"use server"

import { z } from "zod"
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  customers,
  escrowHolds,
  garageSettings,
  garages,
  vehicles,
  vendorOrderEvents,
  vendorOrderItems,
  vendorOrders,
  vendorProducts,
  vendors,
} from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { getPortalPhone } from "@/lib/portal/session"
import { listPortalVehicles } from "@/lib/portal/profile"
import { findFittingProducts, type FittingProduct } from "@/lib/parts-catalog/actions"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { nextDocNumber } from "@/lib/money/sequence"
import { rateLimit } from "@/lib/rate-limit"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { createHold, getHoldForEntity, openDispute, releaseHold } from "@/lib/escrow/service"
import { guessNetwork } from "@/lib/escrow/payout-account"
import { commissionFor, quoteByVendor, type Destination, type VendorQuote } from "./core"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function driver(): Promise<{ userId: string; phone: string } | null> {
  const [userId, phone] = await Promise.all([getSessionUserId(), getPortalPhone()])
  return userId && phone ? { userId, phone } : null
}

// ---------------------------------------------------------------------------
// Context: my cars + my garages
// ---------------------------------------------------------------------------

export type DriverCar = { key: string; label: string; make: string; model: string; year: number | null }

export type DestGarage = {
  id: string
  name: string
  slug: string
  city: string | null
  region: string | null
  acceptsCustomerParts: boolean
  fittingFee: number
  isMine: boolean
}

async function garageDests(ids: string[], mine: Set<string>): Promise<DestGarage[]> {
  if (ids.length === 0) return []
  const rows = await db()
    .select({
      id: garages.id,
      name: garages.name,
      slug: garages.slug,
      city: garages.city,
      region: garages.region,
      accepts: garageSettings.acceptsCustomerParts,
      fee: garageSettings.customerPartFittingFee,
    })
    .from(garages)
    .leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(and(inArray(garages.id, ids), eq(garages.status, "active"), isNull(garages.deletedAt)))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    city: r.city,
    region: r.region,
    acceptsCustomerParts: r.accepts ?? true,
    fittingFee: Number(r.fee ?? 0n),
    isMine: mine.has(r.id),
  }))
}

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

const destinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("garage"), garageId: z.string().uuid() }),
  z.object({ type: z.literal("home"), address: z.string().trim().min(5).max(300), region: z.string().trim().min(2).max(60), city: z.string().trim().max(60).optional() }),
  z.object({ type: z.literal("pickup") }),
])

const orderSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(30),
  destination: destinationSchema,
  vehicleLabel: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
})

export type PartQuote = {
  vendors: VendorQuote[]
  fittingFee: number
  garage: DestGarage | null
  total: number
  problems: string[]
}

