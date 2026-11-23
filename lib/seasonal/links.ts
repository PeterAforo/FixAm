import "server-only"
import { createHmac, timingSafeEqual } from "crypto"

/**
 * Signed one-tap opt-out links for seasonal tips: /u/<customer>.<sig>.
 * The customer id is not secret on its own; the signature stops anyone
 * from opting out other people.
 */
function secret(): string {
  return process.env.LINK_SIGNING_SECRET || process.env.PAYOUT_ENCRYPTION_KEY || "fixam-dev-link-secret"
}

function uuidToB64(id: string): string {
  return Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url")
}

function b64ToUuid(s: string): string | null {
  const hex = Buffer.from(s, "base64url").toString("hex")
  if (hex.length !== 32) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const sign = (payload: string) => createHmac("sha256", secret()).update(`seasonal-optout:${payload}`).digest().subarray(0, 12).toString("base64url")

export function optOutToken(customerId: string): string {
  const p = uuidToB64(customerId)
  return `${p}.${sign(p)}`
}

export function readOptOutToken(token: string): string | null {
  const [p, sig] = token.split(".")
  if (!p || !sig || p.length !== 22 || sig.length !== 16) return null
  const expected = Buffer.from(sign(p))
  const got = Buffer.from(sig)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  return b64ToUuid(p)
}

export function optOutUrl(customerId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  return `${base}/u/${optOutToken(customerId)}`
}
