"use server"
import { createHash, randomInt, randomBytes } from "crypto"
import { z } from "zod"
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bays, bookings, branches, customers, garages, jobTemplates, vehicles } from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { sendMessage } from "@/lib/messaging/send"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

const listSchema = z.object({
  garageId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
})

export async function listBookings(rawInput: unknown): Promise<
  ActionResult<{
    id: string; branchId: string; branchName: string; customerName: string | null; guestName: string | null;
    serviceType: string; startsAt: string; endsAt: string; status: string; bayName: string | null;
    vehicleLabel: string | null; source: string | null; jobId: string | null;
  }[]>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = listSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "bookings.manage") && !can(ctx.principal, "jobs.view")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  const rows = await db()
    .select({
      id: bookings.id, branchId: bookings.branchId, branchName: branches.name,
      customerName: customers.fullName, guestName: bookings.guestName,
      serviceType: bookings.serviceType, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
      status: bookings.status, bayName: bays.name, jobId: bookings.jobId, source: bookings.source,
      plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model,
    })
    .from(bookings)
    .innerJoin(branches, eq(bookings.branchId, branches.id))
    .leftJoin(customers, eq(bookings.customerId, customers.id))
    .leftJoin(bays, eq(bookings.bayId, bays.id))
    .leftJoin(vehicles, eq(bookings.vehicleId, vehicles.id))
    .where(and(
      eq(bookings.garageId, d.garageId),
      gte(bookings.startsAt, new Date(d.from)),
      lt(bookings.startsAt, new Date(d.to)),
      d.branchId ? eq(bookings.branchId, d.branchId) : undefined,
      sql`${bookings.status} != 'cancelled'`,
    ))
    .orderBy(bookings.startsAt)
    .limit(300)

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id, branchId: r.branchId, branchName: r.branchName,
      customerName: r.customerName, guestName: r.guestName,
      serviceType: r.serviceType, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
      status: r.status, bayName: r.bayName, jobId: r.jobId, source: r.source,
      vehicleLabel: r.plate ? `${r.plate} ${r.make ?? ""} ${r.model ?? ""}`.trim() : null,
    })),
  }
}

const createSchema = z.object({
  garageId: z.string().uuid(),
  branchId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  guestName: z.string().max(120).optional(),
  guestPhone: z.string().max(30).optional(),
  guestPlate: z.string().max(20).optional(),
  serviceType: z.string().min(1).max(120),
  jobTemplateId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  bayId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
  confirm: z.boolean().default(false),
})

export async function createBooking(rawInput: unknown): Promise<ActionResult<{ bookingId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = createSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "bookings.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [branch] = await db().select({ id: branches.id }).from(branches).where(and(eq(branches.id, d.branchId), eq(branches.garageId, d.garageId))).limit(1)
  if (!branch) return { ok: false, error: { code: "VALIDATION", message: "Unknown branch" } }

  const start = new Date(d.startsAt)
  const end = new Date(d.endsAt)
  if (!(end > start)) return { ok: false, error: { code: "VALIDATION", message: "End must be after start" } }

  // capacity: overlapping non-cancelled bookings at this branch must not exceed active bays
  const [bayCount] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(bays)
    .where(and(eq(bays.branchId, d.branchId), eq(bays.garageId, d.garageId), eq(bays.isActive, true)))
  const capacity = bayCount?.n ?? 1

  const overlap = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(
      eq(bookings.branchId, d.branchId),
      eq(bookings.garageId, d.garageId),
      sql`${bookings.status} IN ('requested','confirmed','checked_in')`,
      sql`${bookings.startsAt} < ${end.toISOString()} AND ${bookings.endsAt} > ${start.toISOString()}`,
    ))
  if ((overlap[0]?.n ?? 0) >= capacity) {
    return { ok: false, error: { code: "VALIDATION", message: "That slot is fully booked" } }
  }

  const bookingId = crypto.randomUUID()
  await db().insert(bookings).values({
    id: bookingId,
    garageId: d.garageId,
    branchId: d.branchId,
    customerId: d.customerId ?? null,
    vehicleId: d.vehicleId ?? null,
    guestName: d.guestName ?? null,
    guestPhone: d.guestPhone ?? null,
    guestPlate: d.guestPlate ?? null,
    serviceType: d.serviceType,
    jobTemplateId: d.jobTemplateId ?? null,
    startsAt: start,
    endsAt: end,
    bayId: d.bayId ?? null,
    status: d.confirm ? "confirmed" : "requested",
    notes: d.notes ?? null,
    source: "staff",
    confirmedAt: d.confirm ? new Date() : null,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "booking.create",
    entityType: "booking", entityId: bookingId, after: { serviceType: d.serviceType, startsAt: start.toISOString() },
  })
  return { ok: true, data: { bookingId } }
}

