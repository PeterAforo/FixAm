import "server-only"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  bookings,
  customers,
  garageSettings,
  garages,
  memberships,
  notifications,
  seasonalCampaignSends,
  seasonalCampaigns,
  vehicles,
} from "@/lib/db/schema"
import { sendMessage } from "@/lib/messaging/send"
import { isQuietHour, type QuietHours, DEFAULT_QUIET_HOURS } from "@/lib/messaging/quiet-hours"
import { normalizeGhPhone } from "@/lib/phone"
import {
  SEASON_INFO,
  checklistLine,
  earliestStart,
  eligible,
  plannedCampaigns,
  seasonalChannel,
  windowClosed,
  windowOpen,
  zoneFor,
  type SeasonKey,
} from "./core"
import { optOutUrl } from "./links"

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
const today = () => new Date().toISOString().slice(0, 10)
const MAX_ATTEMPTS = 3

function quietOf(v: unknown): QuietHours {
  const q = v as { start?: string; end?: string } | null
  return q?.start && q?.end ? { start: q.start, end: q.end } : DEFAULT_QUIET_HOURS
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

type AudienceRow = {
  id: string
  phone: string
  full_name: string
  seasonal_opt_out: boolean
  whatsapp_opt_in: boolean | null
  preferred_channels: string[] | null
  last_service: string | null
  vehicle_id: string | null
  last_seasonal: string | null
}

async function audience(garageId: string): Promise<AudienceRow[]> {
  const rows = await db().execute<AudienceRow>(sql`
    select c.id, c.phone, c.full_name, c.seasonal_opt_out, c.whatsapp_opt_in, c.preferred_channels::text[] as preferred_channels,
      lj.last_service, lj.vehicle_id,
      (select max(s.sent_at)::date::text from seasonal_campaign_sends s where s.customer_id = c.id and s.status = 'sent') as last_seasonal
    from customers c
    left join lateral (
      select coalesce(j.delivered_at, j.ready_at, j.created_at)::date::text as last_service, j.vehicle_id
      from jobs j
      where j.customer_id = c.id and j.garage_id = c.garage_id and j.status in ('delivered', 'closed') and j.deleted_at is null
      order by coalesce(j.delivered_at, j.ready_at, j.created_at) desc
      limit 1
    ) lj on true
    where c.garage_id = ${garageId}::uuid and c.deleted_at is null
  `)
  return [...rows]
}

/** How many customers would get this garage's next seasonal message. */
export async function audienceEstimate(garageId: string): Promise<{ reachable: number; optedOut: number }> {
  const t = today()
  let reachable = 0
  let optedOut = 0
  for (const r of await audience(garageId)) {
    const e = eligible({ seasonalOptOut: r.seasonal_opt_out, deleted: false, lastServiceAt: r.last_service, lastSeasonalAt: null, todayISO: t })
    if (e.ok && r.phone) reachable++
    else if (!e.ok && e.reason === "opted_out") optedOut++
  }
  return { reachable, optedOut }
}

// ---------------------------------------------------------------------------
// Planning (daily)
// ---------------------------------------------------------------------------

/**
 * Creates the campaigns that should exist today for every garage with
 * seasonal reminders on, tells owners a week ahead, and closes campaigns
 * whose send window has passed.
 */
export async function planSeasonalCampaigns(todayISO = today()): Promise<{ created: number; closed: number }> {
  const rows = await db()
    .select({ id: garages.id, slug: garages.slug, region: garages.region, enabled: garageSettings.seasonalCampaigns })
    .from(garages)
    .leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(eq(garages.status, "active"))

  let created = 0
  for (const g of rows) {
    if (g.enabled === false) continue
    const zone = zoneFor(g.region)
    for (const p of plannedCampaigns(zone, todayISO)) {
      const [c] = await db()
        .insert(seasonalCampaigns)
        .values({ garageId: g.id, season: p.season, sendOn: p.sendOn, zone })
        .onConflictDoNothing()
        .returning({ id: seasonalCampaigns.id })
      if (!c) continue
      created++
      const startsOn = earliestStart(p.sendOn, new Date()).toISOString().slice(0, 10)
      await notifyManagers(g.id, g.slug, p.season, startsOn).catch(() => undefined)
    }
  }

  const open = await db()
    .select({ id: seasonalCampaigns.id, sendOn: seasonalCampaigns.sendOn, sentCount: seasonalCampaigns.sentCount })
    .from(seasonalCampaigns)
    .where(inArray(seasonalCampaigns.status, ["scheduled", "sending"]))
  let closed = 0
  for (const c of open) {
    if (!windowClosed(c.sendOn, todayISO)) continue
    await refreshCounts(c.id)
    const [fresh] = await db().select({ sentCount: seasonalCampaigns.sentCount }).from(seasonalCampaigns).where(eq(seasonalCampaigns.id, c.id)).limit(1)
    await db().update(seasonalCampaigns)
      .set({ status: (fresh?.sentCount ?? 0) > 0 ? "sent" : "expired", finishedAt: new Date(), updatedAt: new Date() })
      .where(eq(seasonalCampaigns.id, c.id))
    await db().update(seasonalCampaignSends).set({ status: "skipped", reason: "window_closed" })
      .where(and(eq(seasonalCampaignSends.campaignId, c.id), eq(seasonalCampaignSends.status, "pending")))
    closed++
  }
  return { created, closed }
}

async function notifyManagers(garageId: string, slug: string, season: SeasonKey, sendOn: string) {
  const { reachable } = await audienceEstimate(garageId)
  const when = new Date(`${sendOn}T00:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short", timeZone: "UTC" })
  const managers = await db().select({ userId: memberships.userId }).from(memberships)
    .where(and(eq(memberships.garageId, garageId), inArray(memberships.role, ["owner", "manager"]), eq(memberships.status, "active")))
  for (const m of managers) {
    if (!m.userId) continue
    await db().insert(notifications).values({
      garageId, userId: m.userId, kind: "system",
      title: `${SEASON_INFO[season].title} reminders go out ${when}`,
      body: `About ${reachable} customers will get a ${SEASON_INFO[season].short} message. Add an offer or skip it in Settings.`,
      link: `/g/${slug}/settings#seasonal`,
    }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Sending (hourly, daytime)
// ---------------------------------------------------------------------------

async function refreshCounts(campaignId: string) {
  await db().execute(sql`
    update seasonal_campaigns c set
      recipients_count = s.total,
      sent_count = s.sent,
      failed_count = s.failed,
      updated_at = now()
    from (
      select count(*)::int as total,
        count(*) filter (where status = 'sent')::int as sent,
        count(*) filter (where status = 'failed')::int as failed
      from seasonal_campaign_sends where campaign_id = ${campaignId}::uuid
    ) s
    where c.id = ${campaignId}::uuid
  `)
}

/** Adds a pending send for every eligible customer (once per campaign). */
async function buildRecipients(campaign: typeof seasonalCampaigns.$inferSelect): Promise<void> {
  const t = today()
  const rows = await audience(campaign.garageId)
  const pending: { garageId: string; campaignId: string; customerId: string; vehicleId: string | null }[] = []
  let skipped = 0
  for (const r of rows) {
    const e = eligible({ seasonalOptOut: r.seasonal_opt_out, deleted: false, lastServiceAt: r.last_service, lastSeasonalAt: r.last_seasonal, todayISO: t })
    if (!e.ok || !r.phone) { if (!e.ok && e.reason !== "inactive") skipped++; continue }
    pending.push({ garageId: campaign.garageId, campaignId: campaign.id, customerId: r.id, vehicleId: r.vehicle_id })
  }
  for (let i = 0; i < pending.length; i += 500) {
    await db().insert(seasonalCampaignSends).values(pending.slice(i, i + 500)).onConflictDoNothing()
  }
  await db().update(seasonalCampaigns)
    .set({ status: "sending", startedAt: new Date(), skippedCount: skipped, updatedAt: new Date() })
    .where(eq(seasonalCampaigns.id, campaign.id))
  await refreshCounts(campaign.id)
}

/**
 * Sends up to `limit` pending messages for one campaign. Stops for quiet
 * hours or an exhausted message allowance and picks up on the next run.
 */
export async function sendCampaignBatch(campaignId: string, limit = 300): Promise<{ sent: number; failed: number; paused?: string }> {
  const [c] = await db().select().from(seasonalCampaigns).where(eq(seasonalCampaigns.id, campaignId)).limit(1)
  if (!c || !["scheduled", "sending"].includes(c.status)) return { sent: 0, failed: 0, paused: "not_active" }
  if (!windowOpen(c.sendOn, today())) return { sent: 0, failed: 0, paused: "outside_window" }
  if (earliestStart(c.sendOn, c.createdAt) > new Date()) return { sent: 0, failed: 0, paused: "review_period" }

  const [g] = await db()
    .select({ name: garages.name, slug: garages.slug, enabled: garageSettings.seasonalCampaigns, quiet: garageSettings.quietHours })
    .from(garages).leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(eq(garages.id, c.garageId)).limit(1)
  if (!g) return { sent: 0, failed: 0, paused: "no_garage" }
  if (g.enabled === false) return { sent: 0, failed: 0, paused: "disabled" }
  const quiet = quietOf(g.quiet)
  if (isQuietHour(new Date(), quiet)) return { sent: 0, failed: 0, paused: "quiet_hours" }

  if (c.status === "scheduled") await buildRecipients(c)

  const season = c.season as SeasonKey
  const info = SEASON_INFO[season]
  const batch = await db()
    .select({
      id: seasonalCampaignSends.id, attempts: seasonalCampaignSends.attempts,
      customerId: customers.id, phone: customers.phone, fullName: customers.fullName,
      optOut: customers.seasonalOptOut, deletedAt: customers.deletedAt,
      whatsappOptIn: customers.whatsappOptIn, preferredChannels: customers.preferredChannels,
      plate: vehicles.plateNumber, make: vehicles.make, model: vehicles.model,
    })
    .from(seasonalCampaignSends)
    .innerJoin(customers, eq(customers.id, seasonalCampaignSends.customerId))
    .leftJoin(vehicles, eq(vehicles.id, seasonalCampaignSends.vehicleId))
    .where(and(eq(seasonalCampaignSends.campaignId, c.id), eq(seasonalCampaignSends.status, "pending")))
    .limit(limit)

  let sent = 0
  let failed = 0
  let paused: string | undefined
  const offer = c.offerText?.trim() ? ` ${c.offerText.trim().replace(/[.!]?$/, ".")}` : ""
  for (const r of batch) {
    if (r.optOut || r.deletedAt) {
      await db().update(seasonalCampaignSends).set({ status: "skipped", reason: r.optOut ? "opted_out" : "deleted" }).where(eq(seasonalCampaignSends.id, r.id))
      continue
    }
    const channel = seasonalChannel({ whatsappOptIn: r.whatsappOptIn, preferredChannels: r.preferredChannels as string[] | null })
    const res = await sendMessage({
      garageId: c.garageId,
      channel,
      to: r.phone,
      templateKey: info.templateKey,
      variables: {
        customer_first_name: r.fullName.split(" ")[0] || "there",
        garage_name: g.name,
        plate: r.plate ?? "your car",
        vehicle: [r.make, r.model].filter(Boolean).join(" "),
        checklist: checklistLine(season),
        offer_line: offer,
        booking_link: `${APP_URL()}/b/${g.slug}`,
        stop_link: optOutUrl(r.customerId),
      },
      idempotencyKey: `seasonal:${r.id}`,
      quietHours: quiet,
      fallbackChannel: channel === "whatsapp" ? "sms" : undefined,
    }).catch((e) => ({ ok: false as const, error: String(e) }))

    if (res.ok && res.deferredTo) { paused = "quiet_hours"; break }
    if (!res.ok && /allowance/i.test(res.error)) { paused = "allowance"; break }
    if (res.ok) {
      sent++
      await db().update(seasonalCampaignSends)
        .set({ status: "sent", channel: res.channel, providerMessageId: res.providerMessageId, sentAt: new Date(), attempts: r.attempts + 1 })
        .where(eq(seasonalCampaignSends.id, r.id))
    } else {
      const attempts = r.attempts + 1
      if (attempts >= MAX_ATTEMPTS) failed++
      await db().update(seasonalCampaignSends)
        .set({ attempts, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", reason: res.error.slice(0, 200) })
        .where(eq(seasonalCampaignSends.id, r.id))
    }
  }

  await refreshCounts(c.id)
  const [left] = await db().select({ n: sql<number>`count(*)::int` }).from(seasonalCampaignSends)
    .where(and(eq(seasonalCampaignSends.campaignId, c.id), eq(seasonalCampaignSends.status, "pending")))
  if (!paused && (left?.n ?? 0) === 0) {
    await db().update(seasonalCampaigns).set({ status: "sent", finishedAt: new Date(), updatedAt: new Date() }).where(eq(seasonalCampaigns.id, c.id))
  }
  return { sent, failed, paused }
}

/** Hourly: send every campaign whose window is open. */
export async function runSeasonalSends(): Promise<{ campaigns: number; sent: number }> {
  const t = today()
  const rows = await db().select({ id: seasonalCampaigns.id, sendOn: seasonalCampaigns.sendOn })
    .from(seasonalCampaigns)
    .where(and(inArray(seasonalCampaigns.status, ["scheduled", "sending"]), sql`${seasonalCampaigns.sendOn} <= ${t}`))
  let sent = 0
  let campaigns = 0
  for (const r of rows) {
    if (!windowOpen(r.sendOn, t)) continue
    campaigns++
    sent += (await sendCampaignBatch(r.id).catch(() => ({ sent: 0 }))).sent
  }
  return { campaigns, sent }
}

// ---------------------------------------------------------------------------
// Opt-out & booking attribution
// ---------------------------------------------------------------------------

export async function setSeasonalOptOut(customerId: string, optOut: boolean): Promise<{ garageName: string } | null> {
  const [row] = await db()
    .update(customers)
    .set({ seasonalOptOut: optOut, updatedAt: new Date() })
    .where(eq(customers.id, customerId))
    .returning({ garageId: customers.garageId })
  if (!row) return null
  const [g] = await db().select({ name: garages.name }).from(garages).where(eq(garages.id, row.garageId)).limit(1)
  return { garageName: g?.name ?? "this garage" }
}

export async function optOutStatus(customerId: string): Promise<{ garageName: string; optedOut: boolean } | null> {
  const [row] = await db()
    .select({ optOut: customers.seasonalOptOut, garageName: garages.name })
    .from(customers).innerJoin(garages, eq(garages.id, customers.garageId))
    .where(eq(customers.id, customerId)).limit(1)
  return row ? { garageName: row.garageName, optedOut: row.optOut } : null
}

/**
 * A public booking from someone who got a seasonal message in the last
 * 30 days counts towards that campaign and is tagged source "seasonal".
 */
export async function attributeSeasonalBooking(garageId: string, guestPhone: string, bookingId: string): Promise<void> {
  const phone = normalizeGhPhone(guestPhone)
  if (!phone) return
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [hit] = await db()
    .select({ campaignId: seasonalCampaignSends.campaignId })
    .from(seasonalCampaignSends)
    .innerJoin(customers, eq(customers.id, seasonalCampaignSends.customerId))
    .where(and(
      eq(seasonalCampaignSends.garageId, garageId),
      eq(customers.phone, phone),
      eq(seasonalCampaignSends.status, "sent"),
      sql`${seasonalCampaignSends.sentAt} >= ${since.toISOString()}`,
    ))
    .orderBy(desc(seasonalCampaignSends.sentAt))
    .limit(1)
  if (!hit) return
  await db().update(bookings).set({ source: "seasonal" }).where(eq(bookings.id, bookingId))
  await db().update(seasonalCampaigns)
    .set({ bookingsCount: sql`${seasonalCampaigns.bookingsCount} + 1`, updatedAt: new Date() })
    .where(eq(seasonalCampaigns.id, hit.campaignId))
}
