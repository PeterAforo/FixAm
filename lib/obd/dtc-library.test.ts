import { describe, expect, it } from "vitest"
import { LIBRARY_SIZE, describeDtc, isDtcCode, worstSeverity } from "./dtc-library"
import { PART_TYPE_SEED } from "../parts-catalog/seed"

describe("dtc library", () => {
  it("has the common codes with meaning, severity and parts", () => {
    expect(LIBRARY_SIZE).toBeGreaterThan(100)
    expect(describeDtc("p0420")).toMatchObject({ code: "P0420", severity: "monitor", parts: ["catalytic-converter", "oxygen-sensor"], known: true })
    expect(describeDtc("P0217").severity).toBe("stop")
    expect(describeDtc("P0301").tip).toMatch(/flashing/)
  })
  it("only points to parts that exist in the standard parts list", () => {
    const slugs = new Set(PART_TYPE_SEED.map((p) => p.slug))
    for (const c of ["P0011", "P0171", "P0300", "P0420", "P0562", "P0730", "U0121"]) {
      for (const s of describeDtc(c).parts) expect(slugs.has(s), `${c} → ${s}`).toBe(true)
    }
  })
  it("describes unknown codes from their structure", () => {
    expect(describeDtc("P0399")).toMatchObject({ known: false, system: "Ignition" })
    expect(describeDtc("P1604").title).toMatch(/maker-specific/)
    expect(describeDtc("C1234").title).toMatch(/Chassis/)
    expect(describeDtc("B0001").severity).toBe("monitor")
    expect(describeDtc("U1000").system).toBe("Network")
  })
  it("validates codes and finds the worst severity", () => {
    expect(isDtcCode("P0A0F")).toBe(true)
    expect(isDtcCode("X0100")).toBe(false)
    expect(worstSeverity([{ severity: "monitor" }, { severity: "stop" }, { severity: "soon" }])).toBe("stop")
    expect(worstSeverity([])).toBeNull()
  })
})

import { rulesDtcExplanation } from "./explain-core"
describe("rulesDtcExplanation", () => {
  it("summarises from the library with part names", () => {
    const e = rulesDtcExplanation(["P0420", "P0217"])
    expect(e.overallSeverity).toBe("stop")
    expect(e.codes[0].likelyParts).toContain("Catalytic converter")
    expect(e.codes[1].checkFirst).toMatch(/Stop the engine/)
    expect(rulesDtcExplanation([]).summary).toMatch(/No fault codes/)
  })
})