const statusSchema = z.object({
  garageId: z.string().uuid(),
  bookingId: z.string().uuid(),
  status: z.enum(["confirmed", "cancelled", "no_show"]),
})

export async function updateBookingStatus(rawInput: unknown): Promise<ActionResult<{ bookingId: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = statusSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }
  if (!can(ctx.principal, "bookings.manage")) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }

  const [b] = await db().select().from(bookings).where(and(eq(bookings.id, d.bookingId), eq(bookings.garageId, d.garageId))).limit(1)
  if (!b) return { ok: false, error: { code: "NOT_FOUND", message: "Booking not found" } }
  if (["checked_in", "cancelled"].includes(b.status)) {
    return { ok: false, error: { code: "VALIDATION", message: "Booking already closed" } }
  }

  await db().update(bookings).set({
    status: d.status,
    confirmedAt: d.status === "confirmed" ? new Date() : b.confirmedAt,
    updatedAt: new Date(),
  }).where(eq(bookings.id, b.id))

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "booking.status",
    entityType: "booking", entityId: b.id, before: { status: b.status }, after: { status: d.status },
  })
  return { ok: true, data: { bookingId: b.id } }
}

/** Prefill data for the check-in wizard when converting a booking. */
export async function getBookingForCheckIn(rawInput: unknown): Promise<
  ActionResult<{ bookingId: string; customerId: string | null; vehicleId: string | null; serviceType: string; jobTemplateId: string | null; guestName: string | null; guestPhone: string | null; guestPlate: string | null; branchId: string } | null>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), bookingId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member" } }

  const [b] = await db().select().from(bookings).where(and(eq(bookings.id, parsed.data.bookingId), eq(bookings.garageId, parsed.data.garageId))).limit(1)
  if (!b || b.status === "cancelled") return { ok: true, data: null }
  return {
    ok: true,
    data: {
      bookingId: b.id, customerId: b.customerId, vehicleId: b.vehicleId,
      serviceType: b.serviceType, jobTemplateId: b.jobTemplateId,
      guestName: b.guestName, guestPhone: b.guestPhone, guestPlate: b.guestPlate,
      branchId: b.branchId,
    },
  }
}

// ---------------------------------------------------------------------------
// Public booking page /b/[garageSlug]
// ---------------------------------------------------------------------------

export async function getPublicBookingInfo(rawInput: unknown): Promise<
  ActionResult<{
    garageId: string; garageName: string; garagePhone: string;
    branches: { id: string; name: string; bayCount: number }[];
    services: { id: string; name: string; description: string | null; estimatedMinutes: number | null }[];
  } | null>
> {
  const parsed = z.object({ garageSlug: z.string().min(1).max(80) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid garage" } }

  const [garage] = await db().select().from(garages).where(eq(garages.slug, parsed.data.garageSlug)).limit(1)
  if (!garage || garage.status !== "active") return { ok: true, data: null }

  const [branchRows, tplRows, bayRows] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))),
    db().select({ id: jobTemplates.id, name: jobTemplates.name, description: jobTemplates.description, estimatedMinutes: jobTemplates.estimatedMinutes })
      .from(jobTemplates).where(and(eq(jobTemplates.garageId, garage.id), eq(jobTemplates.isActive, true))),
    db().select({ branchId: bays.branchId, n: sql<number>`count(*)::int` }).from(bays)
      .where(and(eq(bays.garageId, garage.id), eq(bays.isActive, true))).groupBy(bays.branchId),
  ])
  const bayByBranch = new Map(bayRows.map((b) => [b.branchId, b.n]))

  return {
    ok: true,
    data: {
      garageId: garage.id,
      garageName: garage.name,
      garagePhone: garage.phone,
      branches: branchRows.map((b) => ({ id: b.id, name: b.name, bayCount: bayByBranch.get(b.id) ?? 0 })),
      services: tplRows.map((t) => ({ id: t.id, name: t.name, description: t.description, estimatedMinutes: t.estimatedMinutes })),
    },
  }
}

