import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { webhookEvents } from "@/lib/db/schema"

/**
 * Webhook idempotency — insert (provider, event_id) first; a duplicate
 * means the event was already processed and must be skipped.
 * No-ops when DATABASE_URL isn't configured (local mock mode).
 */

export type WebhookRecordResult = "recorded" | "duplicate" | "unavailable"

export async function recordWebhookEvent(input: {
  provider: string
  eventId: string
  type?: string
  payload: unknown
}): Promise<WebhookRecordResult> {
  if (!process.env.DATABASE_URL) return "unavailable"

  try {
    await db().insert(webhookEvents).values({
      provider: input.provider,
      eventId: input.eventId,
      type: input.type ?? null,
      payload: input.payload as Record<string, unknown>,
    })
    return "recorded"
  } catch (e) {
    // Unique violation on (provider, event_id) → duplicate
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505") {
      return "duplicate"
    }
    throw e
  }
}

export async function markWebhookProcessed(provider: string, eventId: string) {
  if (!process.env.DATABASE_URL) return
  await db()
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)))
}

export async function markWebhookError(provider: string, eventId: string, error: string) {
  if (!process.env.DATABASE_URL) return
  await db()
    .update(webhookEvents)
    .set({ error })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)))
}
