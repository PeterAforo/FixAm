"use server"

import { z } from "zod"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, sosRecipients, sosRequests, towOperatorMembers, towOperators } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { rateLimit } from "@/lib/rate-limit"
import { storageProvider } from "@/lib/integrations/storage"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { normalizeGhPhone } from "@/lib/phone"
import { encryptPayoutAccount, decryptPayoutAccount, guessNetwork, maskPayoutAccount, payoutAccountSchema, type PayoutAccount } from "@/lib/escrow/payout-account"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { ACTIVE, PROBLEM_IDS, SERVICES, distanceKm, etaMinutes, operatorPoint, suggestQuote, type SosStatus } from "./core"
import { acceptSos, createSos, declineSos, moveSos, operatorForUser, sosEventsFor, sosForDriver, updateOperatorLocation } from "./service"

type Fail = { ok: false; error: string }
const num = (v: string | null | undefined) => (v == null ? null : Number(v))

async function driver() {
  const [userId, phone] = await Promise.all([getSessionUserId(), getPortalPhone()])
  return userId && phone ? { userId, phone } : null
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

const sosSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  problem: z.enum(PROBLEM_IDS),
  notes: z.string().trim().max(500).optional(),
  landmark: z.string().trim().max(200).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  plate: z.string().trim().max(20).optional(),
  name: z.string().trim().max(80).optional(),
  destinationGarageId: z.string().uuid().optional(),
  radiusKm: z.coerce.number().int().min(5).max(60).default(25),
})

/** Driver presses SOS. FormData so photos can come along. */
export async function sendSos(form: FormData): Promise<{ ok: true; sosId: string; notified: number } | Fail> {
  const me = await driver()
  if (!me) return { ok: false, error: "Sign in with your phone first" }
  const rl = await rateLimit(`sos:${me.userId}`, 4, 3600)
  if (!rl.ok) return { ok: false, error: "You've sent several SOS calls — if it's an emergency, call 112 (police) or 193 (ambulance)" }
  const get = (k: string) => form.get(k) || undefined
  const parsed = sosSchema.safeParse({
    lat: get("lat"), lng: get("lng"), problem: get("problem"), notes: get("notes"), landmark: get("landmark"),
    make: get("make"), model: get("model"), year: get("year"), plate: get("plate"), name: get("name"),
    destinationGarageId: get("destinationGarageId"), radiusKm: get("radiusKm"),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path.includes("lat") ? "We need your location — allow location access and try again" : "Check the form" }
  const d = parsed.data

  // Photos first, so operators see them with the alert.
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0 && f.type.startsWith("image/")).slice(0, 3)
  const folder = uuidv7()
  const photoPaths: string[] = []
  for (const f of files) {
    if (f.size > 4 * 1024 * 1024) continue
    const key = `sos/${folder}/${uuidv7()}.${(f.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/g, "")}`
    await storageProvider().put(key, Buffer.from(await f.arrayBuffer()), f.type).then(() => photoPaths.push(key)).catch(() => undefined)
  }

  const { sos, notified } = await createSos({
    userId: me.userId, phone: me.phone, name: d.name ?? null,
    vehicle: { make: d.make ?? null, model: d.model ?? null, year: d.year ?? null, plate: d.plate ?? null },
    problem: d.problem, notes: d.notes ?? null, lat: d.lat, lng: d.lng, landmark: d.landmark ?? null,
    radiusKm: d.radiusKm, destinationGarageId: d.destinationGarageId ?? null, photoPaths,
  })
  return { ok: true, sosId: sos.id, notified }
}

export type DriverSosView = {
  id: string; number: string; status: string; problem: string; createdAt: string; expiresAt: string
  lat: number; lng: number
  operator: { name: string; phone: string; verified: boolean; completedJobs: number } | null
  quote: number | null; quoteNote: string | null; etaMinutes: number | null
  operatorLocation: { lat: number; lng: number; at: string; distanceKm: number; etaMinutes: number } | null
  destination: { id: string; name: string } | null
  paymentMethod: string | null; paymentStatus: string
  repairRequestId: string | null
  events: { status: string; note: string | null; at: string }[]
}

