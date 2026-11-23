import "server-only"
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  garages,
  memberships,
  notifications,
  repairRequestRecipients,
  repairRequests,
  sosEvents,
  sosRecipients,
  sosRequests,
  towOperatorMembers,
  towOperators,
} from "@/lib/db/schema"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { ACTIVE, SEARCH_MINUTES, canMove, distanceKm, pickRecipients, problemLabel, type SosStatus } from "./core"

type Sos = typeof sosRequests.$inferSelect
const num = (v: string | null | undefined) => (v == null ? null : Number(v))

async function event(sosId: string, status: string, note: string | null, actorUserId: string | null) {
  await db().insert(sosEvents).values({ sosId, status, note, actorUserId }).catch(() => undefined)
}

async function nextSosNumber(): Promise<string> {
  const rows = await db().execute<{ v: string }>(sql`select lpad((floor(random() * 1000000))::text, 6, '0') as v`)
  return `SOS-${rows[0]?.v ?? String(Date.now()).slice(-6)}`
}

/** The tow-operator workspace this user belongs to. */
export async function operatorForUser(userId: string) {
  const [row] = await db().select({ op: towOperators, role: towOperatorMembers.role })
    .from(towOperatorMembers).innerJoin(towOperators, eq(towOperators.id, towOperatorMembers.operatorId))
    .where(and(eq(towOperatorMembers.userId, userId), isNull(towOperators.deletedAt))).limit(1)
  return row ?? null
}

export type CreateSos = {
  userId: string
  phone: string
  name: string | null
  vehicle: { make: string | null; model: string | null; year: number | null; plate: string | null }
  problem: string
  notes: string | null
  lat: number
  lng: number
  landmark: string | null
  radiusKm: number
  destinationGarageId: string | null
  photoPaths: string[]
}

/**
 * Creates the SOS and alerts nearby available operators straight away
 * (SMS sent in parallel, in this request — not via a queue — so it lands in
 * seconds). Nearby garages get an in-app notice too.
 */
export async function createSos(input: CreateSos): Promise<{ sos: Sos; notified: number }> {
  const id = uuidv7()
  const [sos] = await db().insert(sosRequests).values({
    id, number: await nextSosNumber(), requesterUserId: input.userId, requesterPhone: input.phone, requesterName: input.name,
    vehicleMake: input.vehicle.make, vehicleModel: input.vehicle.model, vehicleYear: input.vehicle.year, vehiclePlate: input.vehicle.plate,
    problem: input.problem, notes: input.notes, photoPaths: input.photoPaths,
    lat: input.lat.toFixed(6), lng: input.lng.toFixed(6), landmark: input.landmark, radiusKm: input.radiusKm,
    destinationGarageId: input.destinationGarageId, expiresAt: new Date(Date.now() + SEARCH_MINUTES * 60_000),
  }).returning()
  await event(sos.id, "searching", "SOS sent", input.userId)
  const notified = await fanOut(sos)
  return { sos, notified }
}

async function fanOut(sos: Sos, extraRadius = 0): Promise<number> {
  const ops = await db().select().from(towOperators).where(and(eq(towOperators.isAvailable, true), eq(towOperators.status, "active"), isNull(towOperators.deletedAt))).limit(2000)
  const at = { lat: Number(sos.lat), lng: Number(sos.lng) }
  const picked = pickRecipients(ops.map((o) => ({
    id: o.id, isAvailable: o.isAvailable, status: o.status, serviceRadiusKm: o.serviceRadiusKm + extraRadius,
    lastLat: num(o.lastLat), lastLng: num(o.lastLng), lastLocationAt: o.lastLocationAt, baseLat: num(o.baseLat), baseLng: num(o.baseLng),
  })), at, sos.radiusKm + extraRadius, new Date())
  if (!picked.length) return 0
  const inserted = await db().insert(sosRecipients)
    .values(picked.map((p) => ({ sosId: sos.id, operatorId: p.id, distanceKm: p.distanceKm.toFixed(1) })))
    .onConflictDoNothing().returning({ operatorId: sosRecipients.operatorId, distanceKm: sosRecipients.distanceKm })
  const phones = new Map(ops.map((o) => [o.id, o.phone]))
  const car = [sos.vehicleMake, sos.vehicleModel].filter(Boolean).join(" ") || "a car"
  await Promise.all(inserted.map((r) => sendDirectSms(phones.get(r.operatorId) ?? "", "sos_new_job", {
    number: sos.number, problem: problemLabel(sos.problem).toLowerCase(), vehicle: car,
    distance: `${r.distanceKm} km`, job_link: appUrl(`/tow/jobs/${sos.id}`),
  })))
  void notifyNearbyGarages(sos).catch(() => undefined)
  return inserted.length
}

