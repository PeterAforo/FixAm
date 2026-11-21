import "server-only"
import { and, asc, eq, ilike, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { vehicleMakes, vehicleModels } from "@/lib/db/schema"
import { VEHICLE_CATALOGUE } from "./data"

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

/** Idempotent catalogue seed — safe to re-run. */
export async function seedCatalogue() {
  let inserted = 0
  for (const make of VEHICLE_CATALOGUE) {
    const [existing] = await db()
      .select({ id: vehicleMakes.id })
      .from(vehicleMakes)
      .where(eq(vehicleMakes.slug, make.slug))
      .limit(1)

    let makeId = existing?.id
    if (!makeId) {
      const [row] = await db()
        .insert(vehicleMakes)
        .values({
          name: make.name,
          slug: make.slug,
          country: make.country,
          sortOrder: make.sortOrder,
        })
        .returning({ id: vehicleMakes.id })
      makeId = row!.id
      inserted++
    }

    for (const [i, m] of make.models.entries()) {
      const slug = slugify(m.name)
      const [modelExists] = await db()
        .select({ id: vehicleModels.id })
        .from(vehicleModels)
        .where(and(eq(vehicleModels.makeId, makeId), eq(vehicleModels.slug, slug)))
        .limit(1)
      if (modelExists) continue
      await db().insert(vehicleModels).values({
        makeId,
        name: m.name,
        slug,
        yearStart: m.yearStart ?? null,
        yearEnd: m.yearEnd ?? null,
        bodyType: m.bodyType ?? null,
        sortOrder: i,
      })
      inserted++
    }
  }
  return { inserted }
}

export async function listMakes() {
  return db()
    .select({ id: vehicleMakes.id, name: vehicleMakes.name, slug: vehicleMakes.slug, country: vehicleMakes.country })
    .from(vehicleMakes)
    .where(eq(vehicleMakes.isActive, true))
    .orderBy(asc(vehicleMakes.sortOrder), asc(vehicleMakes.name))
}

export async function modelsForMake(makeId: string) {
  return db()
    .select({
      id: vehicleModels.id,
      name: vehicleModels.name,
      yearStart: vehicleModels.yearStart,
      yearEnd: vehicleModels.yearEnd,
      bodyType: vehicleModels.bodyType,
    })
    .from(vehicleModels)
    .where(and(eq(vehicleModels.makeId, makeId), eq(vehicleModels.isActive, true)))
    .orderBy(asc(vehicleModels.sortOrder), asc(vehicleModels.name))
}

/** Full catalogue grouped by make — for pickers (small dataset). */
export async function listCatalogueGrouped() {
  const makes = await listMakes()
  const models = await db()
    .select({
      id: vehicleModels.id,
      makeId: vehicleModels.makeId,
      name: vehicleModels.name,
      yearStart: vehicleModels.yearStart,
      yearEnd: vehicleModels.yearEnd,
      bodyType: vehicleModels.bodyType,
    })
    .from(vehicleModels)
    .where(eq(vehicleModels.isActive, true))
    .orderBy(asc(vehicleModels.sortOrder), asc(vehicleModels.name))
  return makes.map((m) => ({
    ...m,
    models: models.filter((v) => v.makeId === m.id),
  }))
}

/** Fuzzy search across makes and models for pickers. */
export async function searchCatalogue(q: string, limit = 20) {
  const term = `%${q}%`
  const rows = await db()
    .select({
      modelId: vehicleModels.id,
      modelName: vehicleModels.name,
      makeId: vehicleMakes.id,
      makeName: vehicleMakes.name,
      makeSlug: vehicleMakes.slug,
    })
    .from(vehicleModels)
    .innerJoin(vehicleMakes, eq(vehicleModels.makeId, vehicleMakes.id))
    .where(
      and(
        eq(vehicleModels.isActive, true),
        eq(vehicleMakes.isActive, true),
        or(ilike(vehicleModels.name, term), ilike(vehicleMakes.name, term))
      )
    )
    .orderBy(asc(vehicleMakes.sortOrder), asc(vehicleModels.sortOrder))
    .limit(limit)
  return rows
}

/** Resolve free-text make/model to catalogue ids (best effort). */
export async function resolveCatalogueIds(make: string, model: string) {
  const [mk] = await db()
    .select({ id: vehicleMakes.id })
    .from(vehicleMakes)
    .where(and(eq(vehicleMakes.isActive, true), ilike(vehicleMakes.name, make)))
    .limit(1)
  if (!mk) return { catalogMakeId: null, catalogModelId: null }
  const [md] = await db()
    .select({ id: vehicleModels.id })
    .from(vehicleModels)
    .where(and(eq(vehicleModels.makeId, mk.id), ilike(vehicleModels.name, model)))
    .limit(1)
  return { catalogMakeId: mk.id, catalogModelId: md?.id ?? null }
}

/** Count for admin/seed reporting. */
export async function catalogueStats() {
  const [m] = await db().select({ n: sql<number>`count(*)::int` }).from(vehicleMakes)
  const [v] = await db().select({ n: sql<number>`count(*)::int` }).from(vehicleModels)
  return { makes: m?.n ?? 0, models: v?.n ?? 0 }
}
