import { describe, expect, it } from "vitest"
import { buildSchedule, isGhanaCard, mockDecision, reminderToSend, repaymentStatus } from "./core"

describe("buildSchedule", () => {
  it("splits principal plus flat charge into monthly repayments", () => {
    const s = buildSchedule(100_000, 3, 400, "2026-11-23") // GH₵1,000, 4%/month, 3 months
    expect(s.totalRepayable).toBe(112_000)
    expect(s.lines.map((l) => l.amount)).toEqual([37_334, 37_334, 37_332])
    expect(s.lines.reduce((a, l) => a + l.amount, 0)).toBe(s.totalRepayable)
    expect(s.lines.map((l) => l.dueDate)).toEqual(["2026-12-23", "2027-01-23", "2027-02-23"])
  })
  it("keeps month-end dates valid", () => {
    expect(buildSchedule(50_000, 2, 0, "2027-01-31").lines.map((l) => l.dueDate)).toEqual(["2027-02-28", "2027-03-31"])
  })
  it("rejects bad input", () => {
    expect(() => buildSchedule(0, 3, 400, "2026-01-01")).toThrow()
    expect(() => buildSchedule(1000, 7, 400, "2026-01-01")).toThrow()
  })
})

describe("mockDecision", () => {
  it("follows the documented test rules", () => {
    expect(mockDecision(150_00, "+233241234567")).toMatchObject({ status: "declined" })
    expect(mockDecision(20_000_00, "+233241234567")).toMatchObject({ status: "declined" })
    expect(mockDecision(1_000_00, "+233241234569")).toMatchObject({ status: "declined" })
    expect(mockDecision(9_000_00, "+233241234567")).toEqual({ status: "approved", maxMonths: 3 })
    expect(mockDecision(1_000_00, "+233241234567")).toEqual({ status: "approved", maxMonths: 6 })
  })
})

describe("Ghana Card", () => {
  it("validates the format", () => {
    expect(isGhanaCard("GHA-123456789-0")).toBe(true)
    expect(isGhanaCard("gha-123456789-0")).toBe(true)
    expect(isGhanaCard("GHA-12345-0")).toBe(false)
  })
})

describe("repayments", () => {
  const r = { dueDate: "2026-12-23", amount: 37_334, paidAmount: 0, reminderStage: 0 }
  it("works out status", () => {
    expect(repaymentStatus(r, "2026-12-22")).toBe("upcoming")
    expect(repaymentStatus(r, "2026-12-24")).toBe("overdue")
    expect(repaymentStatus({ ...r, paidAmount: 37_334 }, "2027-01-30")).toBe("paid")
  })
  it("sends each reminder once, at the right time", () => {
    expect(reminderToSend(r, "2026-12-19")).toBeNull()
    expect(reminderToSend(r, "2026-12-20")?.stage).toBe(1)
    expect(reminderToSend({ ...r, reminderStage: 1 }, "2026-12-21")).toBeNull()
    expect(reminderToSend({ ...r, reminderStage: 1 }, "2026-12-23")?.stage).toBe(2)
    expect(reminderToSend({ ...r, reminderStage: 2 }, "2026-12-26")?.templateKey).toBe("financing_overdue")
    expect(reminderToSend({ ...r, reminderStage: 3 }, "2027-01-02")?.stage).toBe(4)
    expect(reminderToSend({ ...r, reminderStage: 4 }, "2027-02-01")).toBeNull()
  })
  it("skips stages that were missed instead of sending them late", () => {
    expect(reminderToSend(r, "2026-12-27")?.stage).toBe(3)
  })
  it("stops once paid", () => {
    expect(reminderToSend({ ...r, paidAmount: 37_334 }, "2026-12-23")).toBeNull()
  })
})
