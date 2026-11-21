/**
 * Reminder engine domain logic — mirrors specs/reminder-rules.json.
 * Pure functions only; scheduling/persistence lives in lib/reminders + Inngest.
 */

export type DueItemType =
  | "oil_change" | "general_service" | "insurance" | "roadworthy"
  | "registration_licence" | "drivers_licence"
  | "instalment" | "credit_statement" | "custom"

export type DueStatus = "scheduled" | "due_soon" | "due" | "overdue" | "completed" | "dismissed"

export type ReminderRule = {
  escalationDaysBefore: number[]
  overdueDaysAfter: number[]
  templates: { due_soon: string; due: string; overdue: string }
  primaryAction: string
  secondaryActions: string[]
}

export const REMINDER_RULES: Record<DueItemType, ReminderRule> = {
  oil_change: {
    escalationDaysBefore: [14, 7, 0],
    overdueDaysAfter: [3, 14],
    templates: { due_soon: "oil_due_soon", due: "oil_due", overdue: "oil_overdue" },
    primaryAction: "book_now",
    secondaryActions: ["update_mileage", "already_done"],
  },
  general_service: {
    escalationDaysBefore: [14, 3],
    overdueDaysAfter: [7],
    templates: { due_soon: "service_due_soon", due: "service_due", overdue: "service_overdue" },
    primaryAction: "book_now",
    secondaryActions: ["update_mileage", "already_done"],
  },
  insurance: {
    escalationDaysBefore: [30, 14, 7, 1, 0],
    overdueDaysAfter: [3, 7],
    templates: { due_soon: "insurance_due_soon", due: "insurance_due", overdue: "insurance_overdue" },
    primaryAction: "renew_with_garage",
    secondaryActions: ["already_done"],
  },
  roadworthy: {
    escalationDaysBefore: [30, 14, 7, 1, 0],
    overdueDaysAfter: [3, 7],
    templates: { due_soon: "roadworthy_due_soon", due: "roadworthy_due", overdue: "roadworthy_overdue" },
    primaryAction: "renew_with_garage",
    secondaryActions: ["book_now", "already_done"],
  },
  registration_licence: {
    escalationDaysBefore: [30, 14, 7, 1, 0],
    overdueDaysAfter: [3, 7],
    templates: { due_soon: "registration_due_soon", due: "registration_due", overdue: "registration_overdue" },
    primaryAction: "renew_with_garage",
    secondaryActions: ["already_done"],
  },
  drivers_licence: {
    escalationDaysBefore: [30, 7, 0],
    overdueDaysAfter: [7],
    templates: { due_soon: "drivers_licence_due_soon", due: "drivers_licence_due", overdue: "drivers_licence_overdue" },
    primaryAction: "renew_with_garage",
    secondaryActions: ["already_done"],
  },
  instalment: {
    escalationDaysBefore: [3, 0],
    overdueDaysAfter: [1, 3, 7],
    templates: { due_soon: "instalment_due_soon", due: "instalment_due", overdue: "instalment_overdue" },
    primaryAction: "pay_now",
    secondaryActions: [],
  },
  credit_statement: {
    escalationDaysBefore: [0],
    overdueDaysAfter: [7, 14, 30],
    templates: { due_soon: "credit_statement_ready", due: "credit_statement_ready", overdue: "credit_statement_overdue" },
    primaryAction: "pay_now",
    secondaryActions: [],
  },
  custom: {
    escalationDaysBefore: [7, 0],
    overdueDaysAfter: [3],
    templates: { due_soon: "custom_due_soon", due: "custom_due", overdue: "custom_overdue" },
    primaryAction: "book_now",
    secondaryActions: ["already_done"],
  },
}

/** Effective due date = earliest of date-based and mileage-predicted dates. */
export function effectiveDueDate(item: { dueDate?: string | null; predictedDueDate?: string | null }): string | null {
  const dates = [item.dueDate, item.predictedDueDate].filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a < b ? a : b))
}

const DAY = 86_400_000

/** Whole days from `from` (today) to `to` (YYYY-MM-DD); negative = past. */
export function daysUntil(toISO: string, from: Date): number {
  const to = Date.parse(`${toISO}T00:00:00Z`)
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  return Math.round((to - today) / DAY)
}

