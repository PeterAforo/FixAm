"use server"
import { cookies } from "next/headers"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { landingWorkspace, listMyWorkspaces } from "@/lib/accounts/workspaces"
import { NEXT_COOKIE, safeNextPath } from "@/lib/auth/next-cookie"

/**
 * Where to send a signed-in user:
 *   explicit `next` (sign-up for a role) → the page they were trying to open
 *   (remembered in a cookie) → their default workspace → the one they last
 *   used on this device → their highest-ranked workspace → /onboarding.
 *   Never the workspace picker: other workspaces are in the sidebar.
 */
export async function postLoginDestination(next?: string | null): Promise<string> {
  const userId = await getSessionUserId()
  if (!userId) return "/login"
  await ensureUser() // syncs public.users + accepts pending staff invites

  const explicit = safeNextPath(next)
  if (explicit) return explicit
  const remembered = safeNextPath((await cookies()).get(NEXT_COOKIE)?.value)
  if (remembered) return remembered

  const list = await listMyWorkspaces(userId)
  if (list.length === 0) return "/onboarding"
  const landing = await landingWorkspace(userId, list)
  return landing!.href
}
