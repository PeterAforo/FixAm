import "server-only"
import { createHash, randomBytes, randomInt } from "crypto"
import { cookies } from "next/headers"
import { and, eq, gt } from "drizzle-orm"
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

/** Phone for the current portal session, or null. */
export async function getPortalPhone(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(PORTAL_COOKIE)?.value
  if (!token) return null
  const [s] = await db().select({ phone: portalSessions.phone })
    .from(portalSessions)
    .where(and(eq(portalSessions.tokenHash, sha256(token)), gt(portalSessions.expiresAt, new Date())))
    .limit(1)
  return s?.phone ?? null
}

export { randomInt }
