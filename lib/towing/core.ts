/**
 * Breakdown & towing (P8-15) — pure helpers, no database.
 */

export const PROBLEMS = [
  { id: "wont_start", label: "Won't start" },
  { id: "flat_tyre", label: "Flat tyre" },
  { id: "battery", label: "Flat battery" },
  { id: "overheating", label: "Overheating" },
  { id: "accident", label: "Accident" },
  { id: "out_of_fuel", label: "Out of fuel" },
  { id: "locked_out", label: "Locked out" },
  { id: "other", label: "Something else" },
] as const
export type ProblemId = (typeof PROBLEMS)[number]["id"]
export const PROBLEM_IDS = PROBLEMS.map((p) => p.id) as [ProblemId, ...ProblemId[]]
export const problemLabel = (id: string) => PROBLEMS.find((p) => p.id === id)?.label ?? id

export const SERVICES = [
  { id: "flatbed", label: "Flatbed tow" },
  { id: "wheel_lift", label: "Wheel-lift tow" },
  { id: "motorbike", label: "Motorbike carrier" },
  { id: "jump_start", label: "Jump start" },
  { id: "tyre", label: "Tyre change" },
] as const

/** How long an SOS waits for someone to accept. */
export const SEARCH_MINUTES = 30
/** A live location older than this isn't trusted; the base location is used instead. */
export const LIVE_FRESH_MINUTES = 30

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Rough road ETA: straight-line × 1.4 for roads, 25 km/h city traffic, + 5 min to get going. */
export function etaMinutes(km: number): number {
  return Math.max(5, Math.round(((km * 1.4) / 25) * 60 + 5))
}

export type OperatorPosition = {
  id: string
  isAvailable: boolean
  status: string
  serviceRadiusKm: number
  lastLat: number | null
  lastLng: number | null
  lastLocationAt: Date | null
  baseLat: number | null
  baseLng: number | null
}

/** Where an operator is now: fresh live location, else their base. */
export function operatorPoint(o: OperatorPosition, now: Date): { lat: number; lng: number; live: boolean } | null {
  const fresh = o.lastLocationAt && now.getTime() - o.lastLocationAt.getTime() <= LIVE_FRESH_MINUTES * 60_000
  if (fresh && o.lastLat != null && o.lastLng != null) return { lat: o.lastLat, lng: o.lastLng, live: true }
  if (o.baseLat != null && o.baseLng != null) return { lat: o.baseLat, lng: o.baseLng, live: false }
  return null
}

/** Available operators within both their own radius and the driver's, nearest first. */
export function pickRecipients(ops: OperatorPosition[], at: { lat: number; lng: number }, radiusKm: number, now: Date, max = 15): { id: string; distanceKm: number }[] {
  return ops
    .filter((o) => o.isAvailable && o.status === "active")
    .flatMap((o) => {
      const p = operatorPoint(o, now)
      if (!p) return []
      const d = distanceKm(p, at)
      return d <= Math.min(radiusKm, o.serviceRadiusKm) ? [{ id: o.id, distanceKm: Math.round(d * 10) / 10 }] : []
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, max)
}

/** Suggested quote: base fee + per-km fee × (operator → driver + driver → garage). */
export function suggestQuote(fees: { baseFee: number; perKmFee: number }, toDriverKm: number, toGarageKm: number | null): number {
  const km = toDriverKm + (toGarageKm ?? 0)
  return Math.round((fees.baseFee + fees.perKmFee * km * 1.4) / 100) * 100 // round to whole cedis
}

export type SosStatus = "searching" | "assigned" | "en_route" | "arrived" | "towing" | "completed" | "cancelled" | "expired"
export const ACTIVE: SosStatus[] = ["assigned", "en_route", "arrived", "towing"]

/** Steps the operator moves a job through. */
const NEXT: Partial<Record<SosStatus, SosStatus[]>> = {
  assigned: ["en_route"],
  en_route: ["arrived"],
  arrived: ["towing", "completed"], // roadside fix (jump start, tyre) can finish on the spot
  towing: ["completed"],
}
export function canMove(from: string, to: string): boolean {
  return (NEXT[from as SosStatus] ?? []).includes(to as SosStatus)
}

export const STATUS_LABEL: Record<SosStatus, string> = {
  searching: "Finding a tow truck",
  assigned: "Tow truck assigned",
  en_route: "On the way to you",
  arrived: "Arrived",
  towing: "Towing to the garage",
  completed: "Done",
  cancelled: "Cancelled",
  expired: "No one was available",
}

export const mapsLink = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
