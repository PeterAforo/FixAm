import { describe, expect, it } from "vitest"
import { buildSchedule, computeLateFee, daysOverdue } from "./instalments"

describe("buildSchedule", () => {
  it("splits evenly with remainder on the last instalment", () => {
    const s = buildSchedule({
      totalAmount: 100_000, // GH₵1,000
      instalmentCount: 3,
      frequency: "monthly",
      startDate: "2026-02-01",
    })
    expect(s).toHaveLength(3)
    expect(s.map((x) => x.amount)).toEqual([33_333, 33_333, 33_334])
    expect(s.map((x) => x.dueDate)).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"])
  })

  it("applies the down payment before splitting", () => {
    const s = buildSchedule({
      totalAmount: 100_000,
      downPayment: 40_000,
      instalmentCount: 2,
      frequency: "weekly",
      startDate: "2026-01-05",
    })
    expect(s.map((x) => x.amount)).toEqual([30_000, 30_000])
    expect(s[1]!.dueDate).toBe("2026-01-12")
  })

  it("clamps month-end dates (Jan 31 → Feb 28)", () => {
    const s = buildSchedule({
      totalAmount: 30_000,
      instalmentCount: 3,
      frequency: "monthly",
      startDate: "2026-01-31",
    })
    expect(s.map((x) => x.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-28"])
  })

  it("returns [] for degenerate input", () => {
    expect(buildSchedule({ totalAmount: 10_000, downPayment: 10_000, instalmentCount: 3, frequency: "monthly", startDate: "2026-01-01" })).toEqual([])
    expect(buildSchedule({ totalAmount: 10_000, instalmentCount: 0, frequency: "monthly", startDate: "2026-01-01" })).toEqual([])
  })
})

describe("computeLateFee", () => {
  const rule = { kind: "percent" as const, rate_bp: 500, after_days: 7 } // 5% after 7 days

  it("is zero inside the grace period", () => {
    expect(computeLateFee({ amount: 10_000, dueDate: "2026-01-01", today: "2026-01-07", rule })).toBe(0)
  })

  it("charges percent of the instalment after grace", () => {
    expect(computeLateFee({ amount: 10_000, dueDate: "2026-01-01", today: "2026-01-10", rule })).toBe(500)
  })

  it("supports fixed fees", () => {
    const fixed = { kind: "fixed" as const, amount: 250, after_days: 0 }
    expect(computeLateFee({ amount: 10_000, dueDate: "2026-01-01", today: "2026-01-02", rule: fixed })).toBe(250)
  })

  it("is zero with no rule", () => {
    expect(computeLateFee({ amount: 10_000, dueDate: "2026-01-01", today: "2026-03-01", rule: null })).toBe(0)
  })
})

describe("daysOverdue", () => {
  it("counts whole days past due", () => {
    expect(daysOverdue("2026-01-01", "2026-01-10")).toBe(9)
    expect(daysOverdue("2026-01-10", "2026-01-01")).toBe(0)
  })
})
