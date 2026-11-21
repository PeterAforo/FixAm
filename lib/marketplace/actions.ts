"use server"
import { z } from "zod"
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  garages,
  goodsReceipts,
  jobAssignments,
  jobStatusEvents,
  jobs,
  notifications,
  parts,
  users,
  vendorOrderEvents,
  vendorOrderItems,
  vendorOrders,
  vendorProducts,
  vendorReviews,
  vendors,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { nextDocNumber } from "@/lib/money/sequence"
import { applyStockMovement } from "@/lib/parts/stock"
import { paymentProvider } from "@/lib/integrations/payments"
import { sendMessage } from "@/lib/messaging/send"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

type Zone = { region?: string; city?: string; fee?: number; etaHours?: number }

function zonesOf(v: typeof vendors.$inferSelect): Zone[] {
  return Array.isArray(v.deliveryZones) ? (v.deliveryZones as Zone[]) : []
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase()
}

/** Vendor delivers to this garage if any zone matches region or city (blank garage location = all vendors). */
function zoneFor(v: typeof vendors.$inferSelect, garage: { region: string | null; city: string | null }): Zone | null {
  const zones = zonesOf(v)
  if (zones.length === 0) return null
  const gRegion = norm(garage.region)
  const gCity = norm(garage.city)
  if (!gRegion && !gCity) return zones[0] ?? null
  return zones.find((z) =>
    (gRegion && norm(z.region) === gRegion) ||
    (gCity && (norm(z.city) === gCity || norm(z.region) === gCity))
  ) ?? null
}

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------

export async function browseMarketplace(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({
    garageId: z.string().uuid(),
    q: z.string().max(120).optional(),
    category: z.string().max(80).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "parts.view")) return { ok: false as const }

  const [garage] = await db().select({ region: garages.region, city: garages.city }).from(garages)
    .where(eq(garages.id, d.garageId)).limit(1)
  if (!garage) return { ok: false as const }

  const approved = await db().select().from(vendors)
    .where(and(eq(vendors.status, "approved"), isNull(vendors.deletedAt)))

  const deliverable = approved
    .map((v) => ({ vendor: v, zone: zoneFor(v, garage) }))
    .filter((x): x is { vendor: typeof x.vendor; zone: Zone } => x.zone !== null)

  if (deliverable.length === 0) {
    return { ok: true as const, data: { products: [], garage: { region: garage.region, city: garage.city } } }
  }

  const vendorIds = deliverable.map((x) => x.vendor.id)
  const rows = await db()
    .select({
      product: vendorProducts,
      vendorName: vendors.businessName,
      vendorId: vendors.id,
      ratingAvg: vendors.ratingAvg,
      ratingCount: vendors.ratingCount,
      vendorCity: vendors.city,
      vendorRegion: vendors.region,
      vendorVerified: vendors.isVerified,
    })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(and(
      inArray(vendorProducts.vendorId, vendorIds),
      eq(vendorProducts.isActive, true),
      ne(vendorProducts.stockStatus, "out"),
      or(
        d.q ? ilikeSafe(vendorProducts.name, d.q) : undefined,
        d.q ? ilikeSafe(vendorProducts.sku, d.q) : undefined,
        d.q ? ilikeSafe(vendorProducts.brand, d.q) : undefined,
      ),
      d.category ? ilikeSafe(vendorProducts.category, d.category) : undefined,
    ))
    .orderBy(vendorProducts.name)
    .limit(300)

  const zoneMap = new Map(deliverable.map((x) => [x.vendor.id, x.zone]))

  return {
    ok: true as const,
    data: {
      garage: { region: garage.region, city: garage.city },
      products: rows.map((r) => ({
        id: r.product.id,
        sku: r.product.sku,
        name: r.product.name,
        brand: r.product.brand,
        category: r.product.category,
        unit: r.product.unit ?? "pcs",
        price: Number(r.product.price),
        stockStatus: r.product.stockStatus,
        quantityAvailable: r.product.quantityAvailable,
        minOrderQty: r.product.minOrderQty ?? 1,
        leadTimeHours: r.product.leadTimeHours,
        compatibleVehicles: r.product.compatibleVehicles,
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        vendorRating: r.ratingAvg != null ? Number(r.ratingAvg) : null,
        vendorRatingCount: r.ratingCount,
        vendorCity: r.vendorCity,
        vendorRegion: r.vendorRegion,
        vendorVerified: r.vendorVerified,
        zone: zoneMap.get(r.vendorId) ?? null,
      })),
    },
  }
}

