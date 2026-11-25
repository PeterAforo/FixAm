import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * Encrypt small JSON secrets (provider API keys) at rest with AES-256-GCM.
 * Same key as payout accounts: PAYOUT_ENCRYPTION_KEY (required in production).
 */

const PREFIX = "enc:v1:"

function key(): Buffer {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("PAYOUT_ENCRYPTION_KEY is not set")
    return createHash("sha256").update("fixam-dev-only-payout-key").digest()
  }
  return createHash("sha256").update(raw).digest()
}

export function sealJson(value: Record<string, string>): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

/** Returns {} for empty or undecryptable values (never throws). */
export function openJson(stored: string | null | undefined): Record<string, string> {
  if (!stored || !stored.startsWith(PREFIX)) return {}
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), "base64url")
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    const json = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]))
  } catch {
    return {}
  }
}
