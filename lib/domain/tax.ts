/**
 * Tax engine (specs/data-model.json → tax_calculation).
 *
 * Rates are basis points (1500 = 15%). Rules apply per job-item type via
 * `applies_to`. Non-compound taxes are computed on the discounted base;
 * compound taxes on base + previously computed taxes. Each tax amount is
 * rounded half-up to the nearest pesewa per line. When
 * `pricesIncludeTax` is set, tax is backed out of the gross price.
 */

export type TaxRule = {
  code: string
  name?: string
  rate_bp: number
  applies_to: string[]
  compound: boolean
  enabled: boolean
}

export type TaxLineInput = {
  /** job_item_type: labour | part | sundry | service_fee */
  type: string
  quantity: number
  /** unit price in pesewas */
  unitPrice: number
  /** discount in pesewas */
  discountAmount?: number
  /** restrict to these rule codes; empty/undefined = all matching rules */
  taxCodes?: string[]
}

export type LineTax = { code: string; rate_bp: number; amount: number }

export type TaxedLine = {
  base: number
  gross: number
  taxes: LineTax[]
  taxTotal: number
  /** base + taxTotal (exclusive) or gross (inclusive, taxes informational) */
  lineTotal: number
}

export type TaxTotals = {
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  lines: TaxedLine[]
}

export function roundHalfUpPesewa(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5)
}

function rulesFor(line: TaxLineInput, rules: TaxRule[]): TaxRule[] {
  return rules.filter(
    (r) =>
      r.enabled &&
      r.applies_to.includes(line.type) &&
      (!line.taxCodes || line.taxCodes.length === 0 || line.taxCodes.includes(r.code))
  )
}

function computeTaxes(
  baseForRules: number,
  ordered: TaxRule[],
  accumulated: number,
  round: boolean
): { taxes: LineTax[]; total: number } {
  const taxes: LineTax[] = []
  let prev = accumulated
  for (const r of ordered) {
    const taxBase = r.compound ? baseForRules + prev : baseForRules
    const raw = (taxBase * r.rate_bp) / 10000
    const amount = round ? roundHalfUpPesewa(raw) : raw
    taxes.push({ code: r.code, rate_bp: r.rate_bp, amount })
    prev += amount
  }
  return { taxes, total: taxes.reduce((s, t) => s + t.amount, 0) }
}

export function taxLine(
  line: TaxLineInput,
  rules: TaxRule[],
  pricesIncludeTax: boolean
): TaxedLine {
  const gross = Math.round(line.quantity * line.unitPrice) - (line.discountAmount ?? 0)
  const ordered = rulesFor(line, rules)

  if (!pricesIncludeTax) {
    const { taxes, total } = computeTaxes(gross, ordered, 0, true)
    return { base: gross, gross, taxes, taxTotal: total, lineTotal: gross + total }
  }

  // Inclusive: solve net + taxes(net) = gross using unrounded amounts,
  // then round each tax once on the final net.
  let net = gross
  for (let i = 0; i < 60; i++) {
    const { total } = computeTaxes(net, ordered, 0, false)
    const next = gross - total
    if (Math.abs(next - net) < 1e-7) { net = next; break }
    net = next
  }
  net = roundHalfUpPesewa(net)
  const { taxes, total } = computeTaxes(net, ordered, 0, true)
  return { base: net, gross, taxes, taxTotal: total, lineTotal: gross }
}

export function computeTaxTotals(
  lines: TaxLineInput[],
  rules: TaxRule[],
  pricesIncludeTax: boolean
): TaxTotals {
  const taxed = lines.map((l) => taxLine(l, rules, pricesIncludeTax))
  const subtotal = taxed.reduce((s, l) => s + l.base, 0)
  const discountTotal = lines.reduce((s, l) => s + (l.discountAmount ?? 0), 0)
  const taxTotal = taxed.reduce((s, l) => s + l.taxTotal, 0)
  const total = taxed.reduce((s, l) => s + l.lineTotal, 0)
  return { subtotal, discountTotal, taxTotal, total, lines: taxed }
}
