import "server-only"
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  customers,
  dueItems,
  garages,
  messageSends,
  messageUsage,
  memberships,
  notifications,
  vehicles,
} from "@/lib/db/schema"
import {
  allowedChannels,
  batchBucket,
  channelOrder,
  effectiveDueDate,
  escalationFor,
  type DueItemType,
} from "@/lib/domain/reminders"
import { sendMessage } from "@/lib/messaging/send"
import { uuidv7 } from "@/lib/id"
import { createHash, randomBytes } from "crypto"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

const OPEN_STATUSES = ["scheduled", "due_soon", "due", "overdue"] as const

async function currentPeriodUsage(garageId: string) {
  const periodStart = new Date().toISOString().slice(0, 8) + "01"
  const [row] = await db().select().from(messageUsage)
    .where(and(eq(messageUsage.garageId, garageId), eq(messageUsage.periodStart, periodStart))).limit(1)
  return row ?? null
}

async function overAllowance(garageId: string): Promise<boolean> {
  const u = await currentPeriodUsage(garageId)
  if (!u) return false
  return (u.usedUnits ?? 0) >= (u.allowance + (u.addonUnits ?? 0))
}

async function notifyOwnerOnce(garageId: string, title: string, body: string) {
  const u = await currentPeriodUsage(garageId)
  if (!u || u.alert100SentAt) return
  const managers = await db().select({ userId: memberships.userId }).from(memberships)
    .where(and(eq(memberships.garageId, garageId), inArray(memberships.role, ["owner", "manager"]), eq(memberships.status, "active")))
  for (const m of managers) {
    if (!m.userId) continue
    await db().insert(notifications).values({
      garageId, userId: m.userId, kind: "system", title, body,
      link: `/g/${garageId}/settings`,
    }).catch(() => {})
  }
  await db().update(messageUsage).set({ alert100SentAt: new Date(), updatedAt: new Date() })
    .where(eq(messageUsage.id, u.id))
}

export type DueRow = typeof dueItems.$inferSelect & {
  customerPhone: string | null
  customerName: string | null
  customerEmail: string | null
  preferredChannels: string[] | null
  plate: string | null
  make: string | null
  model: string | null
  kmPerDayConfidence: string | null
  kmPerDay: string | null
  lastOdometerAt: Date | null
  lastOdometerKm: number | null
  vehicleUsage: string | null
}

export async function loadDueCandidates(): Promise<DueRow[]> {
  const now = new Date()
  return db()
    .select({
      item: dueItems,
      customerPhone: customers.phone,
      customerName: customers.fullName,
      customerEmail: customers.email,
      preferredChannels: customers.preferredChannels,
      plate: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      kmPerDayConfidence: vehicles.kmPerDayConfidence,
      kmPerDay: vehicles.kmPerDay,
      lastOdometerAt: vehicles.lastOdometerAt,
      lastOdometerKm: vehicles.lastOdometerKm,
      vehicleUsage: vehicles.usage,
    })
    .from(dueItems)
    .innerJoin(customers, eq(dueItems.customerId, customers.id))
    .innerJoin(vehicles, eq(dueItems.vehicleId, vehicles.id))
    .where(and(
      inArray(dueItems.status, [...OPEN_STATUSES]),
      or(isNull(dueItems.nextReminderAt), lte(dueItems.nextReminderAt, now)),
      sql`${customers.deletedAt} IS NULL`,
      // pause reminders while a renewal request is open for the item
      sql`NOT EXISTS (
        SELECT 1 FROM renewal_requests rr
        WHERE rr.due_item_id = ${dueItems.id}
          AND rr.status NOT IN ('completed','cancelled','failed')
      )`,
    ))
    .then((rows) => rows.map((r) => ({
      ...r.item,
      customerPhone: r.customerPhone, customerName: r.customerName,
      customerEmail: r.customerEmail, preferredChannels: r.preferredChannels,
      plate: r.plate, make: r.make, model: r.model,
      kmPerDayConfidence: r.kmPerDayConfidence, kmPerDay: r.kmPerDay,
      lastOdometerAt: r.lastOdometerAt,
      lastOdometerKm: r.lastOdometerKm, vehicleUsage: r.vehicleUsage,
    })))
}

