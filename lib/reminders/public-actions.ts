"use server"
import { createHash, randomBytes, randomInt } from "crypto"
import { z } from "zod"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bays,
  bookings,
  branches,
  customers,
  dueItems,
  garages,
  messageSends,
  odometerReadings,
  invoices,
  renewalEvents,
  renewalRequests,
  vehicles,
} from "@/lib/db/schema"
import { sendMessage } from "@/lib/messaging/send"
import { validateReading, type OdometerReading } from "@/lib/domain/mileage"
import { REMINDER_RULES, type DueItemType } from "@/lib/domain/reminders"
import { recalculateVehicleMileage } from "@/lib/inngest/functions/recalc-mileage"
import { inngest } from "@/lib/inngest/client"
import { nextDocNumber } from "@/lib/money/sequence"
import { uuidv7 } from "@/lib/id"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const OPEN = ["scheduled", "due_soon", "due", "overdue"] as const
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

async function itemsForToken(token: string) {
  const hash = sha256(token)
  const rows = await db()
    .select({
      item: dueItems,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      plate: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      garageName: garages.name,
      garageSlug: garages.slug,
      garagePhone: garages.phone,
    })
    .from(dueItems)
    .innerJoin(customers, eq(dueItems.customerId, customers.id))
    .innerJoin(vehicles, eq(dueItems.vehicleId, vehicles.id))
    .innerJoin(garages, eq(dueItems.garageId, garages.id))
    .where(and(eq(dueItems.actionTokenHash, hash), inArray(dueItems.status, [...OPEN])))
    .limit(10)
  return rows
}

/** Public lookup for /t/[token] reminder landing. */
export async function getPublicReminder(rawInput: unknown) {
  const parsed = z.object({ token: z.string().min(10).max(200) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const rows = await itemsForToken(parsed.data.token)
  if (!rows.length) return { ok: false as const }

  const first = rows[0]!
  const garageId = first.item.garageId
  const [branchRows, garage] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.garageId, garageId), isNull(branches.deletedAt))).limit(10),
    db().select({ phone: garages.phone }).from(garages).where(eq(garages.id, garageId)).limit(1),
  ])

  return {
    ok: true as const,
    data: {
      garageId,
      garageName: first.garageName,
      garageSlug: first.garageSlug,
      garagePhone: garage[0]?.phone ?? null,
      customerName: first.customerName,
      customerPhone: first.customerPhone,
      branches: branchRows,
      items: await Promise.all(rows.map(async (r) => {
        const rule = REMINDER_RULES[r.item.type as DueItemType]
        return {
          id: r.item.id,
          type: r.item.type,
          title: r.item.title,
          dueDate: r.item.dueDate,
          predictedDueDate: r.item.predictedDueDate,
          effectiveDueDate: r.item.effectiveDueDate,
          dueMileageKm: r.item.dueMileageKm,
          vehicleId: r.item.vehicleId,
          plate: r.plate,
          vehicleLabel: [r.make, r.model, r.plate].filter(Boolean).join(" "),
          primaryAction: rule?.primaryAction ?? "book_now",
          sourceType: r.item.sourceType,
          sourceId: r.item.sourceId,
          payUrl: await payUrlFor(r.item, parsed.data.token, garageId),
        }
      })),
    },
  }
}

/** Resolve a pay URL for pay_now items: instalments reuse /i/[token] (same
 *  due-item hash); other items get a fresh invoice pay link. */
async function payUrlFor(
  item: typeof dueItems.$inferSelect,
  token: string,
  garageId: string
): Promise<string | null> {
  if (item.sourceType === "instalment") return `${APP_URL()}/i/${token}`

  const [inv] = await db().select({ id: invoices.id, tokenHash: invoices.tokenHash })
    .from(invoices)
    .where(and(
      eq(invoices.garageId, garageId),
      eq(invoices.customerId, item.customerId),
      inArray(invoices.status, ["issued", "partially_paid"]),
      sql`${invoices.balanceDue} > 0`,
    ))
    .orderBy(invoices.createdAt)
    .limit(1)
  if (!inv) return null

  // rotate a fresh pay token (only the hash is stored)
  const payToken = randomBytes(24).toString("hex")
  await db().update(invoices).set({ tokenHash: sha256(payToken), updatedAt: new Date() })
    .where(eq(invoices.id, inv.id))
  return `${APP_URL()}/t/${payToken}`
}

