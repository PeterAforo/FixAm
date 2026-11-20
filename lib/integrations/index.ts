import "server-only"
import type { MessagingProvider, MessageChannel } from "./types"
import { createMockMessagingProvider } from "./messaging/mock"

/**
 * Provider selection via env (specs/integrations.json):
 *   MESSAGING_SMS_PROVIDER / MESSAGING_WHATSAPP_PROVIDER /
 *   MESSAGING_EMAIL_PROVIDER / MESSAGING_PUSH_PROVIDER
 * Each accepts 'mock' (default) plus provider names implemented later.
 */

const ENV_KEYS: Record<MessageChannel, string> = {
  sms: "MESSAGING_SMS_PROVIDER",
  whatsapp: "MESSAGING_WHATSAPP_PROVIDER",
  email: "MESSAGING_EMAIL_PROVIDER",
  push: "MESSAGING_PUSH_PROVIDER",
}

const cache = new Map<MessageChannel, MessagingProvider>()

export function messagingProvider(channel: MessageChannel): MessagingProvider {
  const cached = cache.get(channel)
  if (cached) return cached

  const selected = process.env[ENV_KEYS[channel]] ?? "mock"
  let provider: MessagingProvider

  switch (selected) {
    case "mock":
    default:
      // Until real adapters land, every channel resolves to the mock.
      provider = createMockMessagingProvider(`mock-${channel}`)
      if (selected !== "mock") {
        console.warn(`[integrations] ${ENV_KEYS[channel]}=${selected} not implemented; using mock`)
      }
  }

  cache.set(channel, provider)
  return provider
}
