"use server"

import { z } from "zod"
import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { riders, users, vendorMembers, vendorOrders } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { rateLimit } from "@/lib/rate-limit"
import { storageProvider } from "@/lib/integrations/storage"
import { encryptPayoutAccount, guessNetwork, maskPayoutAccount, payoutAccountSchema, type PayoutAccount } from "@/lib/escrow/payout-account"
import { normalizeGhPhone } from "@/lib/phone"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { normalizeGhanaCard, encryptGhanaCard, ghanaCardMatches } from "./ghana-card"
import { DEFAULT_RIDER_FEE, pinMatches } from "./core"
import {
  acceptDelivery,
  availableForRider,
  createDeliveryOffer,
  declineDelivery,
  deliveryForRider,
  deliveryForVendorOrder,
  deliveriesForRider,
  moveDelivery,
  riderById,
  riderForUser,
  serializeDelivery,
} from "./service"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function me() {
  const userId = await getSessionUserId()
  return userId ? { userId, rider: await riderForUser(userId) } : null
}

function momoAccount(phone: string, name: string): PayoutAccount | "invalid" | null {
  const network = guessNetwork(phone)
  if (!network) return "invalid"
  const parsed = payoutAccountSchema.safeParse({ method: "momo", network, phone, accountName: name })
  return parsed.success ? parsed.data : "invalid"
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/** Rider sign-up — FormData so the bike/licence photos can come along. */
export async function riderSignup(form: FormData): Promise<{ ok: true } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return fail("Sign in first")
  const rl = await rateLimit(`rider-signup:${userId}`, 3, 3600)
  if (!rl.ok) return fail("Too many attempts — wait a while")
  if (await riderForUser(userId)) return { ok: true }

  const ghanaCard = normalizeGhanaCard(String(form.get("ghanaCard") ?? ""))
  if (!ghanaCard) return fail("Enter a valid Ghana Card number (GHA-XXXXXXXXX-X)")
  const bikePlate = String(form.get("bikePlate") ?? "").trim()
  if (!bikePlate) return fail("Enter your motorbike plate")
  const [u] = await db().select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)).limit(1)
  const momoPhone = normalizeGhPhone(String(form.get("momoPhone") ?? ""))
  const momoName = String(form.get("momoName") ?? u?.fullName ?? "").trim()
  if (!momoPhone) return fail("Enter a valid MoMo number for payouts")
  const payout = momoAccount(momoPhone, momoName)
  if (payout === "invalid") return fail("Check the MoMo number and name")

  const folder = uuidv7()
  const sp = storageProvider()
  const upload = async (file: FormDataEntryValue | null, kind: string) => {
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024 || !file.type.startsWith("image/")) return null
    const key = `riders/${folder}/${kind}.${(file.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/g, "")}`
    await sp.put(key, Buffer.from(await file.arrayBuffer()), file.type).then(() => key).catch(() => null)
    return key
  }
  const [motorbike, licence] = await Promise.all([
    upload(form.get("motorbike"), "motorbike"),
    upload(form.get("licence"), "licence"),
  ])
  if (!motorbike) return fail("Add a photo of your motorbike")
  if (!licence) return fail("Add a photo of your licence")

  await db().insert(riders).values({
    id: uuidv7(),
    userId,
    fullName: u?.fullName ?? null,
    bikePlate: bikePlate.slice(0, 20),
    motorbikePhotoPath: motorbike,
    licencePhotoPath: licence,
    ghanaCardEncrypted: encryptGhanaCard(ghanaCard),
    ghanaCardLast4: ghanaCard.slice(-4),
    payoutDetailsEncrypted: payout ? encryptPayoutAccount(payout) : null,
    status: "pending",
  })
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "rider.signup", entityType: "rider", entityId: userId, after: { bikePlate } }).catch(() => undefined)
  return { ok: true }
}

export type RiderView = {
  id: string
  fullName: string | null
  bikePlate: string | null
  status: string
  isOnline: boolean
  ghanaCardVerified: boolean
  ghanaCardLast4: string | null
  payoutMasked: string | null
  completedJobs: number
  canTakeJobs: boolean
}

export async function getMyRider(): Promise<RiderView | null> {
  const m = await me()
  if (!m?.rider) return null
  const r = m.rider
  const { decryptPayoutAccount } = await import("@/lib/escrow/payout-account")
  return {
    id: r.id,
    fullName: r.fullName,
    bikePlate: r.bikePlate,
    status: r.status,
    isOnline: r.isOnline,
    ghanaCardVerified: r.ghanaCardVerified,
    ghanaCardLast4: r.ghanaCardLast4,
    payoutMasked: maskPayoutAccount(decryptPayoutAccount(r.payoutDetailsEncrypted)),
    completedJobs: r.completedJobs,
    canTakeJobs: r.status === "active" && r.ghanaCardVerified,
  }
}

