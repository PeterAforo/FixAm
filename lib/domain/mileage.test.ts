import { describe, expect, it } from "vitest"
import {
  computeKmPerDay,
  daysBetween,
  effectiveDueDate,
  predictDueDate,
  predictOdometer,
  validateReading,
  type OdometerReading,
} from "./mileage"

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const r = (s: string, km: number, status?: OdometerReading["status"]): OdometerReading => ({
  at: d(s),
  km,
  status,
})

describe("validateReading", () => {
  it("accepts the first reading", () => {
    expect(validateReading({ km: 50000, at: d("2026-01-01") }, [])).toBe("valid")
  })

  it("flags a lower reading", () => {
    const history = [r("2026-01-01", 50000)]
    expect(validateReading({ km: 49000, at: d("2026-02-01") }, history)).toBe("flagged")
  })

  it("allows lower reading when odometer replaced", () => {
    const history = [r("2026-01-01", 50000)]
    expect(
      validateReading({ km: 1000, at: d("2026-02-01"), odometerReplaced: true }, history)
    ).toBe("valid")
  })

  it("flags implausible jumps (>1000 km/day)", () => {
    const history = [r("2026-01-01", 50000)]
    expect(validateReading({ km: 60000, at: d("2026-01-08") }, history)).toBe("flagged")
  })

  it("accepts plausible jumps", () => {
    const history = [r("2026-01-01", 50000)]
    expect(validateReading({ km: 50800, at: d("2026-01-08") }, history)).toBe("valid")
  })

  it("ignores flagged/rejected history when validating", () => {
    const history = [r("2026-01-01", 50000), r("2026-01-15", 49000, "flagged")]
    expect(validateReading({ km: 50200, at: d("2026-02-01") }, history)).toBe("valid")
  })
})

describe("computeKmPerDay", () => {
  it("spec case: two readings 30 days apart → 50 km/day, medium", () => {
    const readings = [r("2026-01-01", 50000), r("2026-01-31", 51500)]
    const res = computeKmPerDay(readings, d("2026-02-01"), 40)
    expect(res.kmPerDay).toBe(50)
    expect(res.confidence).toBe("medium")
  })

  it("spec case: single reading uses fallback, low confidence", () => {
    const res = computeKmPerDay([r("2026-01-01", 50000)], d("2026-02-01"), 40)
    expect(res.kmPerDay).toBe(40)
    expect(res.confidence).toBe("low")
  })

  it("weights recent intervals more heavily", () => {
    // old interval: 100 km/day, recent interval: 10 km/day
    const readings = [
      r("2025-01-01", 10000),
      r("2025-01-11", 20000), // +1000/day over 10d? no—1000/day implausible for rate but compute doesn't validate
      r("2026-01-01", 30000),
      r("2026-01-11", 30100), // +10/day
    ]
    const res = computeKmPerDay(readings, d("2026-01-12"), 40)
    expect(res.kmPerDay).toBeLessThan(100)
    expect(res.confidence).toBe("medium")
  })
})

describe("predictOdometer", () => {
  it("projects forward at km/day", () => {
    const last = r("2026-01-01", 50000)
    expect(predictOdometer(last, 50, d("2026-01-11"))).toBe(50500)
  })
})

describe("predictDueDate + effectiveDueDate", () => {
  const last = r("2026-01-01", 50000)

  it("spec case: mileage beats date → 2026-02-20", () => {
    // last service 2026-01-01 @50000, interval 6mo/5000km, km/day 100
    // remaining 5000km → 50 days → 2026-02-20
    const predicted = predictDueDate(last, 55000, 100, d("2026-03-01"))
    expect(predicted!.toISOString().slice(0, 10)).toBe("2026-02-20")
    const effective = effectiveDueDate(d("2026-07-01"), predicted)
    expect(effective!.toISOString().slice(0, 10)).toBe("2026-02-20")
  })

  it("spec case: date beats mileage → 2026-04-01", () => {
    // interval 3mo/10000km, km/day 20 → 10000km needs 500 days → date wins
    const predicted = predictDueDate(last, 60000, 20, d("2026-01-02"))
    const effective = effectiveDueDate(d("2026-04-01"), predicted)
    expect(effective!.toISOString().slice(0, 10)).toBe("2026-04-01")
  })

  it("returns today when already past", () => {
    const predicted = predictDueDate(last, 40000, 100, d("2026-03-01"))
    expect(predicted!.toISOString().slice(0, 10)).toBe("2026-03-01")
  })

  it("ignores nulls", () => {
    expect(effectiveDueDate(null, d("2026-05-01"))!.toISOString().slice(0, 10)).toBe("2026-05-01")
    expect(effectiveDueDate(d("2026-05-01"), null)!.toISOString().slice(0, 10)).toBe("2026-05-01")
    expect(effectiveDueDate(null, null)).toBeNull()
  })
})

describe("daysBetween", () => {
  it("computes whole UTC days", () => {
    expect(daysBetween(d("2026-01-01"), d("2026-01-31"))).toBe(30)
  })
})
