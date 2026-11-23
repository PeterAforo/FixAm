"use server"

import { z } from "zod"
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  escrowHolds,
  garages,
  vehicles,
  vendorOrderEvents,
  vendorOrderItems,
  vendorOrders,
  vendors,
} from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { listPortalVehicles } from "@/lib/portal/profile"
import { findFittingProducts, type FittingProduct } from "@/lib/parts-catalog/actions"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { rateLimit } from "@/lib/rate-limit"
import { uuidv7 } from "@/lib/id"
import { getHoldForEntity, openDispute, releaseHold } from "@/lib/escrow/service"
import { buildQuote, createBuyerPartOrder, garageDests, orderSchema, type DestGarage, type PartQuote } from "./order-service"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

/** Orders this driver bought — signed in, or via an estimate link sent to their phone. */
const mine = (me: { userId: string; phone: string }) => or(eq(vendorOrders.buyerUserId, me.userId), eq(vendorOrders.buyerPhone, me.phone))!

async function driver(): Promise<{ userId: string; phone: string } | null> {
  const [userId, phone] = await Promise.all([getSessionUserId(), getPortalPhone()])
  return userId && phone ? { userId, phone } : null
}

// ---------------------------------------------------------------------------
// Context: my cars + my garages
// ---------------------------------------------------------------------------

export type DriverCar = { key: string; label: string; make: string; model: string; year: number | null }

export type { DestGarage, PartQuote }

export async function getPartsShopContext(): Promise<{ cars: DriverCar[]; myGarages: DestGarage[] } | null> {
  const me = await driver()
  if (!me) return null
  const [claimed, custRows] = await Promise.all([
    listPortalVehicles(me.phone),
    db().select({ id: customers.id, garageId: customers.garageId }).from(customers).where(and(eq(customers.phone, me.phone), isNull(customers.deletedAt))),
  ])
  const garageCars = custRows.length
    ? await db()
        .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, year: vehicles.year, plate: vehicles.plateNumber })
        .from(vehicles)
        .where(and(inArray(vehicles.currentOwnerId, custRows.map((c) => c.id)), isNull(vehicles.deletedAt)))
        .limit(30)
    : []
  const seen = new Set<string>()
  const cars: DriverCar[] = []
  for (const v of [...claimed.map((c) => ({ id: c.id, make: c.make, model: c.model, year: c.year, plate: c.plateNumber })), ...garageCars]) {
    const sig = `${v.plate ?? ""}|${v.make}|${v.model}|${v.year ?? ""}`.toLowerCase()
    if (seen.has(sig)) continue
    seen.add(sig)
    cars.push({ key: v.id, label: `${v.make} ${v.model}${v.year ? ` ${v.year}` : ""}${v.plate ? ` · ${v.plate}` : ""}`, make: v.make, model: v.model, year: v.year })
  }
  const garageIds = [...new Set(custRows.map((c) => c.garageId))]
  return { cars, myGarages: await garageDests(garageIds, new Set(garageIds)) }
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

const searchSchema = z.object({
  make: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(60).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  q: z.string().trim().max(80).optional(),
  partTypeId: z.string().uuid().optional(),
})

export async function searchPartsForCar(raw: unknown): Promise<FittingProduct[]> {
  const parsed = searchSchema.safeParse(raw)
  if (!parsed.success) return []
  return findFittingProducts({ ...parsed.data, limit: 60 })
}

/** Directory garages a driver can send parts to (refusing garages are flagged, not hidden, so the driver knows why). */
export async function searchDestinationGarages(raw: unknown): Promise<DestGarage[]> {
  const q = z.string().trim().min(2).max(60).safeParse(raw)
  if (!q.success) return []
  const like = `%${q.data}%`
  const rows = await db()
    .select({ id: garages.id })
    .from(garages)
    .where(and(eq(garages.status, "active"), isNull(garages.deletedAt), or(ilike(garages.name, like), ilike(garages.city, like), ilike(garages.region, like))))
    .limit(20)
  return garageDests(rows.map((r) => r.id), new Set())
}

