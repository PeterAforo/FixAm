"use server"

import { z } from "zod"
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { bookings, branches, customers, garageSettings, jobs, memberships, pickupRuns, users, vehicles } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog } from "@/lib/actions"
import { normalizeGhPhone } from "@/lib/phone"
import { PHOTO_SIDE_IDS, reportProblems, type RunStatus } from "./core"
import { createRun, moveRun, runsView, saveReport, updateDriverLocation, type RunView } from "./service"

type Fail = { ok: false; error: string }

async function staff(garageId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  const principal = { kind: "staff" as const, role: m.role, garageId, branchId: m.branchId }
  return { userId, role: m.role, branchId: m.branchId, canManage: can(principal, "pickups.manage"), canDrive: can(principal, "handovers.perform") }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getPickupSettings(garageId: string) {
  const [s] = await db().select({ enabled: garageSettings.pickupEnabled, fee: garageSettings.pickupFee, radius: garageSettings.pickupRadiusKm })
    .from(garageSettings).where(eq(garageSettings.garageId, garageId)).limit(1)
  return { enabled: s?.enabled ?? false, fee: Number(s?.fee ?? 0n), radiusKm: s?.radius ?? 10 }
}

export async function savePickupSettings(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), enabled: z.boolean(), feeGhs: z.number().min(0).max(10_000), radiusKm: z.number().int().min(1).max(100) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Check the fee and distance" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const m = await resolveMembership(userId, parsed.data.garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId: parsed.data.garageId, branchId: m.branchId }, "garage.settings.manage")) return { ok: false, error: "No permission" }
  const d = parsed.data
  const vals = { pickupEnabled: d.enabled, pickupFee: BigInt(Math.round(d.feeGhs * 100)), pickupRadiusKm: d.radiusKm }
  await db().insert(garageSettings).values({ garageId: d.garageId, ...vals })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { ...vals, updatedAt: new Date() } })
  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "garage.pickup_settings", entityType: "garage", entityId: d.garageId, after: d }).catch(() => undefined)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Runs (staff + drivers)
// ---------------------------------------------------------------------------

export type RunRow = {
  id: string; kind: "pickup" | "dropoff"; status: RunStatus; scheduledAt: string; address: string; lat: number | null; lng: number | null
  contactName: string | null; contactPhone: string; vehicleLabel: string | null; plate: string | null; fee: number
  driverUserId: string | null; driverName: string | null; jobId: string | null; bookingId: string | null; notes: string | null
}

const toRow = (r: typeof pickupRuns.$inferSelect, driverName: string | null): RunRow => ({
  id: r.id, kind: r.kind as "pickup" | "dropoff", status: r.status as RunStatus, scheduledAt: r.scheduledAt.toISOString(), address: r.address,
  lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
  contactName: r.contactName, contactPhone: r.contactPhone, vehicleLabel: r.vehicleLabel, plate: r.plate, fee: Number(r.fee),
  driverUserId: r.driverUserId, driverName, jobId: r.jobId, bookingId: r.bookingId, notes: r.notes,
})

/** Drivers see their own runs; managers see all of the garage's runs. */
export async function listRuns(raw: unknown): Promise<{ upcoming: RunRow[]; done: RunRow[]; canManage: boolean } | null> {
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return null
  const s = await staff(parsed.data.garageId)
  if (!s || !s.canDrive) return null
  const mine = !s.canManage ? eq(pickupRuns.driverUserId, s.userId) : undefined
  const base = and(eq(pickupRuns.garageId, parsed.data.garageId), mine)
  const [open, done] = await Promise.all([
    db().select({ r: pickupRuns, driverName: users.fullName }).from(pickupRuns).leftJoin(users, eq(users.id, pickupRuns.driverUserId))
      .where(and(base, inArray(pickupRuns.status, ["scheduled", "assigned", "en_route", "arrived"]))).orderBy(asc(pickupRuns.scheduledAt)).limit(100),
    db().select({ r: pickupRuns, driverName: users.fullName }).from(pickupRuns).leftJoin(users, eq(users.id, pickupRuns.driverUserId))
      .where(and(base, inArray(pickupRuns.status, ["done", "cancelled"]), gte(pickupRuns.updatedAt, new Date(Date.now() - 14 * 86_400_000)))).orderBy(desc(pickupRuns.updatedAt)).limit(30),
  ])
  return { upcoming: open.map((x) => toRow(x.r, x.driverName)), done: done.map((x) => toRow(x.r, x.driverName)), canManage: s.canManage }
}