const DAY_START = 8 // 08:00
const DAY_END = 17 // 17:00

function slotsFor(dateISO: string) {
  const day = new Date(`${dateISO}T00:00:00`)
  const slots: { start: string; end: string; label: string }[] = []
  for (let h = DAY_START; h < DAY_END; h++) {
    const s = new Date(day); s.setHours(h, 0, 0, 0)
    const e = new Date(day); e.setHours(h + 1, 0, 0, 0)
    slots.push({
      start: s.toISOString(),
      end: e.toISOString(),
      label: s.toLocaleTimeString("en-GH", { hour: "numeric", minute: "2-digit" }),
    })
  }
  return slots
}

export async function getPublicAvailability(rawInput: unknown): Promise<ActionResult<{ start: string; end: string; label: string; available: boolean }[]>> {
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const [bayCount] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(bays)
    .where(and(eq(bays.branchId, d.branchId), eq(bays.garageId, d.garageId), eq(bays.isActive, true)))
  const capacity = bayCount?.n ?? 0

  const slots = slotsFor(d.date)
  const dayStart = new Date(`${d.date}T00:00:00`)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  const busy = await db()
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(
      eq(bookings.branchId, d.branchId),
      eq(bookings.garageId, d.garageId),
      sql`${bookings.status} IN ('requested','confirmed','checked_in')`,
      sql`${bookings.startsAt} < ${dayEnd.toISOString()} AND ${bookings.endsAt} > ${dayStart.toISOString()}`,
    ))

  return {
    ok: true,
    data: slots.map((s) => {
      const overlap = busy.filter((b) => b.startsAt < new Date(s.end) && b.endsAt > new Date(s.start)).length
      return { ...s, available: overlap < capacity }
    }),
  }
}

const publicBookingSchema = z.object({
  garageId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceType: z.string().min(1).max(120),
  jobTemplateId: z.string().uuid().optional(),
  guestName: z.string().min(2).max(120),
  guestPhone: z.string().min(9).max(30),
  guestPlate: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
})