/** Polled every few seconds by the driver's tracking screen. */
export async function getMySos(sosId: string): Promise<DriverSosView | null> {
  const userId = await getSessionUserId()
  if (!userId || !z.string().uuid().safeParse(sosId).success) return null
  const row = await sosForDriver(sosId, userId)
  if (!row) return null
  const s = row.s
  const at = { lat: Number(s.lat), lng: Number(s.lng) }
  const oLat = num(s.operatorLat)
  const oLng = num(s.operatorLng)
  const events = await sosEventsFor(s.id)
  const km = oLat != null && oLng != null ? distanceKm({ lat: oLat, lng: oLng }, at) : null
  return {
    id: s.id, number: s.number, status: s.status, problem: s.problem, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(),
    lat: at.lat, lng: at.lng,
    operator: row.op ? { name: row.op.businessName, phone: row.op.phone, verified: row.op.isVerified, completedJobs: row.op.completedJobs } : null,
    quote: s.quoteAmount != null ? Number(s.quoteAmount) : null, quoteNote: s.quoteNote, etaMinutes: s.etaMinutes,
    operatorLocation: km != null && ["assigned", "en_route"].includes(s.status)
      ? { lat: oLat!, lng: oLng!, at: (s.operatorLocationAt ?? s.assignedAt ?? s.updatedAt).toISOString(), distanceKm: Math.round(km * 10) / 10, etaMinutes: etaMinutes(km) }
      : null,
    destination: s.destinationGarageId ? { id: s.destinationGarageId, name: row.garageName ?? "Garage" } : null,
    paymentMethod: s.paymentMethod, paymentStatus: s.paymentStatus, repairRequestId: s.repairRequestId,
    events: events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
  }
}

export async function listMySos(): Promise<{ id: string; number: string; status: string; problem: string; createdAt: string }[]> {
  const userId = await getSessionUserId()
  if (!userId) return []
  const rows = await db().select({ id: sosRequests.id, number: sosRequests.number, status: sosRequests.status, problem: sosRequests.problem, createdAt: sosRequests.createdAt })
    .from(sosRequests).where(eq(sosRequests.requesterUserId, userId)).orderBy(desc(sosRequests.createdAt)).limit(10)
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

export async function setSosDestination(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid(), garageId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const [g] = await db().select({ id: garages.id }).from(garages).where(and(eq(garages.id, parsed.data.garageId), eq(garages.status, "active"))).limit(1)
  if (!g) return { ok: false, error: "Garage not found" }
  const [u] = await db().update(sosRequests).set({ destinationGarageId: g.id, updatedAt: new Date() })
    .where(and(eq(sosRequests.id, parsed.data.sosId), eq(sosRequests.requesterUserId, userId), inArray(sosRequests.status, ["searching", "assigned", "en_route", "arrived"]))).returning({ id: sosRequests.id })
  return u ? { ok: true } : { ok: false, error: "You can't change the garage now" }
}

/** Pay the agreed price by MoMo through theTeller — FixAm holds it until the job is done. */
export async function paySosByMomo(raw: unknown): Promise<{ ok: true; checkoutUrl: string } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const me = await driver()
  if (!me) return { ok: false, error: "Sign in first" }
  const [s] = await db().select().from(sosRequests).where(and(eq(sosRequests.id, parsed.data.sosId), eq(sosRequests.requesterUserId, me.userId))).limit(1)
  if (!s || !s.quoteAmount || !ACTIVE.includes(s.status as SosStatus)) return { ok: false, error: "There's nothing to pay yet" }
  if (s.paymentStatus === "paid" || s.paymentStatus === "cash") return { ok: false, error: "Already settled" }
  const reference = await nextPaymentReference()
  await db().update(sosRequests).set({ paymentMethod: "momo", paymentReference: reference, paymentStatus: "pending", updatedAt: new Date() }).where(eq(sosRequests.id, s.id))
  try {
    const init = await paymentProvider().initializeCheckout({
      amountPesewas: s.quoteAmount, reference, phone: me.phone, description: `FixAm tow ${s.number}`, returnPath: `/portal/sos/${s.id}`,
      metadata: { sosId: s.id },
    })
    return { ok: true, checkoutUrl: init.authorizationUrl }
  } catch {
    await db().update(sosRequests).set({ paymentStatus: "unpaid", updatedAt: new Date() }).where(eq(sosRequests.id, s.id))
    return { ok: false, error: "We couldn't start the payment — try again, or pay the driver in cash" }
  }
}

