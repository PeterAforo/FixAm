import { describe, expect, it } from "vitest"
import { computeServiceDueDates, intervalForOilGrade, GENERAL_SERVICE_INTERVAL } from "./service"

describe("intervalForOilGrade", () => {
  it("maps spec grades to intervals", () => {
    expect(intervalForOilGrade("mineral")).toEqual({ months: 3, km: 5000 })
    expect(intervalForOilGrade("semi_synthetic")).toEqual({ months: 6, km: 7500 })
    expect(intervalForOilGrade("fully_synthetic")).toEqual({ months: 6, km: 10000 })
    expect(intervalForOilGrade("diesel_commercial")).toEqual({ months: 3, km: 5000 })
  })
  it("falls back to semi_synthetic", () => {
    expect(intervalForOilGrade(null)).toEqual(intervalForOilGrade("semi_synthetic"))
    expect(intervalForOilGrade("unknown")).toEqual(intervalForOilGrade("semi_synthetic"))
  })
})

describe("computeServiceDueDates", () => {
  const performed = new Date("2026-01-01T12:00:00Z")

  it("mileage beats date (spec case)", () => {
    // last_service Jan 1 @50000, 6mo/5000km, 100 km/day → predicted Feb 20 < Jul 1
    const r = computeServiceDueDates({
      performedAt: performed, odometerKm: 50000,
      interval: { months: 6, km: 5000 }, kmPerDay: 100, now: new Date("2026-01-01T00:00:00Z"),
    })
    expect(r.dueDate).toBe("2026-07-01")
    expect(r.dueMileageKm).toBe(55000)
    expect(r.predictedDueDate).toBe("2026-02-20")
    expect(r.effectiveDueDate).toBe("2026-02-20")
  })

  it("date beats mileage (spec case)", () => {
    // 3mo/10000km, 20 km/day → predicted ~Aug, date Apr 1 wins
    const r = computeServiceDueDates({
      performedAt: performed, odometerKm: 50000,
      interval: { months: 3, km: 10000 }, kmPerDay: 20, now: new Date("2026-01-01T00:00:00Z"),
    })
    expect(r.dueDate).toBe("2026-04-01")
    expect(r.effectiveDueDate).toBe("2026-04-01")
  })

  it("no mileage inputs → date only", () => {
    const r = computeServiceDueDates({
      performedAt: performed, odometerKm: null,
      interval: GENERAL_SERVICE_INTERVAL,
    })
    expect(r.dueMileageKm).toBe(0)
    expect(r.predictedDueDate).toBeNull()
    expect(r.effectiveDueDate).toBe(r.dueDate)
  })

  it("acceptance: mineral oil → 3 months / 5000 km", () => {
    const r = computeServiceDueDates({
      performedAt: new Date("2026-03-01T00:00:00Z"), odometerKm: 110500,
      interval: intervalForOilGrade("mineral"),
    })
    expect(r.dueDate).toBe("2026-06-01")
    expect(r.dueMileageKm).toBe(115500)
  })
})
