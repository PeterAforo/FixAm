import "server-only"
import { messagingProvider } from "@/lib/integrations"
import { renderBody, renderTemplate } from "./templates"

/**
 * Platform-level transactional SMS (sign-in codes, broker notifications).
 * Unlike sendMessage() this skips garage quiet hours and garage message
 * allowances: a sign-in code at 22:00 must arrive at 22:00.
 */

const PLATFORM_TEMPLATES: Record<string, string> = {
  broker_request_new:
    "New {{kind}} renewal {{number}} for {{plate}} from {{requester}}. Quote it on FixAm: {{link}}",
  broker_quote_ready:
    "{{broker}} quoted GH₵ {{amount}} for your {{kind}} renewal ({{plate}}). Review and accept: {{link}}",
  broker_request_update:
    "{{plate}} {{kind}} renewal is now {{status}} — {{broker}}. Details: {{link}}",
  broker_request_reply:
    "{{requester}} {{action}} your quote for {{plate}} ({{number}}). Open FixAm: {{link}}",
}

export function smsIsLive() {
  const p = process.env.MESSAGING_SMS_PROVIDER
  return p === "arkesel" || p === "hubtel"
}

export async function sendDirectSms(
  to: string,
  templateKey: string,
  variables: Record<string, string>
): Promise<{ ok: true; providerMessageId: string } | { ok: false; error: string }> {
  try {
    const body = PLATFORM_TEMPLATES[templateKey]
      ? renderBody(PLATFORM_TEMPLATES[templateKey]!, variables)
      : renderTemplate(templateKey, "sms", variables).body
    const res = await messagingProvider("sms").send({
      channel: "sms",
      to,
      templateKey,
      variables,
      rendered: { body },
      idempotencyKey: `${templateKey}:${to}:${Date.now()}`,
    })
    return { ok: true, providerMessageId: res.providerMessageId }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.warn(`[sms] ${templateKey} to ${to} failed: ${error}`)
    return { ok: false, error }
  }
}

export function appUrl(path = "") {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://fixam.app"
  return `${base.replace(/\/$/, "")}${path}`
}
