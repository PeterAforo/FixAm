"use server"
import { z } from "zod"
import { and, eq, ilike, isNull, ne, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  garages,
  jobStatusEvents,
  jobs,
  parts,
  stockLevels,
  vendorOrderEvents,
  vendorOrderItems,
  vendorOrders,
  vendorProducts,
  vendors,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { canTransitionJob } from "@/lib/jobs/transitions"
import { nextDocNumber } from "@/lib/money/sequence"
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

// ---------------------------------------------------------------------------
// Out-of-stock suggestions for a job part
// ---------------------------------------------------------------------------

export async function suggestVendorsForPart(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid(), partId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "stock.request_for_job")) return { ok: false as const }

  const [part] = await db().select().from(parts)
    .where(and(eq(parts.id, parsed.data.partId), eq(parts.garageId, parsed.data.garageId))).limit(1)
  if (!part) return { ok: true as const, data: null }

  const [garage] = await db().select({ region: garages.region, city: garages.city }).from(garages)
    .where(eq(garages.id, parsed.data.garageId)).limit(1)

  // preferred vendor product first, then name/sku matches from approved vendors
  const conditions = [
    part.preferredVendorProductId ? eq(vendorProducts.id, part.preferredVendorProductId) : undefined,
    ilike(vendorProducts.name, `%${part.name.replace(/[%_]/g, "")}%`),
    ilike(vendorProducts.sku, `%${part.sku.replace(/[%_]/g, "")}%`),
  ].filter(Boolean)

  const rows = await db()
    .select({ product: vendorProducts, vendor: vendors })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(and(
      eq(vendorProducts.isActive, true),
      eq(vendors.status, "approved"),
      isNull(vendors.deletedAt),
      ne(vendorProducts.stockStatus, "out"),
      or(...conditions),
    ))
    .limit(20)

  return {
    ok: true as const,
    data: {
      part: { id: part.id, name: part.name, sku: part.sku, preferredVendorProductId: part.preferredVendorProductId },
      suggestions: rows
        .filter((r) => garage ? zoneFor(r.vendor, garage) !== null : true)
        .map((r) => ({
          productId: r.product.id,
          name: r.product.name,
          sku: r.product.sku,
          brand: r.product.brand,
          price: Number(r.product.price),
          stockStatus: r.product.stockStatus,
          minOrderQty: r.product.minOrderQty ?? 1,
          leadTimeHours: r.product.leadTimeHours,
          vendorId: r.vendor.id,
          vendorName: r.vendor.businessName,
          rating: r.vendor.ratingAvg != null ? Number(r.vendor.ratingAvg) : null,
          isPreferred: r.product.id === part.preferredVendorProductId,
          zone: garage ? zoneFor(r.vendor, garage) : null,
        })),
    },
  }
}

// ---------------------------------------------------------------------------
// Order a part for a job → job moves to waiting_parts
// ---------------------------------------------------------------------------

