"use server"

import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings, whatsappConversations } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { resolveMembership, writeAuditLog, type ActionResult } from "@/lib/actions"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { rateLimit } from "@/lib/rate-limit"
import { sendWaReply, getThread, listInbox, totalUnread } from "./service"

async function requireInbox(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  const principal = { kind: "staff" as const, role: m.role as StaffRole, garageId, branchId: m.branchId }
  if (!can(principal, "whatsapp.inbox")) return null
  return { membership: m, principal }
}

const gid = z.string().uuid()

export async function inboxThreads(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return []
  const parsed = z.object({ garageId: gid }).safeParse(raw)
  if (!parsed.success) return []
  if (!(await requireInbox(userId, parsed.data.garageId))) return []
  return listInbox(parsed.data.garageId)
}

export async function inboxUnread(raw: unknown): Promise<number> {
  const userId = await getSessionUserId()
  if (!userId) return 0
  const parsed = z.object({ garageId: gid }).safeParse(raw)
  if (!parsed.success) return 0
  if (!(await requireInbox(userId, parsed.data.garageId))) return 0
  return totalUnread(parsed.data.garageId)
}

export async function inboxThread(raw: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const parsed = z.object({ garageId: gid, conversationId: gid }).safeParse(raw)
  if (!parsed.success) return null
  if (!(await requireInbox(userId, parsed.data.garageId))) return null
  return getThread(parsed.data.garageId, parsed.data.conversationId, userId)
}

/** Staff takes over — pauses the AI for this conversation. */
export async function takeOverConversation(raw: unknown): Promise<ActionResult<{ mode: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: gid, conversationId: gid }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireInbox(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const [conv] = await db().select().from(whatsappConversations)
    .where(and(eq(whatsappConversations.id, parsed.data.conversationId), eq(whatsappConversations.garageId, parsed.data.garageId))).limit(1)
  if (!conv) return { ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }
  await db().update(whatsappConversations)
    .set({ mode: "human", assignedUserId: userId, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, conv.id))
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: userId, action: "whatsapp.takeover", entityType: "whatsapp_conversation", entityId: conv.id }).catch(() => undefined)
  return { ok: true, data: { mode: "human" } }
}

/** Hand the conversation back to the AI assistant. */
export async function handBackToAi(raw: unknown): Promise<ActionResult<{ mode: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: gid, conversationId: gid }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireInbox(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const [conv] = await db().select().from(whatsappConversations)
    .where(and(eq(whatsappConversations.id, parsed.data.conversationId), eq(whatsappConversations.garageId, parsed.data.garageId))).limit(1)
  if (!conv) return { ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }
  await db().update(whatsappConversations)
    .set({ mode: "ai", assignedUserId: null, updatedAt: new Date() })
    .where(eq(whatsappConversations.id, conv.id))
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: userId, action: "whatsapp.handback", entityType: "whatsapp_conversation", entityId: conv.id }).catch(() => undefined)
  return { ok: true, data: { mode: "ai" } }
}

/** Staff reply — goes out over WhatsApp (template outside the 24 h window). */
export async function staffReply(raw: unknown): Promise<ActionResult<{ sent: boolean }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: gid, conversationId: gid, body: z.string().trim().min(1).max(2000) }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Type a message first" } }
  const ctx = await requireInbox(userId, parsed.data.garageId)
  if (!ctx) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const rl = await rateLimit(`wa-reply:${userId}`, 60, 3600)
  if (!rl.ok) return { ok: false, error: { code: "INTERNAL", message: "Slow down a little" } }
  const [conv] = await db().select().from(whatsappConversations)
    .where(and(eq(whatsappConversations.id, parsed.data.conversationId), eq(whatsappConversations.garageId, parsed.data.garageId))).limit(1)
  if (!conv) return { ok: false, error: { code: "NOT_FOUND", message: "Conversation not found" } }
  const res = await sendWaReply(conv, parsed.data.body, { sentByUserId: userId })
  if (!res.ok) return { ok: false, error: { code: "INTERNAL", message: res.error ?? "Couldn't send" } }
  return { ok: true, data: { sent: true } }
}

/** P8-19 settings: garage WhatsApp number + AI toggle (owner/manager only). */
export async function saveWhatsAppSettings(raw: unknown): Promise<ActionResult<{ saved: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: gid,
    whatsappNumber: z.string().trim().max(20).optional(),
    whatsappPhoneNumberId: z.string().trim().max(40).optional(),
    whatsappAiEnabled: z.boolean().optional(),
  }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data
  const m = await resolveMembership(userId, d.garageId)
  if (!m || !can({ kind: "staff", role: m.role as StaffRole, garageId: d.garageId, branchId: m.branchId }, "garage.settings.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only owners and managers can change settings" } }
  }
  const digits = (s?: string) => {
    if (!s) return null
    const n = s.replace(/\D/g, "")
    return n.length >= 10 ? n : null
  }
  const vals: Partial<typeof garageSettings.$inferInsert> = {
    ...(d.whatsappNumber !== undefined ? { whatsappNumber: digits(d.whatsappNumber) } : {}),
    ...(d.whatsappPhoneNumberId !== undefined ? { whatsappPhoneNumberId: d.whatsappPhoneNumberId.trim() || null } : {}),
    ...(d.whatsappAiEnabled !== undefined ? { whatsappAiEnabled: d.whatsappAiEnabled } : {}),
  }
  await db().insert(garageSettings).values({ garageId: d.garageId, ...vals })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { ...vals, updatedAt: new Date() } })
  await writeAuditLog({ garageId: d.garageId, actorUserId: userId, action: "settings.whatsapp", entityType: "garage_settings", entityId: d.garageId, after: { ai: d.whatsappAiEnabled } }).catch(() => undefined)
  return { ok: true, data: { saved: true } }
}
