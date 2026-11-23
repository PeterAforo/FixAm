"use server"
import { z } from "zod"
import { and, asc, desc, eq, gte, ilike, isNull, lte, ne, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { partTypes, users, vendorProducts, vendors } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import type { ActionResult } from "@/lib/actions"

/**
 * Standard parts list (P8-01): search part types, match free text to a part
 * type, and find vendor products that fit a given car.
 */

export type PartTypeView = {
  id: string
  slug: string
  name: string
  category: string
  synonyms: string[]
  typicalLabourHours: number | null
}

const view = (p: typeof partTypes.$inferSelect): PartTypeView => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  category: p.category,
  synonyms: p.synonyms,
  typicalLabourHours: p.typicalLabourHours != null ? Number(p.typicalLabourHours) : null,
})

/** All part types (≈150) — small enough to ship to pickers in one go. */
export async function listPartTypes(): Promise<PartTypeView[]> {
  const rows = await db().select().from(partTypes).orderBy(asc(partTypes.category), asc(partTypes.name))
  return rows.map(view)
}

/** Name / synonym search, best matches first. */
export async function searchPartTypes(rawQ: unknown): Promise<PartTypeView[]> {
  const q = z.string().trim().min(1).max(80).safeParse(rawQ)
  if (!q.success) return []
  const like = `%${q.data}%`
  const rows = await db()
    .select()
    .from(partTypes)
    .where(
      or(
        ilike(partTypes.name, like),
        ilike(partTypes.slug, like),
        sql`exists (select 1 from unnest(${partTypes.synonyms}) s where s ilike ${like})`
      )
    )
    .orderBy(sql`case when ${partTypes.name} ilike ${q.data + "%"} then 0 else 1 end`, asc(partTypes.name))
    .limit(20)
  return rows.map(view)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ɛɔŋ\s]/g, " ").replace(/\s+/g, " ").trim()

/**
 * Fast, deterministic text → part type match (no AI). Scores every name and
 * synonym against the text; P8-04 adds an AI fallback for messy findings.
 */
