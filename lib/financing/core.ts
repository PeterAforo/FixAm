/**
 * Fix now, pay later (P8-14) — pure helpers, no database.
 */

export const MIN_MONTHS = 1
export const MAX_MONTHS = 6

export type ScheduleLine = { sequence: number; dueDate: string; amount: number }

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + n)
  if (d.getUTCDate() < day) d.setUTCDate(0) // 31 Jan + 1 month → 28/29 Feb
  return d.toISOString().slice(0, 10)
}

/**
 * Flat monthly charge on the amount borrowed, split into equal monthly
 * repayments (rounded up to the pesewa; the last one absorbs the rounding).
 * First repayment one month after the start date.
 */
export function buildSchedule(principal: number, months: number, monthlyRateBp: number, startISO: string): { totalRepayable: number; monthly: number; lines: ScheduleLine[] } {
  if (!Number.isInteger(principal) || principal <= 0) throw new Error("principal must be positive pesewas")
  if (months < MIN_MONTHS || months > MAX_MONTHS) throw new Error("months out of range")
  const charge = Math.round((principal * monthlyRateBp * months) / 10_000)
  const totalRepayable = principal + charge
  const monthly = Math.ceil(totalRepayable / months)
  const lines: ScheduleLine[] = []
  let left = totalRepayable
  for (let i = 1; i <= months; i++) {
    const amount = i === months ? left : monthly
    lines.push({ sequence: i, dueDate: addMonths(startISO, i), amount })
    left -= amount
  }
  return { totalRepayable, monthly, lines }
}

/** Ghana Card number, e.g. GHA-123456789-0. */
export function isGhanaCard(s: string): boolean {
  return /^GHA-\d{9}-\d$/.test(s.trim().toUpperCase())
}

export type MockDecision = { status: "approved"; maxMonths: number } | { status: "declined"; reason: string }

/**
 * Test lender rules — predictable so every path can be tried:
 * under GH₵200 or over GH₵15,000 → declined; a phone number ending in 9 →
 * declined; over GH₵8,000 → approved for at most 3 months; else approved.
 */
export function mockDecision(amountPesewas: number, phone: string): MockDecision {
  if (amountPesewas < 200_00) return { status: "declined", reason: "The amount is below the lender's GH₵200 minimum." }
  if (amountPesewas > 15_000_00) return { status: "declined", reason: "The amount is above the lender's GH₵15,000 limit." }
  if (/9$/.test(phone.replace(/\D/g, ""))) return { status: "declined", reason: "The lender couldn't approve this application right now." }
  return { status: "approved", maxMonths: amountPesewas > 8_000_00 ? 3 : MAX_MONTHS }
}

export type RepaymentState = { dueDate: string; amount: number; paidAmount: number; reminderStage: number }

/** paid | overdue | upcoming */
export function repaymentStatus(r: Pick<RepaymentState, "dueDate" | "amount" | "paidAmount">, todayISO: string): "paid" | "overdue" | "upcoming" {
  if (r.paidAmount >= r.amount) return "paid"
  return r.dueDate < todayISO ? "overdue" : "upcoming"
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** Reminder stages: 1 = 3 days before, 2 = due today, 3 = 3 days late, 4 = 10 days late. */
export const REMINDER_STAGES = [
  { stage: 1, offsetDays: -3, templateKey: "financing_due_soon" },
  { stage: 2, offsetDays: 0, templateKey: "financing_due_today" },
  { stage: 3, offsetDays: 3, templateKey: "financing_overdue" },
  { stage: 4, offsetDays: 10, templateKey: "financing_overdue" },
] as const

/**
 * Which reminder (if any) to send today. Sends the latest stage that has
 * been reached but not yet sent, so a missed day doesn't send two messages.
 */
export function reminderToSend(r: RepaymentState, todayISO: string): (typeof REMINDER_STAGES)[number] | null {
  if (r.paidAmount >= r.amount) return null
  const dayOffset = daysBetween(r.dueDate, todayISO)
  const reached = REMINDER_STAGES.filter((s) => dayOffset >= s.offsetDays)
  const latest = reached[reached.length - 1]
  if (!latest || latest.stage <= r.reminderStage) return null
  // Don't send a "3 days before" note if we're already past the due date.
  if (latest.stage === 1 && dayOffset > 0) return null
  return latest
}

export const ghs = (p: number) => `GH₵${(p / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