function ilikeSafe(col: Parameters<typeof ilike>[0], q: string) {
  return ilike(col, `%${q.replace(/[%_]/g, "")}%`)
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const orderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999),
})

export async function createVendorOrder(rawInput: unknown): Promise<
  ActionResult<{ orders: { id: string; number: string; vendorName: string; total: number }[]; checkoutUrl?: string }>
> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    items: z.array(orderItemSchema).min(1).max(100),
    jobId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
    payNow: z.boolean().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid order" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.create")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission to order" } }
  }

  const [garage, branch] = await Promise.all([
    db().select({ id: garages.id, region: garages.region, city: garages.city }).from(garages).where(eq(garages.id, d.garageId)).limit(1),
    db().select({ id: branches.id }).from(branches).where(and(eq(branches.id, d.branchId), eq(branches.garageId, d.garageId))).limit(1),
  ])
  if (!garage[0] || !branch[0]) return { ok: false, error: { code: "NOT_FOUND", message: "Garage or branch not found" } }

  // load products
  const productIds = [...new Set(d.items.map((i) => i.productId))]
  const prods = await db().select({ product: vendorProducts, vendor: vendors })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(and(inArray(vendorProducts.id, productIds), eq(vendorProducts.isActive, true), isNull(vendors.deletedAt)))

  const prodMap = new Map(prods.map((p) => [p.product.id, p]))
  const missing = productIds.filter((id) => !prodMap.has(id))
  if (missing.length) return { ok: false, error: { code: "VALIDATION", message: "Some products are unavailable" } }

  // validate + group by vendor
  const byVendor = new Map<string, { product: typeof vendorProducts.$inferSelect; vendor: typeof vendors.$inferSelect; qty: number }[]>()
  for (const item of d.items) {
    const p = prodMap.get(item.productId)!
    if (p.vendor.status !== "approved") {
      return { ok: false, error: { code: "VALIDATION", message: `Vendor ${p.vendor.businessName} is not approved` } }
    }
    if (p.product.stockStatus === "out") {
      return { ok: false, error: { code: "VALIDATION", message: `${p.product.name} is out of stock` } }
    }
    const minQty = p.product.minOrderQty ?? 1
    if (item.quantity < minQty) {
      return { ok: false, error: { code: "VALIDATION", message: `${p.product.name} minimum order is ${minQty}` } }
    }
    const zone = zoneFor(p.vendor, garage[0])
    if (!zone) {
      return { ok: false, error: { code: "VALIDATION", message: `${p.vendor.businessName} does not deliver to your region` } }
    }
    const arr = byVendor.get(p.vendor.id) ?? []
    arr.push({ product: p.product, vendor: p.vendor, qty: item.quantity })
    byVendor.set(p.vendor.id, arr)
  }

  // map vendor products to garage parts (preferred_vendor_product_id)
  const allProductIds = prods.map((p) => p.product.id)
  const linkedParts = await db().select({ id: parts.id, preferredVendorProductId: parts.preferredVendorProductId })
    .from(parts)
    .where(and(eq(parts.garageId, d.garageId), inArray(parts.preferredVendorProductId, allProductIds)))
  const partByProduct = new Map(linkedParts.filter((p) => p.preferredVendorProductId).map((p) => [p.preferredVendorProductId!, p.id]))

  const created: { id: string; number: string; vendorName: string; total: number; paystackReference: string | null }[] = []
  let grandTotal = 0n

  for (const [vendorId, lines] of byVendor) {
    const vendor = lines[0]!.vendor
    const zone = zoneFor(vendor, garage[0])!
    const subtotal = lines.reduce((s, l) => s + BigInt(l.product.price) * BigInt(l.qty), 0n)
    const deliveryFee = BigInt(Math.round((zone.fee ?? 0) * 100))
    const commission = (subtotal * BigInt(vendor.commissionBp ?? 0)) / 10000n
    const total = subtotal + deliveryFee
    grandTotal += total

    const number = await nextDocNumber(d.garageId, d.branchId, "VO", "VO")
    const orderId = uuidv7()

    await db().insert(vendorOrders).values({
      id: orderId, garageId: d.garageId, branchId: d.branchId,
      number, vendorId,
      origin: d.jobId ? "job_linked" : "garage_manual",
      orderedByUserId: userId,
      jobId: d.jobId ?? null,
      vehicleId: d.vehicleId ?? null,
      status: "placed",
      subtotal, deliveryFee, commissionAmount: commission, total,
      paymentStatus: "pending",
      expectedDeliveryAt: zone.etaHours ? new Date(Date.now() + zone.etaHours * 3600_000) : null,
      notes: d.notes ?? null,
    })

    for (const l of lines) {
      await db().insert(vendorOrderItems).values({
        id: uuidv7(), garageId: d.garageId, vendorOrderId: orderId,
        vendorProductId: l.product.id,
        partId: partByProduct.get(l.product.id) ?? null,
        description: `${l.product.name}${l.product.brand ? ` (${l.product.brand})` : ""}`,
        quantity: l.qty,
        unitPrice: l.product.price,
      })
    }

    await db().insert(vendorOrderEvents).values({
      id: uuidv7(), garageId: d.garageId, vendorOrderId: orderId,
      status: "placed", actorUserId: userId,
    })

    created.push({ id: orderId, number, vendorName: vendor.businessName, total: Number(total), paystackReference: null })
  }

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "marketplace.order",
    entityType: "vendor_order", entityId: created[0]?.id,
    after: { orders: created.map((c) => c.number), total: Number(grandTotal), jobId: d.jobId },
  }).catch(() => {})

  // optional checkout
  let checkoutUrl: string | undefined
  if (d.payNow && grandTotal > 0n) {
    const ref = `VO-${created.map((c) => c.number).join("+")}`
    try {
      const init = await paymentProvider().initializeCheckout({
        amountPesewas: grandTotal, reference: ref,
        metadata: { garageId: d.garageId, orderIds: created.map((c) => c.id).join(",") },
      })
      checkoutUrl = init.authorizationUrl
      for (const c of created) {
        await db().update(vendorOrders).set({ paystackReference: ref }).where(eq(vendorOrders.id, c.id))
      }
    } catch {
      // payment init failure leaves orders pending — garage can pay later
    }
  }

  return { ok: true, data: { orders: created, checkoutUrl } }
}

