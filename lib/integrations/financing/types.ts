/**
 * FinancingProvider (P8-14): a partner lender that decides on
 * "fix now, pay later" applications, pays the garage up-front and collects
 * the repayments. FixAm tracks the schedule and sends reminders.
 */

export type FinancingOffer = {
  months: number
  monthlyRateBp: number
  /** Short label shown to the customer, e.g. "4% a month, flat". */
  rateLabel: string
}

export type ApplyInput = {
  reference: string
  amount: number // pesewas
  months: number
  applicant: { fullName: string; phone: string; ghanaCard: string }
  garage: { id: string; name: string; payoutMethod: string | null; payoutAccountMasked: string | null }
  purpose: string
}

export type ApplyResult =
  | { status: "approved"; providerRef: string; offer: FinancingOffer; maxMonths: number }
  | { status: "declined"; providerRef: string | null; reason: string }
  | { status: "pending"; providerRef: string }

export type DisburseResult = { status: "disbursed" | "pending"; disbursementRef: string } | { status: "failed"; reason: string }

export type ProviderRepayment = { sequence: number; paidAmount: number; paidAt: string | null }

export interface FinancingProvider {
  readonly name: string
  /** Price for a number of months (before applying). */
  terms(amount: number, months: number): FinancingOffer
  apply(input: ApplyInput): Promise<ApplyResult>
  /** For pending decisions. */
  status(providerRef: string): Promise<ApplyResult>
  /** Lender pays the garage for this application (amount may be lower than applied for). */
  disburse(providerRef: string, amount: number): Promise<DisburseResult>
  /** Where the customer pays a repayment. */
  repaymentUrl(providerRef: string, sequence: number): string
  /** Repayments the lender has received, or null when FixAm's own records are the source (mock). */
  repayments(providerRef: string): Promise<ProviderRepayment[] | null>
}
