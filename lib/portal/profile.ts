import "server-only"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portalProfiles, portalVehicles } from "@/lib/db/schema"

export async function getPortalProfile(phone: string) {
  const [p] = await db().select().from(portalProfiles).where(eq(portalProfiles.phone, phone)).limit(1)
  return p ?? null
}

export async function listPortalVehicles(phone: string) {
  return db()
    .select()
    .from(portalVehicles)
    .where(eq(portalVehicles.phone, phone))
    .orderBy(desc(portalVehicles.createdAt))
    .limit(50)
}
