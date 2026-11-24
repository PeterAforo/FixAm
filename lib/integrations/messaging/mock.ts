import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type {
  InboundMessage,
  MessageSendInput,
  MessageSendResult,
  MessagingProvider,
  StatusWebhookEvent,
} from "../types"

/**
 * Mock messaging provider — captures every send into a dev inbox readable
 * at /dev/messages. Backed by .dev-inbox/messages.json so it survives HMR.
 */

export type MockMessage = {
  id: string
  at: string
  channel: MessageSendInput["channel"]
  provider: string
  to: string
  templateKey: string
  subject?: string
  body: string
  costUnits: number
  idempotencyKey: string
  status: "sent" | "delivered" | "failed"
}

const INBOX_PATH = path.join(process.cwd(), ".dev-inbox", "messages.json")
const seen = new Set<string>()

const memoryInbox: MockMessage[] = []

async function readDisk(): Promise<MockMessage[]> {
  try {
    return JSON.parse(await readFile(INBOX_PATH, "utf8")) as MockMessage[]
  } catch {
    return []
  }
}

async function readInbox(): Promise<MockMessage[]> {
  const seen = new Set<string>()
  return [...(await readDisk()), ...memoryInbox].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
}

async function appendToInbox(msg: MockMessage) {
  memoryInbox.push(msg)
  try {
    await mkdir(path.dirname(INBOX_PATH), { recursive: true })
    await writeFile(INBOX_PATH, JSON.stringify([...(await readDisk()), msg], null, 2))
  } catch {
    // Read-only filesystem (e.g. Vercel) — keep the message in memory only.
  }
}

export async function listMockMessages(): Promise<MockMessage[]> {
  return readInbox()
}

export function createMockMessagingProvider(providerName: string): MessagingProvider {
  return {
    name: providerName,

    async send(input: MessageSendInput): Promise<MessageSendResult> {
      // Idempotent: same key returns the original result.
      if (seen.has(input.idempotencyKey)) {
        const existing = (await readInbox()).find(
          (m) => m.idempotencyKey === input.idempotencyKey
        )
        return {
          providerMessageId: existing?.id ?? input.idempotencyKey,
          costUnits: existing?.costUnits ?? estimateCost(input),
        }
      }
      seen.add(input.idempotencyKey)

      const costUnits = estimateCost(input)
      const id = `mock_${randomUUID()}`
      await appendToInbox({
        id,
        at: new Date().toISOString(),
        channel: input.channel,
        provider: providerName,
        to: input.to,
        templateKey: input.templateKey,
        subject: input.rendered.subject,
        body: input.rendered.body,
        costUnits,
        idempotencyKey: input.idempotencyKey,
        status: "sent",
      })
      return { providerMessageId: id, costUnits }
    },

    async parseStatusWebhook(): Promise<StatusWebhookEvent[]> {
      return []
    },

    async parseInboundWebhook(): Promise<InboundMessage[]> {
      return []
    },
  }
}

/** Rough GSM-7 segment cost for mock accounting. */
function estimateCost(input: MessageSendInput): number {
  if (input.channel === "email" || input.channel === "push") return 0
  const len = input.rendered.body.length
  if (input.channel === "sms") return Math.max(1, Math.ceil(len / 160))
  return 1 // whatsapp counts as 1 unit
}
