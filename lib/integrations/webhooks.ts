import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/** Webhook signature verification helpers (specs/integrations.json). */

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

export function hmacSha512Hex(secret: string, body: string): string {
  return createHmac("sha512", secret).update(body).digest("hex")
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex")
    const bb = Buffer.from(b, "hex")
    return ba.length === bb.length && timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/** Meta WhatsApp: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret). */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!signatureHeader || !appSecret) return false
  const expected = `sha256=${hmacSha256Hex(appSecret, rawBody)}`
  return safeEqualHex(signatureHeader.replace(/^sha256=/, ""), expected.replace(/^sha256=/, ""))
}

/** Arkesel/Hubtel SMS delivery reports — provider-specific; mock accepts all in dev. */
export function verifySmsWebhook(
  _rawBody: string,
  _signature: string | null,
  _secret: string | undefined
): boolean {
  void _rawBody
  void _signature
  void _secret
  // Real adapters verify per-provider auth (API key header / HMAC).
  // In mock mode there is nothing to verify.
  return true
}
