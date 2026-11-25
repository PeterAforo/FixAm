import "server-only"
import type { MessagingProvider, MessageChannel } from "./types"
import { createMockMessagingProvider } from "./messaging/mock"
import {
  createArkeselProvider,
  createCustomHttpSmsProvider,
  createHubtelProvider,
  createMnotifyProvider,
  type SmsCreds,
} from "./messaging/ghana-sms"
import { activeProvider } from "./config"

/**
 * Provider selection:
 *  1. SMS: the provider an admin switched on in /admin/integrations (with its saved keys);
 *  2. otherwise env (specs/integrations.json): MESSAGING_SMS_PROVIDER /
 *     MESSAGING_WHATSAPP_PROVIDER / MESSAGING_EMAIL_PROVIDER / MESSAGING_PUSH_PROVIDER,
 *     each accepting 'mock' (default) or an implemented provider name.
 */

const ENV_KEYS: Record<MessageChannel, string> = {
  sms: "MESSAGING_SMS_PROVIDER",
  whatsapp: "MESSAGING_WHATSAPP_PROVIDER",
  email: "MESSAGING_EMAIL_PROVIDER",
  push: "MESSAGING_PUSH_PROVIDER",
}

/** Build an SMS adapter by provider key (admin-saved creds, or env when empty). */
export function smsAdapter(provider: string, creds: SmsCreds = {}): MessagingProvider | null {
  switch (provider) {
    case "arkesel":
      return createArkeselProvider(creds)
    case "hubtel":
      return createHubtelProvider(creds)
    case "mnotify":
      return createMnotifyProvider(creds)
    case "custom_http":
      return createCustomHttpSmsProvider(creds)
    default:
      return null
  }
}

const envCache = new Map<MessageChannel, MessagingProvider>()

function envProvider(channel: MessageChannel): MessagingProvider {
  const cached = envCache.get(channel)
  if (cached) return cached
  const selected = process.env[ENV_KEYS[channel]] ?? "mock"
  let provider: MessagingProvider | null = channel === "sms" && selected !== "custom_http" ? smsAdapter(selected) : null
  if (!provider) {
    provider = createMockMessagingProvider(`mock-${channel}`)
    if (selected !== "mock") console.warn(`[integrations] ${ENV_KEYS[channel]}=${selected} not implemented; using mock`)
  }
  envCache.set(channel, provider)
  return provider
}

/** SMS goes through whichever provider is active at send time (admin choice, else env). */
const smsRouter: MessagingProvider = {
  name: "sms",
  async send(input) {
    const cfg = await activeProvider("sms")
    const adapter = (cfg && smsAdapter(cfg.provider, cfg.creds)) || envProvider("sms")
    return adapter.send(input)
  },
  parseStatusWebhook: (req) => envProvider("sms").parseStatusWebhook(req),
  parseInboundWebhook: (req) => envProvider("sms").parseInboundWebhook(req),
}

export function messagingProvider(channel: MessageChannel): MessagingProvider {
  return channel === "sms" ? smsRouter : envProvider(channel)
}

/** True when SMS will really be delivered (an admin-chosen provider, or an env provider). */
export async function smsDeliveryLive(): Promise<boolean> {
  if (await activeProvider("sms")) return true
  const p = process.env.MESSAGING_SMS_PROVIDER
  return p === "arkesel" || p === "hubtel" || p === "mnotify"
}