/** Garages within 10 km see "a breakdown near you" — they may be chosen as the destination. */
async function notifyNearbyGarages(sos: Sos) {
  const rows = await db().select({ id: garages.id, slug: garages.slug, lat: garages.gpsLat, lng: garages.gpsLng })
    .from(garages).where(and(eq(garages.status, "active"), isNull(garages.deletedAt))).limit(3000)
  const at = { lat: Number(sos.lat), lng: Number(sos.lng) }
  const near = rows.filter((g) => g.lat != null && g.lng != null && distanceKm({ lat: Number(g.lat), lng: Number(g.lng) }, at) <= 10).slice(0, 20)
  if (!near.length) return
  const managers = await db().select({ userId: memberships.userId, garageId: memberships.garageId }).from(memberships)
    .where(and(inArray(memberships.garageId, near.map((g) => g.id)), inArray(memberships.role, ["owner", "manager", "service_advisor"]), eq(memberships.status, "active")))
  const slug = new Map(near.map((g) => [g.id, g.slug]))
  for (const m of managers) {
    if (!m.userId) continue
    await db().insert(notifications).values({
      garageId: m.garageId, userId: m.userId, kind: "system",
      title: `Breakdown nearby: ${problemLabel(sos.problem)}`,
      body: `A driver near you needs help (${sos.number}). If they choose your garage, the tow will bring the car to you.`,
      link: `/g/${slug.get(m.garageId)}/leads`,
    }).catch(() => undefined)
  }
}

/** Every 2 minutes: widen the search once, expire SOSes nobody took. */
export async function sweepSos(): Promise<{ widened: number; expired: number }> {
  const now = new Date()
  const open = await db().select().from(sosRequests).where(eq(sosRequests.status, "searching")).limit(200)
  let widened = 0
  let expired = 0
  for (const s of open) {
    if (s.expiresAt <= now) {
      const [u] = await db().update(sosRequests).set({ status: "expired", updatedAt: now }).where(and(eq(sosRequests.id, s.id), eq(sosRequests.status, "searching"))).returning()
      if (u) {
        expired++
        await event(s.id, "expired", "No tow truck accepted in time", null)
        await sendDirectSms(s.requesterPhone, "sos_status", { number: s.number, status: "Sorry — no tow truck was free nearby. Please try again or call a garage directly.", link: appUrl(`/portal/sos/${s.id}`) })
      }
      continue
    }
    // After 5 minutes with nobody: try operators up to 15 km further away (once).
    const ageMin = (now.getTime() - s.createdAt.getTime()) / 60_000
    if (ageMin >= 5 && ageMin < 7) widened += (await fanOut(s, 15)) > 0 ? 1 : 0
  }
  return { widened, expired }
}

/** Operator accepts: first one wins (conditional update), with a price and ETA. */
export async function acceptSos(input: { sosId: string; operatorId: string; userId: string; quote: number; etaMinutes: number; note: string | null }): Promise<Sos | null> {
  const [rec] = await db().select({ id: sosRecipients.id }).from(sosRecipients)
    .where(and(eq(sosRecipients.sosId, input.sosId), eq(sosRecipients.operatorId, input.operatorId))).limit(1)
  if (!rec) return null
  const [op] = await db().select().from(towOperators).where(eq(towOperators.id, input.operatorId)).limit(1)
  const [won] = await db().update(sosRequests).set({
    status: "assigned", operatorId: input.operatorId, assignedUserId: input.userId, assignedAt: new Date(),
    quoteAmount: BigInt(input.quote), quoteNote: input.note, etaMinutes: input.etaMinutes,
    operatorLat: op?.lastLat ?? op?.baseLat ?? null, operatorLng: op?.lastLng ?? op?.baseLng ?? null, operatorLocationAt: op?.lastLocationAt ?? null,
    updatedAt: new Date(),
  }).where(and(eq(sosRequests.id, input.sosId), eq(sosRequests.status, "searching"))).returning()
  if (!won) return null
  await event(won.id, "assigned", `${op?.businessName ?? "Operator"} accepted — GH₵${(input.quote / 100).toFixed(0)}, about ${input.etaMinutes} min`, input.userId)
  await sendDirectSms(won.requesterPhone, "sos_assigned", {
    number: won.number, operator: op?.businessName ?? "A tow truck", operator_phone: op?.phone ?? "",
    eta: String(input.etaMinutes), price: `GH₵${(input.quote / 100).toFixed(0)}`, link: appUrl(`/portal/sos/${won.id}`),
  })
  return won
}