export async function setRiderOnline(raw: unknown): Promise<{ ok: true; isOnline: boolean } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const parsed = z.object({ online: z.boolean() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  if (parsed.data.online && !(m.rider.status === "active" && m.rider.ghanaCardVerified)) {
    return fail(m.rider.status === "pending" ? "Waiting for FixAm approval" : "Your account is suspended")
  }
  await db().update(riders).set({ isOnline: parsed.data.online, updatedAt: new Date() }).where(eq(riders.id, m.rider.id))
  return { ok: true, isOnline: parsed.data.online }
}

export async function shareRiderLocation(raw: unknown): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(raw)
  if (!parsed.success) return fail("Invalid location")
  await db()
    .update(riders)
    .set({ lastLat: parsed.data.lat.toFixed(6), lastLng: parsed.data.lng.toFixed(6), lastLocationAt: new Date(), updatedAt: new Date() })
    .where(eq(riders.id, m.rider.id))
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Rider jobs
// ---------------------------------------------------------------------------

export async function listRiderJobs() {
  const m = await me()
  if (!m?.rider) return { available: [], active: [], recent: [] }
  const [available, mine] = await Promise.all([availableForRider(m.rider.id), deliveriesForRider(m.rider.id)])
  const active = mine.filter((d) => ["assigned", "picked_up"].includes(d.status))
  const recent = mine.filter((d) => ["delivered", "failed", "cancelled"].includes(d.status)).slice(0, 10)
  const ser = async (rows: typeof mine) => Promise.all(rows.map(serializeDelivery))
  return {
    available: await ser(available),
    active: await ser(active),
    recent: await ser(recent),
  }
}

export async function getRiderJob(raw: unknown) {
  const m = await me()
  if (!m?.rider) return null
  const parsed = z.object({ deliveryId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return null
  const d = await deliveryForRider(parsed.data.deliveryId, m.rider.id)
    ?? (await availableForRider(m.rider.id)).find((x) => x.id === parsed.data.deliveryId)
  if (!d) return null
  const s = await serializeDelivery(d)
  // The assigned rider sees the pickup PIN; everyone sees drop-off PIN only via the receiver.
  return { ...s, pickupPin: d.riderId === m.rider.id ? d.pickupPin : null }
}

export async function acceptRiderJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const parsed = z.object({ deliveryId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  const d = await acceptDelivery(parsed.data.deliveryId, m.rider.id)
  return d ? { ok: true } : fail("Someone else took this job")
}

export async function declineRiderJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const parsed = z.object({ deliveryId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  await declineDelivery(parsed.data.deliveryId, m.rider.id)
  return { ok: true }
}

/** Rider collected the package — vendor's pickup PIN required. */
export async function confirmPickup(raw: unknown): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const parsed = z.object({ deliveryId: z.string().uuid(), pin: z.string().trim().max(10) }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  const d = await deliveryForRider(parsed.data.deliveryId, m.rider.id)
  if (!d) return fail("Job not found")
  if (d.status !== "assigned") return fail("This job isn't ready for pickup")
  if (!pinMatches(parsed.data.pin, d.pickupPin)) return fail("Wrong pickup PIN — ask the sender")
  const res = await moveDelivery({ deliveryId: d.id, riderId: m.rider.id, to: "picked_up", actor: "rider" })
  return res.ok ? { ok: true } : fail(res.error)
}

/** Rider dropped off — receiver's PIN + a photo of the handover. */
export async function confirmDropoff(form: FormData): Promise<{ ok: true } | Fail> {
  const m = await me()
  if (!m?.rider) return fail("No rider profile")
  const deliveryId = String(form.get("deliveryId") ?? "")
  const pin = String(form.get("pin") ?? "").trim()
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) return fail("Invalid input")
  const d = await deliveryForRider(deliveryId, m.rider.id)
  if (!d) return fail("Job not found")
  if (d.status !== "picked_up") return fail("Collect the package first")
  if (!pinMatches(pin, d.dropoffPin)) return fail("Wrong receiver PIN — ask the person receiving it")

  const photo = form.get("photo")
  let proofPath: string | null = null
  if (photo instanceof File && photo.size > 0 && photo.size <= 4 * 1024 * 1024 && photo.type.startsWith("image/")) {
    const key = `deliveries/${uuidv7()}/${uuidv7()}.${(photo.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/g, "")}`
    await storageProvider().put(key, Buffer.from(await photo.arrayBuffer()), photo.type).then(() => { proofPath = key }).catch(() => undefined)
  }
  const res = await moveDelivery({
    deliveryId: d.id,
    riderId: m.rider.id,
    to: "delivered",
    actor: "rider",
    patch: proofPath ? { proofPhotoPath: proofPath } : {},
  })
  return res.ok ? { ok: true } : fail(res.error)
}

// ---------------------------------------------------------------------------
// Dispatch (vendor side — called from fulfilVendorOrder)
// ---------------------------------------------------------------------------

/** Vendor picks "FixAm rider": create the delivery offer nearest-first. */
export async function dispatchFixamRider(input: {
  vendorOrderId: string
  vendorUserId: string
  pickup: DispatchPickup
  dropoff: DispatchDropoff
}): Promise<{ ok: true; deliveryId: string; number: string } | Fail> {
  const [o] = await db().select().from(vendorOrders).where(eq(vendorOrders.id, input.vendorOrderId)).limit(1)
  if (!o) return fail("Order not found")
  const d = await createDeliveryOffer({
    vendorOrderId: o.id,
    pickup: input.pickup,
    dropoff: input.dropoff,
    fee: DEFAULT_RIDER_FEE,
    createdByUserId: input.vendorUserId,
  })
  return { ok: true, deliveryId: d.id, number: d.number }
}

type DispatchPickup = { name: string; phone: string | null; address: string | null; city: string | null; lat?: number | null; lng?: number | null }
type DispatchDropoff = DispatchPickup

/** Vendor sees the pickup PIN for their FixAm-rider order (to give the rider). */
export async function getVendorDeliveryPin(raw: unknown): Promise<{ ok: true; pin: string | null; deliveryId: string } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return fail("Sign in first")
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  const [m] = await db().select({ vendorId: vendorMembers.vendorId }).from(vendorMembers).where(eq(vendorMembers.userId, userId)).limit(1)
  if (!m) return fail("No vendor account")
  const [o] = await db().select({ id: vendorOrders.id }).from(vendorOrders).where(and(eq(vendorOrders.id, parsed.data.orderId), eq(vendorOrders.vendorId, m.vendorId))).limit(1)
  if (!o) return fail("Order not found")
  const d = await deliveryForVendorOrder(o.id)
  if (!d || d.courier !== "fixam_rider") return fail("No FixAm rider on this order")
  return { ok: true, pin: d.status === "offered" || d.status === "assigned" ? d.pickupPin : null, deliveryId: d.id }
}

// ---------------------------------------------------------------------------
// Admin approval queue
// ---------------------------------------------------------------------------

export async function adminListRiders() {
  const userId = await getSessionUserId()
  if (!userId) return []
  const [u] = await db().select({ isAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u?.isAdmin) return []
  const rows = await db()
    .select({ r: riders, name: users.fullName, email: users.email, phone: users.phone })
    .from(riders)
    .innerJoin(users, eq(users.id, riders.userId))
    .where(isNull(riders.deletedAt))
    .orderBy(desc(riders.createdAt))
    .limit(200)
  return rows.map(({ r, name, email, phone }) => ({
    id: r.id,
    name: r.fullName ?? name,
    email,
    phone,
    bikePlate: r.bikePlate,
    status: r.status,
    ghanaCardLast4: r.ghanaCardLast4,
    ghanaCardVerified: r.ghanaCardVerified,
    isOnline: r.isOnline,
    completedJobs: r.completedJobs,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function adminSetRiderStatus(raw: unknown): Promise<{ ok: true } | Fail> {
  const userId = await getSessionUserId()
  if (!userId) return fail("Sign in first")
  const [u] = await db().select({ isAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u?.isAdmin) return fail("Admins only")
  const parsed = z.object({
    riderId: z.string().uuid(),
    status: z.enum(["active", "suspended", "pending"]),
    verifyGhanaCard: z.boolean().optional(),
    ghanaCardNumber: z.string().trim().max(20).optional(),
  }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  const d = parsed.data
  const r = await riderById(d.riderId)
  if (!r) return fail("Rider not found")
  const patch: Partial<typeof riders.$inferInsert> = { status: d.status, updatedAt: new Date() }
  if (d.verifyGhanaCard) {
    // Admin compares the physical card; the number is checked against the
    // ciphertext without ever being stored or logged in the clear.
    if (!r.ghanaCardEncrypted || !d.ghanaCardNumber || !ghanaCardMatches(r.ghanaCardEncrypted, d.ghanaCardNumber)) {
      return fail("Ghana Card number doesn't match — check the card")
    }
    patch.ghanaCardVerified = true
  }
  await db().update(riders).set(patch).where(eq(riders.id, r.id))
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "rider.status", entityType: "rider", entityId: r.id, after: { status: d.status, verified: !!d.verifyGhanaCard } }).catch(() => undefined)
  return { ok: true }
}