async function buildQuote(input: z.infer<typeof orderSchema>, userPhone?: string) {
  const ids = [...new Set(input.items.map((i) => i.productId))]
  const prods = await db()
    .select({ p: vendorProducts, v: vendors })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(and(inArray(vendorProducts.id, ids), eq(vendorProducts.isActive, true), eq(vendors.status, "approved"), isNull(vendors.deletedAt)))
  const byId = new Map(prods.map((r) => [r.p.id, r]))
  const problems: string[] = []
  if (byId.size !== ids.length) problems.push("Some parts are no longer available — remove them and try again.")

  let garage: DestGarage | null = null
  let place: { region: string | null; city: string | null } | null = null
  const dest = input.destination as Destination
  if (dest.type === "garage") {
    const mine = new Set<string>()
    if (userPhone) {
      const rows = await db().select({ g: customers.garageId }).from(customers).where(and(eq(customers.phone, userPhone), eq(customers.garageId, dest.garageId))).limit(1)
      if (rows[0]) mine.add(dest.garageId)
    }
    garage = (await garageDests([dest.garageId], mine))[0] ?? null
    if (!garage) problems.push("That garage isn't available.")
    else if (!garage.acceptsCustomerParts) problems.push(`${garage.name} doesn't fit parts customers bring — choose another garage.`)
    place = garage ? { region: garage.region, city: garage.city } : null
  } else if (dest.type === "home") {
    place = { region: dest.region, city: dest.city ?? null }
  }

  const lines = input.items
    .map((i) => {
      const r = byId.get(i.productId)
      if (!r) return null
      if (r.p.stockStatus === "out") problems.push(`${r.p.name} is out of stock.`)
      return { productId: r.p.id, quantity: i.quantity, name: r.p.name, price: Number(r.p.price), vendorId: r.v.id, vendorName: r.v.businessName, deliveryZones: r.v.deliveryZones }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const vendorsQ = quoteByVendor(lines, dest.type === "pickup" ? null : place)
  for (const v of vendorsQ) if (!v.deliverable) problems.push(`${v.vendorName} doesn't deliver there — try pickup or another garage.`)
  const fittingFee = garage?.acceptsCustomerParts ? garage.fittingFee : 0
  const total = vendorsQ.reduce((s, v) => s + v.subtotal + v.deliveryFee, 0) + fittingFee
  return { quote: { vendors: vendorsQ, fittingFee, garage, total, problems } as PartQuote, byId }
}

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

  const input = parsed.data
  const { quote, byId } = await buildQuote(input, me.phone)
  if (quote.problems.length) return fail(quote.problems[0]!)
  const dest = input.destination as Destination
  const garageId = dest.type === "garage" ? dest.garageId : null

  let branchId: string | null = null
  if (garageId) {
    const [b] = await db()
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.garageId, garageId))
      .orderBy(desc(branches.isDefault))
      .limit(1)
    branchId = b?.id ?? null
  }

  const reference = await nextPaymentReference()
  const created: { id: string; number: string }[] = []
  let fittingLeft = BigInt(quote.fittingFee)

  for (const vq of quote.vendors) {
    const vendor = byId.get(vq.lines[0]!.productId)!.v
    const subtotal = BigInt(vq.subtotal)
    const deliveryFee = BigInt(vq.deliveryFee)
    const commission = commissionFor(subtotal, vendor.commissionBp)
    const total = subtotal + deliveryFee
    const fittingFee = fittingLeft
    fittingLeft = 0n
    const number = garageId && branchId ? await nextDocNumber(garageId, branchId, "VO", "VO") : `VO-D${reference.slice(-7)}-${created.length + 1}`
    const orderId = uuidv7()
    await db().insert(vendorOrders).values({
      id: orderId,
      garageId,
      branchId,
      number,
      vendorId: vendor.id,
      origin: garageId ? "customer_to_garage" : "customer_direct",
      orderedByUserId: me.userId,
      buyerUserId: me.userId,
      buyerPhone: me.phone,
      destinationType: dest.type,
      deliveryAddress: dest.type === "home" ? dest.address : null,
      deliveryRegion: dest.type === "home" ? dest.region : quote.garage?.region ?? null,
      deliveryCity: dest.type === "home" ? dest.city ?? null : quote.garage?.city ?? null,
      status: "placed",
      subtotal,
      deliveryFee,
      commissionAmount: commission,
      total,
      fittingFee,
      paymentStatus: "pending",
      paystackReference: reference,
      expectedDeliveryAt: vq.etaHours ? new Date(Date.now() + vq.etaHours * 3600_000) : null,
      notes: [input.vehicleLabel ? `For ${input.vehicleLabel}` : null, input.note].filter(Boolean).join(" — ") || null,
    })
    for (const l of vq.lines) {
      await db().insert(vendorOrderItems).values({
        id: uuidv7(),
        garageId,
        vendorOrderId: orderId,
        vendorProductId: l.productId,
        description: l.name,
        quantity: l.quantity,
        unitPrice: BigInt(l.unitPrice),
      })
    }
    await db().insert(vendorOrderEvents).values({ id: uuidv7(), garageId, vendorOrderId: orderId, status: "placed", actorUserId: me.userId, note: "Ordered by driver" })
    await createHold({
      entityType: "vendor_order",
      entityId: orderId,
      garageId,
      buyerUserId: me.userId,
      payeeType: "vendor",
      payeeId: vendor.id,
      gross: total + fittingFee,
      commissionAmount: commission,
      fittingFee,
      fittingGarageId: fittingFee > 0n ? garageId : null,
      paymentReference: reference,
      payerPhone: me.phone,
      payerNetwork: guessNetwork(me.phone),
    })
    created.push({ id: orderId, number })
  }

  await writeAuditLog({
    garageId,
    actorUserId: me.userId,
    action: "parts_shop.order",
    entityType: "vendor_order",
    entityId: created[0]?.id,
    after: { orders: created.map((c) => c.number), total: quote.total, destination: dest.type, reference },
  }).catch(() => undefined)

  try {
    const init = await paymentProvider().initializeCheckout({
      amountPesewas: BigInt(quote.total),
      reference,
      phone: me.phone,
      description: `FixAm parts ${created.map((c) => c.number).join(", ")}`.slice(0, 100),
      returnPath: "/portal/parts/orders",
      metadata: { orderIds: created.map((c) => c.id).join(","), buyer: me.userId },
    })
    return { ok: true, checkoutUrl: init.authorizationUrl, orderNumbers: created.map((c) => c.number) }
  } catch (e) {
    console.error("[parts-shop] checkout failed:", (e as Error).message)
    return fail("We couldn't start the payment. Your order is saved — try paying again from My orders.")
  }
}

/** Pay again for an unpaid order (same reference covers the whole basket). */
export async function retryPartOrderPayment(raw: unknown): Promise<{ ok: true; checkoutUrl: string } | Fail> {
  const me = await driver()
  if (!me) return fail("Sign in first")
  const id = z.string().uuid().safeParse(raw)
  if (!id.success) return fail("Invalid order")
  const [o] = await db().select().from(vendorOrders).where(and(eq(vendorOrders.id, id.data), eq(vendorOrders.buyerUserId, me.userId))).limit(1)
  if (!o || o.paymentStatus === "paid" || ["cancelled", "rejected"].includes(o.status)) return fail("This order can't be paid")
  const siblings = await db().select().from(vendorOrders).where(and(eq(vendorOrders.paystackReference, o.paystackReference ?? "-"), eq(vendorOrders.buyerUserId, me.userId)))
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
    .where(eq(vendorOrders.buyerUserId, me.userId))
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
  const [o] = await db().select().from(vendorOrders).where(and(eq(vendorOrders.id, id.data), eq(vendorOrders.buyerUserId, me.userId))).limit(1)
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
  const [o] = await db().select({ id: vendorOrders.id }).from(vendorOrders).where(and(eq(vendorOrders.id, parsed.data.orderId), eq(vendorOrders.buyerUserId, me.userId))).limit(1)
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
    .where(and(eq(vendorOrders.buyerUserId, me.userId), inArray(vendorOrders.status, ["placed", "accepted", "packed", "out_for_delivery", "delivered"])))
  return r?.n ?? 0
}