export async function declineSos(sosId: string, operatorId: string) {
  await db().update(sosRecipients).set({ declinedAt: new Date() }).where(and(eq(sosRecipients.sosId, sosId), eq(sosRecipients.operatorId, operatorId)))
}

/** Operator moves the job forward. Completing it hands the car to the destination garage. */
export async function moveSos(input: { sosId: string; operatorId: string; userId: string; to: SosStatus }): Promise<{ ok: true; sos: Sos } | { ok: false; error: string }> {
  const [s] = await db().select().from(sosRequests).where(and(eq(sosRequests.id, input.sosId), eq(sosRequests.operatorId, input.operatorId))).limit(1)
  if (!s) return { ok: false, error: "Job not found" }
  if (!canMove(s.status, input.to)) return { ok: false, error: "That step isn't possible now" }
  if (input.to === "towing" && !s.destinationGarageId) return { ok: false, error: "The driver hasn't chosen a garage yet — ask them to pick one in the app" }
  if (input.to === "completed" && s.paymentStatus !== "paid" && s.paymentStatus !== "cash") return { ok: false, error: "Payment isn't confirmed yet — mark cash received or wait for the MoMo payment" }
  const now = new Date()
  const [u] = await db().update(sosRequests).set({
    status: input.to, updatedAt: now,
    ...(input.to === "arrived" ? { arrivedAt: now } : {}),
    ...(input.to === "completed" ? { completedAt: now } : {}),
  }).where(and(eq(sosRequests.id, s.id), eq(sosRequests.status, s.status))).returning()
  if (!u) return { ok: false, error: "The job changed — refresh and try again" }
  await event(u.id, input.to, null, input.userId)
  const words: Partial<Record<SosStatus, string>> = { en_route: "is on the way to you", arrived: "has arrived", towing: "is towing your car to the garage", completed: "has finished the job" }
  if (words[input.to]) {
    const [op] = await db().select({ name: towOperators.businessName }).from(towOperators).where(eq(towOperators.id, input.operatorId)).limit(1)
    await sendDirectSms(u.requesterPhone, "sos_status", { number: u.number, status: `${op?.name ?? "Your tow truck"} ${words[input.to]}.`, link: appUrl(`/portal/sos/${u.id}`) })
  }
  if (input.to === "completed") await completeSos(u)
  return { ok: true, sos: u }
}

/** Done: pay the operator (if MoMo), count the job, and create a repair request at the destination garage. */
async function completeSos(s: Sos) {
  if (s.operatorId) await db().update(towOperators).set({ completedJobs: sql`${towOperators.completedJobs} + 1`, updatedAt: new Date() }).where(eq(towOperators.id, s.operatorId))
  if (s.paymentStatus === "paid" && s.operatorId && s.quoteAmount) {
    const { queueTowSettlement } = await import("@/lib/escrow/service")
    await queueTowSettlement({ operatorId: s.operatorId, amount: s.quoteAmount, key: `tow:${s.id}`, memo: `Tow ${s.number}` }).catch(() => undefined)
  }
  if (s.destinationGarageId && !s.repairRequestId) await createTowRepairRequest(s).catch((e) => console.error("[sos] repair request failed:", (e as Error).message))
}

