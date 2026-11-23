import "server-only"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureUser, getSessionPhone, getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces } from "@/lib/accounts/workspaces"

/** A name we generated from a phone/e-mail rather than one the person typed. */
function looksGenerated(name: string | null | undefined) {
  return !name || name === "FixAm user" || /^\+?\d[\d\s]+$/.test(name) || name.includes("@")
}

/** Signed-in context for onboarding pages (the proxy already sends guests to /signup). */
export async function loadOnboarding(signupPath: string) {
  const userId = await getSessionUserId()
  if (!userId) redirect(signupPath)
  await ensureUser()
  const [[me], phone, workspaces] = await Promise.all([
    db().select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    getSessionPhone(),
    listMyWorkspaces(userId),
  ])
  return {
    userId,
    phone,
    email: me?.email ?? "",
    name: looksGenerated(me?.fullName) ? "" : (me?.fullName ?? ""),
    workspaces,
  }
}
