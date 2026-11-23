import "server-only"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { ensureUser, getSessionPhone, getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces } from "./workspaces"

/** Everything a workspace layout needs: user, phone and the switcher list. */
export async function getShellContext() {
  const userId = await getSessionUserId()
  if (!userId) redirect("/login")
  await ensureUser()
  const [[me], phone, workspaces] = await Promise.all([
    db().select({ fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, userId)).limit(1),
    getSessionPhone(),
    listMyWorkspaces(userId),
  ])
  return {
    userId,
    phone,
    workspaces,
    user: {
      name: me?.fullName ?? "FixAm user",
      detail: phone ? phone.replace("+233", "0") : (me?.email ?? ""),
    },
  }
}
