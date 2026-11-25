import type {
  InboundMessage,
  MessageSendInput,
  MessageSendResult,
  MessagingProvider,
  StatusWebhookEvent,
} from "../types"

/**
 * Ghana SMS adapters. Chosen in /admin/integrations (credentials passed in as
 * `creds`), or with MESSAGING_SMS_PROVIDER=arkesel|hubtel and env keys.
 * Sender ID (max 11 chars) must be approved by the provider.
 */

export type SmsCreds = Record<string, string | undefined>

const senderId = (c: SmsCreds = {}) => (c.sender_id || process.env.SMS_SENDER_ID || "FIXAM").slice(0, 11)
const msisdn = (to: string) => to.replace(/\D/g, "") // 233XXXXXXXXX
const segments = (body: string) => Math.max(1, Math.ceil(body.length / 160))

const noWebhooks = {
  async parseStatusWebhook(): Promise<StatusWebhookEvent[]> {
    return []
  },
  async parseInboundWebhook(): Promise<InboundMessage[]> {
    return []
  },
}

/** Arkesel — https://developers.arkesel.com (SMS API v2). Env: ARKESEL_API_KEY */
export function createArkeselProvider(creds: SmsCreds = {}): MessagingProvider {
  return {
    name: "arkesel",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const key = creds.api_key || process.env.ARKESEL_API_KEY
      if (!key) throw new Error("Arkesel API key is not set")
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: senderId(creds),
          message: input.rendered.body,
          recipients: [msisdn(input.to)],
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        status?: string
        message?: string
        data?: { id?: string; recipient?: string }[]
      }
      if (!res.ok || json.status !== "success") {
        throw new Error(`Arkesel: ${json.message ?? res.statusText}`)
      }
      return {
        providerMessageId: json.data?.[0]?.id ?? input.idempotencyKey,
        costUnits: segments(input.rendered.body),
      }
    },
    ...noWebhooks,
  }
}

/** Hubtel — https://developers.hubtel.com (Quick Send). Env: HUBTEL_CLIENT_ID, HUBTEL_CLIENT_SECRET */
export function createHubtelProvider(creds: SmsCreds = {}): MessagingProvider {
  return {
    name: "hubtel",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const id = creds.client_id || process.env.HUBTEL_CLIENT_ID
      const secret = creds.client_secret || process.env.HUBTEL_CLIENT_SECRET
      if (!id || !secret) throw new Error("Hubtel client ID / secret are not set")
      const qs = new URLSearchParams({
        clientid: id,
        clientsecret: secret,
        from: senderId(creds),
        to: msisdn(input.to),
        content: input.rendered.body,
      })
      const res = await fetch(`https://smsc.hubtel.com/v1/messages/send?${qs.toString()}`, {
        headers: { Accept: "application/json" },
      })
      const json = (await res.json().catch(() => ({}))) as { messageId?: string; status?: number; statusDescription?: string }
      if (!res.ok || (json.status !== undefined && json.status !== 0)) {
        throw new Error(`Hubtel: ${json.statusDescription ?? res.statusText}`)
      }
      return {
        providerMessageId: json.messageId ?? input.idempotencyKey,
        costUnits: segments(input.rendered.body),
      }
    },
    ...noWebhooks,
  }
}

/** mNotify — https://developer.mnotify.com (Quick SMS, v2). */
export function createMnotifyProvider(creds: SmsCreds = {}): MessagingProvider {
  return {
    name: "mnotify",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const key = creds.api_key || process.env.MNOTIFY_API_KEY
      if (!key) throw new Error("mNotify API key is not set")
      const res = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          recipient: [msisdn(input.to)],
          sender: senderId(creds),
          message: input.rendered.body,
          is_schedule: false,
          schedule_date: "",
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string; summary?: { _id?: string } }
      if (!res.ok || json.status !== "success") throw new Error(`mNotify: ${json.message ?? res.statusText}`)
      return { providerMessageId: json.summary?._id ?? input.idempotencyKey, costUnits: segments(input.rendered.body) }
    },
    ...noWebhooks,
  }
}

/** Fill {{to}}, {{message}}, {{sender}} — JSON-escaped for bodies, URL-encoded for GET. */
export function fillSmsTemplate(template: string, vars: { to: string; message: string; sender: string }, mode: "json" | "query"): string {
  const enc = (v: string) => (mode === "json" ? JSON.stringify(v).slice(1, -1) : encodeURIComponent(v))
  return template
    .replaceAll("{{to}}", enc(vars.to))
    .replaceAll("{{message}}", enc(vars.message))
    .replaceAll("{{sender}}", enc(vars.sender))
}

/**
 * Any HTTP SMS gateway, described in /admin/integrations: URL, method, an
 * optional auth header and a body (POST) or query (GET) template.
 */
export function createCustomHttpSmsProvider(creds: SmsCreds = {}): MessagingProvider {
  return {
    name: "custom_http",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const url = creds.url
      if (!url || !/^https:\/\//i.test(url)) throw new Error("Custom SMS: the send URL must start with https://")
      const vars = { to: msisdn(input.to), message: input.rendered.body, sender: senderId(creds) }
      const method = (creds.method || "POST").toUpperCase() === "GET" ? "GET" : "POST"
      const headers: Record<string, string> = { Accept: "application/json" }
      if (creds.auth_header && creds.auth_value) headers[creds.auth_header] = creds.auth_value
      let target = url
      let body: string | undefined
      if (method === "GET") {
        const q = fillSmsTemplate(creds.body_template || "to={{to}}&message={{message}}&sender={{sender}}", vars, "query")
        target = `${url}${url.includes("?") ? "&" : "?"}${q}`
      } else {
        headers["Content-Type"] = "application/json"
        body = fillSmsTemplate(creds.body_template || '{"to":"{{to}}","message":"{{message}}","sender":"{{sender}}"}', vars, "json")
      }
      const res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(15_000) })
      const text = await res.text().catch(() => "")
      if (!res.ok) throw new Error(`Custom SMS: HTTP ${res.status} ${text.slice(0, 120)}`)
      if (creds.success_contains && !text.includes(creds.success_contains)) {
        throw new Error(`Custom SMS: reply did not contain "${creds.success_contains}"`)
      }
      let id = input.idempotencyKey
      try {
        const j = JSON.parse(text) as Record<string, unknown>
        const found = j.id ?? j.messageId ?? j.message_id
        if (typeof found === "string" || typeof found === "number") id = String(found)
      } catch {
        /* not JSON — keep our own id */
      }
      return { providerMessageId: id, costUnits: segments(input.rendered.body) }
    },
    ...noWebhooks,
  }
}
