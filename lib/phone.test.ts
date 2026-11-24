import { describe, expect, it } from "vitest"
import { formatGhPhone, isValidGhPhone, normalizeGhPhone } from "./phone"

describe("normalizeGhPhone", () => {
  it("normalises local numbers to +233", () => {
    expect(normalizeGhPhone("0241234567")).toBe("+233241234567")
    expect(normalizeGhPhone("0551234567")).toBe("+233551234567")
  })

  it("accepts international formats", () => {
    expect(normalizeGhPhone("+233241234567")).toBe("+233241234567")
    expect(normalizeGhPhone("233241234567")).toBe("+233241234567")
    expect(normalizeGhPhone("00233241234567")).toBe("+233241234567")
  })

  it("tolerates formatting characters", () => {
    expect(normalizeGhPhone("024 123 4567")).toBe("+233241234567")
    expect(normalizeGhPhone("+233 (24) 123-4567")).toBe("+233241234567")
  })

  it("rejects invalid numbers", () => {
    expect(normalizeGhPhone("")).toBeNull()
    expect(normalizeGhPhone("12345")).toBeNull()
    expect(normalizeGhPhone("+15551234567")).toBeNull()
    expect(isValidGhPhone("abc")).toBe(false)
  })
})

describe("formatGhPhone", () => {
  it("spaces a Ghana number for display", () => {
    expect(formatGhPhone("+233200000001")).toBe("+233 20 000 0001")
  })
  it("leaves anything else alone", () => {
    expect(formatGhPhone("+15551234567")).toBe("+15551234567")
  })
})
