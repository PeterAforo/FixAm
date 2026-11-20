import { describe, expect, it } from "vitest"
import { formatGHS, parseGHS, roundToCedi, sumPesewas, toCedis, toPesewas } from "./index"

describe("money helpers", () => {
  it("converts cedis to pesewas", () => {
    expect(toPesewas(1250.5)).toBe(125050n)
    expect(toPesewas("42")).toBe(4200n)
    expect(toPesewas(-1.25)).toBe(-125n)
  })

  it("converts pesewas to cedis", () => {
    expect(toCedis(125050n)).toBe(1250.5)
    expect(toCedis(0n)).toBe(0)
  })

  it("formats as GH₵ with thousands separators and 2 decimals", () => {
    expect(formatGHS(125000n)).toBe("GH₵ 1,250.00")
    expect(formatGHS(-25000n)).toBe("-GH₵ 250.00")
    expect(formatGHS(5n)).toBe("GH₵ 0.05")
  })

  it("round-trips through parseGHS", () => {
    expect(parseGHS("GH₵ 1,250.50")).toBe(125050n)
    expect(parseGHS("1,250.50")).toBe(125050n)
    expect(parseGHS("₵99.99")).toBe(9999n)
  })

  it("rejects invalid input", () => {
    expect(() => parseGHS("abc")).toThrow()
    expect(() => toPesewas("1.234")).toThrow()
  })

  it("rounds to whole cedi", () => {
    expect(roundToCedi(125050n)).toBe(125100n)
    expect(roundToCedi(125049n)).toBe(125000n)
    expect(roundToCedi(-125060n)).toBe(-125100n)
  })

  it("sums without overflow", () => {
    expect(sumPesewas([9007199254740993n, 1n])).toBe(9007199254740994n)
  })
})
