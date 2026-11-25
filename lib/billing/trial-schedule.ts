/**
 * Which billing reminder (if any) is due today. The billing sweep runs once a
 * day, so each stage matches exactly one day:
 *  - 7 days left → "midway" (with what they've done so far)
 *  - 2 days left → "ending"
 *  - last day    → "last_day"
 *  - trial ended today → "ended" (7-day grace starts)
 *  - 5 days into grace (2 left) → "grace_last", then the account goes read-only
 */
export type ReminderStage = "midway" | "ending" | "last_day" | "ended" | "grace_last"

const DAY = 86_400_000
export const GRACE_DAYS = 7

export function reminderStage(
  status: string,
  trialEndsAt: Date | null,
  now: Date = new Date()
): ReminderStage | null {
  if (!trialEndsAt) return null
  const diff = trialEndsAt.getTime() - now.getTime()
  if (status === "trialing" && diff > 0) {
    const daysLeft = Math.ceil(diff / DAY)
    if (daysLeft === 7) return "midway"
    if (daysLeft === 2) return "ending"
    if (daysLeft === 1) return "last_day"
    return null
  }
  if ((status === "past_due" || status === "trialing") && diff <= 0) {
    const daysSince = Math.floor(-diff / DAY)
    if (daysSince === 0) return "ended"
    if (daysSince === GRACE_DAYS - 2) return "grace_last"
  }
  return null
}

/** One SMS line per stage (the template adds "FixAm:" and the link). */
export function reminderDetail(stage: ReminderStage, planName: string, priceGhs: number, stats?: string): string {
  const price = priceGhs > 0 ? `GH₵${priceGhs.toFixed(2)}/month` : "your plan"
  switch (stage) {
    case "midway":
      return `you're halfway through your free trial${stats ? ` — ${stats}` : ""}. Keep ${planName} going for ${price}.`
    case "ending":
      return `your free trial ends in 2 days. Keep ${planName} for ${price}.`
    case "last_day":
      return `your free trial ends today. Pay ${price} to keep ${planName} running.`
    case "ended":
      return `your free trial has ended. You have ${GRACE_DAYS} days to pay ${price} before your account becomes read-only.`
    case "grace_last":
      return `2 days left before your account becomes read-only. Pay ${price} to keep working.`
  }
}
