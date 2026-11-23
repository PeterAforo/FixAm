/** DeliveryProvider — partner courier fallback when a vendor has no rider free (P8-03). */
export type DeliveryBookingInput = {
  orderNumber: string
  pickup: { name: string; phone: string; address: string | null; city: string | null }
  dropoff: { name: string; phone: string | null; address: string | null; city: string | null }
  notes?: string
}

export type DeliveryBooking = {
  reference: string
  status: "requested" | "assigned"
  riderName?: string
  riderPhone?: string
  trackingUrl?: string
}

export interface DeliveryProvider {
  readonly name: string
  book(input: DeliveryBookingInput): Promise<DeliveryBooking>
}