async function markConversion(token: string, patch: { convertedBookingId?: string; convertedRenewalId?: string }) {
  const hash = sha256(token)
  const ids = (await db().select({ id: dueItems.id }).from(dueItems)
    .where(eq(dueItems.actionTokenHash, hash))).map((r) => r.id)
  if (!ids.length) return
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.convertedBookingId) set.convertedBookingId = patch.convertedBookingId
  if (patch.convertedRenewalId) set.convertedRenewalId = patch.convertedRenewalId
  await db().update(messageSends).set(set as never).where(and(
    sql`${messageSends.dueItemIds} && ${ids}::uuid[]`,
    sql`${messageSends.convertedBookingId} IS NULL`,
    sql`${messageSends.convertedRenewalId} IS NULL`,
  ))
}

/** Pause reminders on converted due items until booking date + 1 day. */
async function pauseForBooking(dueItemIds: string[], startsAt: Date) {
  const resume = new Date(startsAt.getTime() + 86_400_000)
  await db().update(dueItems).set({ nextReminderAt: resume, updatedAt: new Date() })
    .where(inArray(dueItems.id, dueItemIds))
}

// ---------------------------------------------------------------------------
// book_now — reminder-sourced public booking (with OTP confirm)
// ---------------------------------------------------------------------------

const bookingSchema = z.object({
  token: z.string().min(10).max(200),
  dueItemId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceType: z.string().min(1).max(120),
  guestName: z.string().min(2).max(120),
  guestPhone: z.string().min(9).max(30),
  guestPlate: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
})

export async function requestReminderBooking(rawInput: unknown) {
  const parsed = bookingSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Check the form" } }
  const d = parsed.data

  const rows = await itemsForToken(d.token)
  const item = rows.find((r) => r.item.id === d.dueItemId)
  if (!item) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }
  const garageId = item.item.garageId

  const start = new Date(d.startsAt)
  const end = new Date(d.endsAt)
  if (!(end > start)) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid time" } }

  const [bayCount] = await db().select({ n: sql<number>`count(*)::int` }).from(bays)
    .where(and(eq(bays.branchId, d.branchId), eq(bays.garageId, garageId), eq(bays.isActive, true)))
  const capacity = bayCount?.n ?? 0
  const overlap = await db().select({ n: sql<number>`count(*)::int` }).from(bookings)
    .where(and(
      eq(bookings.branchId, d.branchId), eq(bookings.garageId, garageId),
      sql`${bookings.status} IN ('requested','confirmed','checked_in')`,
      sql`${bookings.startsAt} < ${end.toISOString()} AND ${bookings.endsAt} > ${start.toISOString()}`,
    ))
  if ((overlap[0]?.n ?? 0) >= capacity) {
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "That slot was just taken" } }
  }

  const bookingId = uuidv7()
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const confirmToken = randomBytes(16).toString("hex")

  await db().insert(bookings).values({
    id: bookingId, garageId, branchId: d.branchId,
    customerId: item.item.customerId, vehicleId: item.item.vehicleId,
    guestName: d.guestName, guestPhone: d.guestPhone,
    guestPlate: d.guestPlate ?? item.plate ?? null,
    serviceType: d.serviceType, startsAt: start, endsAt: end,
    status: "requested", notes: d.notes ?? null,
    source: "reminder", dueItemId: d.dueItemId,
    otpHash: sha256(`${bookingId}:${otp}`),
    otpExpiresAt: new Date(Date.now() + 15 * 60_000),
  })

  // conversion tracking + pause reminders until booking + 1 day
  await markConversion(d.token, { convertedBookingId: bookingId })
  await pauseForBooking([d.dueItemId], start)

  const [gr] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, garageId)).limit(1)
  try {
    await sendMessage({
      garageId, channel: "sms", to: d.guestPhone,
      templateKey: "otp",
      variables: { otp_code: otp, garage_name: gr?.name ?? "FixAm" },
      idempotencyKey: `booking-otp:${bookingId}`,
    })
  } catch { /* OTP failure shouldn't block */ }

  return { ok: true as const, data: { bookingId, confirmToken } }
}

