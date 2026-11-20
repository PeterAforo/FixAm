import "server-only"
import { and, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { memberships } from "@/lib/db/schema"

/**
 * Auto-accept pending staff invites matching the user's email or phone.
 * Called from ensureUser() on sign-in.
 */
export async function acceptPendingInvites(
  userId: string,
  email: string,
  phone: string | null
): Promise<number> {
  const candidates = await db()
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.status, "invited"),
        isNull(memberships.userId),
        or(
          email ? sql`lower(${memberships.invitedEmail}) = ${email.toLowerCase()}` : undefined,
          phone ? eq(memberships.invitedPhone, phone) : undefined
        )
      )
    )

  for (const c of candidates) {
    await db()
      .update(memberships)
      .set({ userId, status: "active", inviteTokenHash: null, updatedAt: new Date() })
      .where(eq(memberships.id, c.id))
  }
  return candidates.length
}
