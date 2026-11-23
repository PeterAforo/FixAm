import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { z } from "zod"

/**
 * Payout account (where FixAm sends a vendor's or garage's money), stored
 * encrypted at rest with AES-256-GCM. Key: PAYOUT_ENCRYPTION_KEY (any long
 * random string; required in production).
 */

export const payoutAccountSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("momo"),
    network: z.enum(["mtn", "telecel", "airteltigo"]),
    phone: z.string().trim().regex(/^(?:\+?233|0)\d{9}$/, "Enter a Ghana mobile number"),
    accountName: z.string().trim().min(2).max(120),
  }),
  z.object({
    method: z.literal("bank"),
    bankCode: z.string().trim().min(2).max(10).transform((s) => s.toUpperCase()),
    accountNumber: z.string().trim().regex(/^\d{6,20}$/, "Account number should be 6–20 digits"),
    accountName: z.string().trim().min(2).max(120),
  }),
])

export type PayoutAccount = z.infer<typeof payoutAccountSchema>

const PREFIX = "enc:v1:"

function key(): Buffer {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("PAYOUT_ENCRYPTION_KEY is not set")
    return createHash("sha256").update("fixam-dev-only-payout-key").digest()
  }
  return createHash("sha256").update(raw).digest()
}

export function encryptPayoutAccount(acct: PayoutAccount): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(acct), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, body]).toString("base64url")
}

/** Returns null for empty, legacy plaintext or undecryptable values. */
export function decryptPayoutAccount(stored: string | null | undefined): PayoutAccount | null {
  if (!stored || !stored.startsWith(PREFIX)) return null
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64url")
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const body = buf.subarray(28)
    const decipher = createDecipheriv("aes-256-gcm", key(), iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")
    const parsed = payoutAccountSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Safe-to-show summary, e.g. "MTN MoMo ••• 4567 (Ama Mensah)". */
export function maskPayoutAccount(acct: PayoutAccount | null): string | null {
  if (!acct) return null
  if (acct.method === "momo") {
    const d = acct.phone.replace(/\D/g, "")
    const net = { mtn: "MTN MoMo", telecel: "Telecel Cash", airteltigo: "AT Money" }[acct.network]
    return `${net} ••• ${d.slice(-4)} (${acct.accountName})`
  }
  return `${acct.bankCode} ••• ${acct.accountNumber.slice(-4)} (${acct.accountName})`
}

const PREFIX_NETWORK: Record<string, "mtn" | "telecel" | "airteltigo"> = {
  "024": "mtn", "025": "mtn", "053": "mtn", "054": "mtn", "055": "mtn", "059": "mtn",
  "020": "telecel", "050": "telecel",
  "026": "airteltigo", "027": "airteltigo", "056": "airteltigo", "057": "airteltigo",
}

/** Guess the MoMo network from a Ghana number (ported numbers may differ — vendors can correct it). */
export function guessNetwork(phone: string): "mtn" | "telecel" | "airteltigo" | null {
  const d = phone.replace(/\D/g, "")
  const local = d.startsWith("233") ? `0${d.slice(3)}` : d
  return PREFIX_NETWORK[local.slice(0, 3)] ?? null
}

/**
 * Onboarding still collects one free-text line ("024 123 4567 · Kofi Mensah").
 * Turn it into a MoMo payout account when possible; otherwise null and the
 * vendor finishes it in Payouts.
 */
export function parseFreeTextMomo(text: string | null | undefined): PayoutAccount | null {
  if (!text) return null
  const m = text.match(/(\+?233|0)[\s-]?(\d{2})[\s-]?(\d{3})[\s-]?(\d{4})/)
  if (!m) return null
  const phone = `0${m[2]}${m[3]}${m[4]}`
  const network = guessNetwork(phone)
  const name = text.replace(m[0], "").replace(/[·|,\-–—:]+/g, " ").replace(/\s+/g, " ").trim()
  if (!network || name.length < 2) return null
  const parsed = payoutAccountSchema.safeParse({ method: "momo", network, phone, accountName: name })
  return parsed.success ? parsed.data : null
}
