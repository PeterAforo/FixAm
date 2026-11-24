import "server-only"
import { createClient } from "@/lib/auth/supabase/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { uuidv7 } from "@/lib/id"
import { acceptPendingInvites } from "@/lib/staff/invites"
import { normalizeGhPhone } from "@/lib/phone"
import { isPhoneAccountEmail } from "@/lib/auth/admin"

/** Supabase stores phones without "+"; FixAm stores E.164. */
function e164(phone: string | null | undefined): string | null {
  if (!phone) return null
  return normalizeGhPhone(phone) ?? (phone.startsWith("+") ? phone : `+${phone}`)
}

/**
 * Ensures a public.users row exists for the authenticated Supabase user and
 * accepts any staff invites waiting for their phone or e-mail. Idempotent.
 */
export async function ensureUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const email = isPhoneAccountEmail(user.email) ? null : (user.email ?? null)
  // app_metadata is only writable with the service role, so it's safe to trust.
  const appPhone = (user.app_metadata as Record<string, unknown> | undefined)?.phone
  const phone = e164(user.phone) ?? (typeof appPhone === "string" ? e164(appPhone) : null)

  const existing = await db()
    .select({ id: users.id, phone: users.phone, email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  if (existing[0]) {
    await db()
      .update(users)
      .set({
        lastSeenAt: new Date(),
        ...(phone && !existing[0].phone ? { phone } : {}),
        ...(email && !existing[0].email ? { email } : {}),
      })
      .where(eq(users.id, user.id))
    await acceptPendingInvites(user.id, email ?? "", phone ?? existing[0].phone)
    const { acceptPendingWorkspaceInvites } = await import("@/lib/staff/workspace")
    await acceptPendingWorkspaceInvites(user.id, email ?? "", phone ?? existing[0].phone)
    return user.id
  }

  const meta = user.user_metadata as Record<string, string | undefined>
  await db()
    .insert(users)
    .values({
      id: user.id,
      fullName: meta.full_name ?? meta.name ?? email ?? phone ?? "FixAm user",
      email,
      phone,
      avatarUrl: meta.avatar_url ?? null,
    })
    .onConflictDoNothing()

  await acceptPendingInvites(user.id, email ?? "", phone)
  const { acceptPendingWorkspaceInvites } = await import("@/lib/staff/workspace")
  await acceptPendingWorkspaceInvites(user.id, email ?? "", phone)
  return user.id
}

export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** The signed-in user's verified phone (E.164), or null. */
export async function getSessionPhone(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const fromAuth = e164(user.phone)
  if (fromAuth) return fromAuth
  const appPhone = (user.app_metadata as Record<string, unknown> | undefined)?.phone
  if (typeof appPhone === "string") return e164(appPhone)
  const [row] = await db().select({ phone: users.phone }).from(users).where(eq(users.id, user.id)).limit(1)
  return row?.phone ?? null
}

export { uuidv7 }
