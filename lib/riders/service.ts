import "server-only"
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { deliveryOffers, deliveries, riders, users, vendorOrders, vendors } from "@/lib/db/schema"
import { appUrl, sendDirectSms } from "@/lib/messaging/direct"
import { distanceKm } from "@/lib/towing/core"
import { uuidv7 } from "@/lib/id"
import {
  OFFER_BATCH,
  OFFER_TTL_MINUTES,
  canTransitionDelivery,
  offerRadiusKm,
  type DeliveryActor,
  type DeliveryStatus,
} from "./core"

export type Delivery = typeof deliveries.$inferSelect
export type Rider = typeof riders.$inferSelect

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

export async function riderForUser(userId: string): Promise<Rider | null> {
  const [r] = await db().select().from(riders).where(and(eq(riders.userId, userId), isNull(riders.deletedAt))).limit(1)
  return r ?? null
}

export async function riderById(id: string): Promise<Rider | null> {
  const [r] = await db().select().from(riders).where(eq(riders.id, id)).limit(1)
  return r ?? null
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

let seq = 0
export async function nextDeliveryNumber(): Promise<string> {
  // DLV- + 6 digits; collisions retry via the unique index upstream.
  const n = (Date.now() % 1000000 + seq++ * 7919) % 1000000
  return `DLV-${String(n).padStart(6, "0")}`
}

export type DispatchInput = {
  vendorOrderId: string
  kind?: string
  pickup: { name: string; phone: string | null; address: string | null; city: string | null; lat?: number | null; lng?: number | null }
  dropoff: { name: string; phone: string | null; address: string | null; city: string | null; lat?: number | null; lng?: number | null }
  fee: bigint
  createdByUserId: string | null
}

/**
 * Create a delivery in `offered` state and fan it out to the nearest online,
 * approved riders. Returns the delivery.
 */
export async function createDeliveryOffer(input: DispatchInput): Promise<Delivery> {
  const pickupPin = String(Math.floor(1000 + Math.random() * 9000))
  const dropoffPin = String(Math.floor(1000 + Math.random() * 9000))
  const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60_000)
  const [d] = await db()
    .insert(deliveries)
    .values({
      id: uuidv7(),
      number: await nextDeliveryNumber(),
      vendorOrderId: input.vendorOrderId,
      kind: input.kind ?? "part",
      courier: "fixam_rider",
      pickup: input.pickup,
      dropoff: input.dropoff,
      pickupPin,
      dropoffPin,
      fee: input.fee,
      riderEarning: input.fee,
      status: "offered",
      offerRadiusKm: offerRadiusKm(0),
      expiresAt,
      offeredAt: new Date(),
      createdByUserId: input.createdByUserId,
    })
    .returning()
  await fanOut(d!, 0)
  return d!
}