const MILEAGE_BASED = new Set<DueItemType>(["oil_change", "general_service", "custom"])

/** Spec: low-confidence + mileage-based item → send mileage_confirm before
 *  the normal due-soon reminder, once per due item. */
async function needsMileageConfirm(r: DueRow): Promise<boolean> {
  if (!MILEAGE_BASED.has(r.type as DueItemType)) return false
  if (r.dueMileageKm == null) return false
  if (r.kmPerDayConfidence !== "low") return false
  const prior = await db().select({ id: messageSends.id }).from(messageSends).where(and(
    eq(messageSends.garageId, r.garageId),
    eq(messageSends.templateKey, "mileage_confirm"),
    sql`${messageSends.dueItemIds} @> ARRAY[${r.id}]::uuid[]`,
  )).limit(1)
  return !prior[0]
}

function templateVars(r: DueRow, garageName: string, actionUrl: string): Record<string, string> {
  return {
    customer_first_name: (r.customerName ?? "").split(" ")[0] || "there",
    customer_name: r.customerName ?? "",
    garage_name: garageName,
    vehicle: [r.make, r.model, r.plate].filter(Boolean).join(" "),
    plate: r.plate ?? "",
    due_title: r.title,
    items_list: r.title,
    due_date: r.effectiveDueDate ?? "",
    action_url: actionUrl,
    reminder_link: actionUrl,
    action_link: actionUrl,
    predicted_km: predictedKm(r),
  }
}

/** Approx current odometer for mileage templates (≈ X km). */
function predictedKm(r: DueRow): string {
  if (r.lastOdometerKm == null) return ""
  const rate = r.kmPerDay != null ? Number(r.kmPerDay) : 0
  const days = r.lastOdometerAt ? Math.max(0, (Date.now() - r.lastOdometerAt.getTime()) / 86_400_000) : 0
  return String(Math.round(r.lastOdometerKm + rate * days))
}

/**
 * Send batched reminders for a set of due rows (shared by the hourly scan
 * and the manual-send action). Groups by customer+7-day bucket → one
 * messageSends row and one outbound message per batch.
 */