export async function chooseSosCash(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const [u] = await db().update(sosRequests).set({ paymentMethod: "cash", updatedAt: new Date() })
    .where(and(eq(sosRequests.id, parsed.data.sosId), eq(sosRequests.requesterUserId, userId), inArray(sosRequests.paymentStatus, ["unpaid", "failed"]))).returning({ id: sosRequests.id })
  return u ? { ok: true } : { ok: false, error: "Payment can't be changed now" }
}

export async function cancelMySos(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid(), reason: z.string().trim().max(200).optional() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  const [s] = await db().select().from(sosRequests).where(and(eq(sosRequests.id, parsed.data.sosId), eq(sosRequests.requesterUserId, userId))).limit(1)
  if (!s || !["searching", "assigned", "en_route"].includes(s.status)) return { ok: false, error: "This can't be cancelled now" }
  if (s.paymentStatus === "paid") return { ok: false, error: "You've already paid — ask FixAm support to cancel and refund" }
  await db().update(sosRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelReason: parsed.data.reason ?? null, updatedAt: new Date() }).where(eq(sosRequests.id, s.id))
  if (s.operatorId) {
    const [op] = await db().select({ phone: towOperators.phone }).from(towOperators).where(eq(towOperators.id, s.operatorId)).limit(1)
    if (op?.phone) {
      const { sendDirectSms, appUrl } = await import("@/lib/messaging/direct")
      await sendDirectSms(op.phone, "sos_status", { number: s.number, status: "The driver cancelled this job.", link: appUrl("/tow") })
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Tow operator
// ---------------------------------------------------------------------------

async function me() {
  const userId = await getSessionUserId()
  if (!userId) return null
  const r = await operatorForUser(userId)
  return r ? { userId, op: r.op, role: r.role } : null
}

const signupSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  baseLat: z.number().min(-90).max(90).nullable().optional(),
  baseLng: z.number().min(-180).max(180).nullable().optional(),
  serviceRadiusKm: z.number().int().min(5).max(100).default(25),
  services: z.array(z.enum(SERVICES.map((s) => s.id) as [string, ...string[]])).min(1),
  baseFeeGhs: z.number().min(0).max(100_000).default(0),
  perKmFeeGhs: z.number().min(0).max(1000).default(0),
  /** MoMo payout number + account name (network is worked out from the number). */
  momoPhone: z.string().trim().max(20).optional(),
  momoName: z.string().trim().max(120).optional(),
  planCode: z.string().min(1).max(40).optional(),
})

function momoAccount(phone: string | undefined, name: string | undefined): PayoutAccount | null | "invalid" {
  if (!phone) return null
  const p = normalizeGhPhone(phone)
  const network = p ? guessNetwork(p) : null
  if (!p || !network) return "invalid"
  const parsed = payoutAccountSchema.safeParse({ method: "momo", phone: p, network, accountName: name || "Account holder" })
  return parsed.success ? parsed.data : "invalid"
}

export async function towSignup(raw: unknown): Promise<{ ok: true } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: "Sign in first" }
  if (await operatorForUser(userId)) return { ok: true }
  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const d = parsed.data
  const phone = normalizeGhPhone(d.phone)
  if (!phone) return { ok: false, error: "Enter a valid Ghana phone number" }
  const payout = momoAccount(d.momoPhone, d.momoName)
  if (payout === "invalid") return { ok: false, error: "Enter an MTN, Telecel or AirtelTigo MoMo number for payouts" }
  const { resolvePlanCode, createTrialSubscription } = await import("@/lib/billing/account")
  const planCode = await resolvePlanCode("tow", d.planCode)
  if (!planCode) return { ok: false, error: "No towing plans configured — contact support" }
  const id = uuidv7()
  await db().insert(towOperators).values({
    id, businessName: d.businessName, phone, city: d.city ?? null, region: d.region ?? null,
    baseLat: d.baseLat != null ? d.baseLat.toFixed(6) : null, baseLng: d.baseLng != null ? d.baseLng.toFixed(6) : null,
    serviceRadiusKm: d.serviceRadiusKm, services: d.services,
    baseFee: BigInt(Math.round(d.baseFeeGhs * 100)), perKmFee: BigInt(Math.round(d.perKmFeeGhs * 100)),
    payoutDetailsEncrypted: payout ? encryptPayoutAccount(payout) : null,
  })
  await db().insert(towOperatorMembers).values({ operatorId: id, userId, role: "owner" })
  await createTrialSubscription({ ownerKind: "tow", ownerId: id, planCode })
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "tow_operator.signup", entityType: "tow_operator", entityId: id, after: { businessName: d.businessName } }).catch(() => undefined)
  return { ok: true }
}

