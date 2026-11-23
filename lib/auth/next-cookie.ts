/** Where to send someone after they sign in — kept in a cookie so URLs stay clean (no ?next=). */
export const NEXT_COOKIE = "fixam_next"

/** Only same-site, non-auth paths are allowed as a post-login destination. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null
  if (next.startsWith("/login") || next.startsWith("/signup")) return null
  return next
}
