import "server-only"
import { createHash, randomBytes, randomInt } from "crypto"
import { cookies } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalSessions } from "@/lib/db/schema"
import { normalizeGhPhone } from "@/lib/phone"

export const PORTAL_COOKIE = "fixam_portal"
const SESSION_DAYS = 30
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

/** Normalise a Ghana phone to E.164; returns null when invalid. */
export function portalPhone(raw: string): string | null {
  return normalizeGhPhone(raw)
}

export async function setPortalSession(phone: string) {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db().insert(portalSessions).values({
    tokenHash: sha256(token), phone, expiresAt,
    userAgent: "web",
  })
  const jar = await cookies()
  jar.set(PORTAL_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  })
}

export async function clearPortalSession() {
  const jar = await cookies()
  const token = jar.get(PORTAL_COOKIE)?.value
  if (token) {
    await db().delete(portalSessions).where(eq(portalSessions.tokenHash, sha256(token)))
  }
  jar.delete(PORTAL_COOKIE)
}

/**
 * Phone for the signed-in driver, or null. Drivers now use the same FixAm
 * account as everyone else, so this is the verified phone on that account.
 */
export async function getPortalPhone(): Promise<string | null> {
  const { getSessionPhone } = await import("@/lib/auth/ensure-user")
  return getSessionPhone()
}

export { randomInt }