export type OperatorView = {
  id: string; businessName: string; phone: string; city: string | null; region: string | null
  isAvailable: boolean; serviceRadiusKm: number; services: string[]; baseFee: number; perKmFee: number
  baseLat: number | null; baseLng: number | null; payoutMasked: string | null; isVerified: boolean; completedJobs: number
  liveLocationAt: string | null
}

export async function getMyOperator(): Promise<OperatorView | null> {
  const m = await me()
  if (!m) return null
  const o = m.op
  return {
    id: o.id, businessName: o.businessName, phone: o.phone, city: o.city, region: o.region, isAvailable: o.isAvailable,
    serviceRadiusKm: o.serviceRadiusKm, services: o.services, baseFee: Number(o.baseFee), perKmFee: Number(o.perKmFee),
    baseLat: num(o.baseLat), baseLng: num(o.baseLng), payoutMasked: maskPayoutAccount(decryptPayoutAccount(o.payoutDetailsEncrypted)),
    isVerified: o.isVerified, completedJobs: o.completedJobs, liveLocationAt: o.lastLocationAt?.toISOString() ?? null,
  }
}

export async function updateTowProfile(raw: unknown): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m || m.role !== "owner") return { ok: false, error: "Only the owner can change settings" }
  const parsed = signupSchema.partial().safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" }
  const d = parsed.data
  const phone = d.phone ? normalizeGhPhone(d.phone) : undefined
  if (d.phone && !phone) return { ok: false, error: "Enter a valid Ghana phone number" }
  const payout = momoAccount(d.momoPhone, d.momoName)
  if (payout === "invalid") return { ok: false, error: "Enter an MTN, Telecel or AirtelTigo MoMo number for payouts" }
  await db().update(towOperators).set({
    ...(d.businessName ? { businessName: d.businessName } : {}),
    ...(phone ? { phone } : {}),
    ...(d.city !== undefined ? { city: d.city || null } : {}),
    ...(d.region !== undefined ? { region: d.region || null } : {}),
    ...(d.baseLat !== undefined ? { baseLat: d.baseLat != null ? d.baseLat.toFixed(6) : null } : {}),
    ...(d.baseLng !== undefined ? { baseLng: d.baseLng != null ? d.baseLng.toFixed(6) : null } : {}),
    ...(d.serviceRadiusKm ? { serviceRadiusKm: d.serviceRadiusKm } : {}),
    ...(d.services ? { services: d.services } : {}),
    ...(d.baseFeeGhs !== undefined ? { baseFee: BigInt(Math.round(d.baseFeeGhs * 100)) } : {}),
    ...(d.perKmFeeGhs !== undefined ? { perKmFee: BigInt(Math.round(d.perKmFeeGhs * 100)) } : {}),
    ...(payout ? { payoutDetailsEncrypted: encryptPayoutAccount(payout) } : {}),
    updatedAt: new Date(),
  }).where(eq(towOperators.id, m.op.id))
  return { ok: true }
}

export async function setTowAvailability(raw: unknown): Promise<{ ok: true; available: boolean } | Fail> {
  const parsed = z.object({ available: z.boolean() }).safeParse(raw)
  const m = await me()
  if (!m || !parsed.success) return { ok: false, error: "No permission" }
  if (parsed.data.available && m.op.baseLat == null && !m.op.lastLocationAt) return { ok: false, error: "Share your location or set your base in Settings first, so we can send you nearby jobs" }
  await db().update(towOperators).set({ isAvailable: parsed.data.available, updatedAt: new Date() }).where(eq(towOperators.id, m.op.id))
  return { ok: true, available: parsed.data.available }
}

