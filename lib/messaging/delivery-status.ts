import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { messageLogs, messageSends } from "@/lib/db/schema"

/**
 * Apply a provider delivery-status webhook to message_sends + message_logs.
 * Normalizes provider status strings to the message_status enum.
 */
export async function applyDeliveryStatus(
  providerMessageId: string,
  rawStatus: string
): Promise<{ matched: boolean }> {
  if (!providerMessageId) return { matched: false }
  const status = normalizeStatus(rawStatus)
  if (!status) return { matched: false }

  const now = new Date()
  const patch: Record<string, unknown> = { status }
  if (status === "delivered") patch.deliveredAt = now
  if (status === "read") { patch.deliveredAt = now; patch.readAt = now }
  if (status === "clicked") { patch.deliveredAt = now; patch.clickedAt = now }
  if (status === "failed") patch.failedReason = rawStatus

  const updated = await db().update(messageSends)
    .set(patch as never)
    .where(and(eq(messageSends.providerMessageId, providerMessageId), eq(messageSends.status, "sent")))
    .returning({ id: messageSends.id })
  if (updated.length === 0) {
    // allow failed/read even when not currently 'sent' (e.g. mock marks sent)
    await db().update(messageSends).set(patch as never)
      .where(eq(messageSends.providerMessageId, providerMessageId))
      .returning({ id: messageSends.id })
  }

  await db().update(messageLogs).set({ status: status as never })
    .where(eq(messageLogs.providerMessageId, providerMessageId))

  return { matched: true }
}

function normalizeStatus(raw: string): "delivered" | "read" | "clicked" | "failed" | null {
  const s = raw.toLowerCase()
  if (["delivered", "delivery", "dlv", "success"].includes(s)) return "delivered"
  if (["read", "seen"].includes(s)) return "read"
  if (["clicked", "click"].includes(s)) return "clicked"
  if (["failed", "fail", "undelivered", "rejected", "error"].includes(s)) return "failed"
  return null
}