export async function matchPartTypeText(rawText: unknown): Promise<{ partType: PartTypeView; score: number }[]> {
  const t = z.string().trim().min(2).max(500).safeParse(rawText)
  if (!t.success) return []
  const text = ` ${norm(t.data)} `
  const all = await listPartTypes()
  const scored = all
    .map((p) => {
      let best = 0
      for (const term of [p.name, ...p.synonyms]) {
        const n = norm(term)
        if (!n) continue
        if (text.includes(` ${n} `)) best = Math.max(best, 0.6 + Math.min(0.4, n.length / 40))
        else {
          const words = n.split(" ").filter((w) => w.length > 2)
          const hit = words.filter((w) => text.includes(` ${w} `) || text.includes(` ${w}s `)).length
          if (words.length && hit) best = Math.max(best, (hit / words.length) * 0.55)
        }
      }
      return { partType: p, score: Math.round(best * 100) / 100 }
    })
    .filter((x) => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Fitting products
// ---------------------------------------------------------------------------

const fitSchema = z.object({
  partTypeId: z.string().uuid().optional(),
  q: z.string().max(80).optional(),
  make: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  condition: z.enum(["genuine", "aftermarket", "home_used"]).optional(),
  limit: z.number().int().min(1).max(100).default(30),
})

export type FittingProduct = {
  id: string
  vendorId: string
  vendorName: string
  vendorCity: string | null
  vendorVerified: boolean
  vendorRating: number | null
  name: string
  brand: string | null
  sku: string
  partTypeId: string | null
  condition: string | null
  fitMake: string | null
  fitModel: string | null
  fitYearFrom: number | null
  fitYearTo: number | null
  /** 3 = make+model+year, 2 = make+model, 1 = make, 0 = universal */
  fitLevel: number
  price: number
  stockStatus: string | null
  leadTimeHours: number | null
  warrantyDays: number | null
  photo: string | null
}

/**
 * Products from approved vendors that fit the car. A product with no fitment
 * is treated as universal; one with a make must match it, and so on.
 */
export async function findFittingProducts(rawInput: unknown): Promise<FittingProduct[]> {
  const parsed = fitSchema.safeParse(rawInput ?? {})
  if (!parsed.success) return []
  const f = parsed.data
  const conds = [
    eq(vendorProducts.isActive, true),
    eq(vendors.status, "approved"),
    isNull(vendors.deletedAt),
    or(isNull(vendorProducts.stockStatus), ne(vendorProducts.stockStatus, "out"))!,
  ]
  if (f.partTypeId) conds.push(eq(vendorProducts.partTypeId, f.partTypeId))
  if (f.condition) conds.push(eq(vendorProducts.condition, f.condition))
  if (f.q) {
    const like = `%${f.q.trim()}%`
    conds.push(or(ilike(vendorProducts.name, like), ilike(vendorProducts.brand, like), ilike(vendorProducts.oemNumber, like))!)
  }
  if (f.make) conds.push(or(isNull(vendorProducts.fitMake), ilike(vendorProducts.fitMake, f.make))!)
  if (f.model) conds.push(or(isNull(vendorProducts.fitModel), ilike(vendorProducts.fitModel, f.model))!)
  if (f.year) {
    conds.push(or(isNull(vendorProducts.fitYearFrom), lte(vendorProducts.fitYearFrom, f.year))!)
    conds.push(or(isNull(vendorProducts.fitYearTo), gte(vendorProducts.fitYearTo, f.year))!)
  }

  const fitLevel = sql<number>`(case when ${vendorProducts.fitMake} is not null then 1 else 0 end
    + case when ${vendorProducts.fitModel} is not null then 1 else 0 end
    + case when ${vendorProducts.fitYearFrom} is not null or ${vendorProducts.fitYearTo} is not null then 1 else 0 end)`

  const rows = await db()
    .select({
      p: vendorProducts,
      vendorName: vendors.businessName,
      vendorCity: vendors.city,
      vendorVerified: vendors.isVerified,
      vendorRating: vendors.ratingAvg,
      fitLevel,
    })
    .from(vendorProducts)
    .innerJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
    .where(and(...conds))
    .orderBy(desc(fitLevel), desc(vendors.isVerified), asc(vendorProducts.price))
    .limit(f.limit)

  return rows.map(({ p, ...r }) => ({
    id: p.id,
    vendorId: p.vendorId,
    vendorName: r.vendorName,
    vendorCity: r.vendorCity,
    vendorVerified: Boolean(r.vendorVerified),
    vendorRating: r.vendorRating != null ? Number(r.vendorRating) : null,
    name: p.name,
    brand: p.brand,
    sku: p.sku,
    partTypeId: p.partTypeId,
    condition: p.condition,
    fitMake: p.fitMake,
    fitModel: p.fitModel,
    fitYearFrom: p.fitYearFrom,
    fitYearTo: p.fitYearTo,
    fitLevel: Number(r.fitLevel),
    price: Number(p.price),
    stockStatus: p.stockStatus,
    leadTimeHours: p.leadTimeHours,
    warrantyDays: p.warrantyDays,
    photo: p.photos?.[0] ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Platform admin — curate the list (local-language synonyms live here)
// ---------------------------------------------------------------------------

async function requireAdmin() {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [u] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.a ? userId : null
}

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  synonyms: z.array(z.string().trim().min(1).max(60)).max(40),
  typicalLabourHours: z.number().min(0).max(99).nullable().optional(),
})

export async function adminUpsertPartType(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: { code: "FORBIDDEN", message: "Platform admin only" } }
  const parsed = upsertSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Check the fields" } }
  const d = parsed.data
  const synonyms = [...new Set(d.synonyms.filter(Boolean))]
  const values = {
    name: d.name,
    category: d.category,
    synonyms,
    typicalLabourHours: d.typicalLabourHours != null ? String(d.typicalLabourHours) : null,
    updatedAt: new Date(),
  }
  if (d.id) {
    await db().update(partTypes).set(values).where(eq(partTypes.id, d.id))
    return { ok: true, data: { id: d.id } }
  }
  const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)
  try {
    const [row] = await db().insert(partTypes).values({ slug, ...values }).returning({ id: partTypes.id })
    return { ok: true, data: { id: row!.id } }
  } catch {
    return { ok: false, error: { code: "CONFLICT", message: "A part with that name already exists" } }
  }
}
