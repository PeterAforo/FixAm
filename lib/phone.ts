/**
 * Ghana phone normalisation → E.164 (+233...).
 * Accepts: 0241234567, 233241234567, +233241234567, 00233241234567
 */
export function normalizeGhPhone(input: string): string | null {
  const trimmed = input.trim().replace(/[\s()-]/g, "")
  if (!trimmed) return null

  let digits = trimmed.replace(/^\+/, "")
  if (digits.startsWith("00")) digits = digits.slice(2)

  // Local format: 0XXXXXXXXX (10 digits starting with 0)
  if (/^0\d{9}$/.test(digits)) {
    return `+233${digits.slice(1)}`
  }
  // International without +: 233XXXXXXXXX (12 digits)
  if (/^233\d{9}$/.test(digits)) {
    return `+${digits}`
  }
  return null
}

export function isValidGhPhone(input: string): boolean {
  return normalizeGhPhone(input) !== null
}

/** "+233200000001" → "+233 20 000 0001" for display. Other input is returned unchanged. */
export function formatGhPhone(e164: string): string {
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164)
  return m ? `+233 ${m[1]} ${m[2]} ${m[3]}` : e164
}
