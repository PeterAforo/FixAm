"use server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garages, memberships } from "@/lib/db/schema"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { and, desc } from "drizzle-orm"

/** Where to send a signed-in user: their garage, or onboarding. */
export async function postLoginDestination(): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) return "/login"
  await ensureUser() // syncs public.users + accepts pending staff invites

  const rows = await db()
    .select({ slug: garages.slug })
    .from(memberships)
    .innerJoin(garages, eq(memberships.garageId, garages.id))
    .where(
      and(eq(memberships.userId, userId), eq(memberships.status, "active"))
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1)

  return rows[0] ? `/g/${rows[0].slug}` : "/onboarding"
}
