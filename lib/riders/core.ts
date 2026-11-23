/**
 * P8-18 rider network — pure logic (no DB, no I/O). Unit-tested.
 */

export const DELIVERY_STATUSES = [
  "offered",
  "assigned",
  "picked_up",
  "delivered",
  "failed",
  "cancelled",
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  offered: "Finding a rider",
  assigned: "Rider assigned",
  picked_up: "On the way",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
}

export type DeliveryActor = "rider" | "vendor" | "system" | "buyer"

/** Who may move a delivery where. PIN checks happen in the service layer. */
const TRANSITIONS: Record<DeliveryStatus, Partial<Record<DeliveryStatus, DeliveryActor[]>>> = {
  offered: {
    assigned: ["rider"],
    cancelled: ["vendor", "system"],
    failed: ["system"],
  },
  assigned: {
    picked_up: ["rider"],
    cancelled: ["vendor", "system"],
    failed: ["system"],
  },
  picked_up: {
    delivered: ["rider"],
    failed: ["system"],
  },
  delivered: {},
  failed: {},
  cancelled: {},
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus, actor: DeliveryActor): boolean {
  return (TRANSITIONS[from]?.[to] ?? []).includes(actor)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export const OFFER_START_KM = 5
export const OFFER_STEP_KM = 5
export const OFFER_MAX_KM = 25
export const OFFER_TTL_MINUTES = 30

/** Radius for offer attempt `step` (0-based): 5, 10, 15, 20, 25 km. */
export function offerRadiusKm(step: number): number {
  return Math.min(OFFER_MAX_KM, OFFER_START_KM + step * OFFER_STEP_KM)
}

/** How many riders to SMS per offer round (nearest first). */
export const OFFER_BATCH = 10

/** Default rider earning for a delivery, pesewas (GH₵20). Vendors can see it; FixAm sets it. */
export const DEFAULT_RIDER_FEE = 2000n

/** PINs are 4 digits, shown to the hander-over party only. */
export const PIN_LENGTH = 4

export function pinMatches(input: string, expected: string | null): boolean {
  return !!expected && input.trim() === expected
}

/** A delivery offer is still live while unexpired and still `offered`. */
export function offerIsLive(status: string, expiresAt: Date | null, now: Date): boolean {
  return status === "offered" && !!expiresAt && expiresAt > now
}

/** Earnings history row shape for the rider's "My earnings" list. */
export type RiderEarningRow = {
  deliveryId: string
  number: string
  dropoffLabel: string
  amount: number // pesewas
  status: string
  deliveredAt: string | null
}