/** Confirm OTP for a reminder booking (mirrors confirmPublicBooking). */
export async function confirmReminderBooking(rawInput: unknown) {
  const parsed = z.object({
    bookingId: z.string().uuid(), confirmToken: z.string().min(16).max(64), code: z.string().regex(/^\d{6}$/),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Enter the 6-digit code" } }
  const d = parsed.data

  const [b] = await db().select().from(bookings).where(eq(bookings.id, d.bookingId)).limit(1)
  if (!b || b.source !== "reminder") return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Booking not found" } }
  if (b.status !== "requested") return { ok: false as const, error: { code: "VALIDATION" as const, message: "Booking already processed" } }
  if (!b.otpExpiresAt || b.otpExpiresAt < new Date()) {
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "Code expired — request a new booking" } }
  }
  if (b.otpHash !== sha256(`${b.id}:${d.code}`)) {
    return { ok: false as const, error: { code: "VALIDATION" as const, message: "Incorrect code" } }
  }

  await db().update(bookings).set({
    status: "confirmed", confirmedAt: new Date(),
    otpHash: null, otpExpiresAt: null, updatedAt: new Date(),
  }).where(eq(bookings.id, b.id))

  const [gr] = await db().select({ name: garages.name, phone: garages.phone }).from(garages).where(eq(garages.id, b.garageId)).limit(1)
  try {
    await sendMessage({
      garageId: b.garageId, channel: "sms", to: b.guestPhone!,
      templateKey: "booking_confirmed",
      variables: { customer_first_name: (b.guestName ?? "").split(" ")[0], garage_name: gr?.name ?? "FixAm", booking_time: b.startsAt.toISOString() },
      idempotencyKey: `booking-confirm:${b.id}`,
    })
  } catch { /* best effort */ }

  return { ok: true as const, data: { status: "confirmed" } }
}

// ---------------------------------------------------------------------------
// update_mileage
// ---------------------------------------------------------------------------

export async function submitReminderMileage(rawInput: unknown) {
  const parsed = z.object({
    token: z.string().min(10).max(200),
    vehicleId: z.string().uuid(),
    km: z.number().int().min(0).max(2_000_000),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Enter a valid mileage" } }
  const d = parsed.data

  const rows = await itemsForToken(d.token)
  const item = rows.find((r) => r.item.vehicleId === d.vehicleId)
  if (!item) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }

  const history = await db()
    .select({ readingKm: odometerReadings.readingKm, readAt: odometerReadings.readAt, status: odometerReadings.status })
    .from(odometerReadings)
    .where(and(eq(odometerReadings.vehicleId, d.vehicleId), eq(odometerReadings.garageId, item.item.garageId)))
    .orderBy(sql`${odometerReadings.readAt} DESC`).limit(50)
  const valid: OdometerReading[] = history
    .filter((r) => r.status === "valid")
    .map((r) => ({ km: r.readingKm, at: r.readAt, status: "valid" as const }))
  const status = validateReading({ km: d.km, at: new Date() }, valid)
  const now = new Date()

  await db().insert(odometerReadings).values({
    garageId: item.item.garageId, vehicleId: d.vehicleId,
    readingKm: d.km, readAt: now, source: "customer_update",
    status, flagReason: status === "flagged" ? "customer_update_flagged" : null,
    recordedByCustomerId: item.item.customerId,
  })
  if (status === "valid") {
    await db().update(vehicles)
      .set({ lastOdometerKm: d.km, lastOdometerAt: now, updatedAt: now })
      .where(eq(vehicles.id, d.vehicleId))
  }

  // recalc prediction immediately (also fires the Inngest event path)
  await recalculateVehicleMileage(item.item.garageId, d.vehicleId).catch(() => null)
  await inngest.send({
    name: "vehicle/odometer.recorded",
    data: { garageId: item.item.garageId, vehicleId: d.vehicleId, status },
  }).catch(() => {})

  return { ok: true as const, data: { status } }
}

// ---------------------------------------------------------------------------
// already_done
// ---------------------------------------------------------------------------

const doneSchema = z.object({
  token: z.string().min(10).max(200),
  dueItemId: z.string().uuid(),
  reason: z.enum(["done_elsewhere", "sold_vehicle", "not_needed"]),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
})

export async function submitReminderDone(rawInput: unknown) {
  const parsed = doneSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid input" } }
  const d = parsed.data

  const rows = await itemsForToken(d.token)
  const item = rows.find((r) => r.item.id === d.dueItemId)
  if (!item) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }

  const now = new Date()
  await db().update(dueItems).set({
    status: "completed", completedAt: now, updatedAt: now,
    nextReminderAt: null, dismissedReason: `customer: ${d.reason}`,
  }).where(eq(dueItems.id, d.dueItemId))

  // optionally schedule the next cycle
  if (d.newDate) {
    await db().insert(dueItems).values({
      garageId: item.item.garageId,
      vehicleId: item.item.vehicleId,
      customerId: item.item.customerId,
      type: item.item.type,
      title: item.item.title,
      dueDate: d.newDate,
      dueMileageKm: item.item.dueMileageKm,
      effectiveDueDate: d.newDate,
      status: "scheduled",
      sourceType: "manual",
    })
  }
  return { ok: true as const, data: { status: "completed" } }
}