export type Escalation = {
  status: "scheduled" | "due_soon" | "due" | "overdue"
  /** how many escalation reminders have fired (0 = none yet) */
  stage: number
  templateKey: string
  primaryAction: string
  /** next reminder timestamp basis: effective date minus next uncrossed threshold, or overdue offset */
  nextReminderAt: Date | null
}

/**
 * Compute where a due item sits in its escalation ladder for `today`.
 * stage = count of escalation thresholds already reached.
 */
export function escalationFor(type: DueItemType, effISO: string | null, today: Date): Escalation | null {
  if (!effISO) return null
  const rule = REMINDER_RULES[type]
  const until = daysUntil(effISO, today)
  const eff = new Date(`${effISO}T00:00:00Z`)

  if (until > 0) {
    const before = [...rule.escalationDaysBefore].sort((a, b) => b - a) // largest first
    // thresholds already crossed = those >= until? A threshold t fires when daysUntil <= t.
    // crossed count = number of t where until <= t
    const crossed = before.filter((t) => until <= t)
    if (crossed.length === 0) {
      // not yet inside escalation window → next fire at the largest threshold
      const nextT = before[0]
      return {
        status: "scheduled", stage: 0,
        templateKey: rule.templates.due_soon, primaryAction: rule.primaryAction,
        nextReminderAt: nextT != null ? new Date(eff.getTime() - nextT * DAY) : null,
      }
    }
    const stage = crossed.length
    // next uncrossed threshold = smallest t that is < until... thresholds sorted desc:
    // fired thresholds are t >= until; remaining are t < until → next fires when until drops to max(remaining)
    const remaining = before.filter((t) => until > t)
    const nextT = remaining.length ? Math.max(...remaining) : 0
    return {
      status: "due_soon", stage,
      templateKey: stage >= before.length ? rule.templates.due : rule.templates.due_soon,
      primaryAction: rule.primaryAction,
      nextReminderAt: new Date(eff.getTime() - nextT * DAY),
    }
  }

  const overdueBy = -until
  if (overdueBy <= 0) {
    // due today
    const stage = rule.escalationDaysBefore.length
    return {
      status: "due", stage,
      templateKey: rule.templates.due, primaryAction: rule.primaryAction,
      nextReminderAt: new Date(eff.getTime() + 86400_000),
    }
  }

  // overdue: stage counts overdue thresholds passed
  const od = [...rule.overdueDaysAfter].sort((a, b) => a - b)
  const passed = od.filter((t) => overdueBy >= t)
  const stage = rule.escalationDaysBefore.length + passed.length
  const nextT = od.find((t) => overdueBy < t)
  return {
    status: "overdue", stage,
    templateKey: rule.templates.overdue, primaryAction: rule.primaryAction,
    nextReminderAt: nextT != null ? new Date(eff.getTime() + nextT * DAY) : null,
  }
}

/** 7-day batching bucket for combining reminders (spec: same 7-day window).
 *  Bucket index is anchored at `now` so items due within the next 7 days
 *  (or overdue within the last 7) share a bucket. */
export function batchBucket(effISO: string, nowISO: string): string {
  const day = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY)
  return String(Math.floor((day(effISO) - day(nowISO)) / 7))
}

export type Channel = "whatsapp" | "sms" | "push" | "email"
const DEFAULT_CHANNEL_ORDER: Channel[] = ["whatsapp", "sms", "push", "email"]
const PAID_CHANNELS = new Set<Channel>(["whatsapp", "sms"])

/** Channel order: customer's preferred_channels first (in stored order), then the rest. */
export function channelOrder(preferred: string[] | null | undefined): Channel[] {
  const pref = (preferred ?? []).filter((c): c is Channel => PAID_CHANNELS.has(c as Channel) || c === "push" || c === "email")
  const rest = DEFAULT_CHANNEL_ORDER.filter((c) => !pref.includes(c))
  return [...pref, ...rest]
}

/** When over allowance: only push/email may send; paid channels suppressed. */
export function allowedChannels(order: Channel[], overAllowance: boolean): Channel[] {
  if (!overAllowance) return order
  return order.filter((c) => !PAID_CHANNELS.has(c))
}
