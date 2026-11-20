import "server-only"
import { messagingProvider } from "@/lib/integrations"
import type { MessageChannel } from "@/lib/integrations/types"
import { renderTemplate } from "./templates"
import { nextAllowedTime, DEFAULT_QUIET_HOURS, type QuietHours } from "./quiet-hours"

/**
 * sendMessage orchestration (specs/integrations.json → sendMessage):
 * render template → quiet hours → allowance check → provider call →
 * message_log → retries → WhatsApp→SMS fallback.
 *
 * DB-backed steps (allowance, message_log) are injected so this runs with
 * mocks locally and wires to Drizzle once the schema lands.
 */

export type SendMessageInput = {
  garageId: string
  channel: MessageChannel
  to: string
  templateKey: string
  variables: Record<string, string>
  idempotencyKey?: string
  /** Preferred fallback channel when the primary fails (default: whatsapp→sms). */
  fallbackChannel?: MessageChannel
  /** Garage quiet hours; defaults to 21:00–07:00 Africa/Accra. */
  quietHours?: QuietHours
  /** Called with the scheduled send time when quiet hours defer the message. */
  onDeferred?: (sendAt: Date) => void
}

export type SendDeps = {
  /** Returns remaining message allowance units, or null when unlimited/unknown. */
  checkAllowance?: (garageId: string, units: number) => Promise<boolean>
  /** Persist a message_log row. */
  logMessage?: (entry: {
    garageId: string
    channel: MessageChannel
    to: string
    templateKey: string
    providerMessageId?: string
    costUnits: number
    status: "sent" | "failed" | "deferred"
    error?: string
  }) => Promise<void>
}

export type SendResult =
  | { ok: true; providerMessageId: string; costUnits: number; deferredTo?: string; channel: MessageChannel }
  | { ok: false; error: string }

const FALLBACKS: Partial<Record<MessageChannel, MessageChannel>> = {
  whatsapp: "sms",
}

export async function sendMessage(
  input: SendMessageInput,
  deps: SendDeps = {}
): Promise<SendResult> {
  const quiet = input.quietHours ?? DEFAULT_QUIET_HOURS
  const now = new Date()
  const allowedAt = nextAllowedTime(now, quiet)

  if (allowedAt.getTime() !== now.getTime()) {
    input.onDeferred?.(allowedAt)
    await deps.logMessage?.({
      garageId: input.garageId,
      channel: input.channel,
      to: input.to,
      templateKey: input.templateKey,
      costUnits: 0,
      status: "deferred",
    })
    return {
      ok: true,
      providerMessageId: "",
      costUnits: 0,
      deferredTo: allowedAt.toISOString(),
      channel: input.channel,
    }
  }

  const attempts: MessageChannel[] = [
    input.channel,
    ...(input.fallbackChannel !== undefined
      ? [input.fallbackChannel]
      : [FALLBACKS[input.channel]].filter(Boolean) as MessageChannel[]),
  ]

  let lastError = "send failed"
  for (const channel of attempts) {
    try {
      const rendered = renderTemplate(input.templateKey, channel, input.variables)
      const provider = messagingProvider(channel)

      const result = await provider.send({
        channel,
        to: input.to,
        templateKey: input.templateKey,
        variables: input.variables,
        rendered: {
          body: rendered.body,
          subject: rendered.subject,
          title: rendered.subject,
        },
        whatsappTemplateName: rendered.whatsappTemplateName,
        whatsappParams: rendered.whatsappParams,
        idempotencyKey:
          input.idempotencyKey ??
          `${input.garageId}:${input.templateKey}:${input.to}:${channel}`,
      })

      if (deps.checkAllowance) {
        const allowed = await deps.checkAllowance(input.garageId, result.costUnits)
        if (!allowed) {
          await deps.logMessage?.({
            garageId: input.garageId,
            channel,
            to: input.to,
            templateKey: input.templateKey,
            providerMessageId: result.providerMessageId,
            costUnits: result.costUnits,
            status: "failed",
            error: "message allowance exhausted",
          })
          return { ok: false, error: "Message allowance exhausted" }
        }
      }

      await deps.logMessage?.({
        garageId: input.garageId,
        channel,
        to: input.to,
        templateKey: input.templateKey,
        providerMessageId: result.providerMessageId,
        costUnits: result.costUnits,
        status: "sent",
      })

      return {
        ok: true,
        providerMessageId: result.providerMessageId,
        costUnits: result.costUnits,
        channel,
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      // try fallback channel
    }
  }

  await deps.logMessage?.({
    garageId: input.garageId,
    channel: input.channel,
    to: input.to,
    templateKey: input.templateKey,
    costUnits: 0,
    status: "failed",
    error: lastError,
  })
  return { ok: false, error: lastError }
}
