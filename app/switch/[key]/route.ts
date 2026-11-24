import { NextResponse, type NextRequest } from "next/server"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { listMyWorkspaces, WORKSPACE_COOKIE } from "@/lib/accounts/workspaces"
import { safeNextPath } from "@/lib/auth/next-cookie"

/**
 * GET /switch/<workspace key>?to=/vendor/orders — the sidebar's links into
 * another workspace. Remembers it as "last used on this device", then opens
 * the page (only pages inside that workspace; anything else → its home).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params
  const key = decodeURIComponent(raw)
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.redirect(new URL("/login", request.url))
  const ws = (await listMyWorkspaces(userId)).find((w) => w.key === key)
  if (!ws) return NextResponse.redirect(new URL("/account", request.url))

  const to = safeNextPath(request.nextUrl.searchParams.get("to"))
  const inside = to && (to === ws.href || to.startsWith(`${ws.href}/`) || to.startsWith(`${ws.href}?`))
  const res = NextResponse.redirect(new URL(inside ? to : ws.href, request.url))
  res.cookies.set(WORKSPACE_COOKIE, ws.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
