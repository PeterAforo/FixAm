/**
 * Pure helpers for the driver parts shop (no DB) — delivery zones and order
 * maths, unit-tested in parts-shop.test.ts.
 */

export type Zone = { region?: string; city?: string; fee?: number; etaHours?: number }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase()

export function zonesOf(deliveryZones: unknown): Zone[] {
  return Array.isArray(deliveryZones) ? (deliveryZones as Zone[]) : []
}

/** The vendor's zone covering this place, or null when they don't deliver there. */
export function zoneForPlace(deliveryZones: unknown, place: { region: string | null; city: string | null }): Zone | null {
  const zones = zonesOf(deliveryZones)
  if (zones.length === 0) return null
  const r = norm(place.region)
  const c = norm(place.city)
  if (!r && !c) return zones[0] ?? null
  return zones.find((z) => (r && norm(z.region) === r) || (c && (norm(z.city) === c || norm(z.region) === c))) ?? null
}

export type Destination =
  | { type: "garage"; garageId: string }
  | { type: "home"; address: string; region: string; city?: string }
  | { type: "pickup" }

export type QuoteLine = { productId: string; name: string; unitPrice: number; quantity: number }

export type VendorQuote = {
  vendorId: string
  vendorName: string
  lines: QuoteLine[]
  subtotal: number
  deliveryFee: number
  etaHours: number | null
  deliverable: boolean
}

/** Group lines by vendor and price delivery to the destination (pesewas, numbers). */
export function quoteByVendor(
  items: { productId: string; quantity: number; name: string; price: number; vendorId: string; vendorName: string; deliveryZones: unknown }[],
  place: { region: string | null; city: string | null } | null // null = pickup
): VendorQuote[] {
  const byVendor = new Map<string, VendorQuote>()
  for (const it of items) {
    let q = byVendor.get(it.vendorId)
    if (!q) {
      const zone = place ? zoneForPlace(it.deliveryZones, place) : null
      q = {
        vendorId: it.vendorId,
        vendorName: it.vendorName,
        lines: [],
        subtotal: 0,
        deliveryFee: place ? Math.round((zone?.fee ?? 0) * 100) : 0,
        etaHours: zone?.etaHours ?? null,
        deliverable: place ? zone !== null : true,
      }
      byVendor.set(it.vendorId, q)
    }
    q.lines.push({ productId: it.productId, name: it.name, unitPrice: it.price, quantity: it.quantity })
    q.subtotal += it.price * it.quantity
  }
  return [...byVendor.values()]
}

/** Commission in pesewas from basis points (floor). */
export function commissionFor(subtotal: bigint, bp: number | null | undefined): bigint {
  return (subtotal * BigInt(Math.max(0, bp ?? 0))) / 10000n
}
