import "server-only"
import { messagingProvider } from "@/lib/integrations"

/** Best-effort SMS to a driver/buyer about their parts order (platform-level, not garage-metered). */
export async function smsBuyer(to: string | null | undefined, body: string, key: string) {
  if (!to) return
  await messagingProvider("sms")
    .send({ channel: "sms", to, templateKey: "parts.order_update", variables: {}, rendered: { body: body.slice(0, 320) }, idempotencyKey: key })
    .catch(() => undefined)
}