/** Public booking request — capacity-checked, OTP sent by SMS. */
export async function requestPublicBooking(rawInput: unknown): Promise<ActionResult<{ bookingId: string; confirmToken: string }>> {
  const parsed = publicBookingSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the form" } }
  const d = parsed.data

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const rl = await rateLimit(`pubbook:${d.garageId}:${d.guestPhone}`, 5, 3600)
  if (!rl.ok) return rateLimited(rl)

  const [garage] = await db().select({ id: garages.id }).from(garages).where(and(eq(garages.id, d.garageId), eq(garages.status, "active"))).limit(1)
  if (!garage) return { ok: false, error: { code: "NOT_FOUND", message: "Garage not found" } }

  const start = new Date(d.startsAt)
  const end = new Date(d.endsAt)
  if (!(end > start)) return { ok: false, error: { code: "VALIDATION", message: "Invalid time" } }

  // re-check capacity server-side
  const [bayCount] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(bays)
    .where(and(eq(bays.branchId, d.branchId), eq(bays.garageId, d.garageId), eq(bays.isActive, true)))
  const capacity = bayCount?.n ?? 0
  const overlap = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(
      eq(bookings.branchId, d.branchId),
      eq(bookings.garageId, d.garageId),
      sql`${bookings.status} IN ('requested','confirmed','checked_in')`,
      sql`${bookings.startsAt} < ${end.toISOString()} AND ${bookings.endsAt} > ${start.toISOString()}`,
    ))
  if ((overlap[0]?.n ?? 0) >= capacity) {
    return { ok: false, error: { code: "VALIDATION", message: "Sorry, that slot was just taken" } }
  }

  const bookingId = crypto.randomUUID()
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const confirmToken = randomBytes(16).toString("hex")

  await db().insert(bookings).values({
    id: bookingId,
    garageId: d.garageId,
    branchId: d.branchId,
    guestName: d.guestName,
    guestPhone: d.guestPhone,
    guestPlate: d.guestPlate ?? null,
    serviceType: d.serviceType,
    jobTemplateId: d.jobTemplateId ?? null,
    startsAt: start,
    endsAt: end,
    status: "requested",
    notes: d.notes ?? null,
    source: "public_page",
    otpHash: sha256(`${bookingId}:${otp}`),
    otpExpiresAt: new Date(Date.now() + 15 * 60_000),
  })

  const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, d.garageId)).limit(1)
  try {
    await sendMessage({
      garageId: d.garageId,
      channel: "sms",
      to: d.guestPhone,
      templateKey: "otp",
      variables: { otp_code: otp, garage_name: gr?.name ?? "FixAm" },
      idempotencyKey: `booking-otp:${bookingId}`,
    })
  } catch {
    // OTP delivery failure shouldn't block the booking request
  }

  return { ok: true, data: { bookingId, confirmToken } }
}

const confirmSchema = z.object({
  bookingId: z.string().uuid(),
  confirmToken: z.string().min(16).max(64),
  code: z.string().regex(/^\d{6}$/),
})

/** Confirm a public booking with the SMS code. */
export async function confirmPublicBooking(rawInput: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = confirmSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Enter the 6-digit code" } }
  const d = parsed.data

  const [b] = await db().select().from(bookings).where(eq(bookings.id, d.bookingId)).limit(1)
  if (!b || b.source !== "public_page") return { ok: false, error: { code: "NOT_FOUND", message: "Booking not found" } }

  const { rateLimit, rateLimited } = await import("@/lib/rate-limit")
  const rl = await rateLimit(`pubbook-confirm:${d.bookingId}`, 10, 900)
  if (!rl.ok) return rateLimited(rl)

  if (b.status !== "requested") return { ok: false, error: { code: "VALIDATION", message: "Booking already processed" } }
  if (!b.otpExpiresAt || b.otpExpiresAt < new Date()) {
    return { ok: false, error: { code: "VALIDATION", message: "Code expired — request a new booking" } }
  }
  if (b.otpHash !== sha256(`${b.id}:${d.code}`)) {
    return { ok: false, error: { code: "VALIDATION", message: "Incorrect code" } }
  }

  await db().update(bookings).set({
    status: "confirmed",
    confirmedAt: new Date(),
    otpHash: null,
    otpExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(bookings.id, b.id))

  // confirmation message
  try {
    const [gr] = await db().select({ name: garages.name, phone: garages.phone }).from(garages).where(eq(garages.id, b.garageId)).limit(1)
    const [veh] = b.vehicleId ? await db().select({ plateNumber: vehicles.plateNumber }).from(vehicles).where(eq(vehicles.id, b.vehicleId)).limit(1) : []
    const [cust] = b.customerId ? await db().select({ fullName: customers.fullName }).from(customers).where(eq(customers.id, b.customerId)).limit(1) : []
    const first = (b.guestName ?? cust?.fullName ?? "there").split(" ")[0]!
    await sendMessage({
      garageId: b.garageId,
      channel: "sms",
      to: b.guestPhone ?? "",
      templateKey: "booking_confirmed",
      variables: {
        customer_first_name: first,
        plate: veh?.plateNumber ?? b.guestPlate ?? "",
        garage_name: gr?.name ?? "the garage",
        due_date: b.startsAt.toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
        garage_phone: gr?.phone ?? "",
      },
      idempotencyKey: `booking-confirmed:${b.id}`,
    })
  } catch {
    // best-effort
  }

  return { ok: true, data: { status: "confirmed" } }
}
