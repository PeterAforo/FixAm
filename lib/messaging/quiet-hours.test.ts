import { describe, expect, it } from "vitest"
import { isQuietHour, nextAllowedTime, DEFAULT_QUIET_HOURS } from "./quiet-hours"

// Africa/Accra is UTC+0 year-round (no DST) — easy to reason about.
describe("quiet hours (21:00–07:00 Africa/Accra)", () => {
  it("flags night-time messages", () => {
    // 22:30 UTC = 22:30 Accra → quiet
    expect(isQuietHour(new Date("2025-01-15T22:30:00Z"))).toBe(true)
    // 03:00 UTC → quiet
    expect(isQuietHour(new Date("2025-01-15T03:00:00Z"))).toBe(true)
  })

  it("allows daytime messages", () => {
    expect(isQuietHour(new Date("2025-01-15T12:00:00Z"))).toBe(false)
    expect(isQuietHour(new Date("2025-01-15T07:00:00Z"))).toBe(false) // boundary: end is inclusive-open
    expect(isQuietHour(new Date("2025-01-15T20:59:00Z"))).toBe(false)
  })

  it("reschedules a 22:30 send to 07:00 next morning", () => {
    const result = nextAllowedTime(new Date("2025-01-15T22:30:00Z"))
    expect(result.toISOString()).toBe("2025-01-16T07:00:00.000Z")
  })

  it("reschedules a 03:00 send to 07:00 same morning", () => {
    const result = nextAllowedTime(new Date("2025-01-15T03:00:00Z"))
    expect(result.toISOString()).toBe("2025-01-15T07:00:00.000Z")
  })

  it("leaves daytime sends untouched", () => {
    const d = new Date("2025-01-15T12:00:00Z")
    expect(nextAllowedTime(d).getTime()).toBe(d.getTime())
  })

  it("supports custom windows", () => {
    const quiet = { start: "12:00", end: "13:00" }
    expect(isQuietHour(new Date("2025-01-15T12:30:00Z"), quiet)).toBe(true)
    const result = nextAllowedTime(new Date("2025-01-15T12:30:00Z"), quiet)
    expect(result.toISOString()).toBe("2025-01-15T13:00:00.000Z")
  })

  it("exposes the spec default", () => {
    expect(DEFAULT_QUIET_HOURS).toEqual({ start: "21:00", end: "07:00" })
  })
})
