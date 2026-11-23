/**
 * Pure money maths for escrow holds (pesewas, bigint). No rounding surprises:
 * commission uses basis points with floor division; net is what's left.
 */
export type Split = { gross: bigint; commission: bigint; fittingFee: bigint; net: bigint }

export function computeSplit(input: {
  gross: bigint
  commissionBp?: number
  /** When the order already stores its commission, pass it to avoid drift. */
  commissionAmount?: bigint | null
  fittingFee?: bigint | null
}): Split {
  if (input.gross <= 0n) throw new Error("Gross amount must be positive")
  const commission =
    input.commissionAmount !== undefined && input.commissionAmount !== null
      ? input.commissionAmount
      : (input.gross * BigInt(Math.max(0, Math.round(input.commissionBp ?? 0)))) / 10000n
  const fittingFee = input.fittingFee ?? 0n
  if (commission < 0n || fittingFee < 0n) throw new Error("Fees cannot be negative")
  const net = input.gross - commission - fittingFee
  if (net < 0n) throw new Error("Fees exceed the amount paid")
  return { gross: input.gross, commission, fittingFee, net }
}

/** Exponential backoff for payout retries: 5, 10, 20, 40 minutes… capped at 6 h. */
export function payoutBackoffMs(attempt: number): number {
  return Math.min(6 * 3600_000, 5 * 60_000 * 2 ** Math.max(0, attempt - 1))
}

export const MAX_PAYOUT_ATTEMPTS = 5

/** Hold transitions allowed by the escrow state machine. */
const TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["held", "cancelled"],
  held: ["released", "refunded", "disputed"],
  disputed: ["released", "refunded", "held"],
  released: [],
  refunded: [],
  cancelled: [],
}

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function fromStatesFor(to: string): string[] {
  return Object.entries(TRANSITIONS)
    .filter(([, tos]) => tos.includes(to))
    .map(([from]) => from)
}
