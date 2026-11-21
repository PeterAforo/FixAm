import { describe, expect, it } from "vitest"
import { computeTaxTotals, taxLine, type TaxRule } from "./tax"

const vat: TaxRule = { code: "VAT", name: "VAT", rate_bp: 1500, applies_to: ["labour", "part", "sundry", "service_fee"], compound: false, enabled: true }
const levy: TaxRule = { code: "NHIL", name: "NHIL", rate_bp: 250, applies_to: ["part"], compound: true, enabled: true }

const line = (over: Partial<Parameters<typeof taxLine>[0]> = {}) => ({
  type: "labour",
  quantity: 1,
  unitPrice: 100_000, // GH₵1,000.00
  ...over,
})

describe("taxLine exclusive", () => {
  it("applies a single non-compound tax", () => {
    const r = taxLine(line(), [vat], false)
    expect(r.base).toBe(100_000)
    expect(r.taxTotal).toBe(15_000)
    expect(r.lineTotal).toBe(115_000)
  })

  it("subtracts discount before tax", () => {
    const r = taxLine(line({ discountAmount: 10_000 }), [vat], false)
    expect(r.base).toBe(90_000)
    expect(r.taxTotal).toBe(13_500)
    expect(r.lineTotal).toBe(103_500)
  })

  it("multiplies quantity × unit price", () => {
    const r = taxLine(line({ quantity: 2.5, unitPrice: 40_000 }), [vat], false)
    expect(r.base).toBe(100_000)
    expect(r.taxTotal).toBe(15_000)
  })

  it("only applies rules matching the line type", () => {
    const r = taxLine(line({ type: "sundry" }), [levy], false)
    expect(r.taxTotal).toBe(0)
  })

  it("respects taxCodes restriction", () => {
    const r = taxLine(line({ taxCodes: ["OTHER"] }), [vat], false)
    expect(r.taxTotal).toBe(0)
  })

  it("skips disabled rules", () => {
    const r = taxLine(line(), [{ ...vat, enabled: false }], false)
    expect(r.taxTotal).toBe(0)
  })

  it("compound tax applies on base + previous taxes", () => {
    // part: 100,000 + VAT 15,000 = 115,000; NHIL 2.5% of 115,000 = 2,875
    const r = taxLine(line({ type: "part" }), [vat, levy], false)
    expect(r.taxes).toEqual([
      { code: "VAT", rate_bp: 1500, amount: 15_000 },
      { code: "NHIL", rate_bp: 250, amount: 2_875 },
    ])
    expect(r.taxTotal).toBe(17_875)
    expect(r.lineTotal).toBe(117_875)
  })

  it("rounds each tax half-up to the nearest pesewa", () => {
    // 3333 * 1500 / 10000 = 499.95 → 500
    const r = taxLine(line({ unitPrice: 3_333 }), [vat], false)
    expect(r.taxes[0]!.amount).toBe(500)
    // 3335 * 1500 / 10000 = 500.25 → 500
    const r2 = taxLine(line({ unitPrice: 3_335 }), [vat], false)
    expect(r2.taxes[0]!.amount).toBe(500)
  })
})

describe("taxLine inclusive (prices_include_tax)", () => {
  it("backs VAT out of a tax-inclusive price", () => {
    // GH₵115.00 incl. 15% VAT → tax 15.00, net 100.00
    const r = taxLine(line({ unitPrice: 115_000 }), [vat], true)
    expect(r.taxTotal).toBe(15_000)
    expect(r.base).toBe(100_000)
    expect(r.lineTotal).toBe(115_000)
  })

  it("backs out compound taxes", () => {
    // gross 1178.75; VAT 15% + NHIL 2.5% compound → tax ≈178.75, net 1000.00
    const r = taxLine(line({ type: "part", unitPrice: 117_875 }), [vat, levy], true)
    expect(r.base).toBe(100_000)
    expect(r.lineTotal).toBe(117_875)
  })
})

describe("computeTaxTotals", () => {
  it("sums lines and reports discount total", () => {
    const t = computeTaxTotals(
      [
        line({ unitPrice: 100_000 }),
        line({ type: "part", unitPrice: 50_000, discountAmount: 5_000 }),
      ],
      [vat, levy],
      false
    )
    // labour: 100k + 15k VAT = 115k
    // part: base 45k; VAT 6,750 + NHIL 2.5% of 51,750 = 1,293.75→1,294 → total 8,044 → 53,044
    expect(t.subtotal).toBe(145_000)
    expect(t.discountTotal).toBe(5_000)
    expect(t.taxTotal).toBe(15_000 + 8_044)
    expect(t.total).toBe(115_000 + 53_044)
  })
})
