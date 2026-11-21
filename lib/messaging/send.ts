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

// ---------------------------------------------------------------------------
// DB-backed default deps — allowance meter + message_log, used when the caller
// doesn't inject mocks. Keeps sendMessage pure for tests.
// ---------------------------------------------------------------------------

let dbDepsPromise: Promise<SendDeps> | null = null

function categoryFor(templateKey: string): "transactional" | "reminder" | "otp" | "marketing" | "staff" {
  if (templateKey === "otp") return "otp"
  if (templateKey === "staff_invite") return "staff"
  if (/due|remind|nudge|confirm|oil|insurance|roadworthy|registration|licence|instalment|credit|booking/.test(templateKey)) return "reminder"
  if (/promo|offer|marketing/.test(templateKey)) return "marketing"
  return "transactional"
}

function dbDeps(): Promise<SendDeps> {
  dbDepsPromise ??= (async () => {
    const { and, eq, sql } = await import("drizzle-orm")
    const { db } = await import("@/lib/db")
    const { messageLogs, messageUsage, plans, subscriptions } = await import("@/lib/db/schema")

    const periodStart = () => new Date().toISOString().slice(0, 8) + "01"

    async function ensureUsageRow(garageId: string) {
      const ps = periodStart()
      const [u] = await db().select().from(messageUsage)
        .where(and(eq(messageUsage.garageId, garageId), eq(messageUsage.periodStart, ps))).limit(1)
      if (u) return u
      const [sub] = await db().select({ allowance: plans.messageAllowance })
        .from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.garageId, garageId)).limit(1)
      const allowance = sub?.allowance ?? 0
      const [created] = await db().insert(messageUsage)
        .values({ garageId, periodStart: ps, allowance, usedUnits: 0 })
        .onConflictDoNothing()
        .returning()
      if (created) return created
      const [again] = await db().select().from(messageUsage)
        .where(and(eq(messageUsage.garageId, garageId), eq(messageUsage.periodStart, ps))).limit(1)
      return again ?? null
    }

    return {
      async checkAllowance(garageId, units) {
        const u = await ensureUsageRow(garageId)
        if (!u) return true // no plan row → don't block
        return (u.usedUnits ?? 0) + units <= (u.allowance ?? 0) + (u.addonUnits ?? 0)
      },
      async logMessage(entry) {
        const statusMap = { sent: "sent", failed: "failed", deferred: "queued" } as const
        await db().insert(messageLogs).values({
          garageId: entry.garageId,
          channel: entry.channel,
          category: categoryFor(entry.templateKey),
          templateKey: entry.templateKey,
          to: entry.to,
          status: statusMap[entry.status],
          providerMessageId: entry.providerMessageId ?? null,
          costUnits: entry.costUnits,
        })
        if (entry.status === "sent") {
          const ps = periodStart()
          await db().update(messageUsage)
            .set({ usedUnits: sql`${messageUsage.usedUnits} + ${entry.costUnits || 1}`, updatedAt: new Date() })
            .where(and(eq(messageUsage.garageId, entry.garageId), eq(messageUsage.periodStart, ps)))
        }
      },
    }
  })()
  return dbDepsPromise
}

export async function sendMessage(
  input: SendMessageInput,
  deps: SendDeps = {}
): Promise<SendResult> {
  if (!deps.checkAllowance && !deps.logMessage) deps = await dbDeps()
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
