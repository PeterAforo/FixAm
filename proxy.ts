import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/auth/supabase/middleware"
import { NEXT_COOKIE, safeNextPath } from "@/lib/auth/next-cookie"

/** Pages that need a signed-in user (guests go to /login, and come back after). */
const PROTECTED = ["/g", "/portal", "/vendor", "/broker", "/tow", "/rider", "/account", "/admin"]
const ROLE_SLUGS = new Set(["garage", "driver", "parts-seller", "insurance-broker", "dvla-agent", "tow-operator", "rider"])

const isUnder = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/** Old ?role=…&kind=… links → new role slugs. */
function legacyRoleSlug(role: string | null, kind: string | null) {
  if (role === "vendor") return "parts-seller"
  if (role === "broker") return kind === "dvla" ? "dvla-agent" : "insurance-broker"
  return role && ROLE_SLUGS.has(role) ? role : null
}

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const url = request.nextUrl
  const path = url.pathname

  const redirectTo = (to: string, rememberNext?: string | null) => {
    const res = NextResponse.redirect(new URL(to, request.url))
    // keep any refreshed Supabase session cookies
    for (const c of response.cookies.getAll()) res.cookies.set(c)
    if (rememberNext) {
      res.cookies.set(NEXT_COOKIE, rememberNext, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 30,
      })
    }
    return res
  }

  // Legacy links with ?next= / ?role= → clean URLs
  if ((path === "/login" || path === "/signup") && url.searchParams.has("next")) {
    const next = safeNextPath(url.searchParams.get("next"))
    if (user && next) return redirectTo(next)
    const role = next?.match(/^\/onboarding\?role=([^&]+)(?:&kind=([^&]+))?/)
    if (role) {
      const slug = legacyRoleSlug(role[1] ?? null, role[2] ?? null)
      return redirectTo(slug ? `/signup/${slug}` : "/signup")
    }
    return redirectTo(path, next)
  }
  if (path === "/onboarding" && url.searchParams.has("role")) {
    const slug = legacyRoleSlug(url.searchParams.get("role"), url.searchParams.get("kind"))
    return redirectTo(slug ? `/onboarding/${slug}` : "/onboarding")
  }

  if (!user) {
    // Setting up a role needs an account first → that role's sign-up page
    if (isUnder(path, "/onboarding")) {
      const slug = path.split("/")[2]
      return redirectTo(slug && ROLE_SLUGS.has(slug) ? `/signup/${slug}` : "/signup")
    }
    // Remember the query too (e.g. /portal/parts?q=brake+pads from the public parts finder).
    if (PROTECTED.some((p) => isUnder(path, p))) return redirectTo("/login", `${path}${url.search}`)
    return response
  }

  // Signed in: sign-up pages lead straight into setup
  if (path === "/signup") return redirectTo("/onboarding")
  if (path.startsWith("/signup/")) {
    const slug = path.split("/")[2]
    return redirectTo(slug && ROLE_SLUGS.has(slug) ? `/onboarding/${slug}` : "/onboarding")
  }
  // Arrived where we were heading → forget it
  const remembered = request.cookies.get(NEXT_COOKIE)?.value
  if (remembered && remembered.split("?")[0] === path) response.cookies.delete(NEXT_COOKIE)
  return response
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
