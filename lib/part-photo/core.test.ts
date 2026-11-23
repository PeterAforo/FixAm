import { describe, expect, it } from "vitest"
import { isSure, mergeChoices, numberCandidates, sniffImageType, topOneAccuracy } from "./core"

const parts = [
  { id: "a", name: "Brake pads", category: "Brakes" },
  { id: "b", name: "Brake disc", category: "Brakes" },
  { id: "c", name: "Spark plug", category: "Engine" },
  { id: "d", name: "Air filter", category: "Engine" },
]

describe("sniffImageType", () => {
  it("recognises jpeg, png and webp by their bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png")
    expect(sniffImageType(new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp")
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull()
  })
})

describe("numberCandidates", () => {
  it("puts text matches first and numbers from 1", () => {
    const n = numberCandidates(parts, ["c"])
    expect(n[0]).toEqual({ n: 1, id: "c", name: "Spark plug", category: "Engine" })
    expect(n.map((x) => x.id)).toEqual(["c", "a", "b", "d"])
  })
})

describe("mergeChoices", () => {
  const n = numberCandidates(parts)
  it("maps numbers to parts, drops unknown numbers and sorts", () => {
    const r = mergeChoices(n, [{ n: 2, confidence: 0.3 }, { n: 1, confidence: 0.82 }, { n: 99, confidence: 0.9 }])
    expect(r.map((c) => c.id)).toEqual(["a", "b"])
    expect(r[0].confidence).toBe(0.82)
  })
  it("boosts a photo choice that agrees with the typed text", () => {
    const r = mergeChoices(n, [{ n: 1, confidence: 0.6 }, { n: 2, confidence: 0.5 }], [{ id: "b", score: 1 }])
    expect(r[0]).toMatchObject({ id: "b", confidence: 0.65 })
  })
  it("adds a strong text match the photo missed, capped below sure", () => {
    const r = mergeChoices(n, [], [{ id: "d", score: 0.9 }])
    expect(r).toEqual([{ id: "d", name: "Air filter", category: "Engine", confidence: 0.6 }])
  })
})

describe("isSure", () => {
  it("needs high confidence and a clear lead", () => {
    expect(isSure([{ id: "a", name: "", category: "", confidence: 0.9 }, { id: "b", name: "", category: "", confidence: 0.3 }])).toBe(true)
    expect(isSure([{ id: "a", name: "", category: "", confidence: 0.9 }, { id: "b", name: "", category: "", confidence: 0.8 }])).toBe(false)
    expect(isSure([{ id: "a", name: "", category: "", confidence: 0.6 }])).toBe(false)
    expect(isSure([])).toBe(false)
  })
})

describe("topOneAccuracy", () => {
  it("counts exact top-1 hits", () => {
    expect(topOneAccuracy([{ expected: "a", got: "a" }, { expected: "b", got: "c" }, { expected: "c", got: null }, { expected: "d", got: "d" }])).toBe(0.5)
  })
})
