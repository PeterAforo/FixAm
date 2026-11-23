import { describe, expect, it } from "vitest"
import { canMove, distanceKm, etaMinutes, operatorPoint, pickRecipients, suggestQuote, type OperatorPosition } from "./core"

const accraMall = { lat: 5.6227, lng: -0.1743 }
const kotoka = { lat: 5.6052, lng: -0.1718 }
const kumasi = { lat: 6.6885, lng: -1.6244 }
const now = new Date("2026-11-23T12:00:00Z")

const op = (o: Partial<OperatorPosition> & { id: string }): OperatorPosition => ({
  isAvailable: true, status: "active", serviceRadiusKm: 25, lastLat: null, lastLng: null, lastLocationAt: null, baseLat: null, baseLng: null, ...o,
})

describe("distance and ETA", () => {
  it("measures real distances", () => {
    expect(distanceKm(accraMall, kotoka)).toBeGreaterThan(1.8)
    expect(distanceKm(accraMall, kotoka)).toBeLessThan(2.2)
    expect(Math.round(distanceKm(accraMall, kumasi))).toBeGreaterThan(195)
  })
  it("gives a sensible city ETA", () => {
    expect(etaMinutes(0)).toBe(5)
    expect(etaMinutes(10)).toBe(39)
  })
})

describe("pickRecipients", () => {
  it("uses fresh live locations, falls back to base, respects both radii, nearest first", () => {
    const list = pickRecipients([
      op({ id: "live-near", lastLat: kotoka.lat, lastLng: kotoka.lng, lastLocationAt: new Date("2026-11-23T11:50:00Z") }),
      op({ id: "stale-live-far-base", lastLat: kotoka.lat, lastLng: kotoka.lng, lastLocationAt: new Date("2026-11-23T10:00:00Z"), baseLat: kumasi.lat, baseLng: kumasi.lng }),
      op({ id: "base-near", baseLat: accraMall.lat + 0.01, baseLng: accraMall.lng }),
      op({ id: "offline", isAvailable: false, baseLat: accraMall.lat, baseLng: accraMall.lng }),
      op({ id: "small-radius", serviceRadiusKm: 1, baseLat: kotoka.lat, baseLng: kotoka.lng }),
      op({ id: "no-location" }),
    ], accraMall, 25, now)
    expect(list.map((x) => x.id)).toEqual(["base-near", "live-near"])
  })
  it("respects the driver's radius", () => {
    expect(pickRecipients([op({ id: "a", baseLat: kotoka.lat, baseLng: kotoka.lng })], accraMall, 1, now)).toEqual([])
  })
  it("knows which location it used", () => {
    expect(operatorPoint(op({ id: "x", baseLat: 1, baseLng: 2 }), now)).toEqual({ lat: 1, lng: 2, live: false })
  })
})

describe("quotes and statuses", () => {
  it("suggests base + per-km, rounded to whole cedis", () => {
    expect(suggestQuote({ baseFee: 150_00, perKmFee: 10_00 }, 5, 10)).toBe(360_00)
    expect(suggestQuote({ baseFee: 100_00, perKmFee: 0 }, 3, null)).toBe(100_00)
  })
  it("only allows forward steps", () => {
    expect(canMove("assigned", "en_route")).toBe(true)
    expect(canMove("arrived", "completed")).toBe(true)
    expect(canMove("assigned", "completed")).toBe(false)
    expect(canMove("completed", "towing")).toBe(false)
  })
})
