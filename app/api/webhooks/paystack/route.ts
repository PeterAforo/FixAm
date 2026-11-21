import { NextResponse } from "next/server"
import { verifyPaystackSignature } from "@/lib/integrations/webhooks"
import {
  markWebhookError,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@/lib/webhook-events"
import { handlePaystackEvent } from "@/lib/money/paystack-webhook"

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get("x-paystack-signature")

  const mockMode = (process.env.PAYMENT_PROVIDER ?? "mock") === "mock"
  if (
    !mockMode &&
    !verifyPaystackSignature(rawBody, signature, process.env.PAYSTACK_SECRET_KEY)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(rawBody) as {
    event?: string
    id?: number | string
    data?: { reference?: string }
  }
  const eventId = String(event.id ?? event.data?.reference ?? "")
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id" }, { status: 400 })
  }

  const recorded = await recordWebhookEvent({
    provider: "paystack",
    eventId,
    type: event.event,
    payload: event,
  })
  if (recorded === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handlePaystackEvent({ event: event.event, data: event.data })
    await markWebhookProcessed("paystack", eventId)
    return NextResponse.json({ received: true })
  } catch (e) {
    await markWebhookError(
      "paystack",
      eventId,
      e instanceof Error ? e.message : String(e)
    )
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
