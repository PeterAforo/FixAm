import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * Ghana Card numbers — encrypted at rest with the same PAYOUT_ENCRYPTION_KEY
 * as payout accounts (AES-256-GCM). Only the last 4 digits are stored in the
 * clear for admin display. Never log the number or decrypted value.
 */

const PREFIX = "gc:v1:"

function key(): Buffer {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("PAYOUT_ENCRYPTION_KEY is not set")
    return createHash("sha256").update("fixam-dev-only-payout-key").digest()
  }
  return createHash("sha256").update(raw).digest()
}

/** Ghana Card format: GHA-123456789-0 (9 digits + check digit). Accepts spaces/dashes. */
export function normalizeGhanaCard(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "")
  return /^\d{10}$/.test(digits) ? digits : null
}

export function encryptGhanaCard(cardNumber: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(cardNumber, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

/** Admin-only: verify a submitted card against the stored ciphertext. Returns boolean. */
export function ghanaCardMatches(stored: string | null, input: string): boolean {
  const card = normalizeGhanaCard(input)
  if (!card || !stored?.startsWith(PREFIX)) return false
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64url")
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")
    return plain === card
  } catch {
    return false
  }
}
