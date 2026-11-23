"use server"
import { cookies } from "next/headers"
import { ensureUser, getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces, preferredWorkspace } from "@/lib/accounts/workspaces"
import { NEXT_COOKIE, safeNextPath } from "@/lib/auth/next-cookie"

/**
 * Where to send a signed-in user:
 *   explicit `next` (sign-up for a role) → the page they were trying to open
 *   (remembered in a cookie) → the workspace they last used → their only
 *   workspace → the workspace picker (/account) → /onboarding.
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
  const preferred = await preferredWorkspace(list)
  if (preferred) return preferred.href
  if (list.length === 1) return list[0]!.href
  return "/account"
}
