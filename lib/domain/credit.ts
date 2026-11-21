/**
 * Credit-account ageing (specs → credit_statements.ageing).
 * Buckets by days overdue from the invoice due date (fallback: issue date).
 * current covers not-yet-due plus ≤30 days overdue; then 31–60, 61–90, 90+.
 */

export type AgeingBuckets = {
  current: number
  d31_60: number
  d61_90: number
  d90_plus: number
}

const DAY = 86_400_000

function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((new Date(`${toISO}T00:00:00Z`).getTime() - new Date(`${fromISO}T00:00:00Z`).getTime()) / DAY)
}

export function daysOverdueOn(dueOrIssueDate: string, today: string): number {
  const d = daysBetween(dueOrIssueDate, today)
  return d > 0 ? d : 0
}

export function ageingBuckets(
  invoices: { balanceDue: number; dueDate: string | null; issueDate: string | null; createdAt?: string | null }[],
  today: string
): AgeingBuckets {
  const out: AgeingBuckets = { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }
  for (const inv of invoices) {
    const bal = inv.balanceDue
    if (bal <= 0) continue
    const ref = inv.dueDate ?? inv.issueDate ?? inv.createdAt?.slice(0, 10)
    if (!ref) { out.current += bal; continue }
    const overdue = daysOverdueOn(ref, today)
    if (overdue <= 30) out.current += bal
    else if (overdue <= 60) out.d31_60 += bal
    else if (overdue <= 90) out.d61_90 += bal
    else out.d90_plus += bal
  }
  return out
}

/** Calendar month period for a statement generated on `today` for `statementDay`. */
export function statementPeriod(statementDay: number, today: string): { start: string; end: string } {
  const d = new Date(`${today}T00:00:00Z`)
  // previous calendar month
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))
  void statementDay
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/** Is today the account's statement day? */
export function isStatementDay(statementDay: number | null | undefined, today: string): boolean {
  if (!statementDay) return false
  return new Date(`${today}T00:00:00Z`).getUTCDate() === statementDay
}