export async function getRunDetail(raw: unknown): Promise<{ run: RunRow; view: Awaited<ReturnType<typeof runsView>>; canManage: boolean; isMine: boolean } | null> {
  const parsed = z.object({ garageId: z.string().uuid(), runId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return null
  const s = await staff(parsed.data.garageId)
  if (!s || !s.canDrive) return null
  const [row] = await db().select({ r: pickupRuns, driverName: users.fullName }).from(pickupRuns).leftJoin(users, eq(users.id, pickupRuns.driverUserId))
    .where(and(eq(pickupRuns.id, parsed.data.runId), eq(pickupRuns.garageId, parsed.data.garageId))).limit(1)
  if (!row) return null
  if (!s.canManage && row.r.driverUserId !== s.userId) return null
  return { run: toRow(row.r, row.driverName), view: await runsView({ runId: row.r.id }), canManage: s.canManage, isMine: row.r.driverUserId === s.userId }
}

/** People who can drive: role "garage_driver" first, then other staff. */
export async function listGarageDrivers(garageId: string): Promise<{ userId: string; name: string; role: string }[]> {
  const s = await staff(garageId)
  if (!s?.canManage) return []
  const rows = await db().select({ userId: memberships.userId, role: memberships.role, name: users.fullName, phone: users.phone })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.garageId, garageId), eq(memberships.status, "active"), isNull(memberships.deletedAt)))
  return rows.filter((r) => r.userId).map((r) => ({ userId: r.userId!, name: r.name ?? r.phone ?? "Staff", role: r.role }))
    .sort((a, b) => (a.role === "garage_driver" ? -1 : 0) - (b.role === "garage_driver" ? -1 : 0))
}

/** Bookings and jobs a run can be created for (staff "new run" form). */
export async function runSources(garageId: string) {
  const s = await staff(garageId)
  if (!s?.canManage) return { bookings: [], jobs: [] }
  const now = new Date()
  const [bk, jb] = await Promise.all([
    db().select({ id: bookings.id, startsAt: bookings.startsAt, serviceType: bookings.serviceType, guestName: bookings.guestName, guestPhone: bookings.guestPhone, guestPlate: bookings.guestPlate, custName: customers.fullName, custPhone: customers.phone, plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model })
      .from(bookings).leftJoin(customers, eq(customers.id, bookings.customerId)).leftJoin(vehicles, eq(vehicles.id, bookings.vehicleId))
      .where(and(eq(bookings.garageId, garageId), inArray(bookings.status, ["requested", "confirmed"]), gte(bookings.startsAt, new Date(now.getTime() - 86_400_000)), lte(bookings.startsAt, new Date(now.getTime() + 14 * 86_400_000))))
      .orderBy(asc(bookings.startsAt)).limit(50),
    db().select({ id: jobs.id, number: jobs.number, status: jobs.status, custName: customers.fullName, custPhone: customers.phone, address: customers.address, plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model })
      .from(jobs).innerJoin(customers, eq(customers.id, jobs.customerId)).innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
      .where(and(eq(jobs.garageId, garageId), inArray(jobs.status, ["in_progress", "waiting_parts", "quality_check", "ready", "approved", "checked_in", "diagnosing"]), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.createdAt)).limit(50),
  ])
  return {
    bookings: bk.map((b) => ({ id: b.id, label: `${b.startsAt.toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })} · ${b.custName ?? b.guestName ?? "Guest"} · ${b.serviceType}`, name: b.custName ?? b.guestName, phone: b.custPhone ?? b.guestPhone, plate: b.plate ?? b.guestPlate, vehicle: [b.make, b.model].filter(Boolean).join(" ") || null, at: b.startsAt.toISOString() })),
    jobs: jb.map((j) => ({ id: j.id, label: `${j.number} · ${j.custName} · ${j.plate} (${j.status.replace(/_/g, " ")})`, name: j.custName, phone: j.custPhone, plate: j.plate, vehicle: [j.make, j.model].filter(Boolean).join(" "), address: j.address })),
  }
}

