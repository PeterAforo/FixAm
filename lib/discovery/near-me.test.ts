import { describe, expect, it } from "vitest"
import { AREAS, cheapestDelivery, groupBySeller, nearestAreaLabel, parsePoint, parseRadius, roundKm, withDistance } from "./near-me"

const kaneshie = AREAS.find((a) => a.slug === "kaneshie")!

describe("parsePoint", () => {
  it("accepts points in Ghana", () => {
    expect(parsePoint("5.567", "-0.233")).toEqual({ lat: 5.567, lng: -0.233 })
  })
  it("rejects missing, junk and far-away points", () => {
    expect(parsePoint(null, "1")).toBeNull()
    expect(parsePoint("abc", "1")).toBeNull()
    expect(parsePoint("51.5", "-0.12")).toBeNull() // London
  })
})

describe("parseRadius", () => {
  it("maps the choices", () => {
    expect(parseRadius("5")).toBe(5)
    expect(parseRadius("all")).toBeNull()
    expect(parseRadius("999")).toBe(10)
    expect(parseRadius(undefined)).toBe(10)
  })
})

describe("nearestAreaLabel", () => {
  it("names a nearby area", () => {
    expect(nearestAreaLabel({ lat: 5.568, lng: -0.234 })).toBe("near Kaneshie, Accra")
  })
  it("falls back when nothing is close", () => {
    expect(nearestAreaLabel({ lat: 8.0, lng: -2.5 })).toBe("near you")
  })
})

describe("withDistance", () => {
  const items = [
    { id: "far", lat: 6.718, lng: -1.626 }, // Suame, ~200 km
    { id: "near", lat: 5.556, lng: -0.227 }, // Abossey Okai, ~1.4 km
    { id: "none", lat: null, lng: null },
  ]
  it("sorts by distance and applies the radius", () => {
    const r = withDistance(items, kaneshie, 10)
    expect(r.map((x) => x.id)).toEqual(["near"])
    expect(r[0]!.distanceKm!).toBeLessThan(2)
  })
  it("keeps unlocated items last when asked", () => {
    expect(withDistance(items, kaneshie, null, true).map((x) => x.id)).toEqual(["near", "far", "none"])
  })
  it("leaves order alone without a point", () => {
    expect(withDistance(items, null, 10).map((x) => x.id)).toEqual(["far", "near", "none"])
  })
})

describe("cheapestDelivery", () => {
  it("picks the lowest fee", () => {
    expect(cheapestDelivery([{ fee: 30, etaHours: 24 }, { fee: 25, etaHours: 4 }])).toEqual({ feePesewas: 2500, etaHours: 4 })
  })
  it("is null for pickup-only sellers", () => {
    expect(cheapestDelivery(null)).toBeNull()
    expect(cheapestDelivery([])).toBeNull()
    expect(cheapestDelivery([{ region: "Greater Accra" }])).toBeNull()
  })
})

describe("groupBySeller", () => {
  it("groups offers under sellers, cheapest first", () => {
    const g = groupBySeller(
      [{ vendorId: "a", price: 300 }, { vendorId: "b", price: 100 }, { vendorId: "a", price: 200 }, { vendorId: "x", price: 1 }],
      [{ id: "b" }, { id: "a" }]
    )
    expect(g.map((s) => s.id)).toEqual(["b", "a"])
    expect(g[1]!.offers.map((o) => o.price)).toEqual([200, 300])
    expect(g[1]!.cheapest).toBe(200)
  })
})

describe("roundKm", () => {
  it("formats", () => {
    expect(roundKm(1.234)).toBe("1.2 km")
    expect(roundKm(12.6)).toBe("13 km")
  })
})

describe("nearestTown", () => {
  it("gives the town of a nearby area", async () => {
    const { nearestTown } = await import("./near-me")
    expect(nearestTown({ lat: 5.57, lng: -0.23 })).toBe("accra")
    expect(nearestTown({ lat: 8.0, lng: -2.5 })).toBeNull()
  })
})