export async function sendForDueRows(rows: DueRow[], garageNameById?: Map<string, string>) {
  const now = new Date()
  const batches = new Map<string, DueRow[]>()
  for (const r of rows) {
    const eff = effectiveDueDate(r) ?? r.effectiveDueDate
    const key = `${r.garageId}:${r.customerId}:${batchBucket(eff, now.toISOString())}`
    batches.set(key, [...(batches.get(key) ?? []), r])
  }

  const results: { sent: number; failed: number; deferred: number } = { sent: 0, failed: 0, deferred: 0 }

  for (const [, items] of batches) {
    const first = items[0]!
    const garageId = first.garageId
    const [garage] = await db().select({ slug: garages.slug, name: garages.name }).from(garages).where(eq(garages.id, garageId)).limit(1)
    const garageName = garageNameById?.get(garageId) ?? garage?.name ?? "FixAm"

    // fresh action token per send — only the hash is persisted (bearer link)
    const token = randomBytes(24).toString("hex")
    const tokenHash = sha256(token)
    await db().update(dueItems).set({ actionTokenHash: tokenHash, updatedAt: now })
      .where(inArray(dueItems.id, items.map((i) => i.id)))
    const link = `${APP_URL()}/t/${token}`

    const multi = items.length > 1
    let templateKey = multi ? "combined_due" : (() => {
      const esc = escalationFor(items[0]!.type as DueItemType, effectiveDueDate(items[0]!) ?? items[0]!.effectiveDueDate, new Date())
      return esc?.templateKey ?? "custom_due"
    })()

    // low-confidence vehicles: first reminder asks for a mileage reading first
    if (!multi && (await needsMileageConfirm(first))) templateKey = "mileage_confirm"

    const over = await overAllowance(garageId)
    if (over) {
      await notifyOwnerOnce(garageId, "Message allowance reached", "SMS/WhatsApp reminders are paused until next billing period; push and email still send.")
    }
    const order = allowedChannels(channelOrder(first.preferredChannels as string[] | null), over)

    // pick first channel with a reachable address
    const channel = order.find((c) => {
      if (c === "email") return !!first.customerEmail
      return !!first.customerPhone // whatsapp/sms/push all route via phone in mock
    }) ?? null

    const sendId = uuidv7()
    const to = channel === "email" ? (first.customerEmail ?? "") : (first.customerPhone ?? "")

    if (!channel || !to) {
      await db().insert(messageSends).values({
        id: sendId, garageId, customerId: first.customerId,
        dueItemIds: items.map((i) => i.id), channel: channel ?? "sms",
        templateKey, renderedBody: "", status: "failed", failedReason: "no reachable channel",
      })
      results.failed++
      continue
    }

    const itemList = items.map((i) => i.title).join(", ")
    const variables: Record<string, string> = multi
      ? {
          customer_first_name: (first.customerName ?? "").split(" ")[0] || "there",
          customer_name: first.customerName ?? "",
          garage_name: garageName,
          plate: first.plate ?? "",
          vehicle: [first.make, first.model, first.plate].filter(Boolean).join(" "),
          items_list: itemList,
          due_items: items.map((i) => `• ${i.title} (${i.effectiveDueDate ?? "soon"})`).join("\n"),
          due_title: itemList,
          due_date: items.map((i) => i.effectiveDueDate).filter(Boolean).sort()[0] ?? "",
          action_url: link,
          action_link: link,
          reminder_link: link,
        }
      : templateVars(first, garageName, link)

    const res = await sendMessage({
      garageId, channel: channel as never, to, templateKey,
      variables,
      idempotencyKey: `reminder:${sendId}`,
      fallbackChannel: channel === "whatsapp" ? "sms" : undefined,
    }).catch((e) => ({ ok: false as const, error: String(e) }))

    const deferredTo = res.ok && "deferredTo" in res && res.deferredTo ? new Date(res.deferredTo) : null
    await db().insert(messageSends).values({
      id: sendId, garageId, customerId: first.customerId,
      dueItemIds: items.map((i) => i.id), channel: channel as never,
      templateKey,
      renderedBody: multi ? variables.due_items : `${templateKey} → ${first.title}`,
      status: !res.ok ? "failed" : deferredTo ? "suppressed_quiet_hours" : "sent",
      providerMessageId: res.ok ? res.providerMessageId : null,
      sentAt: res.ok && !deferredTo ? new Date() : null,
      failedReason: res.ok ? null : res.error,
    })
    if (!res.ok) results.failed++
    else if (deferredTo) { results.deferred++; for (const i of items) await db().update(dueItems).set({ nextReminderAt: deferredTo }).where(eq(dueItems.id, i.id)) }
    else results.sent++
  }

  return results
}