// ---------------------------------------------------------------------------
// renew_with_garage — create a renewal request and pause reminders
// ---------------------------------------------------------------------------

const KIND_FOR_TYPE: Partial<Record<DueItemType, { kind: "insurance" | "dvla"; dvlaRecordType?: "roadworthy" | "registration_licence" | "drivers_licence" }>> = {
  insurance: { kind: "insurance" },
  roadworthy: { kind: "dvla", dvlaRecordType: "roadworthy" },
  registration_licence: { kind: "dvla", dvlaRecordType: "registration_licence" },
  drivers_licence: { kind: "dvla", dvlaRecordType: "drivers_licence" },
}

export async function startReminderRenewal(rawInput: unknown) {
  const parsed = z.object({
    token: z.string().min(10).max(200),
    dueItemId: z.string().uuid(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: { code: "VALIDATION" as const, message: "Invalid input" } }
  const d = parsed.data

  const rows = await itemsForToken(d.token)
  const item = rows.find((r) => r.item.id === d.dueItemId)
  if (!item) return { ok: false as const, error: { code: "NOT_FOUND" as const, message: "Link expired" } }
  const map = KIND_FOR_TYPE[item.item.type as DueItemType]
  if (!map) return { ok: false as const, error: { code: "VALIDATION" as const, message: "This item can't be renewed here" } }

  // plan feature + insurance partner gating
  const { canOfferRenewal } = await import("@/lib/renewals/core")
  const gate = await canOfferRenewal(item.item.garageId, map.kind)
  if (!gate.ok) return { ok: false as const, error: { code: "FORBIDDEN" as const, message: gate.reason ?? "Renewals not available" } }

  const [existing] = await db().select({ id: renewalRequests.id }).from(renewalRequests)
    .where(and(eq(renewalRequests.dueItemId, d.dueItemId), sql`${renewalRequests.status} NOT IN ('completed','cancelled','failed')`))
    .limit(1)
  if (existing) {
    await db().update(dueItems).set({ nextReminderAt: null, updatedAt: new Date() }).where(eq(dueItems.id, d.dueItemId))
    return { ok: true as const, data: { renewalId: existing.id, existing: true } }
  }

  const [defBranch] = await db().select({ id: branches.id }).from(branches)
    .where(and(eq(branches.garageId, item.item.garageId), eq(branches.isDefault, true))).limit(1)
  const number = defBranch
    ? await nextDocNumber(item.item.garageId, defBranch.id, "REN", "REN")
    : `REN-${Date.now().toString(36).toUpperCase()}`
  const [g] = await db().select({ insurancePartnerId: garages.insurancePartnerId })
    .from(garages).where(eq(garages.id, item.item.garageId)).limit(1)
  const renewalId = uuidv7()
  await db().insert(renewalRequests).values({
    id: renewalId,
    garageId: item.item.garageId,
    number,
    kind: map.kind,
    dvlaRecordType: map.dvlaRecordType ?? null,
    vehicleId: item.item.vehicleId,
    customerId: item.item.customerId,
    dueItemId: d.dueItemId,
    status: "requested",
    partnerId: map.kind === "insurance" ? g?.insurancePartnerId ?? null : null,
    requiredDocuments: map.kind === "insurance"
      ? ["policy_document", "vehicle_details"]
      : ["vehicle_details", "inspection_report"],
  })
  await db().insert(renewalEvents).values({
    garageId: item.item.garageId, renewalRequestId: renewalId,
    status: "requested", actorUserId: null, note: "Started from reminder link",
    customerVisible: true,
  })

  // pause reminders while the renewal is in progress (engine skips items with
  // open renewal requests) + clear the scheduled send
  await db().update(dueItems).set({ nextReminderAt: null, updatedAt: new Date() })
    .where(eq(dueItems.id, d.dueItemId))
  await markConversion(d.token, { convertedRenewalId: renewalId })

  return { ok: true as const, data: { renewalId, existing: false } }
}


