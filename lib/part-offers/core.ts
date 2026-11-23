/**
 * Pure ranking for instant part offers (P8-04). Higher score = better offer.
 * Order of importance: fit, then a blend of price, ETA to the garage, seller
 * rating/verification. Distance is folded into ETA (vendor delivery zones).
 */
export type OfferInput = {
  fitLevel: number // 0..3
  price: number // pesewas incl. delivery
  etaHours: number | null
  rating: number | null // 0..5
  verified: boolean
  deliverable: boolean
}

export function scoreOffers<T extends OfferInput>(offers: T[]): (T & { score: number })[] {
  if (offers.length === 0) return []
  const prices = offers.map((o) => o.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const span = Math.max(1, max - min)
  return offers
    .map((o) => {
      const priceScore = 1 - (o.price - min) / span // 1 = cheapest
      const etaScore = o.etaHours == null ? 0.4 : Math.max(0, 1 - o.etaHours / 72) // same-day ≈ 1
      const ratingScore = o.rating == null ? 0.5 : o.rating / 5
      const score =
        (o.deliverable ? 0 : -100) + o.fitLevel * 10 + priceScore * 4 + etaScore * 3 + ratingScore * 2 + (o.verified ? 1 : 0)
      return { ...o, score: Math.round(score * 100) / 100 }
    })
    .sort((a, b) => b.score - a.score)
}

/** Confidence threshold above which a deterministic text match is trusted without AI. */
export const SURE_MATCH = 0.6