/** Hourly scan: advance escalation state, then send due reminders. */
export async function runReminderScan(now = new Date()) {
  const candidates = await loadDueCandidates()
  const garageNames = new Map<string, string>()
  if (candidates.length) {
    const gs = await db().select({ id: garages.id, name: garages.name }).from(garages)
    for (const g of gs) garageNames.set(g.id, g.name)
  }
  const dueForSend: DueRow[] = []

  for (const row of candidates) {
    const eff = effectiveDueDate(row) ?? row.effectiveDueDate
    const esc = escalationFor(row.type as DueItemType, eff, now)
    if (!esc) continue

    const prevStage = row.escalationStage
    const stageAdvanced = esc.stage > prevStage

    // advance persisted state (status, stage, next reminder time)
    if (esc.status !== row.status || esc.stage !== prevStage || (esc.nextReminderAt?.getTime() ?? null) !== (row.nextReminderAt?.getTime() ?? null)) {
      await db().update(dueItems).set({
        status: esc.status as never,
        escalationStage: esc.stage,
        nextReminderAt: esc.nextReminderAt,
        updatedAt: now,
      }).where(eq(dueItems.id, row.id))
    }

    // Fresh items (never scheduled) establish their baseline stage without
    // firing — thresholds already crossed at creation are consumed silently,
    // so e.g. a policy saved 20 days out schedules the 14-day reminder next.
    const freshBaseline =
      prevStage === 0 && row.nextReminderAt == null &&
      (esc.status === "scheduled" || esc.status === "due_soon")

    // a reminder fires exactly when the escalation stage advances
    if (stageAdvanced && !freshBaseline && row.customerPhone) {
      dueForSend.push(row)
    }
  }

  const sent = await sendForDueRows(dueForSend, garageNames)

  // WhatsApp → SMS fallback sweep: whatsapp 'sent' older than 15min, not delivered → resend sms
  const stale = await db().select().from(messageSends).where(and(
    eq(messageSends.channel, "whatsapp"), eq(messageSends.status, "sent"),
    lt(messageSends.sentAt, new Date(now.getTime() - 15 * 60_000)),
    sql`${messageSends.deliveredAt} IS NULL`,
  )).limit(50)
  for (const s of stale) {
    const [cust] = s.customerId
      ? await db().select({ phone: customers.phone }).from(customers).where(eq(customers.id, s.customerId)).limit(1)
      : []
    if (!cust?.phone) continue
    const res = await sendMessage({
      garageId: s.garageId, channel: "sms", to: cust.phone,
      templateKey: s.templateKey,
      variables: { customer_first_name: "there", garage_name: "FixAm", action_url: "", reminder_link: "" },
      idempotencyKey: `reminder-fallback:${s.id}`,
    }).catch(() => null)
    await db().update(messageSends).set({
      channel: "sms",
      status: res?.ok ? "sent" : "failed",
      sentAt: res?.ok ? new Date() : null,
      failedReason: res?.ok ? null : "whatsapp fallback",
    }).where(eq(messageSends.id, s.id))
  }

  return { scanned: candidates.length, ...sent, whatsappFallbacks: stale.length }
}

/** Mark a due item completed/dismissed (manual + action pages). */
export async function closeDueItem(dueItemId: string, outcome: "completed" | "dismissed", reason?: string) {
  await db().update(dueItems).set({
    status: outcome, completedAt: outcome === "completed" ? new Date() : null,
    dismissedReason: reason ?? null, nextReminderAt: null, updatedAt: new Date(),
  }).where(eq(dueItems.id, dueItemId))
}

// ---------------------------------------------------------------------------
// Mileage nudge (spec: daily 10:00 Africa/Accra, max 1 per 90 days per item)
// ---------------------------------------------------------------------------

const NUDGE_TYPES = ["oil_change", "general_service", "custom"] as const
const NUDGE_STALE_DAYS = 45
const NUDGE_MAX_PER_90D = 90 * 86_400_000

