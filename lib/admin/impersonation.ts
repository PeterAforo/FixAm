import "server-only"
import { cookies } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, users } from "@/lib/db/schema"

export const IMPERSONATE_COOKIE = "fixam_impersonate"

export type Impersonation = { adminId: string; garageId: string; garageSlug: string; garageName: string }

/** Active impersonation session, or null. Validates the admin flag each read. */
export async function getImpersonation(): Promise<Impersonation | null> {
  const jar = await cookies()
  const raw = jar.get(IMPERSONATE_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Impersonation
    const [admin] = await db().select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(users).where(eq(users.id, parsed.adminId)).limit(1)
    if (!admin?.isPlatformAdmin) return null
    const [g] = await db().select({ id: garages.id, slug: garages.slug, name: garages.name, status: garages.status })
      .from(garages).where(eq(garages.id, parsed.garageId)).limit(1)
    if (!g || g.status === "suspended") return null
    return { adminId: parsed.adminId, garageId: g.id, garageSlug: g.slug, garageName: g.name }
  } catch {
    return null
  }
}

export async function setImpersonation(adminId: string, garageId: string) {
  const [g] = await db().select({ id: garages.id, slug: garages.slug, name: garages.name })
    .from(garages).where(eq(garages.id, garageId)).limit(1)
  if (!g) return false
  const jar = await cookies()
  jar.set(IMPERSONATE_COOKIE, JSON.stringify({ adminId, garageId: g.id, garageSlug: g.slug, garageName: g.name }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 4, // 4h max
  })
  return true
}

export async function clearImpersonation() {
  const jar = await cookies()
  jar.delete(IMPERSONATE_COOKIE)
}
