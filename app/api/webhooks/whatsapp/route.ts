import { NextResponse } from "next/server"
import { verifyWhatsAppSignature } from "@/lib/integrations/webhooks"
import { applyDeliveryStatus } from "@/lib/messaging/delivery-status"
import {
  markWebhookError,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@/lib/webhook-events"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response("Forbidden", { status: 403 })
}

export async function POST(request: Request) {
  const rawBody = await request.text()

  const mockMode =
    (process.env.MESSAGING_WHATSAPP_PROVIDER ?? "mock") === "mock"
  if (
    !mockMode &&
    !verifyWhatsAppSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      process.env.WHATSAPP_APP_SECRET
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as {
    entry?: Array<{
      changes?: Array<{ value?: { messages?: unknown[]; statuses?: unknown[] } }>
    }>
  }

  // Meta webhooks don't carry a single event id — derive one per payload.
  const eventId = request.headers.get("x-request-id") ?? rawBody.slice(0, 64)
  const recorded = await recordWebhookEvent({
    provider: "whatsapp",
    eventId,
    type: "whatsapp.webhook",
    payload,
  })
  if (recorded === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    // Status updates: entry[].changes[].value.statuses[] = {id, status, ...}
    const statuses = (payload.entry ?? []).flatMap((e) =>
      (e.changes ?? []).flatMap((c) =>
        ((c.value as { statuses?: Array<{ id?: string; status?: string }> } | undefined)?.statuses ?? [])
      )
    )
    for (const s of statuses) {
      if (s.id && s.status) await applyDeliveryStatus(s.id, s.status)
    }
    // Inbound messages (mileage replies) handled in P4-03.
    await markWebhookProcessed("whatsapp", eventId)
    return NextResponse.json({ received: true })
  } catch (e) {
    await markWebhookError(
      "whatsapp",
      eventId,
      e instanceof Error ? e.message : String(e)
    )
    return NextResponse.json({ error: "Processing failed" }, { status: 500 })
  }
}
