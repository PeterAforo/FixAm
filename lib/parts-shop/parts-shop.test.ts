import { describe, expect, it } from "vitest"
import { commissionFor, quoteByVendor, zoneForPlace } from "./core"

const zones = [
  { region: "Greater Accra", fee: 30, etaHours: 24 },
  { region: "Ashanti", city: "Kumasi", fee: 60, etaHours: 48 },
]

describe("zoneForPlace", () => {
  it("matches region or city", () => {
    expect(zoneForPlace(zones, { region: "Greater Accra", city: "Tema" })?.fee).toBe(30)
    expect(zoneForPlace(zones, { region: null, city: "kumasi" })?.fee).toBe(60)
    expect(zoneForPlace(zones, { region: "Volta", city: "Ho" })).toBeNull()
    expect(zoneForPlace([], { region: "Greater Accra", city: null })).toBeNull()
  })
})

describe("quoteByVendor", () => {
  const items = [
    { productId: "a", quantity: 2, name: "Brake pads", price: 15000, vendorId: "v1", vendorName: "Abossey Parts", deliveryZones: zones },
    { productId: "b", quantity: 1, name: "Oil filter", price: 4000, vendorId: "v1", vendorName: "Abossey Parts", deliveryZones: zones },
    { productId: "c", quantity: 1, name: "Shock", price: 50000, vendorId: "v2", vendorName: "Kumasi Spares", deliveryZones: [{ region: "Ashanti", fee: 20 }] },
  ]
  it("groups by vendor and prices delivery to the destination", () => {
    const q = quoteByVendor(items, { region: "Greater Accra", city: "Accra" })
    expect(q).toHaveLength(2)
    expect(q[0]).toMatchObject({ vendorId: "v1", subtotal: 34000, deliveryFee: 3000, deliverable: true })
    expect(q[1]).toMatchObject({ vendorId: "v2", deliverable: false })
  })
  it("charges no delivery for pickup", () => {
    const q = quoteByVendor(items, null)
    expect(q.every((v) => v.deliveryFee === 0 && v.deliverable)).toBe(true)
  })
})

describe("commissionFor", () => {
  it("uses basis points", () => {
    expect(commissionFor(34000n, 500)).toBe(1700n)
    expect(commissionFor(34000n, null)).toBe(0n)
  })
})
