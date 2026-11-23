/**
 * P8-19 WhatsApp assistant — pure logic (no DB, no I/O). Unit-tested.
 */
import { z } from "zod"

/** WhatsApp customer-service window: free-form replies allowed for 24 h after the last inbound. */
export const SERVICE_WINDOW_MS = 24 * 3600_000

export function withinServiceWindow(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS
}

/** E.164 digits only, e.g. "+233241234567" → "233241234567". Returns null when implausible. */
export function normalizeWaPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  if (digits.startsWith("00")) return digits.slice(2)
  if (!/^\d{10,15}$/.test(digits)) return null
  return digits
}

// ---------------------------------------------------------------------------
// Cloud API webhook payloads (graph.facebook.com WhatsApp Business)
// ---------------------------------------------------------------------------

export type WaInbound = {
  wamid: string
  from: string // digits, no +
  type: "text" | "audio" | "image" | "document" | "other"
  text: string | null
  mediaId: string | null
  mediaMime: string | null
  timestamp: Date
}

const mediaSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
})

const messageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  audio: mediaSchema.optional(),
  image: mediaSchema.optional(),
  document: mediaSchema.optional(),
})

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    changes: z.array(z.object({
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }).optional(),
        messages: z.array(z.unknown()).optional(),
        contacts: z.array(z.unknown()).optional(),
      }),
    })),
  })),
})

const TYPE_MAP: Record<string, WaInbound["type"]> = {
  text: "text",
  audio: "audio",
  image: "image",
  document: "document",
  sticker: "other",
  location: "other",
  contacts: "other",
  reaction: "other",
  button: "text",
  interactive: "text",
}

/** Parse a Cloud API webhook body into inbound messages. Statuses are ignored. */
export function parseCloudApiMessages(raw: unknown): WaInbound[] {
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) return []
  const out: WaInbound[] = []
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const m of change.value.messages ?? []) {
        const msg = messageSchema.safeParse(m)
        if (!msg.success) continue
        const from = normalizeWaPhone(msg.data.from)
        if (!from) continue
        const t = msg.data.type
        const mapped = TYPE_MAP[t] ?? "other"
        const media = msg.data.audio ?? msg.data.image ?? msg.data.document ?? null
        let text: string | null = null
        if (t === "text") text = msg.data.text?.body ?? null
        if (t === "button") text = (m as { button?: { text?: string } }).button?.text ?? null
        if (t === "interactive") {
          const it = (m as { interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }).interactive
          text = it?.button_reply?.title ?? it?.list_reply?.title ?? null
        }
        out.push({
          wamid: msg.data.id,
          from,
          type: mapped,
          text,
          mediaId: media?.id ?? null,
          mediaMime: media?.mime_type ?? null,
          timestamp: new Date(Number(msg.data.timestamp) * 1000),
        })
      }
    }
  }
  return out
}

/** The phone_number_id the webhook was addressed to (for per-garage numbers). */
export function phoneNumberIdOf(raw: unknown): string | null {
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success) return null
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const id = change.value.metadata?.phone_number_id
      if (id) return id
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Agent intents — what the model may ask the server to do. The model never
// writes to the DB; every action below is executed by service code.
// ---------------------------------------------------------------------------

export const WA_ACTIONS = [
  "job_status",
  "opening_hours",
  "book",
  "repair_request",
  "send_links",
  "reply",
  "handoff",
] as const
export type WaAction = (typeof WA_ACTIONS)[number]

export const waIntentSchema = z.object({
  action: z.enum(WA_ACTIONS),
  /** job_status: plate or "mine"; book: {service, date?, time?}; repair_request: {complaint, plate?}; reply/handoff: {text} */
  params: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
})
export type WaIntent = z.infer<typeof waIntentSchema>

/** Meta template used when replying outside the 24 h window (must be APPROVED in WhatsApp Manager). */
export const WA_OUTSIDE_WINDOW_TEMPLATE = "fixam_assistant_reply"

/** Fallback when the sender matches several garages — stored on the conversation. */
export type PendingGarage = { options: { id: string; name: string }[]; askedAt: string }

export function parsePendingGarage(raw: unknown): PendingGarage | null {
  const p = z.object({
    options: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
    askedAt: z.string(),
  }).safeParse(raw)
  return p.success ? p.data : null
}
