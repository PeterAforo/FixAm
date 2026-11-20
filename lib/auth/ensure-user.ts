import "server-only"
import { createClient } from "@/lib/auth/supabase/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { uuidv7 } from "@/lib/id"
import { acceptPendingInvites } from "@/lib/staff/invites"

/**
 * Ensures a public.users row exists for the authenticated Supabase user.
 * Called on first sign-in / onboarding. Idempotent.
 */
export async function ensureUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const existing = await db()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (existing[0]) {
    await db()
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id))
    await acceptPendingInvites(user.id, user.email ?? "", user.phone ?? null)
    return user.id
  }

  const meta = user.user_metadata as Record<string, string | undefined>
  await db()
    .insert(users)
    .values({
      id: user.id,
      fullName: meta.full_name ?? meta.name ?? user.email ?? "FixAm user",
      email: user.email ?? "",
      phone: user.phone ?? null,
      avatarUrl: meta.avatar_url ?? null,
    })
    .onConflictDoNothing()

  await acceptPendingInvites(user.id, user.email ?? "", user.phone ?? null)
  return user.id
}

export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export { uuidv7 }
