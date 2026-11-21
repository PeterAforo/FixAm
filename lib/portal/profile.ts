import "server-only"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalProfiles, portalVehicles } from "@/lib/db/schema"

export async function getPortalProfile(phone: string) {
  const [p] = await db().select().from(portalProfiles).where(eq(portalProfiles.phone, phone)).limit(1)
  return p ?? null
}

/** Resolve avatar_url (storage key or external URL) to a displayable URL. */
export async function portalAvatarUrl(avatarUrl: string | null | undefined): Promise<string | null> {
  if (!avatarUrl) return null
  if (avatarUrl.startsWith("http") || avatarUrl.startsWith("/")) return avatarUrl
  const { storageProvider } = await import("@/lib/integrations/storage")
  return storageProvider().getSignedUrl(avatarUrl, 7 * 86_400)
}

export async function listPortalVehicles(phone: string) {
  return db()
    .select()
    .from(portalVehicles)
    .where(eq(portalVehicles.phone, phone))
    .orderBy(desc(portalVehicles.createdAt))
    .limit(50)
}