export async function shareTowLocation(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(raw)
  const m = await me()
  if (!m || !parsed.success) return { ok: false, error: "No permission" }
  const rl = await rateLimit(`tow-loc:${m.op.id}`, 120, 600)
  if (!rl.ok) return { ok: true }
  await updateOperatorLocation(m.op.id, parsed.data.lat, parsed.data.lng)
  return { ok: true }
}

export type OperatorJob = {
  id: string; number: string; status: string; problem: string; notes: string | null; landmark: string | null
  vehicle: string | null; plate: string | null; lat: number; lng: number; createdAt: string
  distanceKm: number | null; suggestedQuote: number; isMine: boolean; declined: boolean
  quote: number | null; etaMinutes: number | null; driverName: string | null; driverPhone: string | null
  destination: { name: string; lat: number | null; lng: number | null } | null
  paymentMethod: string | null; paymentStatus: string; photoCount: number
}

function toJob(s: typeof sosRequests.$inferSelect, opts: { operator: typeof towOperators.$inferSelect; declined: boolean; dest: { name: string; lat: string | null; lng: string | null } | null }): OperatorJob {
  const mine = s.operatorId === opts.operator.id
  const at = { lat: Number(s.lat), lng: Number(s.lng) }
  const p = operatorPoint({ ...opts.operator, lastLat: num(opts.operator.lastLat), lastLng: num(opts.operator.lastLng), baseLat: num(opts.operator.baseLat), baseLng: num(opts.operator.baseLng) }, new Date())
  const toDriver = p ? distanceKm(p, at) : null
  const destLat = opts.dest?.lat != null ? Number(opts.dest.lat) : null
  const destLng = opts.dest?.lng != null ? Number(opts.dest.lng) : null
  const toGarage = destLat != null && destLng != null ? distanceKm(at, { lat: destLat, lng: destLng }) : null
  return {
    id: s.id, number: s.number, status: s.status, problem: s.problem, notes: s.notes, landmark: s.landmark,
    vehicle: [s.vehicleMake, s.vehicleModel, s.vehicleYear].filter(Boolean).join(" ") || null, plate: mine ? s.vehiclePlate : null,
    lat: at.lat, lng: at.lng, createdAt: s.createdAt.toISOString(),
    distanceKm: toDriver != null ? Math.round(toDriver * 10) / 10 : null,
    suggestedQuote: suggestQuote({ baseFee: Number(opts.operator.baseFee), perKmFee: Number(opts.operator.perKmFee) }, toDriver ?? 0, toGarage),
    isMine: mine, declined: opts.declined,
    quote: s.quoteAmount != null ? Number(s.quoteAmount) : null, etaMinutes: s.etaMinutes,
    // The driver's name and phone are only shared with the operator who took the job.
    driverName: mine ? s.requesterName : null, driverPhone: mine ? s.requesterPhone : null,
    destination: opts.dest ? { name: opts.dest.name, lat: destLat, lng: destLng } : null,
    paymentMethod: s.paymentMethod, paymentStatus: s.paymentStatus, photoCount: Array.isArray(s.photoPaths) ? (s.photoPaths as unknown[]).length : 0,
  }
}