// ---------------------------------------------------------------------------
// Order list / tracking / receive / review
// ---------------------------------------------------------------------------

export async function listGarageVendorOrders(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.view")) return { ok: false as const }

  const rows = await db()
    .select({
      id: vendorOrders.id, number: vendorOrders.number, status: vendorOrders.status,
      origin: vendorOrders.origin, total: vendorOrders.total, subtotal: vendorOrders.subtotal,
      deliveryFee: vendorOrders.deliveryFee, paymentStatus: vendorOrders.paymentStatus,
      expectedDeliveryAt: vendorOrders.expectedDeliveryAt, deliveredAt: vendorOrders.deliveredAt,
      createdAt: vendorOrders.createdAt, vendorName: vendors.businessName,
      jobId: vendorOrders.jobId, branchName: branches.name,
    })
    .from(vendorOrders)
    .innerJoin(vendors, eq(vendorOrders.vendorId, vendors.id))
    .leftJoin(branches, eq(vendorOrders.branchId, branches.id))
    .where(eq(vendorOrders.garageId, parsed.data.garageId))
    .orderBy(desc(vendorOrders.createdAt))
    .limit(200)

  return {
    ok: true as const,
    data: rows.map((o) => ({
      ...o, total: Number(o.total), subtotal: Number(o.subtotal),
      deliveryFee: Number(o.deliveryFee ?? 0),
      expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
      deliveredAt: o.deliveredAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
  }
}

export async function getVendorOrderDetail(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), orderId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.view")) return { ok: false as const }

  const [order] = await db().select({ order: vendorOrders, vendorName: vendors.businessName, vendorRating: vendors.ratingAvg })
    .from(vendorOrders).innerJoin(vendors, eq(vendorOrders.vendorId, vendors.id))
    .where(and(eq(vendorOrders.id, parsed.data.orderId), eq(vendorOrders.garageId, parsed.data.garageId))).limit(1)
  if (!order) return { ok: true as const, data: null }

  const items = await db().select().from(vendorOrderItems)
    .where(and(eq(vendorOrderItems.vendorOrderId, order.order.id), eq(vendorOrderItems.garageId, parsed.data.garageId)))
  const events = await db().select().from(vendorOrderEvents)
    .where(and(eq(vendorOrderEvents.vendorOrderId, order.order.id), eq(vendorOrderEvents.garageId, parsed.data.garageId)))
    .orderBy(vendorOrderEvents.createdAt)
  const [review] = await db().select().from(vendorReviews)
    .where(eq(vendorReviews.vendorOrderId, order.order.id)).limit(1)

  return {
    ok: true as const,
    data: {
      id: order.order.id, number: order.order.number, status: order.order.status,
      origin: order.order.origin, vendorName: order.vendorName,
      vendorRating: order.vendorRating != null ? Number(order.vendorRating) : null,
      total: Number(order.order.total), subtotal: Number(order.order.subtotal),
      deliveryFee: Number(order.order.deliveryFee ?? 0), commissionAmount: Number(order.order.commissionAmount ?? 0),
      paymentStatus: order.order.paymentStatus,
      expectedDeliveryAt: order.order.expectedDeliveryAt?.toISOString() ?? null,
      deliveredAt: order.order.deliveredAt?.toISOString() ?? null,
      createdAt: order.order.createdAt.toISOString(),
      notes: order.order.notes, jobId: order.order.jobId,
      items: items.map((i) => ({
        id: i.id, description: i.description, quantity: i.quantity,
        quantityDelivered: i.quantityDelivered ?? 0, quantityReceived: i.quantityReceived ?? 0,
        unitPrice: Number(i.unitPrice), partId: i.partId,
      })),
      events: events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt.toISOString() })),
      review: review ? { rating: review.rating, comment: review.comment } : null,
      canReview: order.order.status === "received" && !review,
    },
  }
}

