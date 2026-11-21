"use server"
import { z } from "zod"
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  dueItems,
  messageSends,
  messageTemplates,
  vehicles,
} from "@/lib/db/schema"
import { writeAuditLog, resolveMembership, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can, type StaffRole } from "@/lib/auth/permissions"
import { effectiveDueDate, escalationFor, type DueItemType } from "@/lib/domain/reminders"
import { loadDueCandidates, sendForDueRows } from "./engine"
import { uuidv7 } from "@/lib/id"

const staffPrincipal = (role: StaffRole, garageId: string, branchId: string | null) =>
  ({ kind: "staff" as const, role, garageId, branchId })

async function requireMembership(userId: string, garageId: string) {
  const m = await resolveMembership(userId, garageId)
  if (!m) return null
  return { membership: m, principal: staffPrincipal(m.role, garageId, m.branchId) }
}

// ---------------------------------------------------------------------------
// Centre data
// ---------------------------------------------------------------------------

export async function listRemindersData(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "reminders.view")) return { ok: false as const }

  const OPEN = ["scheduled", "due_soon", "due", "overdue"] as const
  const today = new Date()

  const [dueRows, sendRows, tplRows] = await Promise.all([
    db()
      .select({
        id: dueItems.id, type: dueItems.type, title: dueItems.title, status: dueItems.status,
        escalationStage: dueItems.escalationStage, dueDate: dueItems.dueDate,
        predictedDueDate: dueItems.predictedDueDate, effectiveDueDate: dueItems.effectiveDueDate,
        dueMileageKm: dueItems.dueMileageKm, nextReminderAt: dueItems.nextReminderAt,
        customerName: customers.fullName, plate: vehicles.plateNumber,
        make: vehicles.make, model: vehicles.model,
      })
      .from(dueItems)
      .innerJoin(customers, eq(dueItems.customerId, customers.id))
      .innerJoin(vehicles, eq(dueItems.vehicleId, vehicles.id))
      .where(and(eq(dueItems.garageId, parsed.data.garageId), inArray(dueItems.status, OPEN)))
      .orderBy(dueItems.effectiveDueDate)
      .limit(300),
    db().select().from(messageSends)
      .where(eq(messageSends.garageId, parsed.data.garageId))
      .orderBy(desc(messageSends.createdAt)).limit(100),
    db().select().from(messageTemplates)
      .where(or(isNull(messageTemplates.garageId), eq(messageTemplates.garageId, parsed.data.garageId))),
  ])

  const items = dueRows.map((r) => {
    const eff = effectiveDueDate(r) ?? r.effectiveDueDate
    const esc = escalationFor(r.type as DueItemType, eff, today)
    return {
      ...r,
      effective: eff,
      daysUntil: eff ? Math.round((Date.parse(`${eff}T00:00:00Z`) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400_000) : null,
      computedStatus: esc?.status ?? r.status,
      nextReminderAt: r.nextReminderAt?.toISOString() ?? null,
    }
  }).sort((a, b) => (a.effective ?? "9999").localeCompare(b.effective ?? "9999"))

  // merge: garage override replaces the platform default per (key, channel)
  const platform = new Map<string, typeof tplRows[number]>()
  const overrides = new Map<string, typeof tplRows[number]>()
  for (const t of tplRows) {
    const k = `${t.key}|${t.channel}`
    if (t.garageId == null) platform.set(k, t)
    else overrides.set(k, t)
  }
  const keys = new Set([...platform.keys(), ...overrides.keys()])
  const templates = [...keys].map((k) => {
    const o = overrides.get(k)
    const p = platform.get(k)
    const t = o ?? p!
    return {
      id: t.id, key: t.key, channel: t.channel, subject: t.subject,
      body: t.body, isActive: t.isActive, isOverride: !!o,
      platformBody: p?.body ?? null,
    }
  })

  return {
    ok: true as const,
    data: {
      items,
      sends: sendRows.map((s) => ({
        id: s.id, channel: s.channel, templateKey: s.templateKey,
        status: s.status, renderedBody: s.renderedBody,
        dueItemCount: s.dueItemIds?.length ?? 0,
        sentAt: s.sentAt?.toISOString() ?? null,
        failedReason: s.failedReason,
        convertedBookingId: s.convertedBookingId,
        convertedRenewalId: s.convertedRenewalId,
        createdAt: s.createdAt.toISOString(),
      })),
      templates,
      canManage: can(ctx.principal, "reminders.manage"),
      canSend: can(ctx.principal, "reminders.send_manual"),
    },
  }
}