/** Open SOS calls sent to this operator + their own active jobs (polled every few seconds). */
export async function listTowJobs(): Promise<{ open: OperatorJob[]; active: OperatorJob[]; recent: OperatorJob[] }> {
  const m = await me()
  if (!m) return { open: [], active: [], recent: [] }
  const open = await db().select({ s: sosRequests, declinedAt: sosRecipients.declinedAt, gName: garages.name, gLat: garages.gpsLat, gLng: garages.gpsLng })
    .from(sosRecipients).innerJoin(sosRequests, eq(sosRequests.id, sosRecipients.sosId)).leftJoin(garages, eq(garages.id, sosRequests.destinationGarageId))
    .where(and(eq(sosRecipients.operatorId, m.op.id), eq(sosRequests.status, "searching"), isNull(sosRecipients.declinedAt)))
    .orderBy(desc(sosRequests.createdAt)).limit(20)
  const mine = await db().select({ s: sosRequests, gName: garages.name, gLat: garages.gpsLat, gLng: garages.gpsLng })
    .from(sosRequests).leftJoin(garages, eq(garages.id, sosRequests.destinationGarageId))
    .where(eq(sosRequests.operatorId, m.op.id)).orderBy(desc(sosRequests.updatedAt)).limit(30)
  const dest = (r: { gName: string | null; gLat: string | null; gLng: string | null }) => (r.gName ? { name: r.gName, lat: r.gLat, lng: r.gLng } : null)
  return {
    open: open.map((r) => toJob(r.s, { operator: m.op, declined: !!r.declinedAt, dest: dest(r) })),
    active: mine.filter((r) => ACTIVE.includes(r.s.status as SosStatus)).map((r) => toJob(r.s, { operator: m.op, declined: false, dest: dest(r) })),
    recent: mine.filter((r) => !ACTIVE.includes(r.s.status as SosStatus)).slice(0, 10).map((r) => toJob(r.s, { operator: m.op, declined: false, dest: dest(r) })),
  }
}

export async function getTowJob(sosId: string): Promise<OperatorJob | null> {
  const m = await me()
  if (!m || !z.string().uuid().safeParse(sosId).success) return null
  const [r] = await db().select({ s: sosRequests, gName: garages.name, gLat: garages.gpsLat, gLng: garages.gpsLng, rec: sosRecipients.id, declinedAt: sosRecipients.declinedAt })
    .from(sosRequests)
    .leftJoin(garages, eq(garages.id, sosRequests.destinationGarageId))
    .leftJoin(sosRecipients, and(eq(sosRecipients.sosId, sosRequests.id), eq(sosRecipients.operatorId, m.op.id)))
    .where(eq(sosRequests.id, sosId)).limit(1)
  if (!r || (r.s.operatorId !== m.op.id && !r.rec)) return null
  return toJob(r.s, { operator: m.op, declined: !!r.declinedAt, dest: r.gName ? { name: r.gName, lat: r.gLat, lng: r.gLng } : null })
}

export async function acceptTowJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid(), priceGhs: z.number().min(1).max(100_000), etaMinutes: z.number().int().min(1).max(600), note: z.string().trim().max(200).optional() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Enter your price and how many minutes until you arrive" }
  const m = await me()
  if (!m) return { ok: false, error: "No permission" }
  if (m.op.status !== "active") return { ok: false, error: "Your account is suspended" }
  const won = await acceptSos({ sosId: parsed.data.sosId, operatorId: m.op.id, userId: m.userId, quote: Math.round(parsed.data.priceGhs * 100), etaMinutes: parsed.data.etaMinutes, note: parsed.data.note ?? null })
  return won ? { ok: true } : { ok: false, error: "Someone else already took this job" }
}

export async function declineTowJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid() }).safeParse(raw)
  const m = await me()
  if (!m || !parsed.success) return { ok: false, error: "No permission" }
  await declineSos(parsed.data.sosId, m.op.id)
  return { ok: true }
}

export async function moveTowJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid(), to: z.enum(["en_route", "arrived", "towing", "completed"]) }).safeParse(raw)
  const m = await me()
  if (!m || !parsed.success) return { ok: false, error: "No permission" }
  const r = await moveSos({ sosId: parsed.data.sosId, operatorId: m.op.id, userId: m.userId, to: parsed.data.to })
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

export async function markTowCashReceived(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ sosId: z.string().uuid() }).safeParse(raw)
  const m = await me()
  if (!m || !parsed.success) return { ok: false, error: "No permission" }
  const [u] = await db().update(sosRequests).set({ paymentMethod: "cash", paymentStatus: "cash", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sosRequests.id, parsed.data.sosId), eq(sosRequests.operatorId, m.op.id), inArray(sosRequests.paymentStatus, ["unpaid", "failed"]))).returning({ id: sosRequests.id })
  return u ? { ok: true } : { ok: false, error: "Payment is already settled" }
}
