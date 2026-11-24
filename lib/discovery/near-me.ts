/**
 * Pure helpers for the public "near me" finders (/parts and /brokers).
 * No DB or browser code here so it can be unit-tested and used on both sides.
 */
import { distanceKm } from "@/lib/towing/core"

export type Point = { lat: number; lng: number }

/** Radius choices on the finder pages. `null` = all of Ghana. */
export const RADIUS_OPTIONS: { km: number | null; label: string }[] = [
  { km: 5, label: "5 km" },
  { km: 10, label: "10 km" },
  { km: 25, label: "25 km" },
  { km: null, label: "All Ghana" },
]
export const DEFAULT_RADIUS_KM = 10

/**
 * Popular areas for people who won't share GPS. Centre points are approximate
 * (to within about a kilometre) — good enough to sort by distance.
 */
export const AREAS: { slug: string; label: string; lat: number; lng: number }[] = [
  { slug: "abossey-okai", label: "Abossey Okai, Accra", lat: 5.556, lng: -0.227 },
  { slug: "kaneshie", label: "Kaneshie, Accra", lat: 5.567, lng: -0.233 },
  { slug: "east-legon", label: "East Legon, Accra", lat: 5.635, lng: -0.161 },
  { slug: "madina", label: "Madina, Accra", lat: 5.683, lng: -0.166 },
  { slug: "tema", label: "Tema", lat: 5.67, lng: -0.017 },
  { slug: "kasoa", label: "Kasoa", lat: 5.534, lng: -0.425 },
  { slug: "suame", label: "Suame, Kumasi", lat: 6.718, lng: -1.626 },
  { slug: "adum", label: "Adum, Kumasi", lat: 6.693, lng: -1.624 },
  { slug: "takoradi", label: "Takoradi", lat: 4.899, lng: -1.755 },
  { slug: "tamale", label: "Tamale", lat: 9.403, lng: -0.842 },
  { slug: "cape-coast", label: "Cape Coast", lat: 5.106, lng: -1.247 },
  { slug: "ho", label: "Ho", lat: 6.601, lng: 0.47 },
]

/** Parse lat/lng from the URL; anything outside Ghana (roughly) is ignored. */
export function parsePoint(lat?: string | null, lng?: string | null): Point | null {
  const a = Number(lat)
  const b = Number(lng)
  if (!lat || !lng || !Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < 4 || a > 11.5 || b < -3.5 || b > 1.5) return null
  return { lat: a, lng: b }
}

/** "5" | "10" | "25" | "all" → km or null (all). Unknown values fall back to the default. */
export function parseRadius(r?: string | null): number | null {
  if (r === "all") return null
  const n = Number(r)
  return [5, 10, 25].includes(n) ? n : DEFAULT_RADIUS_KM
}

/** The popular area closest to a point, and how far away it is. */
export function nearestArea(p: Point): { area: (typeof AREAS)[number]; km: number } {
  let best = AREAS[0]!
  let bestKm = Infinity
  for (const a of AREAS) {
    const km = distanceKm(p, a)
    if (km < bestKm) {
      best = a
      bestKm = km
    }
  }
  return { area: best, km: bestKm }
}

/** The area label nearest to a point, for the "Near you · …" chip. */
export function nearestAreaLabel(p: Point): string {
  const { area, km } = nearestArea(p)
  return km <= 15 ? `near ${area.label}` : "near you"
}

/** Town of the nearest popular area ("Kaneshie, Accra" → "accra"), when one is within 25 km. */
export function nearestTown(p: Point): string | null {
  const { area, km } = nearestArea(p)
  if (km > 25) return null
  return (area.label.split(",").pop() ?? area.label).trim().toLowerCase()
}

export function roundKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

type Located = { lat: number | null; lng: number | null }

/**
 * Attach distance to each item and filter by radius. Items without a location
 * are dropped when a point is set, unless `keepUnlocated` (they go last).
 */
export function withDistance<T extends Located>(
  items: T[],
  from: Point | null,
  radiusKm: number | null,
  keepUnlocated = false
): (T & { distanceKm: number | null })[] {
  const out = items.map((it) => ({
    ...it,
    distanceKm: from && it.lat != null && it.lng != null ? distanceKm(from, { lat: it.lat, lng: it.lng }) : null,
  }))
  if (!from) return out
  return out
    .filter((it) => (it.distanceKm == null ? keepUnlocated : radiusKm == null || it.distanceKm <= radiusKm))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
}

/** Vendor delivery zones store `fee` in cedis (see lib/vendors/actions.ts). */
export type DeliveryZone = { region?: string; city?: string; fee?: number; etaHours?: number }

/** Cheapest delivery option a seller advertises (fee in pesewas), or null when it only does pickup. */
export function cheapestDelivery(zones: unknown): { feePesewas: number; etaHours: number | null } | null {
  if (!Array.isArray(zones) || zones.length === 0) return null
  let best: { feePesewas: number; etaHours: number | null } | null = null
  for (const z of zones as DeliveryZone[]) {
    if (!z || typeof z !== "object") continue
    const fee = typeof z.fee === "number" && z.fee >= 0 ? Math.round(z.fee * 100) : null
    if (fee == null) continue
    if (!best || fee < best.feePesewas) best = { feePesewas: fee, etaHours: typeof z.etaHours === "number" ? z.etaHours : null }
  }
  return best
}

/** Group product rows under their seller, keeping the cheapest offers first. */
export function groupBySeller<P extends { vendorId: string; price: number }, S extends { id: string }>(
  products: P[],
  sellers: S[]
): (S & { offers: P[]; cheapest: number })[] {
  const byId = new Map(sellers.map((s) => [s.id, s]))
  const groups = new Map<string, P[]>()
  for (const p of products) {
    if (!byId.has(p.vendorId)) continue
    const list = groups.get(p.vendorId) ?? []
    list.push(p)
    groups.set(p.vendorId, list)
  }
  return sellers
    .filter((s) => groups.has(s.id))
    .map((s) => {
      const offers = [...groups.get(s.id)!].sort((a, b) => a.price - b.price)
      return { ...s, offers, cheapest: offers[0]!.price }
    })
}
