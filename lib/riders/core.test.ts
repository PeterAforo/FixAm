import { describe, expect, it } from "vitest"
import { canTransitionDelivery, offerIsLive, offerRadiusKm, pinMatches } from "./core"

describe("delivery transitions", () => {
  it("offers can be accepted by a rider or cancelled by the vendor", () => {
    expect(canTransitionDelivery("offered", "assigned", "rider")).toBe(true)
    expect(canTransitionDelivery("offered", "assigned", "vendor")).toBe(false)
    expect(canTransitionDelivery("offered", "cancelled", "vendor")).toBe(true)
    expect(canTransitionDelivery("offered", "cancelled", "rider")).toBe(false)
  })

  it("pickup and drop-off need the rider and the right order", () => {
    expect(canTransitionDelivery("assigned", "picked_up", "rider")).toBe(true)
    expect(canTransitionDelivery("assigned", "delivered", "rider")).toBe(false)
    expect(canTransitionDelivery("picked_up", "delivered", "rider")).toBe(true)
    expect(canTransitionDelivery("delivered", "picked_up", "rider")).toBe(false)
    expect(canTransitionDelivery("picked_up", "failed", "rider")).toBe(false)
  })
})

describe("offer radius", () => {
  it("widens 5 km per step up to 25 km", () => {
    expect(offerRadiusKm(0)).toBe(5)
    expect(offerRadiusKm(1)).toBe(10)
    expect(offerRadiusKm(4)).toBe(25)
    expect(offerRadiusKm(9)).toBe(25)
  })
})

describe("pins", () => {
  it("only matches the exact pin", () => {
    expect(pinMatches("4821", "4821")).toBe(true)
    expect(pinMatches("4821 ", "4821")).toBe(true)
    expect(pinMatches("4822", "4821")).toBe(false)
    expect(pinMatches("", "4821")).toBe(false)
    expect(pinMatches("4821", null)).toBe(false)
  })
})

describe("offerIsLive", () => {
  it("is live only while offered and unexpired", () => {
    const now = new Date("2026-01-01T00:00:00Z")
    expect(offerIsLive("offered", new Date("2026-01-01T00:30:00Z"), now)).toBe(true)
    expect(offerIsLive("offered", new Date("2025-12-31T23:00:00Z"), now)).toBe(false)
    expect(offerIsLive("assigned", new Date("2026-01-01T00:30:00Z"), now)).toBe(false)
    expect(offerIsLive("offered", null, now)).toBe(false)
  })
})
