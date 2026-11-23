import "server-only"

/**
 * WhatsApp Cloud API (graph.facebook.com) — P8-19.
 * Env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET,
 * WHATSAPP_VERIFY_TOKEN. When unset, calls are no-ops returning mock ids so
 * local dev still exercises the flow (messages land nowhere).
 */

const GRAPH = "https://graph.facebook.com/v21.0"

export function whatsappConfig() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  }
}

export function whatsappEnabled(): boolean {
  const c = whatsappConfig()
  return !!(c.phoneNumberId && c.accessToken)
}

export type WaSendResult = { ok: true; providerMessageId: string } | { ok: false; error: string }

async function graphPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: { messages?: { id: string }[] }; error?: string }> {
  const c = whatsappConfig()
  if (!whatsappEnabled()) return { ok: true, data: { messages: [{ id: `mock_${Date.now()}` }] } }
  try {
    const res = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } }
    if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, data: json }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Free-form text — only valid inside the 24 h customer-service window. */
export async function sendWhatsAppText(to: string, body: string): Promise<WaSendResult> {
  const c = whatsappConfig()
  const r = await graphPost(`${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: body.slice(0, 4096), preview_url: false },
  })
  if (!r.ok) return { ok: false, error: r.error ?? "send failed" }
  return { ok: true, providerMessageId: r.data?.messages?.[0]?.id ?? "" }
}

/** Approved template — required outside the 24 h window. */
export async function sendWhatsAppTemplate(to: string, templateName: string, bodyParam: string): Promise<WaSendResult> {
  const c = whatsappConfig()
  const r = await graphPost(`${c.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "en" },
      components: [{ type: "body", parameters: [{ type: "text", text: bodyParam.slice(0, 1024) }] }],
    },
  })
  if (!r.ok) return { ok: false, error: r.error ?? "send failed" }
  return { ok: true, providerMessageId: r.data?.messages?.[0]?.id ?? "" }
}

/** Download an inbound media file (voice note) — returns bytes + mime. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
  const c = whatsappConfig()
  if (!whatsappEnabled()) return null
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(15_000) })
    const mj = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string }
    if (!meta.ok || !mj.url) return null
    const file = await fetch(mj.url, { headers: { Authorization: `Bearer ${c.accessToken}` }, signal: AbortSignal.timeout(30_000) })
    if (!file.ok) return null
    return { data: new Uint8Array(await file.arrayBuffer()), mimeType: mj.mime_type ?? "audio/ogg" }
  } catch {
    return null
  }
}
