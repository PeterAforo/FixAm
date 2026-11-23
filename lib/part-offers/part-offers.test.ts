import { describe, expect, it } from "vitest"
import { scoreOffers } from "./core"

const base = { rating: 4, verified: false, deliverable: true, etaHours: 24 }

describe("scoreOffers", () => {
  it("puts better fit first even when pricier", () => {
    const r = scoreOffers([
      { id: "universal", fitLevel: 0, price: 10000, ...base },
      { id: "exact", fitLevel: 3, price: 30000, ...base },
    ])
    expect(r[0]!.id).toBe("exact")
  })
  it("prefers cheaper and faster among equal fit", () => {
    const r = scoreOffers([
      { id: "slow-dear", fitLevel: 2, price: 40000, ...base, etaHours: 72 },
      { id: "fast-cheap", fitLevel: 2, price: 20000, ...base, etaHours: 6 },
    ])
    expect(r.map((o) => o.id)).toEqual(["fast-cheap", "slow-dear"])
  })
  it("sinks sellers that don't deliver to the garage", () => {
    const r = scoreOffers([
      { id: "no-delivery", fitLevel: 3, price: 1000, ...base, deliverable: false },
      { id: "delivers", fitLevel: 1, price: 50000, ...base },
    ])
    expect(r[0]!.id).toBe("delivers")
  })
  it("handles empty input", () => {
    expect(scoreOffers([])).toEqual([])
  })
})
