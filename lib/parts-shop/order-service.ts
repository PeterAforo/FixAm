import "server-only"
import { z } from "zod"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, customers, garageSettings, garages, vendorOrderEvents, vendorOrderItems, vendorOrders, vendorProducts, vendors } from "@/lib/db/schema"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextPaymentReference } from "@/lib/payments/reference"
import { nextDocNumber } from "@/lib/money/sequence"
import { writeAuditLog } from "@/lib/actions"
import { uuidv7 } from "@/lib/id"
import { createHold } from "@/lib/escrow/service"
import { guessNetwork } from "@/lib/escrow/payout-account"
import { commissionFor, quoteByVendor, type Destination, type VendorQuote } from "./core"

/** Shared by the driver parts shop and the estimate "I'll buy it" flow. */

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

export async function garageDests(ids: string[], mine: Set<string>): Promise<DestGarage[]> {
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

export const destinationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("garage"), garageId: z.string().uuid() }),
  z.object({ type: z.literal("home"), address: z.string().trim().min(5).max(300), region: z.string().trim().min(2).max(60), city: z.string().trim().max(60).optional() }),
  z.object({ type: z.literal("pickup") }),
])

export const orderSchema = z.object({
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

export async function buildQuote(input: z.infer<typeof orderSchema>, userPhone?: string) {
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


export type BuyerOrderResult = { ok: true; checkoutUrl: string; reference: string; orders: { id: string; number: string; productIds: string[] }[] } | { ok: false; error: string }

/**
 * Create vendor orders (one per vendor), escrow holds and a single checkout
 * for a buyer. The buyer may be a signed-in driver or (estimate flow) just a
 * customer phone. Caller has validated + rate-limited.
 */
export async function createBuyerPartOrder(input: z.infer<typeof orderSchema> & {
  buyer: { userId: string | null; phone: string }
  jobId?: string | null
  returnPath: string
}): Promise<BuyerOrderResult> {
  const me = input.buyer
  const { quote, byId } = await buildQuote(input, me.phone)
  if (quote.problems.length) return { ok: false, error: quote.problems[0]! }
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
  const created: { id: string; number: string; productIds: string[] }[] = []
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
      jobId: input.jobId ?? null,
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
    created.push({ id: orderId, number, productIds: vq.lines.map((l) => l.productId) })
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
      returnPath: input.returnPath,
      metadata: { orderIds: created.map((c) => c.id).join(","), buyer: me.userId ?? me.phone },
    })
    return { ok: true, checkoutUrl: init.authorizationUrl, reference, orders: created }
  } catch (e) {
    console.error("[parts-shop] checkout failed:", (e as Error).message)
    return { ok: false, error: "We couldn't start the payment. Your order is saved — try paying again." }
  }
}
