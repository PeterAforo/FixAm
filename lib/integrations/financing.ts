import "server-only"
import { mockDecision } from "@/lib/financing/core"
import type { FinancingProvider } from "./financing/types"

export type * from "./financing/types"

/**
 * FINANCING_PROVIDER=mock (default; the only one until a partner lender is
 * signed). The mock decides instantly with predictable rules (see
 * lib/financing/core mockDecision), "pays" the garage at once, and lets the
 * customer mark repayments paid on a test page. FINANCING_MOCK_MONTHLY_RATE_BP
 * sets its example price (default 400 = 4% a month, flat).
 */
function mockProvider(): FinancingProvider {
  const rateBp = Number(process.env.FINANCING_MOCK_MONTHLY_RATE_BP ?? 400)
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const terms = (_amount: number, months: number) => ({ months, monthlyRateBp: rateBp, rateLabel: `${(rateBp / 100).toFixed(rateBp % 100 ? 1 : 0)}% a month, flat (test lender)` })
  return {
    name: "mock",
    terms,
    async apply(input) {
      const d = mockDecision(input.amount, input.applicant.phone)
      const providerRef = `MOCKLOAN-${input.reference}`
      if (d.status === "declined") return { status: "declined", providerRef, reason: d.reason }
      return { status: "approved", providerRef, offer: terms(input.amount, Math.min(input.months, d.maxMonths)), maxMonths: d.maxMonths }
    },
    async status() {
      return { status: "pending", providerRef: "" }
    },
    async disburse(providerRef) {
      return { status: "disbursed", disbursementRef: `${providerRef}-D` }
    },
    repaymentUrl(providerRef, sequence) {
      return `${base}/financing/mock-pay/${encodeURIComponent(providerRef)}/${sequence}`
    },
    async repayments() {
      return null
    },
  }
}

let cached: FinancingProvider | undefined
export function financingProvider(): FinancingProvider {
  if (cached) return cached
  const selected = process.env.FINANCING_PROVIDER ?? "mock"
  if (selected !== "mock") console.warn(`[financing] FINANCING_PROVIDER=${selected} isn't available yet — using the mock lender`)
  cached = mockProvider()
  return cached
}
