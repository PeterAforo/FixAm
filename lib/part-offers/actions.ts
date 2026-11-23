"use server"

import { z } from "zod"
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, jobFindings, jobItems, jobs, partTypes, parts, stockLevels, vehicles } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership } from "@/lib/actions"
import { findFittingProducts } from "@/lib/parts-catalog/actions"
import { createVendorOrder } from "@/lib/marketplace/actions"
import { rankVendorOffers, type VendorOffer } from "./service"

type Fail = { ok: false; error: string }
const fail = (error: string): Fail => ({ ok: false, error })

async function staff(garageId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { userId, principal: { kind: "staff" as const, role: m.role, garageId, branchId: m.branchId } }
}

export type StockOffer = { partId: string; name: string; sku: string; sellingPrice: number; available: number }
export type { VendorOffer }
export type JobPartOffers = { partType: { id: string; name: string }; stock: StockOffer[]; offers: VendorOffer[] }

/** Own stock first, then vendor offers ranked by fit, price, ETA to this garage and rating. */
export async function getJobPartOffers(raw: unknown): Promise<JobPartOffers | null> {
  const parsed = z.object({ garageId: z.string().uuid(), jobId: z.string().uuid(), partTypeId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return null
  const d = parsed.data
  const who = await staff(d.garageId)
  if (!who || !can(who.principal, "parts.view")) return null

  const [row] = await db()
    .select({ job: jobs, v: vehicles, g: garages })
    .from(jobs)
    .innerJoin(vehicles, eq(vehicles.id, jobs.vehicleId))
    .innerJoin(garages, eq(garages.id, jobs.garageId))
    .where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId)))
    .limit(1)
  const [pt] = await db().select().from(partTypes).where(eq(partTypes.id, d.partTypeId)).limit(1)
  if (!row || !pt) return null

  const names = [pt.name, ...pt.synonyms].filter((n) => n.length > 2).slice(0, 8)
  const [stockRows, products] = await Promise.all([
    db()
      .select({
        partId: parts.id,
        name: parts.name,
        sku: parts.sku,
        sellingPrice: parts.sellingPrice,
        available: sql<string>`coalesce(sum(${stockLevels.quantityOnHand} - ${stockLevels.quantityReserved}), 0)::text`,
      })
      .from(parts)
      .leftJoin(stockLevels, and(eq(stockLevels.partId, parts.id), eq(stockLevels.branchId, row.job.branchId)))
      .where(
        and(
          eq(parts.garageId, d.garageId),
          isNull(parts.deletedAt),
          or(eq(parts.partTypeId, pt.id), ...names.map((n) => ilike(parts.name, `%${n}%`)))!
        )
      )
      .groupBy(parts.id)
      .limit(5),
    findFittingProducts({ partTypeId: pt.id, make: row.v.make, model: row.v.model, year: row.v.year ?? undefined, limit: 30 }),
  ])

  const offers = await rankVendorOffers(products, { region: row.g.region, city: row.g.city })

  return {
    partType: { id: pt.id, name: pt.name },
    stock: stockRows.map((s) => ({ partId: s.partId, name: s.name, sku: s.sku, sellingPrice: Number(s.sellingPrice), available: Number(s.available) })),
    offers,
  }
}

/** One tap: order a vendor offer to this garage, linked to the job (and the estimate line, if any). */
export async function orderOfferToGarage(raw: unknown): Promise<{ ok: true; orderNumber: string; checkoutUrl?: string } | Fail> {
  const parsed = z
    .object({
      garageId: z.string().uuid(),
      jobId: z.string().uuid(),
      productId: z.string().uuid(),
      quantity: z.number().int().min(1).max(50).default(1),
      jobItemId: z.string().uuid().optional(),
      payNow: z.boolean().default(false),
    })
    .safeParse(raw)
  if (!parsed.success) return fail("Invalid order")
  const d = parsed.data
  const [job] = await db().select({ branchId: jobs.branchId, vehicleId: jobs.vehicleId }).from(jobs).where(and(eq(jobs.id, d.jobId), eq(jobs.garageId, d.garageId))).limit(1)
  if (!job) return fail("Job not found")
  const r = await createVendorOrder({
    garageId: d.garageId,
    branchId: job.branchId,
    items: [{ productId: d.productId, quantity: d.quantity }],
    jobId: d.jobId,
    vehicleId: job.vehicleId,
    payNow: d.payNow,
  })
  if (!r.ok) return fail(r.error.message)
  const order = r.data.orders[0]
  if (order && d.jobItemId) {
    await db().update(jobItems).set({ vendorOrderId: order.id, updatedAt: new Date() }).where(and(eq(jobItems.id, d.jobItemId), eq(jobItems.garageId, d.garageId)))
  }
  return { ok: true, orderNumber: order?.number ?? "", checkoutUrl: r.data.checkoutUrl }
}

/** Use a part already on the shelf for this line. */
export async function assignStockToJobItem(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ garageId: z.string().uuid(), jobItemId: z.string().uuid(), partId: z.string().uuid() }).safeParse(raw)
  if (!parsed.success) return fail("Invalid input")
  const who = await staff(parsed.data.garageId)
  if (!who || !can(who.principal, "jobs.update")) return fail("No permission")
  const [p] = await db().select({ id: parts.id }).from(parts).where(and(eq(parts.id, parsed.data.partId), eq(parts.garageId, parsed.data.garageId))).limit(1)
  if (!p) return fail("Part not found")
  await db().update(jobItems).set({ partId: p.id, supplyMode: "garage", updatedAt: new Date() }).where(and(eq(jobItems.id, parsed.data.jobItemId), eq(jobItems.garageId, parsed.data.garageId)))
  return { ok: true }
}

/** Picker fallback: set (or clear) the standard part on a finding or estimate line. */
export async function setPartTypeOnJob(raw: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z
    .object({ garageId: z.string().uuid(), partTypeId: z.string().uuid().nullable(), jobItemId: z.string().uuid().optional(), findingId: z.string().uuid().optional() })
    .safeParse(raw)
  if (!parsed.success || (!parsed.data.jobItemId && !parsed.data.findingId)) return fail("Invalid input")
  const d = parsed.data
  const who = await staff(d.garageId)
  if (!who || !can(who.principal, "jobs.update")) return fail("No permission")
  if (d.jobItemId) {
    await db().update(jobItems).set({ partTypeId: d.partTypeId, partTypeConfidence: d.partTypeId ? "1.00" : null, updatedAt: new Date() }).where(and(eq(jobItems.id, d.jobItemId), eq(jobItems.garageId, d.garageId)))
  }
  if (d.findingId) {
    await db().update(jobFindings).set({ partTypeId: d.partTypeId, updatedAt: new Date() }).where(and(eq(jobFindings.id, d.findingId), eq(jobFindings.garageId, d.garageId)))
  }
  return { ok: true }
}