export async function receiveVendorOrder(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(), orderId: z.string().uuid(),
    branchId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.receive")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission to receive" } }
  }

  const [order] = await db().select().from(vendorOrders)
    .where(and(eq(vendorOrders.id, d.orderId), eq(vendorOrders.garageId, d.garageId))).limit(1)
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: "Order not found" } }
  if (!["delivered", "out_for_delivery"].includes(order.status)) {
    return { ok: false, error: { code: "VALIDATION", message: `Order is ${order.status} — must be delivered first` } }
  }

  const branchId = d.branchId ?? order.branchId
  if (!branchId) return { ok: false, error: { code: "VALIDATION", message: "Branch required" } }

  const items = await db().select().from(vendorOrderItems)
    .where(and(eq(vendorOrderItems.vendorOrderId, order.id), eq(vendorOrderItems.garageId, d.garageId)))

  // goods receipt
  const receiptId = uuidv7()
  await db().insert(goodsReceipts).values({
    id: receiptId, garageId: d.garageId, branchId,
    vendorOrderId: order.id, receivedBy: userId,
    lines: items.map((i) => ({
      part_id: i.partId, vendor_product_id: i.vendorProductId,
      description: i.description, quantity: i.quantity - (i.quantityReceived ?? 0),
      unit_cost: Number(i.unitPrice),
    })),
    notes: d.notes ?? null,
  })

  // stock in + mark received
  for (const i of items) {
    const remaining = i.quantity - (i.quantityReceived ?? 0)
    if (remaining <= 0) continue
    if (i.partId) {
      await applyStockMovement({
        garageId: d.garageId, branchId, partId: i.partId,
        quantity: remaining, type: "purchase_receipt",
        unitCost: i.unitPrice,
        referenceType: "vendor_order", referenceId: order.id,
        reason: `Vendor order ${order.number}`,
        actorUserId: userId,
      })
    }
    await db().update(vendorOrderItems).set({
      quantityReceived: i.quantity, quantityDelivered: i.quantity, updatedAt: new Date(),
    }).where(eq(vendorOrderItems.id, i.id))
  }

  await db().update(vendorOrders).set({ status: "received", updatedAt: new Date() }).where(eq(vendorOrders.id, order.id))
  await db().insert(vendorOrderEvents).values({
    id: uuidv7(), garageId: d.garageId, vendorOrderId: order.id,
    status: "received", actorUserId: userId, note: d.notes ?? null,
  })

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "marketplace.order.receive",
    entityType: "vendor_order", entityId: order.id,
    after: { number: order.number, receiptId },
  }).catch(() => {})

  // job-linked receipt: move waiting_parts → in_progress and notify assignees
  if (order.jobId) {
    try {
      const [job, garageRow] = await Promise.all([
        db().select({ id: jobs.id, number: jobs.number, status: jobs.status }).from(jobs)
          .where(and(eq(jobs.id, order.jobId), eq(jobs.garageId, d.garageId))).limit(1),
        db().select({ slug: garages.slug }).from(garages).where(eq(garages.id, d.garageId)).limit(1),
      ])
      const jobLink = job[0] && garageRow[0] ? `/g/${garageRow[0].slug}/jobs/${job[0].id}` : null
      if (job[0]?.status === "waiting_parts") {
        await db().update(jobs).set({ status: "in_progress", updatedAt: new Date() }).where(eq(jobs.id, job[0].id))
        await db().insert(jobStatusEvents).values({
          garageId: d.garageId, jobId: job[0].id,
          fromStatus: "waiting_parts", toStatus: "in_progress",
          actorUserId: userId, note: `Parts from ${order.number} received`,
        })
      }
      const assignees = await db().select({ userId: jobAssignments.userId, phone: users.phone }).from(jobAssignments)
        .innerJoin(users, eq(jobAssignments.userId, users.id))
        .where(and(eq(jobAssignments.jobId, order.jobId), eq(jobAssignments.garageId, d.garageId)))
      for (const a of assignees) {
        await db().insert(notifications).values({
          garageId: d.garageId, userId: a.userId,
          kind: "part_arrived",
          title: `Parts arrived for ${job[0]?.number ?? "job"}`,
          body: `Order ${order.number} received into stock`,
          link: jobLink,
        }).catch(() => {})
        if (a.phone) {
          await sendMessage({
            garageId: d.garageId, channel: "sms", to: a.phone,
            templateKey: "job.part_received",
            variables: { job_number: job[0]?.number ?? order.number, order_number: order.number },
            idempotencyKey: `vo-received:${order.id}:${a.phone}`,
          }).catch(() => {})
        }
      }
    } catch {
      // notification failure must not block receiving
    }
  }

  return { ok: true, data: { ok: true as const } }
}

