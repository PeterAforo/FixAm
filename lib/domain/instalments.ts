/**
 * Payment-plan scheduling (specs → payment_plans).
 * All money in integer pesewas. Dates are ISO YYYY-MM-DD (UTC).
 */

export type Frequency = "weekly" | "fortnightly" | "monthly" | "custom"

export type ScheduleEntry = {
  sequence: number // 1-based
  dueDate: string
  amount: number // pesewas
}

const DAY = 86_400_000

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10)
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // clamp to end-of-month (Jan 31 + 1mo → Feb 28/29)
  if (d.getUTCDate() !== day) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

function advance(iso: string, frequency: Frequency, customDays?: number): string {
  switch (frequency) {
    case "weekly": return addDays(iso, 7)
    case "fortnightly": return addDays(iso, 14)
    case "monthly": return addMonths(iso, 1)
    case "custom": return addDays(iso, customDays && customDays > 0 ? customDays : 30)
  }
}

/**
 * Split `instalmentTotal` (already net of down payment) into `count`
 * equal instalments; remainder pesewas go on the last instalment.
 */
export function buildSchedule(args: {
  totalAmount: number
  downPayment?: number
  instalmentCount: number
  frequency: Frequency
  startDate: string
  customDays?: number
}): ScheduleEntry[] {
  const { totalAmount, instalmentCount, frequency, startDate } = args
  const down = args.downPayment ?? 0
  const remaining = totalAmount - down
  if (instalmentCount < 1 || remaining <= 0) return []

  const base = Math.floor(remaining / instalmentCount)
  const remainder = remaining - base * instalmentCount

  const out: ScheduleEntry[] = []
  let date = startDate
  for (let i = 1; i <= instalmentCount; i++) {
    out.push({
      sequence: i,
      dueDate: date,
      amount: base + (i === instalmentCount ? remainder : 0),
    })
    date = advance(date, frequency, args.customDays)
  }
  return out
}

export type LateFeeRule =
  | { kind: "percent"; rate_bp: number; after_days: number }
  | { kind: "fixed"; amount: number; after_days: number }

/** Late fee owed on an unpaid instalment, in pesewas (0 when not applicable). */
export function computeLateFee(args: {
  amount: number
  dueDate: string
  today: string
  rule?: LateFeeRule | null
}): number {
  const rule = args.rule
  if (!rule) return 0
  const overdueDays = Math.floor(
    (new Date(`${args.today}T00:00:00Z`).getTime() - new Date(`${args.dueDate}T00:00:00Z`).getTime()) / DAY
  )
  if (overdueDays <= rule.after_days) return 0
  if (rule.kind === "fixed") return rule.amount
  return Math.round((args.amount * rule.rate_bp) / 10000)
}

/** Days an instalment is overdue (0 if not yet due / negative → 0). */
export function daysOverdue(dueDate: string, today: string): number {
  const d = Math.floor(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueDate}T00:00:00Z`).getTime()) / DAY
  )
  return d > 0 ? d : 0
}
