import { describe, expect, it } from "vitest"
import {
  CHECKLIST,
  INSPECTION_ITEM_COUNT,
  INSPECTION_SECTIONS,
  canTransition,
  flaggedItems,
  isInspectionToken,
  itemKey,
  newInspectionToken,
  summariseResults,
} from "./core"

describe("inspection checklist", () => {
  it("has ~120 points across the required sections", () => {
    expect(INSPECTION_ITEM_COUNT).toBeGreaterThanOrEqual(110)
    expect(INSPECTION_ITEM_COUNT).toBeLessThanOrEqual(140)
    const keys = ["body_paint", "flood_accident", "engine", "transmission", "suspension", "brakes", "electrics", "interior", "tyres", "test_drive"]
    for (const k of keys) expect(INSPECTION_SECTIONS.map((s) => s.key)).toContain(k)
  })

  it("has unique stable keys", () => {
    const keys = CHECKLIST.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(CHECKLIST.every((c) => c.key === itemKey(c.section, Number(c.key.split(".")[1])))).toBe(true)
  })
})

describe("status transitions", () => {
  it("follows the booking lifecycle", () => {
    expect(canTransition("awaiting_payment", "booked")).toBe(true)
    expect(canTransition("booked", "in_progress")).toBe(true)
    expect(canTransition("in_progress", "completed")).toBe(true)
    expect(canTransition("awaiting_payment", "completed")).toBe(false)
    expect(canTransition("completed", "booked")).toBe(false)
    expect(canTransition("booked", "no_show")).toBe(true)
    expect(canTransition("no_show", "booked")).toBe(true)
  })
})

describe("results", () => {
  it("summarises and flags", () => {
    const items = [
      { result: "pass" }, { result: "pass" }, { result: "attention" }, { result: "fail" }, { result: "na" },
    ]
    const s = summariseResults(items)
    expect(s).toMatchObject({ pass: 2, attention: 1, fail: 1, na: 1, answered: 4, total: 5 })
    expect(s.scorePct).toBe(63) // (2 + 0.5) / 4
    expect(flaggedItems(items)).toHaveLength(2)
  })
})

describe("share token", () => {
  it("generates 48-hex tokens", () => {
    const t = newInspectionToken()
    expect(isInspectionToken(t)).toBe(true)
    expect(newInspectionToken()).not.toBe(t)
    expect(isInspectionToken("short")).toBe(false)
  })
})
