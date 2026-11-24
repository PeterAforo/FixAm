import "server-only"
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { brokers, vendors } from "@/lib/db/schema"
import { findFittingProducts, type FittingProduct } from "@/lib/parts-catalog/actions"
import { cheapestDelivery, groupBySeller, nearestTown, withDistance, type Point } from "./near-me"

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export type PartsQuery = {
  q?: string
  make?: string
  model?: string
  year?: number
  point: Point | null
  radiusKm: number | null
  verifiedOnly?: boolean
  deliversOnly?: boolean
  sort?: "nearest" | "cheapest"
}

export type SellerResult = {
  id: string
  slug: string
  name: string
  phone: string
  address: string | null
  city: string | null
  lat: number | null
  lng: number | null
  verified: boolean
  rating: number | null
  ratingCount: number
  delivery: { feePesewas: number; etaHours: number | null } | null
  distanceKm: number | null
  offers: Pick<FittingProduct, "id" | "name" | "brand" | "condition" | "fitLevel" | "price" | "stockStatus" | "warrantyDays">[]
  cheapest: number
}

/**
 * Parts that fit the car, grouped by seller and sorted by distance from the
 * searcher. Sellers without a map pin only show when the radius is "All Ghana".
 */
export async function findPartsNear(qy: PartsQuery): Promise<{ sellers: SellerResult[]; searched: boolean }> {
  const searched = Boolean(qy.q?.trim())
  if (!searched) return { sellers: [], searched }
  const products = await findFittingProducts({
    q: qy.q?.trim().slice(0, 80),
    make: qy.make || undefined,
    model: qy.model || undefined,
    year: qy.year || undefined,
    limit: 100,
  })
  if (!products.length) return { sellers: [], searched }

  const ids = [...new Set(products.map((p) => p.vendorId))]
  const rows = await db()
    .select({
      id: vendors.id, slug: vendors.slug, name: vendors.businessName, phone: vendors.phone, address: vendors.address,
      city: vendors.city, gpsLat: vendors.gpsLat, gpsLng: vendors.gpsLng, verified: vendors.isVerified,
      rating: vendors.ratingAvg, ratingCount: vendors.ratingCount, zones: vendors.deliveryZones,
    })
    .from(vendors)
    .where(and(inArray(vendors.id, ids), eq(vendors.status, "approved"), isNull(vendors.deletedAt)))

  let sellers = rows.map((v) => ({
    id: v.id, slug: v.slug, name: v.name, phone: v.phone, address: v.address, city: v.city,
    lat: v.gpsLat != null ? Number(v.gpsLat) : null,
    lng: v.gpsLng != null ? Number(v.gpsLng) : null,
    verified: Boolean(v.verified),
    rating: v.rating != null ? Number(v.rating) : null,
    ratingCount: v.ratingCount ?? 0,
    delivery: cheapestDelivery(v.zones),
  }))
  if (qy.verifiedOnly) sellers = sellers.filter((s) => s.verified)
  if (qy.deliversOnly) sellers = sellers.filter((s) => s.delivery != null)

  const located = withDistance(sellers, qy.point, qy.radiusKm, qy.radiusKm == null)
  const trimmed = products.map((p) => ({
    id: p.id, vendorId: p.vendorId, name: p.name, brand: p.brand, condition: p.condition, fitLevel: p.fitLevel,
    price: p.price, stockStatus: p.stockStatus, warrantyDays: p.warrantyDays,
  }))
  let groups = groupBySeller(trimmed, located).map((g) => ({
    ...g,
    offers: g.offers.slice(0, 4).map((o) => ({
      id: o.id, name: o.name, brand: o.brand, condition: o.condition, fitLevel: o.fitLevel,
      price: o.price, stockStatus: o.stockStatus, warrantyDays: o.warrantyDays,
    })),
  }))
  if (!qy.point) groups.sort((a, b) => Number(b.verified) - Number(a.verified) || a.cheapest - b.cheapest)
  if (qy.sort === "cheapest") groups = [...groups].sort((a, b) => a.cheapest - b.cheapest)
  return { sellers: groups.slice(0, 30), searched }
}

// ---------------------------------------------------------------------------
// Brokers
// ---------------------------------------------------------------------------

export type BrokerKindFilter = "insurance" | "dvla" | "all"

export type BrokerResult = {
  id: string
  name: string
  kind: string
  phone: string
  city: string | null
  region: string | null
  lat: number | null
  lng: number | null
  verified: boolean
  rating: number | null
  ratingCount: number
  insurers: string[]
  feePesewas: number | null
  distanceKm: number | null
}

/**
 * Active brokers / DVLA agents, nearest first. Brokers who haven't pinned
 * their office come back in `unpinned` so the page can list them separately.
 */
export async function findBrokersNear(qy: {
  kind: BrokerKindFilter
  point: Point | null
  radiusKm: number | null
  verifiedOnly?: boolean
  insurer?: string
}): Promise<{ near: BrokerResult[]; unpinned: BrokerResult[] }> {
  const kindCond =
    qy.kind === "all" ? undefined : or(eq(brokers.kind, qy.kind), eq(brokers.kind, "both"))
  const rows = await db()
    .select()
    .from(brokers)
    .where(and(isNull(brokers.deletedAt), eq(brokers.status, "active"), kindCond, qy.verifiedOnly ? eq(brokers.isVerified, true) : undefined))
    .orderBy(desc(brokers.isVerified), desc(brokers.ratingAvg), brokers.businessName)
    .limit(300)

  let list: Omit<BrokerResult, "distanceKm">[] = rows.map((b) => ({
    id: b.id, name: b.businessName, kind: b.kind, phone: b.phone, city: b.city, region: b.region,
    lat: b.gpsLat != null ? Number(b.gpsLat) : null,
    lng: b.gpsLng != null ? Number(b.gpsLng) : null,
    verified: b.isVerified,
    rating: b.ratingAvg != null ? Number(b.ratingAvg) : null,
    ratingCount: b.ratingCount,
    insurers: b.insurers ?? [],
    feePesewas: b.defaultServiceFee != null ? Number(b.defaultServiceFee) : null,
  }))
  if (qy.insurer && qy.kind !== "dvla") {
    const want = qy.insurer.toLowerCase()
    list = list.filter((b) => b.insurers.some((i) => i.toLowerCase() === want))
  }

  if (!qy.point) return { near: list.map((b) => ({ ...b, distanceKm: null })).slice(0, 60), unpinned: [] }
  const near = withDistance(list.filter((b) => b.lat != null && b.lng != null), qy.point, qy.radiusKm)
  // Not pinned yet: show the ones in the searcher's town first.
  const town = nearestTown(qy.point)
  const unpinned = list
    .filter((b) => b.lat == null || b.lng == null)
    .map((b) => ({ ...b, distanceKm: null }))
    .sort((a, b) => Number(Boolean(town && b.city?.toLowerCase().includes(town))) - Number(Boolean(town && a.city?.toLowerCase().includes(town))))
  return { near: near.slice(0, 60), unpinned: unpinned.slice(0, 30) }
}
