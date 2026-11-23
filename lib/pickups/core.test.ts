import { describe, expect, it } from "vitest"
import { canMoveRun, compareReports, reportProblems } from "./core"

describe("runs", () => {
  it("move forward only, and finish only from arrived", () => {
    expect(canMoveRun("scheduled", "en_route")).toBe(true)
    expect(canMoveRun("assigned", "en_route")).toBe(true)
    expect(canMoveRun("en_route", "arrived")).toBe(true)
    expect(canMoveRun("arrived", "done")).toBe(true)
    expect(canMoveRun("en_route", "done")).toBe(false)
    expect(canMoveRun("done", "en_route")).toBe(false)
  })
})

describe("reportProblems", () => {
  const full = { photos: { front: "a", rear: "b", left: "c", right: "d", interior: "e", dashboard: "f" }, fuelLevel: 50, odometerKm: 84_000, signatureProvided: true, signedByName: "Ama Owusu" }
  it("passes a complete report", () => expect(reportProblems(full)).toEqual([]))
  it("lists every missing piece", () => {
    const p = reportProblems({ photos: { front: "a" }, fuelLevel: null, odometerKm: null, signatureProvided: false, signedByName: "" })
    expect(p[0]).toMatch(/back, left side, right side, inside, dashboard/)
    expect(p).toHaveLength(5)
  })
})

describe("compareReports", () => {
  it("shows km driven, fuel change and warning-light changes", () => {
    expect(compareReports(
      { odometerKm: 84_000, fuelLevel: 50, warningLights: ["check_engine", "abs"] },
      { odometerKm: 84_012, fuelLevel: 40, warningLights: ["abs", "battery"] },
    )).toEqual({ kmDriven: 12, fuelChange: -10, newLights: ["battery"], clearedLights: ["check_engine"] })
  })
})
