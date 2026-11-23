import { NextResponse, type NextRequest } from "next/server"
import { reconcileReference } from "@/lib/escrow/service"

/**
 * theTeller redirect_url target: /api/payments/return/{reference}/{base64url(path)}
 * theTeller appends ?code=&status=&reason=&transaction_id= — we ignore those
 * and confirm server-side with the status API before sending the buyer on.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ reference: string; to: string }> }) {
  const { reference, to } = await ctx.params
  let path = "/"
  try {
    const decoded = Buffer.from(to, "base64url").toString("utf8")
    if (decoded.startsWith("/") && !decoded.startsWith("//")) path = decoded
  } catch {
    // fall back to home
  }

  let status = "pending"
  if (/^\d{12}$/.test(reference)) {
    try {
      const r = await reconcileReference(reference)
      status = r === "unknown" ? "pending" : r
    } catch (e) {
      console.error("[payments] return reconcile failed:", (e as Error).message)
    }
  }

  const url = new URL(path, req.nextUrl.origin)
  url.searchParams.set("payment", status)
  url.searchParams.set("ref", reference)
  return NextResponse.redirect(url, 303)
}