const newRunSchema = z.object({
  garageId: z.string().uuid(),
  kind: z.enum(["pickup", "dropoff"]),
  bookingId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().min(9).max(20),
  address: z.string().trim().min(3).max(300),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  feeGhs: z.number().min(0).max(10_000),
  notes: z.string().trim().max(300).optional(),
  driverUserId: z.string().uuid().optional(),
})

export async function createPickupRun(raw: unknown): Promise<{ ok: true; runId: string } | Fail> {
  const parsed = newRunSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const d = parsed.data
  const s = await staff(d.garageId)
  if (!s?.canManage) return { ok: false, error: "No permission" }
  const phone = normalizeGhPhone(d.contactPhone)
  if (!phone) return { ok: false, error: "Enter a valid phone number" }
  let customerId: string | null = null
  let vehicleLabel: string | null = null
  let plate: string | null = null
  let branchId: string | null = s.branchId
  if (d.jobId) {
    const [j] = await db().select({ customerId: jobs.customerId, branchId: jobs.branchId, plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model })
      .from(jobs).innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId)).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId))).limit(1)
    if (!j) return { ok: false, error: "Job not found" }
    customerId = j.customerId; branchId = j.branchId; plate = j.plate; vehicleLabel = [j.make, j.model].filter(Boolean).join(" ")
  } else if (d.bookingId) {
    const [b] = await db().select().from(bookings).where(and(eq(bookings.id, d.bookingId), eq(bookings.garageId, d.garageId))).limit(1)
    if (!b) return { ok: false, error: "Booking not found" }
    customerId = b.customerId; branchId = b.branchId; plate = b.guestPlate
  }
  if (!branchId) branchId = (await db().select({ id: branches.id }).from(branches).where(eq(branches.garageId, d.garageId)).limit(1))[0]?.id ?? null
  const { run } = await createRun({
    garageId: d.garageId, branchId, bookingId: d.bookingId ?? null, jobId: d.jobId ?? null, customerId, kind: d.kind,
    contactName: d.contactName ?? null, contactPhone: phone, vehicleLabel, plate, address: d.address,
    scheduledAt: new Date(d.scheduledAt), fee: BigInt(Math.round(d.feeGhs * 100)), notes: d.notes ?? null, createdBy: s.userId,
    status: d.driverUserId ? "assigned" : "scheduled",
  })
  if (d.driverUserId) await db().update(pickupRuns).set({ driverUserId: d.driverUserId }).where(eq(pickupRuns.id, run.id))
  await writeAuditLog({ garageId: d.garageId, actorUserId: s.userId, action: "pickup.create", entityType: "pickup_run", entityId: run.id, after: { kind: d.kind, jobId: d.jobId, bookingId: d.bookingId } }).catch(() => undefined)
  return { ok: true, runId: run.id }
}

export async function updatePickupRun(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({
    garageId: z.string().uuid(), runId: z.string().uuid(),
    driverUserId: z.string().uuid().nullable().optional(),
    scheduledAt: z.string().min(10).optional(),
    cancel: z.boolean().optional(),
  }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const d = parsed.data
  const s = await staff(d.garageId)
  if (!s?.canManage) return { ok: false, error: "No permission" }
  const [r] = await db().select().from(pickupRuns).where(and(eq(pickupRuns.id, d.runId), eq(pickupRuns.garageId, d.garageId))).limit(1)
  if (!r || ["done", "cancelled"].includes(r.status)) return { ok: false, error: "This run is finished" }
  await db().update(pickupRuns).set({
    ...(d.driverUserId !== undefined ? { driverUserId: d.driverUserId, status: d.driverUserId && r.status === "scheduled" ? "assigned" : !d.driverUserId && r.status === "assigned" ? "scheduled" : r.status } : {}),
    ...(d.scheduledAt ? { scheduledAt: new Date(d.scheduledAt) } : {}),
    ...(d.cancel ? { status: "cancelled", cancelledAt: new Date() } : {}),
    updatedAt: new Date(),
  }).where(eq(pickupRuns.id, r.id))
  return { ok: true }
}

export async function stepPickupRun(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), runId: z.string().uuid(), to: z.enum(["en_route", "arrived"]) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const s = await staff(parsed.data.garageId)
  if (!s?.canDrive) return { ok: false, error: "No permission" }
  const [r] = await db().select().from(pickupRuns).where(and(eq(pickupRuns.id, parsed.data.runId), eq(pickupRuns.garageId, parsed.data.garageId))).limit(1)
  if (!r) return { ok: false, error: "Run not found" }
  if (!s.canManage && r.driverUserId && r.driverUserId !== s.userId) return { ok: false, error: "This run is assigned to someone else" }
  const res = await moveRun(r, parsed.data.to, s.userId)
  return res.ok ? { ok: true } : res
}

