import { NextResponse } from "next/server"
import { verifySmsWebhook } from "@/lib/integrations/webhooks"
import { applyDeliveryStatus } from "@/lib/messaging/delivery-status"
import {
  markWebhookError,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@/lib/webhook-events"

export async function POST(request: Request) {
  const rawBody = await request.text()

  if (
    !verifySmsWebhook(
      rawBody,
      request.headers.get("x-webhook-signature"),
      process.env.SMS_WEBHOOK_SECRET
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const body = JSON.parse(rawBody) as {
    id?: string | number
    messageId?: string
    status?: string
    type?: string
  }
  const eventId = String(body.id ?? body.messageId ?? rawBody.slice(0, 64))

  const recorded = await recordWebhookEvent({
    provider: "sms",
    eventId,
    type: body.type ?? body.status,
    payload: body,
  })
  if (recorded === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    // Delivery reports — update message_sends/message_logs by provider id.
    const mid = body.messageId ?? (typeof body.id === "string" ? body.id : undefined)
    if (mid && body.status) {
      await applyDeliveryStatus(String(mid), String(body.status))
    }
    await markWebhookProcessed("sms", eventId)
    return NextResponse.json({ received: true })
  } catch (e) {
    await markWebhookError(
      "sms",
      eventId,
      e instanceof Error ? e.message : String(e)
    )
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
