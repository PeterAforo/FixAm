"use server"
import { z } from "zod"
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  branches,
  customers,
  garages,
  parts,
  vehicles,
  vendorOrderEvents,
  vendorOrderItems,
  vendorOrders,
  vendorProducts,
  vendors,
} from "@/lib/db/schema"
import { normalizeGhPhone } from "@/lib/phone"
import { paymentProvider } from "@/lib/integrations/payments"
import { nextDocNumber } from "@/lib/money/sequence"
import { uuidv7 } from "@/lib/id"
import { isCompatible } from "./compat"

// ---------------------------------------------------------------------------
// Public shop (no auth) — garage online catalogue + compatible vendor parts
// ---------------------------------------------------------------------------

type Zone = { region?: string; city?: string; fee?: number; etaHours?: number }
function zonesOf(v: typeof vendors.$inferSelect): Zone[] {
  return Array.isArray(v.deliveryZones) ? (v.deliveryZones as Zone[]) : []
}
function norm(s: string | null | undefined) { return (s ?? "").trim().toLowerCase() }
function zoneFor(v: typeof vendors.$inferSelect, garage: { region: string | null; city: string | null }): Zone | null {
  const zones = zonesOf(v)
  if (zones.length === 0) return null
  const gRegion = norm(garage.region), gCity = norm(garage.city)
  if (!gRegion && !gCity) return zones[0] ?? null
  return zones.find((z) =>
    (gRegion && norm(z.region) === gRegion) ||
    (gCity && (norm(z.city) === gCity || norm(z.region) === gCity))
  ) ?? null
}

export async function getPublicShop(rawInput: unknown) {
  const parsed = z.object({ garageSlug: z.string().min(1).max(80) }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }

  const [garage] = await db().select().from(garages).where(eq(garages.slug, parsed.data.garageSlug)).limit(1)
  if (!garage || garage.status !== "active") return { ok: false as const }

  const [branchRows, partRows, vendorRows] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.garageId, garage.id), isNull(branches.deletedAt))).orderBy(branches.name),
    db().select({
      id: parts.id, sku: parts.sku, name: parts.name, brand: parts.brand,
      category: parts.category, description: parts.description,
      compatibleVehicles: parts.compatibleVehicles, unit: parts.unit,
      sellingPrice: parts.sellingPrice, photoUrl: parts.photoUrl,
      onHand: sql<string>`coalesce((select sum(quantity_on_hand) from stock_levels where part_id = ${parts.id} and garage_id = ${garage.id}), 0)`,
    }).from(parts).where(and(
      eq(parts.garageId, garage.id), eq(parts.onlineVisible, true),
      eq(parts.isActive, true), isNull(parts.deletedAt), ne(parts.isServiceItem, true),
    )).limit(200),
    db().select({ product: vendorProducts, vendor: vendors }).from(vendorProducts)
      .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
      .where(and(
        eq(vendorProducts.isActive, true), eq(vendors.status, "approved"), isNull(vendors.deletedAt),
        ne(vendorProducts.stockStatus, "out"),
      )).limit(300),
  ])

  const zoneMap = new Map<string, Zone>()
  for (const r of vendorRows) {
    const z = zoneFor(r.vendor, garage)
    if (z) zoneMap.set(r.vendor.id, z)
  }
  const deliverableVendorIds = new Set(zoneMap.keys())

  return {
    ok: true as const,
    data: {
      garage: { id: garage.id, name: garage.name, slug: garage.slug, city: garage.city, region: garage.region },
      branches: branchRows,
      parts: partRows.map((p) => ({
        ...p, sellingPrice: Number(p.sellingPrice), onHand: Number(p.onHand),
      })),
      vendorProducts: vendorRows
        .filter((r) => deliverableVendorIds.has(r.vendor.id))
        .map((r) => ({
          id: r.product.id, sku: r.product.sku, name: r.product.name,
          brand: r.product.brand, category: r.product.category,
          description: r.product.description, unit: r.product.unit ?? "pcs",
          price: Number(r.product.price), stockStatus: r.product.stockStatus,
          quantityAvailable: r.product.quantityAvailable,
          minOrderQty: r.product.minOrderQty ?? 1, leadTimeHours: r.product.leadTimeHours,
          compatibleVehicles: r.product.compatibleVehicles,
          vendorId: r.vendor.id, vendorName: r.vendor.businessName,
          vendorRating: r.vendor.ratingAvg != null ? Number(r.vendor.ratingAvg) : null,
          zone: zoneMap.get(r.vendor.id) ?? null,
        })),
    },
  }
}

// ---------------------------------------------------------------------------
// Customer lookup by phone
// ---------------------------------------------------------------------------

