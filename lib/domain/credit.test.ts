import { describe, expect, it } from "vitest"
import { ageingBuckets, daysOverdueOn, isStatementDay, statementPeriod } from "./credit"

const inv = (balanceDue: number, dueDate: string | null) => ({ balanceDue, dueDate, issueDate: null })

describe("ageingBuckets", () => {
  it("buckets by days overdue", () => {
    const today = "2026-03-01"
    const buckets = ageingBuckets([
      inv(10_000, "2026-03-15"),   // not due → current
      inv(20_000, "2026-02-20"),   // 9d overdue → current
      inv(30_000, "2026-01-15"),   // 45d → d31_60
      inv(40_000, "2025-12-01"),   // 90d → d61_90? Dec1→Mar1 = 90 → d61_90
      inv(50_000, "2025-10-01"),   // 151d → d90_plus
      inv(0, "2026-01-01"),        // paid → excluded
    ], today)
    expect(buckets).toEqual({ current: 30_000, d31_60: 30_000, d61_90: 40_000, d90_plus: 50_000 })
  })

  it("uses issueDate fallback when no dueDate", () => {
    const buckets = ageingBuckets([{ balanceDue: 5_000, dueDate: null, issueDate: "2026-02-15" }], "2026-03-01")
    expect(buckets.current).toBe(5_000)
  })
})

describe("daysOverdueOn", () => {
  it("never returns negative", () => {
    expect(daysOverdueOn("2026-03-10", "2026-03-01")).toBe(0)
    expect(daysOverdueOn("2026-02-28", "2026-03-01")).toBe(1)
  })
})

describe("statementPeriod / isStatementDay", () => {
  it("covers the previous calendar month", () => {
    expect(statementPeriod(1, "2026-03-01")).toEqual({ start: "2026-02-01", end: "2026-02-28" })
  })
  it("detects statement day", () => {
    expect(isStatementDay(15, "2026-03-15")).toBe(true)
    expect(isStatementDay(15, "2026-03-16")).toBe(false)
    expect(isStatementDay(null, "2026-03-15")).toBe(false)
  })
})