// ---------------------------------------------------------------------------
// Manual send
// ---------------------------------------------------------------------------

export async function sendReminderNow(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({ garageId: z.string().uuid(), dueItemId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "reminders.send_manual")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  const candidates = await loadDueCandidates()
  const row = candidates.find((r) => r.id === parsed.data.dueItemId)
  if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "Due item not found or already closed" } }

  await sendForDueRows([row])

  await writeAuditLog({
    garageId: parsed.data.garageId, actorUserId: userId, action: "reminders.manual_send",
    entityType: "due_item", entityId: row.id, after: { title: row.title },
  }).catch(() => {})
  return { ok: true, data: { ok: true as const } }
}

// ---------------------------------------------------------------------------
// Template overrides (garage_id set = override of platform default)
// ---------------------------------------------------------------------------

export async function listMessageTemplates(rawInput: unknown) {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false as const }
  const parsed = z.object({ garageId: z.string().uuid() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false as const }
  const ctx = await requireMembership(userId, parsed.data.garageId)
  if (!ctx || !can(ctx.principal, "reminders.view")) return { ok: false as const }

  const rows = await db().select().from(messageTemplates)
    .where(or(isNull(messageTemplates.garageId), eq(messageTemplates.garageId, parsed.data.garageId)))

  // platform default per (key,channel) + garage override replaces it
  const platform = new Map<string, typeof rows[number]>()
  const overrides = new Map<string, typeof rows[number]>()
  for (const t of rows) {
    const k = `${t.key}|${t.channel}`
    if (t.garageId == null) platform.set(k, t)
    else overrides.set(k, t)
  }
  const keys = new Set([...platform.keys(), ...overrides.keys()])
  const merged = [...keys].map((k) => {
    const o = overrides.get(k)
    const p = platform.get(k)
    const t = o ?? p!
    return { ...t, isOverride: !!o, platformBody: p?.body ?? null }
  })

  return { ok: true as const, data: merged }
}

export async function upsertMessageTemplate(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in first" } }
  const parsed = z.object({
    garageId: z.string().uuid(),
    key: z.string().min(1).max(80),
    channel: z.enum(["sms", "whatsapp", "email", "push"]),
    subject: z.string().max(200).optional(),
    body: z.string().min(1).max(2000),
    isActive: z.boolean().optional(),
    resetToDefault: z.boolean().optional(),
  }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const d = parsed.data

  const ctx = await requireMembership(userId, d.garageId)
  if (!ctx || !can(ctx.principal, "reminders.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  }

  if (d.resetToDefault) {
    await db().delete(messageTemplates).where(and(
      eq(messageTemplates.garageId, d.garageId), eq(messageTemplates.key, d.key), eq(messageTemplates.channel, d.channel as never),
    ))
    return { ok: true, data: { id: "" } }
  }

  const [existing] = await db().select({ id: messageTemplates.id }).from(messageTemplates).where(and(
    eq(messageTemplates.garageId, d.garageId), eq(messageTemplates.key, d.key), eq(messageTemplates.channel, d.channel as never),
  )).limit(1)

  const values = {
    subject: d.subject || null, body: d.body,
    isActive: d.isActive ?? true, updatedAt: new Date(),
  }
  if (existing) {
    await db().update(messageTemplates).set(values).where(eq(messageTemplates.id, existing.id))
    return { ok: true, data: { id: existing.id } }
  }
  const id = uuidv7()
  await db().insert(messageTemplates).values({
    id, garageId: d.garageId, key: d.key, channel: d.channel as never, ...values,
  })
  return { ok: true, data: { id } }
}
