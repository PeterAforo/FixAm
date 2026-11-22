import "server-only"
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  branches,
  garageReviews,
  garageVehicleCoverage,
  garages,
  jobTemplates,
  plans,
  subscriptions,
  vehicleMakes,
  vehicleModels,
} from "@/lib/db/schema"

export type DirectoryEntry = {
  id: string
  slug: string
  name: string
  city: string | null
  region: string | null
  address: string | null
  phone: string | null
  logoUrl: string | null
  brandColor: string | null
  gpsLat: number | null
  gpsLng: number | null
  ratingAvg: number | null
  reviewCount: number
  distanceKm: number | null
  services: string[]
  coverage: string[] // e.g. "Toyota", "Honda Civic"
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Garages eligible for the public directory: active + plan includes directory_listing. */
async function eligibleGarageIds() {
  const rows = await db()
    .select({ garageId: subscriptions.garageId })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        inArray(subscriptions.status, ["trialing", "active"]),
        sql`${plans.features} @> ARRAY['directory_listing']::text[]`
      )
    )
  return new Set(rows.map((r) => r.garageId))
}

export async function listDirectoryGarages(opts: {
  q?: string
  lat?: number | null
  lng?: number | null
  makeId?: string | null
  modelId?: string | null
  limit?: number
}): Promise<DirectoryEntry[]> {
  const eligible = await eligibleGarageIds()
  if (!eligible.size) return []

  const term = opts.q?.trim()
  const conditions = [
    eq(garages.status, "active"),
    isNull(garages.deletedAt),
    inArray(garages.id, [...eligible]),
  ]
  if (term) {
    conditions.push(or(ilike(garages.name, `%${term}%`), ilike(garages.city, `%${term}%`), ilike(garages.region, `%${term}%`))!)
  }

  const garageRows = await db()
    .select()
    .from(garages)
    .where(and(...conditions))
    .limit(500)

  // Coverage filter: garage must service the requested make/model
  let filtered = garageRows
  if (opts.makeId || opts.modelId) {
    const cov = await db()
      .select({ garageId: garageVehicleCoverage.garageId, catalogMakeId: garageVehicleCoverage.catalogMakeId, catalogModelId: garageVehicleCoverage.catalogModelId })
      .from(garageVehicleCoverage)
      .where(eq(garageVehicleCoverage.isActive, true))
    filtered = garageRows.filter((g) =>
      cov.some((c) => {
        if (c.garageId !== g.id) return false
        if (opts.modelId && c.catalogModelId === opts.modelId) return true
        if (opts.makeId && c.catalogMakeId === opts.makeId && !c.catalogModelId) return true
        return false
      })
    )
  }

  const ids = filtered.map((g) => g.id)
  if (!ids.length) return []

  const [reviewAgg, coverageRows, serviceRows] = await Promise.all([
    db()
      .select({
        garageId: garageReviews.garageId,
        avg: sql<number>`round(avg(${garageReviews.rating})::numeric, 1)`,
        count: sql<number>`count(*)::int`,
      })
      .from(garageReviews)
      .where(and(inArray(garageReviews.garageId, ids), eq(garageReviews.status, "published")))
      .groupBy(garageReviews.garageId),
    db()
      .select({
        garageId: garageVehicleCoverage.garageId,
        make: garageVehicleCoverage.make,
        model: garageVehicleCoverage.model,
        catalogMakeId: garageVehicleCoverage.catalogMakeId,
        catalogModelId: garageVehicleCoverage.catalogModelId,
      })
      .from(garageVehicleCoverage)
      .where(and(inArray(garageVehicleCoverage.garageId, ids), eq(garageVehicleCoverage.isActive, true))),
    db()
      .selectDistinct({ garageId: jobTemplates.garageId, name: jobTemplates.name })
      .from(jobTemplates)
      .where(inArray(jobTemplates.garageId, ids)),
  ])

  const ratingMap = new Map(reviewAgg.map((r) => [r.garageId, r]))
  const covMap = new Map<string, string[]>()
  for (const c of coverageRows) {
    const label = c.model ? `${c.make} ${c.model}` : c.make
    const arr = covMap.get(c.garageId) ?? []
    if (!arr.includes(label)) arr.push(label)
    covMap.set(c.garageId, arr)
  }
  const svcMap = new Map<string, string[]>()
  for (const s of serviceRows) {
    const arr = svcMap.get(s.garageId) ?? []
    arr.push(s.name)
    svcMap.set(s.garageId, arr)
  }

  const entries: DirectoryEntry[] = filtered.map((g) => {
    const lat = g.gpsLat != null ? Number(g.gpsLat) : null
    const lng = g.gpsLng != null ? Number(g.gpsLng) : null
    const distanceKm =
      opts.lat != null && opts.lng != null && lat != null && lng != null
        ? haversineKm(opts.lat, opts.lng, lat, lng)
        : null
    const ra = ratingMap.get(g.id)
    return {
      id: g.id,
      slug: g.slug,
      name: g.name,
      city: g.city,
      region: g.region,
      address: g.address,
      phone: g.phone,
      logoUrl: g.logoUrl,
      brandColor: g.brandColor,
      gpsLat: lat,
      gpsLng: lng,
      ratingAvg: ra ? Number(ra.avg) : null,
      reviewCount: ra?.count ?? 0,
      distanceKm,
      services: (svcMap.get(g.id) ?? []).slice(0, 8),
      coverage: (covMap.get(g.id) ?? []).slice(0, 12),
    }
  })

  entries.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
    if (a.distanceKm != null) return -1
    if (b.distanceKm != null) return 1
    return a.name.localeCompare(b.name)
  })

  return entries.slice(0, opts.limit ?? 100)
}

