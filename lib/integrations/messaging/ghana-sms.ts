import type {
  InboundMessage,
  MessageSendInput,
  MessageSendResult,
  MessagingProvider,
  StatusWebhookEvent,
} from "../types"

/**
 * Ghana SMS adapters. Select with MESSAGING_SMS_PROVIDER=arkesel|hubtel.
 * Sender ID (SMS_SENDER_ID, max 11 chars) must be approved by the provider.
 */

const senderId = () => (process.env.SMS_SENDER_ID || "FIXAM").slice(0, 11)
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
export function createArkeselProvider(): MessagingProvider {
  return {
    name: "arkesel",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const key = process.env.ARKESEL_API_KEY
      if (!key) throw new Error("ARKESEL_API_KEY is not set")
      const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: senderId(),
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
export function createHubtelProvider(): MessagingProvider {
  return {
    name: "hubtel",
    async send(input: MessageSendInput): Promise<MessageSendResult> {
      const id = process.env.HUBTEL_CLIENT_ID
      const secret = process.env.HUBTEL_CLIENT_SECRET
      if (!id || !secret) throw new Error("HUBTEL_CLIENT_ID / HUBTEL_CLIENT_SECRET are not set")
      const qs = new URLSearchParams({
        clientid: id,
        clientsecret: secret,
        from: senderId(),
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