// ---------------------------------------------------------------------------
// Quote + place order
// ---------------------------------------------------------------------------

export async function quotePartOrder(raw: unknown): Promise<{ ok: true; quote: PartQuote } | Fail> {
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) return fail("Check the delivery details")
  const me = await driver()
  const { quote } = await buildQuote(parsed.data, me?.phone)
  return { ok: true, quote }
}

export async function placePartOrder(raw: unknown): Promise<{ ok: true; checkoutUrl: string; orderNumbers: string[] } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in to buy parts")
  const parsed = orderSchema.safeParse(raw)
  if (!parsed.success) return fail("Check the delivery details")
  const rl = await rateLimit(`partorder:${me.userId}`, 10, 3600)
  if (!rl.ok) return fail("Too many orders — try again later")
  const r = await createBuyerPartOrder({ ...parsed.data, buyer: me, returnPath: "/portal/parts/orders" })
  return r.ok ? { ok: true, checkoutUrl: r.checkoutUrl, orderNumbers: r.orders.map((o) => o.number) } : fail(r.error)
}

/** Pay again for an unpaid order (same reference covers the whole basket). */
export async function retryPartOrderPayment(raw: unknown): Promise<{ ok: true; checkoutUrl: string } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const id = z.string().uuid().safeParse(raw)
  if (!id.success) return fail("Invalid order")
  const [o] = await db().select().from(vendorOrders).where(and(eq(vendorOrders.id, id.data), mine(me))).limit(1)
  if (!o || o.paymentStatus === "paid" || ["cancelled", "rejected"].includes(o.status)) return fail("This order can't be paid")
  const siblings = await db().select().from(vendorOrders).where(and(eq(vendorOrders.paystackReference, o.paystackReference ?? "-"), mine(me)))
  const basket = siblings.filter((s) => s.paymentStatus !== "paid" && !["cancelled", "rejected"].includes(s.status))
  const amount = basket.reduce((s, b) => s + b.total + b.fittingFee, 0n)
  const reference = await nextPaymentReference()
  for (const b of basket) {
    await db().update(vendorOrders).set({ paystackReference: reference, paymentStatus: "pending", updatedAt: new Date() }).where(eq(vendorOrders.id, b.id))
    await db().update(escrowHolds).set({ paymentReference: reference, updatedAt: new Date() }).where(and(eq(escrowHolds.entityType, "vendor_order"), eq(escrowHolds.entityId, b.id), eq(escrowHolds.status, "pending_payment")))
  }
  const init = await paymentProvider().initializeCheckout({ amountPesewas: amount, reference, phone: me.phone, description: "FixAm parts", returnPath: "/portal/parts/orders" })
  return { ok: true, checkoutUrl: init.authorizationUrl }
}

// ---------------------------------------------------------------------------
// My orders
// ---------------------------------------------------------------------------

export type MyPartOrder = {
  id: string
  number: string
  status: string
  paymentStatus: string | null
  holdStatus: string | null
  vendorName: string
  vendorPhone: string
  destinationType: string
  destinationLabel: string
  total: number
  fittingFee: number
  riderName: string | null
  riderPhone: string | null
  courierReference: string | null
  expectedDeliveryAt: string | null
  createdAt: string
  items: { description: string; quantity: number; unitPrice: number }[]
  canConfirm: boolean
  canDispute: boolean
  canPay: boolean
}

