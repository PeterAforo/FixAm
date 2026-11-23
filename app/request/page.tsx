import { redirect } from "next/navigation"

/**
 * Public "post your car problem" entry point (shareable link, WhatsApp, QR).
 * Signed-out visitors are sent through phone sign-in by the proxy and land
 * back on the request form.
 */
export default function PublicRequestPage() {
  redirect("/portal/requests?new=1")
}
