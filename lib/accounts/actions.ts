"use server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/auth/supabase/server"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces, WORKSPACE_COOKIE } from "./workspaces"
import type { ActionResult } from "@/lib/actions"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

/** Remember the workspace the user switched to; returns where to go. */
export async function switchWorkspace(key: string): Promise<ActionResult<{ href: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const list = await listMyWorkspaces(userId)
  const ws = list.find((w) => w.key === key)
  if (!ws) return { ok: false, error: { code: "NOT_FOUND", message: "Workspace not found" } }
  const jar = await cookies()
  jar.set(WORKSPACE_COOKIE, ws.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true, data: { href: ws.href } }
}

/** Make a workspace the one FixAm opens after sign-in, on every device. */
export async function setDefaultWorkspace(key: string): Promise<ActionResult<{ key: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const list = await listMyWorkspaces(userId)
  if (!list.some((w) => w.key === key)) return { ok: false, error: { code: "NOT_FOUND", message: "Workspace not found" } }
  await db().update(users).set({ defaultWorkspace: key, updatedAt: new Date() }).where(eq(users.id, userId))
  return { ok: true, data: { key } }
}

export async function signOut(): Promise<ActionResult<{ ok: true }>> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const jar = await cookies()
  jar.delete("fixam_portal")
  return { ok: true, data: { ok: true as const } }
}