export async function listMyPartOrders(): Promise<MyPartOrder[]> {
  const me = await driver()
  if (!me) return []
  const rows = await db()
    .select({ o: vendorOrders, vendorName: vendors.businessName, vendorPhone: vendors.phone, garageName: garages.name, holdStatus: escrowHolds.status })
    .from(vendorOrders)
    .innerJoin(vendors, eq(vendors.id, vendorOrders.vendorId))
    .leftJoin(garages, eq(garages.id, vendorOrders.garageId))
    .leftJoin(escrowHolds, and(eq(escrowHolds.entityType, "vendor_order"), eq(escrowHolds.entityId, vendorOrders.id)))
    .where(mine(me))
    .orderBy(desc(vendorOrders.createdAt))
    .limit(50)
  const ids = rows.map((r) => r.o.id)
  const items = ids.length
    ? await db()
        .select({ orderId: vendorOrderItems.vendorOrderId, description: vendorOrderItems.description, quantity: vendorOrderItems.quantity, unitPrice: vendorOrderItems.unitPrice })
        .from(vendorOrderItems)
        .where(inArray(vendorOrderItems.vendorOrderId, ids))
    : []
  return rows.map(({ o, vendorName, vendorPhone, garageName, holdStatus }) => {
    const active = !["cancelled", "rejected", "received", "returned"].includes(o.status)
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      paymentStatus: o.paymentStatus,
      holdStatus,
      vendorName,
      vendorPhone,
      destinationType: o.destinationType,
      destinationLabel:
        o.destinationType === "garage" ? `Deliver to ${garageName ?? "garage"}` : o.destinationType === "home" ? `Deliver to ${o.deliveryAddress ?? "you"}` : `Pick up from ${vendorName}`,
      total: Number(o.total + o.fittingFee),
      fittingFee: Number(o.fittingFee),
      riderName: o.riderName,
      riderPhone: o.riderPhone,
      courierReference: o.courierReference,
      expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
      canConfirm: o.destinationType !== "garage" && o.paymentStatus === "paid" && ["out_for_delivery", "delivered"].includes(o.status),
      canDispute: o.paymentStatus === "paid" && holdStatus === "held" && active,
      canPay: o.paymentStatus !== "paid" && active,
    }
  })
}

/** Home delivery / pickup: the driver confirms they have the part → vendor is paid. */
export async function confirmMyPartReceived(raw: unknown): Promise<{ ok: true } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const id = z.string().uuid().safeParse(raw)
  if (!id.success) return fail("Invalid order")
  const [o] = await db().select().from(vendorOrders).where(and(eq(vendorOrders.id, id.data), mine(me))).limit(1)
  if (!o) return fail("Order not found")
  if (o.destinationType === "garage") return fail("Your garage confirms parts delivered to them")
  if (!["out_for_delivery", "delivered"].includes(o.status)) return fail("This order hasn't been sent yet")
  const [updated] = await db()
    .update(vendorOrders)
    .set({ status: "received", receivedAt: new Date(), receivedBy: me.userId, updatedAt: new Date() })
    .where(and(eq(vendorOrders.id, o.id), inArray(vendorOrders.status, ["out_for_delivery", "delivered"])))
    .returning({ id: vendorOrders.id })
  if (!updated) return fail("Already confirmed")
  await db().insert(vendorOrderEvents).values({ id: uuidv7(), garageId: o.garageId, vendorOrderId: o.id, status: "received", actorUserId: me.userId, note: "Driver confirmed receipt" })
  const hold = await getHoldForEntity("vendor_order", o.id)
  if (hold?.status === "held") await releaseHold(hold.id, { actorUserId: me.userId, note: "Driver confirmed receipt" })
  return { ok: true }
}

export async function disputeMyPartOrder(raw: unknown): Promise<{ ok: true } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const parsed = z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).safeParse(raw)
  if (!parsed.success) return fail("Tell us what went wrong (at least 10 characters)")
  const [o] = await db().select({ id: vendorOrders.id }).from(vendorOrders).where(and(eq(vendorOrders.id, parsed.data.orderId), mine(me))).limit(1)
  if (!o) return fail("Order not found")
  const hold = await getHoldForEntity("vendor_order", o.id)
  if (!hold) return fail("No payment held for this order")
  const r = await openDispute(hold.id, { userId: me.userId, reason: parsed.data.reason })
  return r.ok ? { ok: true } : fail(r.message ?? "Can't report this order")
}

export async function countMyOpenPartOrders(): Promise<number> {
  const me = await driver()
  if (!me) return 0
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(vendorOrders)
    .where(and(mine(me), inArray(vendorOrders.status, ["placed", "accepted", "packed", "out_for_delivery", "delivered"])))
  return r?.n ?? 0
}