export async function runMileageNudge(now = new Date()) {
  const staleBefore = new Date(now.getTime() - NUDGE_STALE_DAYS * 86_400_000)
  const nudgeWindowStart = new Date(now.getTime() - NUDGE_MAX_PER_90D)

  const rows = await db()
    .select({
      item: dueItems,
      customerPhone: customers.phone,
      customerName: customers.fullName,
      customerEmail: customers.email,
      preferredChannels: customers.preferredChannels,
      plate: vehicles.plateNumber,
      make: vehicles.make,
      model: vehicles.model,
      kmPerDay: vehicles.kmPerDay,
      lastOdometerAt: vehicles.lastOdometerAt,
      lastOdometerKm: vehicles.lastOdometerKm,
    })
    .from(dueItems)
    .innerJoin(customers, eq(dueItems.customerId, customers.id))
    .innerJoin(vehicles, eq(dueItems.vehicleId, vehicles.id))
    .where(and(
      inArray(dueItems.type, [...NUDGE_TYPES]),
      sql`${dueItems.dueMileageKm} IS NOT NULL`,
      inArray(dueItems.status, [...OPEN_STATUSES]),
      sql`(${vehicles.lastOdometerAt} IS NULL OR ${vehicles.lastOdometerAt} < ${staleBefore})`,
      sql`${customers.deletedAt} IS NULL`,
    ))

  // exclude items nudged in the last 90 days
  const recentNudges = await db().select({ dueItemIds: messageSends.dueItemIds }).from(messageSends)
    .where(and(eq(messageSends.templateKey, "mileage_nudge"), sql`${messageSends.createdAt} > ${nudgeWindowStart}`))
  const nudged = new Set(recentNudges.flatMap((n) => n.dueItemIds ?? []))
  const eligible = rows.filter((r) => !nudged.has(r.item.id))
  if (!eligible.length) return { scanned: rows.length, sent: 0 }

  const garageIds = [...new Set(eligible.map((r) => r.item.garageId))]
  const gs = await db().select({ id: garages.id, name: garages.name, slug: garages.slug }).from(garages)
    .where(inArray(garages.id, garageIds))
  const garageById = new Map(gs.map((g) => [g.id, g]))

  let sent = 0
  for (const r of eligible) {
    const garage = garageById.get(r.item.garageId)
    if (!garage || !r.customerPhone) continue
    const over = await overAllowance(r.item.garageId)
    const order = allowedChannels(channelOrder(r.preferredChannels as string[] | null), over)
    const channel = order.find((c) => c === "email" ? !!r.customerEmail : !!r.customerPhone) ?? null
    if (!channel) continue

    const sendId = uuidv7()
    const token = randomBytes(24).toString("hex")
    await db().update(dueItems).set({ actionTokenHash: sha256(token), updatedAt: now })
      .where(eq(dueItems.id, r.item.id))
    const link = `${APP_URL()}/t/${token}`
    const rate = r.kmPerDay != null ? Number(r.kmPerDay) : 0
    const days = r.lastOdometerAt ? Math.max(0, (now.getTime() - r.lastOdometerAt.getTime()) / 86_400_000) : 0
    const predictedKm = r.lastOdometerKm != null ? Math.round(r.lastOdometerKm + rate * days) : null

    const res = await sendMessage({
      garageId: r.item.garageId, channel: channel as never,
      to: channel === "email" ? (r.customerEmail ?? "") : r.customerPhone,
      templateKey: "mileage_nudge",
      variables: {
        customer_first_name: (r.customerName ?? "").split(" ")[0] || "there",
        garage_name: garage.name,
        plate: r.plate ?? "",
        predicted_km: predictedKm != null ? predictedKm.toLocaleString("en-GH") : "",
        action_url: link, reminder_link: link, action_link: link,
        due_title: r.item.title, due_date: r.item.effectiveDueDate ?? "",
      },
      idempotencyKey: `nudge:${sendId}`,
      fallbackChannel: channel === "whatsapp" ? "sms" : undefined,
    }).catch(() => null)

    await db().insert(messageSends).values({
      id: sendId, garageId: r.item.garageId, customerId: r.item.customerId,
      dueItemIds: [r.item.id], channel: channel as never,
      templateKey: "mileage_nudge", renderedBody: "mileage_nudge",
      status: res?.ok ? ("deferredTo" in res && res.deferredTo ? "suppressed_quiet_hours" : "sent") : "failed",
      providerMessageId: res?.ok ? res.providerMessageId : null,
      sentAt: res?.ok && !("deferredTo" in res && res.deferredTo) ? now : null,
      failedReason: res?.ok ? null : "send failed",
    })
    if (res?.ok) sent++
  }
  return { scanned: rows.length, sent }
}