/** The towed car arrives at the garage as a repair request (in the garage's Leads). */
export async function createTowRepairRequest(s: Sos): Promise<string | null> {
  if (!s.destinationGarageId) return null
  const { nextRequestNumber, triageComplaint, REQUEST_TTL_HOURS } = await import("@/lib/repair-requests/service")
  const complaint = `Towed in after a breakdown (${problemLabel(s.problem).toLowerCase()}).${s.notes ? ` Driver says: ${s.notes}` : ""}`
  const vehicle = [s.vehicleMake, s.vehicleModel, s.vehicleYear].filter(Boolean).join(" ") || null
  const triage = await triageComplaint({ complaint, vehicle, warningLights: [], photos: [], ctx: { userId: s.requesterUserId } }).catch(() => null)
  const id = uuidv7()
  await db().insert(repairRequests).values({
    id, number: await nextRequestNumber(), requesterUserId: s.requesterUserId, requesterPhone: s.requesterPhone, requesterName: s.requesterName,
    vehicleMake: s.vehicleMake, vehicleModel: s.vehicleModel, vehicleYear: s.vehicleYear, vehiclePlate: s.vehiclePlate,
    complaint, gpsLat: s.lat, gpsLng: s.lng, mode: "preferred", preferredGarageId: s.destinationGarageId,
    triage, urgency: triage?.urgency ?? "soon", specialty: triage?.specialty ?? null,
    status: "open", expiresAt: new Date(Date.now() + REQUEST_TTL_HOURS * 3600_000),
  })
  await db().insert(repairRequestRecipients).values({ requestId: id, garageId: s.destinationGarageId }).onConflictDoNothing()
  await db().update(sosRequests).set({ repairRequestId: id, updatedAt: new Date() }).where(eq(sosRequests.id, s.id))
  await event(s.id, "handed_over", "Car delivered — repair request sent to the garage", null)
  await writeAuditLog({ garageId: s.destinationGarageId, actorUserId: null, action: "sos.tow_delivered", entityType: "repair_request", entityId: id, after: { sos: s.number } }).catch(() => undefined)
  const [g] = await db().select({ phone: garages.phone, slug: garages.slug, name: garages.name }).from(garages).where(eq(garages.id, s.destinationGarageId)).limit(1)
  if (g?.phone) await sendDirectSms(g.phone, "sos_garage_incoming", { number: s.number, vehicle: vehicle ?? "A car", plate: s.vehiclePlate ?? "", link: appUrl(`/g/${g.slug}/leads`) })
  return id
}

/** Driver or operator shares a live location. */
export async function updateOperatorLocation(operatorId: string, lat: number, lng: number) {
  const now = new Date()
  await db().update(towOperators).set({ lastLat: lat.toFixed(6), lastLng: lng.toFixed(6), lastLocationAt: now, updatedAt: now }).where(eq(towOperators.id, operatorId))
  await db().update(sosRequests).set({ operatorLat: lat.toFixed(6), operatorLng: lng.toFixed(6), operatorLocationAt: now })
    .where(and(eq(sosRequests.operatorId, operatorId), inArray(sosRequests.status, ACTIVE)))
}

/** theTeller confirmed (or failed) a MoMo tow payment. */
export async function markSosPayment(sosId: string, success: boolean, amountPesewas: bigint) {
  const [s] = await db().select().from(sosRequests).where(eq(sosRequests.id, sosId)).limit(1)
  if (!s || s.paymentStatus === "paid") return
  if (success && s.quoteAmount && amountPesewas > 0n && amountPesewas < s.quoteAmount) {
    const { alertAdmin } = await import("@/lib/escrow/service")
    await alertAdmin("Tow underpayment", `${s.number}: paid ${amountPesewas} of ${s.quoteAmount} pesewas`, { type: "sos_request", id: s.id })
    return
  }
  await db().update(sosRequests).set({ paymentStatus: success ? "paid" : "failed", paidAt: success ? new Date() : null, updatedAt: new Date() }).where(eq(sosRequests.id, s.id))
  await event(s.id, success ? "paid" : "payment_failed", success ? "MoMo payment received — FixAm holds it until the job is done" : "MoMo payment failed", null)
  if (success && s.operatorId) {
    const [op] = await db().select({ phone: towOperators.phone }).from(towOperators).where(eq(towOperators.id, s.operatorId)).limit(1)
    if (op?.phone) await sendDirectSms(op.phone, "sos_status", { number: s.number, status: "The driver has paid by MoMo. You'll be paid when the job is completed.", link: appUrl(`/tow/jobs/${s.id}`) })
  }
}

/** Search helpers for pages. */
export async function sosForDriver(sosId: string, userId: string) {
  const [row] = await db().select({ s: sosRequests, op: towOperators, garageName: garages.name })
    .from(sosRequests)
    .leftJoin(towOperators, eq(towOperators.id, sosRequests.operatorId))
    .leftJoin(garages, eq(garages.id, sosRequests.destinationGarageId))
    .where(and(eq(sosRequests.id, sosId), eq(sosRequests.requesterUserId, userId))).limit(1)
  return row ?? null
}

export async function sosEventsFor(sosId: string) {
  return db().select().from(sosEvents).where(eq(sosEvents.sosId, sosId)).orderBy(desc(sosEvents.createdAt)).limit(30)
}

export async function garageHasTowArrivals(garageId: string) {
  const [r] = await db().select({ n: sql<number>`count(*)::int` }).from(sosRequests)
    .where(and(eq(sosRequests.destinationGarageId, garageId), eq(sosRequests.status, "towing")))
  return Number(r?.n ?? 0)
}

