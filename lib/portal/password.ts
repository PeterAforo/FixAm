import "server-only"
import { randomBytes, scryptSync, timingSafeEqual } from "crypto"

/** scrypt password hashing for portal credentials — format: scrypt$N$r$p$salt$hash */
const N = 16384, r = 8, p = 1, KEYLEN = 64

export function hashPortalPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, KEYLEN, { N, r, p }).toString("hex")
  return `scrypt$${N}$${r}$${p}$${salt}$${hash}`
}

export function verifyPortalPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false
  const [, n, rr, pp, salt, hash] = parts
  try {
    const candidate = scryptSync(password, salt, KEYLEN, { N: Number(n), r: Number(rr), p: Number(pp) })
    const expected = Buffer.from(hash, "hex")
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}
