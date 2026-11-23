import { NextRequest, NextResponse } from "next/server"
import { verifyWhatsAppSignature } from "@/lib/integrations/webhooks"
import { whatsappConfig } from "@/lib/integrations/messaging/whatsapp-cloud"
import { recordWebhookEvent, markWebhookProcessed, markWebhookError } from "@/lib/webhook-events"
import { handleInbound } from "@/lib/whatsapp/service"
import { phoneNumberIdOf } from "@/lib/whatsapp/core"

/**
 * WhatsApp Cloud API webhook (P8-19).
 * GET  — Meta verification challenge.
 * POST — signed inbound events; idempotent via webhook_events, processed inline
 *        (AI replies can take a few seconds; Meta allows ~20 s).
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  const expected = whatsappConfig().verifyToken
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const sig = req.headers.get("x-hub-signature-256")
  if (!verifyWhatsAppSignature(raw, sig, whatsappConfig().appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return new NextResponse("Bad payload", { status: 400 })
  }

  // Meta sends one webhook per change batch; use the first message id as event id,
  // falling back to a hash of the body.
  const firstWamid = extractFirstMessageId(payload) ?? hashBody(raw)
  const rec = await recordWebhookEvent({ provider: "whatsapp", eventId: firstWamid, type: "inbound", payload })
  if (rec === "duplicate") return NextResponse.json({ ok: true, duplicate: true })

  try {
    await handleInbound(payload, phoneNumberIdOf(payload))
    await markWebhookProcessed("whatsapp", firstWamid)
  } catch (e) {
    await markWebhookError("whatsapp", firstWamid, (e as Error).message).catch(() => undefined)
    // Still 200 — Meta retries on non-2xx; the error is logged for ops.
    console.error("[whatsapp] webhook processing failed:", (e as Error).message)
  }
  return NextResponse.json({ ok: true })
}

function extractFirstMessageId(payload: unknown): string | null {
  const p = payload as { entry?: { changes?: { value?: { messages?: { id?: string }[] } }[] }[] }
  for (const e of p?.entry ?? []) {
    for (const c of e.changes ?? []) {
      const id = c.value?.messages?.[0]?.id
      if (id) return id
    }
  }
  return null
}

function hashBody(raw: string): string {
  // Cheap stable id when no message id exists (e.g. status-only payloads).
  let h = 0
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0
  return `wh:${(h >>> 0).toString(16)}`
}
