import type { RingStatus } from "@/components/brand/vehicle-health-card"

export type FixAmScoreInput = {
  oil: { status: RingStatus }
  insurance: { status: RingStatus }
  dvla: { status: RingStatus }
  issues: { status: RingStatus }
  /** Open scheduled/due items beyond the four ring categories. */
  otherDueSoon: number
  otherDueOverdue: number
}

export type FixAmScoreResult = {
  /** 0–100 vehicle care score. */
  score: number
  /** Short actionable tips to raise the score. */
  tips: string[]
}

const RING_PENALTY: Record<RingStatus, { soon: number; overdue: number }> = {
  ok: { soon: 0, overdue: 0 },
  unknown: { soon: 0, overdue: 0 },
  soon: { soon: 8, overdue: 0 },
  overdue: { soon: 0, overdue: 20 },
}

const RING_TIP: Record<string, string> = {
  oil: "Book an oil change to protect the engine",
  insurance: "Renew insurance before it lapses",
  dvla: "Sort DVLA/roadworthy renewal",
  issues: "Close out open job issues",
}

/** Spec: 0–100 vehicle care score from on-time service, valid insurance/DVLA, open issues. */
export function computeFixAmScore(input: FixAmScoreInput): FixAmScoreResult {
  let penalty = 0
  const tips: string[] = []

  for (const [key, ring] of Object.entries({
    oil: input.oil,
    insurance: input.insurance,
    dvla: input.dvla,
    issues: input.issues,
  })) {
    const p = RING_PENALTY[ring.status]
    if (ring.status === "overdue") {
      penalty += p.overdue
      tips.push(RING_TIP[key]!)
    } else if (ring.status === "soon") {
      penalty += p.soon
      tips.push(`${RING_TIP[key]} soon`)
    }
  }

  penalty += Math.min(30, input.otherDueOverdue * 10)
  penalty += Math.min(15, input.otherDueSoon * 5)
  if (input.otherDueOverdue > 0) tips.push("Clear overdue service items")
  else if (input.otherDueSoon > 0) tips.push("A few services coming up")

  const score = Math.max(0, Math.min(100, 100 - penalty))
  return { score, tips: tips.slice(0, 3) }
}