export async function orderPartForJob(rawInput: unknown): Promise<ActionResult<{ orderId: string; number: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    branchId: z.string().uuid(),
    jobId: z.string().uuid(),
    partId: z.string().uuid(),
    vendorProductId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !(can(ctx.principal, "stock.request_for_job") || can(ctx.principal, "purchase_orders.create"))) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission to order parts" } }
  }

  const [job, part, prodRow, garage, branch] = await Promise.all([
    db().select().from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId))).limit(1),
    db().select().from(parts).where(and(eq(parts.id, d.partId), eq(parts.garageId, d.garageId))).limit(1),
    db().select({ product: vendorProducts, vendor: vendors }).from(vendorProducts)
      .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
      .where(and(eq(vendorProducts.id, d.vendorProductId), eq(vendorProducts.isActive, true))).limit(1),
    db().select({ region: garages.region, city: garages.city }).from(garages).where(eq(garages.id, d.garageId)).limit(1),
    db().select({ id: branches.id }).from(branches)
      .where(and(eq(branches.id, d.branchId), eq(branches.garageId, d.garageId), isNull(branches.deletedAt))).limit(1),
  ])
  if (!job[0] || !part[0] || !prodRow[0] || !garage[0] || !branch[0]) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Job, part or product not found" } }
  }
  const { product, vendor } = prodRow[0]
  if (vendor.status !== "approved") {
    return { ok: false, error: { code: "VALIDATION", message: "Vendor is not approved" } }
  }
  if (product.stockStatus === "out") {
    return { ok: false, error: { code: "VALIDATION", message: "Product is out of stock" } }
  }
  if ((product.minOrderQty ?? 1) > d.quantity) {
    return { ok: false, error: { code: "VALIDATION", message: `Minimum order is ${product.minOrderQty}` } }
  }
  const zone = zoneFor(vendor, garage[0])
  if (!zone) {
    return { ok: false, error: { code: "VALIDATION", message: `${vendor.businessName} does not deliver to your region` } }
  }

  const subtotal = product.price * BigInt(d.quantity)
  const deliveryFee = BigInt(Math.round((zone.fee ?? 0) * 100))
  const commission = (subtotal * BigInt(vendor.commissionBp ?? 0)) / 10000n
  const total = subtotal + deliveryFee
  const number = await nextDocNumber(d.garageId, d.branchId, "VO", "VO")
  const orderId = uuidv7()

  await db().insert(vendorOrders).values({
    id: orderId, garageId: d.garageId, branchId: d.branchId, number, vendorId: vendor.id,
    origin: "job_linked", orderedByUserId: userId,
    jobId: job[0].id, vehicleId: job[0].vehicleId,
    status: "placed", subtotal, deliveryFee, commissionAmount: commission, total,
    paymentStatus: "pending",
    expectedDeliveryAt: zone.etaHours ? new Date(Date.now() + zone.etaHours * 3600_000) : null,
    notes: `Job ${job[0].number} — ${part[0].name} ×${d.quantity}`,
  })
  await db().insert(vendorOrderItems).values({
    id: uuidv7(), garageId: d.garageId, vendorOrderId: orderId,
    vendorProductId: product.id, partId: part[0].id,
    description: `${product.name}${product.brand ? ` (${product.brand})` : ""}`,
    quantity: d.quantity, unitPrice: product.price,
  })
  await db().insert(vendorOrderEvents).values({
    id: uuidv7(), garageId: d.garageId, vendorOrderId: orderId,
    status: "placed", actorUserId: userId, note: `Linked to job ${job[0].number}`,
  })

  // move job to waiting_parts when the machine allows it
  const from = job[0].status as string
  if (canTransitionJob(from as never, "waiting_parts")) {
    await db().update(jobs).set({ status: "waiting_parts", updatedAt: new Date() }).where(eq(jobs.id, job[0].id))
    await db().insert(jobStatusEvents).values({
      garageId: d.garageId, jobId: job[0].id,
      fromStatus: from as never, toStatus: "waiting_parts",
      actorUserId: userId, note: `Waiting on ${vendor.businessName} order ${number}`,
    })
  }

  await writeAuditLog({
    garageId: d.garageId, actorUserId: userId, action: "marketplace.job_order",
    entityType: "vendor_order", entityId: orderId,
    after: { number, jobId: job[0].id, partId: part[0].id, quantity: d.quantity },
  }).catch(() => {})

  return { ok: true, data: { orderId, number } }
}

// ---------------------------------------------------------------------------
// Low-stock list for the parts page
// ---------------------------------------------------------------------------

export async function listLowStock(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "parts.view")) return { ok: false as const }

  const rows = await db()
    .select({
      partId: parts.id, name: parts.name, sku: parts.sku,
      quantityOnHand: stockLevels.quantityOnHand,
      reorderLevel: stockLevels.reorderLevel,
      branchId: stockLevels.branchId, branchName: branches.name,
      preferredVendorId: parts.preferredVendorId,
      preferredVendorName: vendors.businessName,
    })
    .from(stockLevels)
    .innerJoin(parts, eq(stockLevels.partId, parts.id))
    .innerJoin(branches, eq(stockLevels.branchId, branches.id))
    .leftJoin(vendors, eq(parts.preferredVendorId, vendors.id))
    .where(and(
      eq(stockLevels.garageId, parsed.data.garageId),
      eq(parts.isActive, true),
      sql`${stockLevels.reorderLevel}::numeric > 0`,
      sql`${stockLevels.quantityOnHand}::numeric <= ${stockLevels.reorderLevel}::numeric`,
    ))
    .orderBy(parts.name)
    .limit(200)

  return {
    ok: true as const,
    data: rows.map((r) => ({
      ...r,
      quantityOnHand: Number(r.quantityOnHand),
      reorderLevel: Number(r.reorderLevel),
    })),
  }
}
