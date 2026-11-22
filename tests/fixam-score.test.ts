import { describe, expect, it } from "vitest"
import { computeFixAmScore } from "@/lib/domain/fixam-score"

const ok = { status: "ok" as const }
const soon = { status: "soon" as const }
const overdue = { status: "overdue" as const }
const unknown = { status: "unknown" as const }

describe("computeFixAmScore", () => {
  it("returns 100 when everything is ok", () => {
    const r = computeFixAmScore({ oil: ok, insurance: ok, dvla: ok, issues: ok, otherDueSoon: 0, otherDueOverdue: 0 })
    expect(r.score).toBe(100)
    expect(r.tips).toEqual([])
  })

  it("penalises overdue rings more than soon", () => {
    const allSoon = computeFixAmScore({ oil: soon, insurance: soon, dvla: soon, issues: soon, otherDueSoon: 0, otherDueOverdue: 0 })
    const allOverdue = computeFixAmScore({ oil: overdue, insurance: overdue, dvla: overdue, issues: overdue, otherDueSoon: 0, otherDueOverdue: 0 })
    expect(allSoon.score).toBeLessThan(100)
    expect(allOverdue.score).toBeLessThan(allSoon.score)
  })

  it("ignores unknown rings", () => {
    const r = computeFixAmScore({ oil: unknown, insurance: unknown, dvla: unknown, issues: unknown, otherDueSoon: 0, otherDueOverdue: 0 })
    expect(r.score).toBe(100)
  })

  it("clamps at 0 and caps other-due penalties", () => {
    const r = computeFixAmScore({ oil: overdue, insurance: overdue, dvla: overdue, issues: overdue, otherDueSoon: 99, otherDueOverdue: 99 })
    expect(r.score).toBe(0)
  })

  it("produces tips for problem areas", () => {
    const r = computeFixAmScore({ oil: overdue, insurance: ok, dvla: ok, issues: ok, otherDueSoon: 0, otherDueOverdue: 0 })
    expect(r.tips.length).toBeGreaterThan(0)
  })
})