export async function lookupOrderCustomer(rawInput: unknown) {
  const parsed = z.object({
    garageSlug: z.string().min(1).max(80), phone: z.string().min(9).max(20),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: "Enter a valid phone number" }

  const [garage] = await db().select({ id: garages.id }).from(garages)
    .where(eq(garages.slug, parsed.data.garageSlug)).limit(1)
  if (!garage) return { ok: false as const, error: "Garage not found" }

  const phone = normalizeGhPhone(parsed.data.phone)
  if (!phone) return { ok: false as const, error: "Enter a valid Ghana phone number" }

  const found = await db().select().from(customers).where(and(
    eq(customers.garageId, garage.id), eq(customers.phone, phone), isNull(customers.deletedAt),
  )).limit(1)
  if (!found[0]) return { ok: true as const, data: { customer: null, vehicles: [] } }

  const vehs = await db().select().from(vehicles).where(and(
    eq(vehicles.garageId, garage.id), eq(vehicles.currentOwnerId, found[0].id), isNull(vehicles.deletedAt),
  )).limit(10)

  return {
    ok: true as const,
    data: {
      customer: { id: found[0].id, fullName: found[0].fullName, phone: found[0].phone },
      vehicles: vehs.map((v) => ({
        id: v.id, plateNumber: v.plateNumber, make: v.make, model: v.model,
        year: v.year, color: v.color,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// Place customer order → vendor orders + fitting/pickup booking
// ---------------------------------------------------------------------------

const orderItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("part"), id: z.string().uuid(), qty: z.number().int().min(1).max(50) }),
  z.object({ type: z.literal("vendor"), id: z.string().uuid(), qty: z.number().int().min(1).max(999) }),
])

export async function placeCustomerOrder(rawInput: unknown) {
  const parsed = z.object({
    garageSlug: z.string().min(1).max(80),
    branchId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    guestName: z.string().min(2).max(120),
    guestPhone: z.string().min(9).max(20),
    vehicleId: z.string().uuid().optional(),
    vehicleDesc: z.string().max(120).optional(),
    fulfilment: z.enum(["pickup", "fitting"]),
    preferredDate: z.string().optional(), // YYYY-MM-DD
    items: z.array(orderItemSchema).min(1).max(50),
    payNow: z.boolean().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const, error: "Check your order details" }
  const d = parsed.data

  const [garage] = await db().select().from(garages).where(eq(garages.slug, d.garageSlug)).limit(1)
  if (!garage || garage.status !== "active") return { ok: false as const, error: "Garage not found" }

  const phone = normalizeGhPhone(d.guestPhone)
  if (!phone) return { ok: false as const, error: "Enter a valid Ghana phone number" }

  const [branch, customer] = await Promise.all([
    db().select({ id: branches.id, name: branches.name }).from(branches)
      .where(and(eq(branches.id, d.branchId), eq(branches.garageId, garage.id), isNull(branches.deletedAt))).limit(1),
    d.customerId
      ? db().select().from(customers).where(and(eq(customers.id, d.customerId), eq(customers.garageId, garage.id))).limit(1)
      : Promise.resolve([]),
  ])
  if (!branch[0]) return { ok: false as const, error: "Choose a branch" }
  const cust = customer[0] ?? null

  let vehicle = null as typeof vehicles.$inferSelect | null
  if (d.vehicleId) {
    const [v] = await db().select().from(vehicles).where(and(
      eq(vehicles.id, d.vehicleId), eq(vehicles.garageId, garage.id), isNull(vehicles.deletedAt),
    )).limit(1)
    vehicle = v ?? null
  }

  const partItems = d.items.filter((i) => i.type === "part")
  const vendorItems = d.items.filter((i) => i.type === "vendor")

  // ---- garage parts → booking (pickup or fitting) ----
  let bookingId: string | null = null
  let bookingNumber: string | null = null
  const partLines: { name: string; qty: number; price: number }[] = []
  if (partItems.length > 0) {
    const partIds = partItems.map((i) => i.id)
    const prods = await db().select().from(parts).where(and(
      eq(parts.garageId, garage.id), inArray(parts.id, partIds),
      eq(parts.onlineVisible, true), eq(parts.isActive, true), isNull(parts.deletedAt),
    ))
    const prodMap = new Map(prods.map((p) => [p.id, p]))
    for (const i of partItems) {
      const p = prodMap.get(i.id)
      if (!p) return { ok: false as const, error: `A selected part is no longer available` }
      partLines.push({ name: p.name, qty: i.qty, price: Number(p.sellingPrice) })
    }

    const startsAt = d.preferredDate
      ? new Date(`${d.preferredDate}T09:00:00`)
      : new Date(Date.now() + 2 * 86400_000)
    const endsAt = new Date(startsAt.getTime() + 3600_000)
    bookingId = uuidv7()
    const bNum = await nextDocNumber(garage.id, branch[0].id, "BKG", "BK")
    bookingNumber = bNum
    const itemText = partLines.map((l) => `${l.name} ×${l.qty}`).join(", ")
    await db().insert(bookings).values({
      id: bookingId, garageId: garage.id, branchId: branch[0].id,
      customerId: cust?.id ?? null,
      vehicleId: vehicle?.id ?? null,
      guestName: cust?.fullName ?? d.guestName,
      guestPhone: phone,
      guestPlate: vehicle?.plateNumber ?? d.vehicleDesc ?? null,
      serviceType: d.fulfilment === "fitting" ? "Parts fitting" : "Parts pickup",
      startsAt, endsAt,
      status: "requested",
      notes: `Online order — ${itemText}${d.fulfilment === "fitting" ? " (fitting required)" : " (pickup)"}`,
      source: "public_page",
    })
  }

  // ---- vendor products → vendor orders (customer_to_garage) ----
  const createdOrders: { id: string; number: string; vendorName: string; total: number }[] = []
  let grandTotal = 0n
  if (vendorItems.length > 0) {
    const ids = vendorItems.map((i) => i.id)
    const rows = await db().select({ product: vendorProducts, vendor: vendors }).from(vendorProducts)
      .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
      .where(and(inArray(vendorProducts.id, ids), eq(vendorProducts.isActive, true),
        eq(vendors.status, "approved"), isNull(vendors.deletedAt), ne(vendorProducts.stockStatus, "out")))
    const map = new Map(rows.map((r) => [r.product.id, r]))
    for (const i of vendorItems) {
      const r = map.get(i.id)
      if (!r) return { ok: false as const, error: "A selected vendor product is unavailable" }
      if (vehicle && !isCompatible(r.product.compatibleVehicles, { make: vehicle.make, model: vehicle.model, year: vehicle.year })) {
        return { ok: false as const, error: `${r.product.name} is not compatible with ${vehicle.plateNumber}` }
      }
      if (r.product.stockStatus === "out") return { ok: false as const, error: `${r.product.name} is out of stock` }
      if (i.qty < (r.product.minOrderQty ?? 1)) {
        return { ok: false as const, error: `${r.product.name} minimum order is ${r.product.minOrderQty}` }
      }
      const zone = zoneFor(r.vendor, garage)
      if (!zone) return { ok: false as const, error: `${r.vendor.businessName} doesn't deliver to ${garage.city ?? garage.region ?? "your area"}` }
    }

    const byVendor = new Map<string, typeof rows>()
    for (const i of vendorItems) {
      const r = map.get(i.id)!
      byVendor.set(r.vendor.id, [...(byVendor.get(r.vendor.id) ?? []), r])
    }
    // need quantities per item — rebuild with qty
    const qtyByProduct = new Map(vendorItems.map((i) => [i.id, i.qty]))

    for (const [, vrows] of byVendor) {
      const vendor = vrows[0]!.vendor
      const zone = zoneFor(vendor, garage)!
      const lines = vrows.map((r) => ({ product: r.product, qty: qtyByProduct.get(r.product.id) ?? 1 }))
      const subtotal = lines.reduce((s, l) => s + l.product.price * BigInt(l.qty), 0n)
      const deliveryFee = BigInt(Math.round((zone.fee ?? 0) * 100))
      const commission = (subtotal * BigInt(vendor.commissionBp ?? 0)) / 10000n
      const total = subtotal + deliveryFee
      grandTotal += total

      const number = await nextDocNumber(garage.id, branch[0].id, "VO", "VO")
      const orderId = uuidv7()
      await db().insert(vendorOrders).values({
        id: orderId, garageId: garage.id, branchId: branch[0].id, number, vendorId: vendor.id,
        origin: "customer_to_garage",
        orderedByCustomerId: cust?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        jobId: null,
        status: "placed", subtotal, deliveryFee, commissionAmount: commission, total,
        paymentStatus: "pending",
        expectedDeliveryAt: zone.etaHours ? new Date(Date.now() + zone.etaHours * 3600_000) : null,
        notes: `Customer order — ${d.guestName} (${phone})${vehicle ? ` — ${vehicle.plateNumber}` : ""} — fulfilment: ${d.fulfilment}`,
      })
      for (const l of lines) {
        await db().insert(vendorOrderItems).values({
          id: uuidv7(), garageId: garage.id, vendorOrderId: orderId,
          vendorProductId: l.product.id, partId: null,
          description: `${l.product.name}${l.product.brand ? ` (${l.product.brand})` : ""}`,
          quantity: l.qty, unitPrice: l.product.price,
        })
      }
      await db().insert(vendorOrderEvents).values({
        id: uuidv7(), garageId: garage.id, vendorOrderId: orderId,
        status: "placed", note: `Customer order by ${d.guestName}`,
      })
      createdOrders.push({ id: orderId, number, vendorName: vendor.businessName, total: Number(total) })
    }
  }

  // optional payment for vendor items
  let checkoutUrl: string | undefined
  if (d.payNow && grandTotal > 0n) {
    const ref = `CO-${createdOrders.map((o) => o.number).join("+")}`
    try {
      const init = await paymentProvider().initializeCheckout({
        amountPesewas: grandTotal, reference: ref,
        metadata: { garageId: garage.id, customerOrder: "1" },
      })
      checkoutUrl = init.authorizationUrl
      for (const o of createdOrders) {
        await db().update(vendorOrders).set({ paystackReference: ref }).where(eq(vendorOrders.id, o.id))
      }
    } catch { /* orders stay pending */ }
  }

  return {
    ok: true as const,
    data: {
      bookingId, bookingNumber, orders: createdOrders,
      partTotal: partLines.reduce((s, l) => s + l.qty * l.price, 0),
      vendorTotal: Number(grandTotal),
      checkoutUrl,
    },
  }
}