export async function reviewVendorOrder(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(), orderId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Rating 1-5 required" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.receive")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  const [order] = await db().select().from(vendorOrders)
    .where(and(eq(vendorOrders.id, d.orderId), eq(vendorOrders.garageId, d.garageId))).limit(1)
  if (!order) return { ok: false, error: { code: "NOT_FOUND", message: "Order not found" } }
  if (order.status !== "received") {
    return { ok: false, error: { code: "VALIDATION", message: "You can review after the order is received" } }
  }
  const [existing] = await db().select({ id: vendorReviews.id }).from(vendorReviews)
    .where(eq(vendorReviews.vendorOrderId, order.id)).limit(1)
  if (existing) return { ok: false, error: { code: "CONFLICT", message: "Already reviewed" } }

  await db().insert(vendorReviews).values({
    id: uuidv7(), vendorId: order.vendorId, vendorOrderId: order.id,
    garageId: d.garageId, rating: d.rating, comment: d.comment ?? null,
  })

  // refresh vendor rating aggregates
  const agg = await db().select({
    avg: sql<string>`avg(rating)`, count: sql<string>`count(*)`,
  }).from(vendorReviews).where(eq(vendorReviews.vendorId, order.vendorId))
  await db().update(vendors).set({
    ratingAvg: agg[0]?.avg ?? null,
    ratingCount: Number(agg[0]?.count ?? 0),
    updatedAt: new Date(),
  }).where(eq(vendors.id, order.vendorId))

  return { ok: true, data: { ok: true as const } }
}

export async function verifyVendorOrderPayment(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), orderId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "purchase_orders.view")) return { ok: false as const }

  const [order] = await db().select().from(vendorOrders)
    .where(and(eq(vendorOrders.id, parsed.data.orderId), eq(vendorOrders.garageId, parsed.data.garageId))).limit(1)
  if (!order?.paystackReference) return { ok: true as const, data: { status: order?.paymentStatus ?? "none" } }
  if (order.paymentStatus === "paid") return { ok: true as const, data: { status: "paid" } }

  const v = await paymentProvider().verify(order.paystackReference)
  if (v.status === "success") {
    await db().update(vendorOrders).set({ paymentStatus: "paid", updatedAt: new Date() }).where(eq(vendorOrders.id, order.id))
    return { ok: true as const, data: { status: "paid" } }
  }
  if (v.status === "failed") {
    await db().update(vendorOrders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(vendorOrders.id, order.id))
    return { ok: true as const, data: { status: "failed" } }
  }
  return { ok: true as const, data: { status: "pending" } }
}
