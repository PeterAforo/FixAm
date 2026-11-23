import "server-only"
import { inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { vendors } from "@/lib/db/schema"
import type { FittingProduct } from "@/lib/parts-catalog/actions"
import { zoneForPlace } from "@/lib/parts-shop/core"
import { scoreOffers } from "./core"

export type VendorOffer = {
  productId: string
  vendorId: string
  vendorName: string
  vendorVerified: boolean
  vendorRating: number | null
  name: string
  brand: string | null
  condition: string | null
  fitLevel: number
  price: number
  deliveryFee: number
  total: number
  etaHours: number | null
  warrantyDays: number | null
  deliverable: boolean
  score: number
}

/** Price delivery to a place (garage) and rank: fit, price, ETA, rating. Top 6. */
export async function rankVendorOffers(products: FittingProduct[], place: { region: string | null; city: string | null }): Promise<VendorOffer[]> {
  const vendorIds = [...new Set(products.map((p) => p.vendorId))]
  const zones = vendorIds.length ? await db().select({ id: vendors.id, zones: vendors.deliveryZones }).from(vendors).where(inArray(vendors.id, vendorIds)) : []
  const zoneByVendor = new Map(zones.map((z) => [z.id, z.zones]))
  return scoreOffers(
    products.map((p) => {
      const zone = zoneForPlace(zoneByVendor.get(p.vendorId), place)
      const deliveryFee = Math.round((zone?.fee ?? 0) * 100)
      return {
        p,
        deliveryFee,
        fitLevel: p.fitLevel,
        price: p.price + deliveryFee,
        etaHours: zone?.etaHours ?? p.leadTimeHours ?? null,
        rating: p.vendorRating,
        verified: p.vendorVerified,
        deliverable: zone !== null,
      }
    })
  )
    .slice(0, 6)
    .map((o) => ({
      productId: o.p.id,
      vendorId: o.p.vendorId,
      vendorName: o.p.vendorName,
      vendorVerified: o.p.vendorVerified,
      vendorRating: o.p.vendorRating,
      name: o.p.name,
      brand: o.p.brand,
      condition: o.p.condition,
      fitLevel: o.p.fitLevel,
      price: o.p.price,
      deliveryFee: o.deliveryFee,
      total: o.p.price + o.deliveryFee,
      etaHours: o.etaHours,
      warrantyDays: o.p.warrantyDays,
      deliverable: o.deliverable,
      score: o.score,
    }))
}