function pointOf(p: unknown): { lat: number; lng: number } | null {
  const o = p as { lat?: number | string | null; lng?: number | string | null } | null
  if (!o || o.lat == null || o.lng == null) return null
  const lat = Number(o.lat)
  const lng = Number(o.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

/**
 * SMS the nearest eligible riders who haven't been offered this delivery yet.
 * `step` widens the radius (used by the Inngest sweep). Returns offers made.
 */
export async function fanOut(d: Delivery, step: number): Promise<number> {
  const origin = pointOf(d.pickup)
  if (!origin) return 0
  const radius = offerRadiusKm(step)
  const candidates = await db()
    .select({ r: riders, phone: users.phone })
    .from(riders)
    .innerJoin(users, eq(users.id, riders.userId))
    .where(and(eq(riders.status, "active"), eq(riders.isOnline, true), eq(riders.ghanaCardVerified, true), isNull(riders.deletedAt)))
    .limit(200)
  const already = new Set(
    (await db().select({ riderId: deliveryOffers.riderId }).from(deliveryOffers).where(eq(deliveryOffers.deliveryId, d.id))).map((o) => o.riderId)
  )
  const nearby = candidates
    .filter((c) => {
      if (!c.phone || already.has(c.r.id)) return false
      const p = pointOf({ lat: c.r.lastLat, lng: c.r.lastLng })
      return p ? distanceKm(origin, p) <= radius : false
    })
    .map((c) => {
      const p = pointOf({ lat: c.r.lastLat, lng: c.r.lastLng })!
      return { ...c, km: distanceKm(origin, p) }
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, OFFER_BATCH)

  let made = 0
  for (const c of nearby) {
    if (!c.phone) continue
    const ins = await db()
      .insert(deliveryOffers)
      .values({ deliveryId: d.id, riderId: c.r.id })
      .onConflictDoNothing()
      .returning({ id: deliveryOffers.id })
    if (!ins.length) continue
    made++
    const drop = d.dropoff as { name?: string; city?: string | null }
    await sendDirectSms(c.phone, "rider_job_offer", {
      number: d.number,
      pickup: `${(d.pickup as { name?: string }).name ?? "pickup"}${(d.pickup as { city?: string | null }).city ? `, ${(d.pickup as { city?: string }).city}` : ""}`,
      dropoff: `${drop.name ?? "drop-off"}${drop.city ? `, ${drop.city}` : ""}`,
      fee: `GH₵${(Number(d.fee) / 100).toFixed(0)}`,
      link: appUrl("/rider"),
    }).catch(() => undefined)
  }
  if (made > 0) {
    await db().update(deliveries).set({ offerRadiusKm: radius, updatedAt: new Date() }).where(eq(deliveries.id, d.id))
  }
  return made
}

/** Cron sweep: widen live offers one step, expire dead ones. */
export async function sweepDeliveries(): Promise<{ widened: number; expired: number }> {
  const now = new Date()
  const open = await db().select().from(deliveries).where(and(eq(deliveries.status, "offered"), isNull(deliveries.riderId))).limit(200)
  let widened = 0
  let expired = 0
  for (const d of open) {
    if (d.expiresAt && d.expiresAt <= now) {
      const [u] = await db().update(deliveries).set({ status: "failed", updatedAt: now }).where(and(eq(deliveries.id, d.id), eq(deliveries.status, "offered"))).returning()
      if (u) {
        expired++
        await failLinkedOrder(u, "No rider accepted in time").catch(() => undefined)
      }
      continue
    }
    const step = Math.floor((d.offerRadiusKm - 5) / 5) + 1
    if (d.offerRadiusKm < 25 && (await fanOut(d, step)) > 0) widened++
  }
  return { widened, expired }
}

/** Mark the linked vendor order failed/cancelled when its delivery dies. */
async function failLinkedOrder(d: Delivery, note: string) {
  if (!d.vendorOrderId) return
  await db()
    .update(vendorOrders)
    .set({ status: "cancelled", courierReference: d.number, updatedAt: new Date() })
    .where(and(eq(vendorOrders.id, d.vendorOrderId), eq(vendorOrders.status, "out_for_delivery")))
    .catch(() => undefined)
  void note
}

/** Rider accepts an offer — first one wins. */
export async function acceptDelivery(deliveryId: string, riderId: string): Promise<Delivery | null> {
  const [d] = await db().select().from(deliveries).where(eq(deliveries.id, deliveryId)).limit(1)
  if (!d || d.status !== "offered") return null
  const [won] = await db()
    .update(deliveries)
    .set({ status: "assigned", riderId, assignedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.status, "offered"), isNull(deliveries.riderId)))
    .returning()
  if (!won) return null
  const [r] = await db().select({ fullName: riders.fullName }).from(riders).where(eq(riders.id, riderId)).limit(1)
  // Tell the vendor who's coming and give the rider the pickup PIN.
  if (won.vendorOrderId) {
    const [o] = await db().select({ vendorId: vendorOrders.vendorId }).from(vendorOrders).where(eq(vendorOrders.id, won.vendorOrderId)).limit(1)
    if (o) {
      const [v] = await db().select({ phone: vendors.phone }).from(vendors).where(eq(vendors.id, o.vendorId)).limit(1)
      if (v?.phone) {
        await sendDirectSms(v.phone, "delivery_update", {
          number: won.number,
          status: `a FixAm rider (${r?.fullName ?? "rider"}) is on the way — pickup PIN ${won.pickupPin ?? ""}`,
          link: appUrl("/vendor"),
        }).catch(() => undefined)
      }
    }
  }
  return won
}

export async function declineDelivery(deliveryId: string, riderId: string) {
  await db().update(deliveryOffers).set({ declinedAt: new Date() }).where(and(eq(deliveryOffers.deliveryId, deliveryId), eq(deliveryOffers.riderId, riderId)))
}

/** Shared transition used by pickup/drop-off actions after PIN + photo checks. */
export async function moveDelivery(input: {
  deliveryId: string
  riderId: string
  to: "picked_up" | "delivered" | "failed" | "cancelled"
  actor: DeliveryActor
  patch?: Partial<typeof deliveries.$inferInsert>
}): Promise<{ ok: true; delivery: Delivery } | { ok: false; error: string }> {
  const [d] = await db().select().from(deliveries).where(eq(deliveries.id, input.deliveryId)).limit(1)
  if (!d) return { ok: false, error: "Delivery not found" }
  if (d.riderId && d.riderId !== input.riderId && input.actor === "rider") return { ok: false, error: "This job belongs to another rider" }
  if (!canTransitionDelivery(d.status as DeliveryStatus, input.to, input.actor)) {
    return { ok: false, error: `Can't move from ${d.status} to ${input.to}` }
  }
  const stamp =
    input.to === "picked_up" ? { pickedUpAt: new Date() }
    : input.to === "delivered" ? { deliveredAt: new Date() }
    : {}
  const [u] = await db()
    .update(deliveries)
    .set({ status: input.to, ...stamp, ...input.patch, updatedAt: new Date() })
    .where(and(eq(deliveries.id, d.id), eq(deliveries.status, d.status)))
    .returning()
  if (!u) return { ok: false, error: "The delivery changed — refresh" }

  // Side effects: buyer SMS + vendor order completion + rider payout.
  if (u.vendorOrderId) {
    const [o] = await db().select().from(vendorOrders).where(eq(vendorOrders.id, u.vendorOrderId)).limit(1)
    if (o) {
      if (input.to === "picked_up" && o.buyerPhone) {
        await sendDirectSms(o.buyerPhone, "delivery_update", {
          number: u.number,
          status: "your rider has collected it and is on the way",
          link: appUrl("/portal/parts"),
        }).catch(() => undefined)
        // The receiver's PIN — they show it to the rider at handover.
        if (u.dropoffPin) {
          await sendDirectSms(o.buyerPhone, "delivery_dropoff_pin", {
            number: u.number,
            pin: u.dropoffPin,
            link: appUrl("/portal/parts"),
          }).catch(() => undefined)
        }
      }
      if (input.to === "delivered") {
        await db().update(vendorOrders)
          .set({ status: "delivered", deliveredAt: new Date(), updatedAt: new Date() })
          .where(and(eq(vendorOrders.id, o.id), eq(vendorOrders.status, "out_for_delivery")))
          .catch(() => undefined)
        if (o.buyerPhone) {
          await sendDirectSms(o.buyerPhone, "delivery_update", {
            number: u.number,
            status: "delivered — confirm receipt in the app so the seller is paid",
            link: appUrl("/portal/parts"),
          }).catch(() => undefined)
        }
        // Release the escrow hold like fulfilVendorOrder does on delivered.
        const { getHoldForEntity, scheduleAutoRelease } = await import("@/lib/escrow/service")
        const hold = await getHoldForEntity("vendor_order", o.id)
        if (hold?.status === "held") await scheduleAutoRelease(hold.id).catch(() => undefined)
        // Pay the rider.
        if (u.riderId && u.riderEarning && u.riderEarning > 0n) {
          const { queueRiderSettlement } = await import("@/lib/escrow/service")
          await queueRiderSettlement({ riderId: u.riderId, amount: u.riderEarning, key: `rider:${u.id}`, memo: `Delivery ${u.number}` }).catch(() => undefined)
          await db().update(riders).set({ completedJobs: sql`${riders.completedJobs} + 1` }).where(eq(riders.id, u.riderId)).catch(() => undefined)
        }
      }
      if (input.to === "failed" || input.to === "cancelled") {
        const { getHoldForEntity, refundHold } = await import("@/lib/escrow/service")
        const hold = await getHoldForEntity("vendor_order", o.id)
        if (hold?.status === "held") await refundHold(hold.id, { note: `Delivery ${input.to}: ${u.number}` }).catch(() => undefined)
      }
    }
  }
  return { ok: true, delivery: u }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function deliveriesForRider(riderId: string) {
  return db().select().from(deliveries).where(eq(deliveries.riderId, riderId)).orderBy(desc(deliveries.createdAt)).limit(50)
}

export async function deliveryForRider(deliveryId: string, riderId: string) {
  const [d] = await db().select().from(deliveries).where(and(eq(deliveries.id, deliveryId), eq(deliveries.riderId, riderId))).limit(1)
  return d ?? null
}

/** Deliveries offered to this rider (from delivery_offers) or broadcast live. */
export async function availableForRider(riderId: string) {
  const rows = await db()
    .select({ d: deliveries })
    .from(deliveryOffers)
    .innerJoin(deliveries, eq(deliveries.id, deliveryOffers.deliveryId))
    .where(and(eq(deliveryOffers.riderId, riderId), isNull(deliveryOffers.declinedAt), eq(deliveries.status, "offered")))
    .orderBy(asc(deliveries.expiresAt))
    .limit(20)
  return rows.map((r) => r.d)
}

export async function deliveryForVendorOrder(vendorOrderId: string) {
  const [d] = await db().select().from(deliveries).where(eq(deliveries.vendorOrderId, vendorOrderId)).orderBy(desc(deliveries.createdAt)).limit(1)
  return d ?? null
}

export type DispatchPoint = { name?: string; phone?: string | null; address?: string | null; city?: string | null; lat?: number | null; lng?: number | null }

export async function serializeDelivery(d: Delivery) {
  return {
    id: d.id,
    number: d.number,
    kind: d.kind,
    courier: d.courier,
    status: d.status,
    pickup: (d.pickup ?? {}) as DispatchPoint,
    dropoff: (d.dropoff ?? {}) as DispatchPoint,
    fee: Number(d.fee),
    riderEarning: d.riderEarning != null ? Number(d.riderEarning) : null,
    offerRadiusKm: d.offerRadiusKm,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    assignedAt: d.assignedAt?.toISOString() ?? null,
    pickedUpAt: d.pickedUpAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    // PINs are only exposed through dedicated vendor/rider actions — never here.
    hasPickupPin: !!d.pickupPin,
    hasDropoffPin: !!d.dropoffPin,
  }
}