export async function garagePublicProfile(slug: string) {
  const eligible = await eligibleGarageIds()
  const [g] = await db()
    .select()
    .from(garages)
    .where(and(eq(garages.slug, slug), eq(garages.status, "active"), isNull(garages.deletedAt)))
    .limit(1)
  if (!g || !eligible.has(g.id)) return null

  const branchRows = await db()
    .select({ name: branches.name, address: branches.address, phone: branches.phone, openingHours: branches.openingHours })
    .from(branches)
    .where(and(eq(branches.garageId, g.id), isNull(branches.deletedAt)))
    .limit(10)

  const coverageRows = await db()
    .select({ make: garageVehicleCoverage.make, model: garageVehicleCoverage.model })
    .from(garageVehicleCoverage)
    .where(and(eq(garageVehicleCoverage.garageId, g.id), eq(garageVehicleCoverage.isActive, true)))

  const serviceRows = await db()
    .selectDistinct({ name: jobTemplates.name })
    .from(jobTemplates)
    .where(eq(jobTemplates.garageId, g.id))

  const reviews = await db()
    .select({
      rating: garageReviews.rating,
      comment: garageReviews.comment,
      createdAt: garageReviews.createdAt,
    })
    .from(garageReviews)
    .where(and(eq(garageReviews.garageId, g.id), eq(garageReviews.status, "published")))
    .orderBy(sql`${garageReviews.createdAt} DESC`)
    .limit(20)

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null

  return {
    id: g.id,
    slug: g.slug,
    name: g.name,
    city: g.city,
    region: g.region,
    address: g.address,
    phone: g.phone,
    email: g.email,
    logoUrl: g.logoUrl,
    brandColor: g.brandColor,
    gpsLat: g.gpsLat != null ? Number(g.gpsLat) : null,
    gpsLng: g.gpsLng != null ? Number(g.gpsLng) : null,
    branches: branchRows,
    coverage: coverageRows.map((c) => (c.model ? `${c.make} ${c.model}` : c.make)),
    services: serviceRows.map((s) => s.name),
    ratingAvg: avg != null ? Math.round(avg * 10) / 10 : null,
    reviewCount: reviews.length,
    reviews: reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString().slice(0, 10) })),
    bookingUrl: `/o/${g.slug}`,
  }
}

/** Makes/models with active coverage — for the directory filter dropdowns. */
export async function directoryCoverageOptions() {
  const rows = await db()
    .selectDistinct({ makeId: garageVehicleCoverage.catalogMakeId, modelId: garageVehicleCoverage.catalogModelId })
    .from(garageVehicleCoverage)
    .where(eq(garageVehicleCoverage.isActive, true))
  const makeIds = [...new Set(rows.map((r) => r.makeId).filter(Boolean))] as string[]
  const makes = makeIds.length
    ? await db().select({ id: vehicleMakes.id, name: vehicleMakes.name }).from(vehicleMakes).where(inArray(vehicleMakes.id, makeIds))
    : []
  const modelIds = [...new Set(rows.map((r) => r.modelId).filter(Boolean))] as string[]
  const models = modelIds.length
    ? await db().select({ id: vehicleModels.id, name: vehicleModels.name, makeId: vehicleModels.makeId }).from(vehicleModels).where(inArray(vehicleModels.id, modelIds))
    : []
  return { makes, models }
}
