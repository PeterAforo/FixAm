/**
 * Accident & insurance claims (P8-17) — pure helpers, no database.
 */

export const CLAIM_STATUSES = [
  "draft",
  "submitted",
  "assessing",
  "approved",
  "partially_approved",
  "rejected",
  "repair_authorised",
  "settled",
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assessing: "Being assessed",
  approved: "Approved",
  partially_approved: "Partly approved",
  rejected: "Rejected",
  repair_authorised: "Repair authorised",
  settled: "Settled",
}

/**
 * Allowed status moves. `actor` restricts who may make the move:
 * driver | garage | broker | system.
 */
const NEXT: Partial<Record<ClaimStatus, { to: ClaimStatus; actor: "driver" | "garage" | "broker" | "system" | "any" }[]>> = {
  draft: [
    { to: "submitted", actor: "driver" },
  ],
  submitted: [
    { to: "assessing", actor: "broker" },
    { to: "rejected", actor: "broker" },
  ],
  assessing: [
    { to: "approved", actor: "broker" },
    { to: "partially_approved", actor: "broker" },
    { to: "rejected", actor: "broker" },
  ],
  approved: [{ to: "repair_authorised", actor: "any" }],
  partially_approved: [{ to: "repair_authorised", actor: "any" }],
  repair_authorised: [{ to: "settled", actor: "system" }],
  rejected: [],
  settled: [],
}

export function canTransition(from: string, to: string, actor: string): boolean {
  const moves = NEXT[from as ClaimStatus] ?? []
  return moves.some((m) => m.to === to && (m.actor === "any" || m.actor === actor))
}

/** Who is expected to act next — drives the "waiting on" copy. */
export function nextActor(status: string): "driver" | "broker" | "garage" | "system" | null {
  switch (status) {
    case "draft":
    case "submitted":
      return "broker"
    case "assessing":
      return "broker"
    case "approved":
    case "partially_approved":
      return "garage"
    case "repair_authorised":
      return "system"
    default:
      return null
  }
}

/** Minimum a claim needs before it can be submitted. */
export function claimReadyForSubmit(input: {
  occurredAt: boolean
  photos: number
  injuries: boolean | null
  otherParty: boolean
}): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!input.occurredAt) missing.push("when the accident happened")
  if (input.photos < 1) missing.push("at least one photo")
  if (input.injuries == null) missing.push("whether anyone was injured")
  return { ok: missing.length === 0, missing }
}

export const CLAIM_NUMBER_PREFIX = "CLM-"

export function newClaimNumber(seq: number | string): string {
  return `${CLAIM_NUMBER_PREFIX}${String(seq).padStart(6, "0")}`
}

/** WhatsApp/SMS-safe one-liner for notifications. */
export function claimSummary(c: { number: string; vehicleRef: string; status: string }): string {
  return `Claim ${c.number} (${c.vehicleRef}) is now ${CLAIM_STATUS_LABEL[c.status as ClaimStatus] ?? c.status}.`
}
