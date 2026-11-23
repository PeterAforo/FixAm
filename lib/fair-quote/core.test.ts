import { describe, expect, it } from "vitest"
import { bandFrom, carClass, comparablePrice, describeCheck, normaliseCity, percentile, verdictFor } from "./core"

describe("carClass", () => {
  it("classifies by body type and make", () => {
    expect(carClass({ make: "Toyota", bodyType: "sedan" })).toBe("economy")
    expect(carClass({ make: "Mercedes-Benz", bodyType: "suv" })).toBe("premium")
    expect(carClass({ make: "Toyota", bodyType: "pickup" })).toBe("suv")
    expect(carClass({ make: "Toyota", bodyType: "bus" })).toBe("commercial")
    expect(carClass({ make: "Honda", bodyType: "motorbike" })).toBe("motorbike")
    expect(carClass(null)).toBe("economy")
  })
})

describe("percentile and bands", () => {
  it("matches percentile_cont", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25)
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20)
  })
  it("hides bands below 5 prices or 3 garages", () => {
    expect(bandFrom([1, 2, 3, 4], 4, "city")).toBeNull()
    expect(bandFrom([1, 2, 3, 4, 5], 2, "city")).toBeNull()
    expect(bandFrom([100, 200, 300, 400, 500], 3, "city")).toMatchObject({ low: 200, median: 300, high: 400, sampleSize: 5 })
  })
})

describe("verdict", () => {
  const band = { low: 20000, high: 30000 }
  it("allows 10% tolerance", () => {
    expect(verdictFor(32000, band)).toBe("within")
    expect(verdictFor(34000, band)).toBe("above")
    expect(verdictFor(17000, band)).toBe("below")
  })
  it("writes a summary with sample size", () => {
    const b = bandFrom([20000, 22000, 25000, 28000, 30000, 31000], 3, "city")!
    const c = describeCheck("part", 45000, b, "economy", "kumasi")
    expect(c.verdict).toBe("above")
    expect(c.summary).toContain("Kumasi")
    expect(c.summary).toContain("6 recent prices")
  })
})

describe("comparablePrice", () => {
  it("uses unit price for parts and hourly rate for labour", () => {
    expect(comparablePrice({ type: "part", partTypeId: "x", unitPrice: 5000, quantity: 2 })).toEqual({ kind: "part", price: 5000, quantity: 2 })
    expect(comparablePrice({ type: "part", partTypeId: null, unitPrice: 5000, quantity: 2 })).toBeNull()
    expect(comparablePrice({ type: "labour", unitPrice: 30000, quantity: 1, labourHours: 2 })).toEqual({ kind: "labour_rate", price: 15000, quantity: 2 })
    expect(comparablePrice({ type: "labour", unitPrice: 30000, quantity: 1, labourHours: null })).toBeNull()
    expect(comparablePrice({ type: "part", partTypeId: "x", unitPrice: 0, quantity: 1 })).toBeNull()
  })
  it("normalises city", () => expect(normaliseCity("  East   Legon ")).toBe("east legon"))
})