export async function shareDriverLocation(raw: unknown): Promise<{ ok: true }> {
  const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(raw)
  const userId = await getSessionUserId()
  if (userId && parsed.success) await updateDriverLocation(userId, parsed.data.lat, parsed.data.lng).catch(() => undefined)
  return { ok: true }
}

/**
 * Handover report. FormData: garageId, runId, fuelLevel, odometerKm,
 * warningLights (repeated), damageNotes, signedByName, signature (PNG file),
 * photo_<side> for each side.
 */
export async function submitConditionReport(form: FormData): Promise<{ ok: true } | Fail> {
  const garageId = String(form.get("garageId") ?? "")
  const runId = String(form.get("runId") ?? "")
  if (!z.string().uuid().safeParse(garageId).success || !z.string().uuid().safeParse(runId).success) return { ok: false, error: "Invalid input" }
  const s = await staff(garageId)
  if (!s?.canDrive) return { ok: false, error: "No permission" }
  const [r] = await db().select().from(pickupRuns).where(and(eq(pickupRuns.id, runId), eq(pickupRuns.garageId, garageId))).limit(1)
  if (!r) return { ok: false, error: "Run not found" }
  if (r.status !== "arrived") return { ok: false, error: "Mark that you've arrived first" }
  if (!s.canManage && r.driverUserId && r.driverUserId !== s.userId) return { ok: false, error: "This run is assigned to someone else" }

  const photos: Partial<Record<string, { bytes: Uint8Array; type: string }>> = {}
  for (const side of PHOTO_SIDE_IDS) {
    const f = form.get(`photo_${side}`)
    if (f instanceof File && f.size > 0) {
      if (!f.type.startsWith("image/")) return { ok: false, error: "Photos must be images" }
      if (f.size > 3.5 * 1024 * 1024) return { ok: false, error: "A photo is too large — retake it" }
      photos[side] = { bytes: new Uint8Array(await f.arrayBuffer()), type: f.type }
    }
  }
  const sig = form.get("signature")
  const fuel = Number(form.get("fuelLevel"))
  const odo = Number(form.get("odometerKm"))
  const name = String(form.get("signedByName") ?? "").trim().slice(0, 120)
  const problems = reportProblems({
    photos: Object.fromEntries(Object.keys(photos).map((k) => [k, "x"])),
    fuelLevel: Number.isFinite(fuel) ? fuel : null, odometerKm: Number.isFinite(odo) && String(form.get("odometerKm") ?? "") !== "" ? odo : null,
    signatureProvided: sig instanceof File && sig.size > 200, signedByName: name,
  })
  if (problems.length) return { ok: false, error: problems.join(". ") }
  const lights = form.getAll("warningLights").map(String).filter((l) => /^[a-z_]{2,30}$/.test(l)).slice(0, 12)
  await saveReport(r, {
    files: { photos, signature: { bytes: new Uint8Array(await (sig as File).arrayBuffer()), type: "image/png" } },
    fuelLevel: Math.round(fuel), odometerKm: Math.round(odo), warningLights: lights,
    damageNotes: String(form.get("damageNotes") ?? "").trim().slice(0, 1000) || null, signedByName: name, recordedBy: s.userId,
  })
  await writeAuditLog({ garageId, actorUserId: s.userId, action: `pickup.${r.kind}.handover`, entityType: "pickup_run", entityId: r.id, after: { odometerKm: odo, fuel } }).catch(() => undefined)
  return { ok: true }
}

export type { RunView }

/** For the job card: the job's runs with status (staff). */
export async function jobRunsSummary(garageId: string, jobId: string) {
  const s = await staff(garageId)
  if (!s) return []
  const rows = await db().select({ id: pickupRuns.id, kind: pickupRuns.kind, status: pickupRuns.status, scheduledAt: pickupRuns.scheduledAt })
    .from(pickupRuns).where(and(eq(pickupRuns.garageId, garageId), eq(pickupRuns.jobId, jobId), sql`${pickupRuns.status} <> 'unconfirmed'`)).orderBy(asc(pickupRuns.scheduledAt))
  return rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt.toISOString() }))
}
