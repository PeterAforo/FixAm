"use server"

import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { garageSettings, garages, seasonalCampaigns } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog, type ActionResult } from "@/lib/actions"
import { renderTemplate } from "@/lib/messaging/templates"
import { SEASON_INFO, checklistLine, earliestStart, upcomingSendDays, zoneFor, type SeasonKey, type Zone } from "./core"
import { audienceEstimate, setSeasonalOptOut } from "./service"
import { readOptOutToken } from "./links"

async function manager(garageId: string): Promise<{ userId: string } | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveMembership(userId, garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId, branchId: m.branchId }, "garage.settings.manage")) return null
  return { userId }
}

export type SeasonalCampaignView = {
  id: string; season: SeasonKey; title: string; sendOn: string; status: string; offerText: string | null
  recipientsCount: number; sentCount: number; skippedCount: number; failedCount: number; bookingsCount: number
}

export type SeasonalOverview = {
  enabled: boolean
  region: string | null
  zone: Zone
  zoneLabel: string
  upcoming: { season: SeasonKey; title: string; sendOn: string }[]
  campaigns: SeasonalCampaignView[]
  reachable: number
  optedOut: number
}

const ZONE_LABEL: Record<Zone, string> = {
  north: "Northern belt (one rainy season)",
  middle: "Middle belt (two rainy seasons)",
  coast: "Coast (two rainy seasons)",
}

export async function getSeasonalOverview(garageId: string): Promise<SeasonalOverview> {
  const [g] = await db()
    .select({ region: garages.region, enabled: garageSettings.seasonalCampaigns })
    .from(garages).leftJoin(garageSettings, eq(garageSettings.garageId, garages.id))
    .where(eq(garages.id, garageId)).limit(1)
  const zone = zoneFor(g?.region)
  const [rows, est] = await Promise.all([
    db().select().from(seasonalCampaigns).where(eq(seasonalCampaigns.garageId, garageId)).orderBy(desc(seasonalCampaigns.sendOn)).limit(8),
    audienceEstimate(garageId).catch(() => ({ reachable: 0, optedOut: 0 })),
  ])
  const t = new Date().toISOString().slice(0, 10)
  const existing = new Set(rows.map((r) => `${r.season}:${r.sendOn}`))
  return {
    enabled: g?.enabled ?? true,
    region: g?.region ?? null,
    zone,
    zoneLabel: ZONE_LABEL[zone],
    upcoming: upcomingSendDays(zone, t)
      .filter((u) => !existing.has(`${u.season}:${u.sendOn}`) && u.sendOn >= t)
      .map((u) => ({ season: u.season, title: SEASON_INFO[u.season].title, sendOn: u.sendOn })),
    campaigns: rows.map((r) => ({
      id: r.id, season: r.season as SeasonKey, title: SEASON_INFO[r.season as SeasonKey]?.title ?? r.season,
      sendOn: r.status === "scheduled" || r.status === "skipped" ? earliestStart(r.sendOn, r.createdAt).toISOString().slice(0, 10) : r.sendOn,
      status: r.status, offerText: r.offerText,
      recipientsCount: r.recipientsCount, sentCount: r.sentCount, skippedCount: r.skippedCount,
      failedCount: r.failedCount, bookingsCount: r.bookingsCount,
    })),
    reachable: est.reachable,
    optedOut: est.optedOut,
  }
}

export async function setSeasonalEnabled(raw: unknown): Promise<ActionResult<{ enabled: boolean }>> {
  const parsed = z.object({ garageId: z.string().uuid(), enabled: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const m = await manager(parsed.data.garageId)
  if (!m) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const { garageId, enabled } = parsed.data
  await db().insert(garageSettings).values({ garageId, seasonalCampaigns: enabled })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { seasonalCampaigns: enabled, updatedAt: new Date() } })
  await writeAuditLog({ garageId, actorUserId: m.userId, action: "garage.seasonal.toggle", entityType: "garage", entityId: garageId, after: { enabled } }).catch(() => undefined)
  return { ok: true, data: { enabled } }
}

/** Add/change the offer line, or skip / un-skip a campaign that hasn't started. */
export async function updateSeasonalCampaign(raw: unknown): Promise<ActionResult<{ status: string; offerText: string | null }>> {
  const parsed = z.object({
    garageId: z.string().uuid(),
    campaignId: z.string().uuid(),
    offerText: z.string().trim().max(80).nullable().optional(),
    skip: z.boolean().optional(),
  }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Offer must be 80 characters or fewer" } }
  const d = parsed.data
  const m = await manager(d.garageId)
  if (!m) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const [c] = await db().select().from(seasonalCampaigns)
    .where(and(eq(seasonalCampaigns.id, d.campaignId), eq(seasonalCampaigns.garageId, d.garageId))).limit(1)
  if (!c) return { ok: false, error: { code: "NOT_FOUND", message: "Campaign not found" } }
  if (!["scheduled", "skipped"].includes(c.status)) return { ok: false, error: { code: "CONFLICT", message: "This campaign has already started sending" } }
  const status = d.skip === undefined ? c.status : d.skip ? "skipped" : "scheduled"
  const offerText = d.offerText === undefined ? c.offerText : d.offerText || null
  await db().update(seasonalCampaigns).set({ status, offerText, updatedAt: new Date() }).where(eq(seasonalCampaigns.id, c.id))
  await writeAuditLog({ garageId: d.garageId, actorUserId: m.userId, action: "garage.seasonal.update", entityType: "seasonal_campaign", entityId: c.id, after: { status, offerText } }).catch(() => undefined)
  return { ok: true, data: { status, offerText } }
}

/** What the SMS will look like with this garage's name and an example car. */
export async function previewSeasonalMessage(raw: unknown): Promise<ActionResult<{ sms: string; length: number }>> {
  const parsed = z.object({ garageId: z.string().uuid(), season: z.enum(["harmattan", "rainy_major", "rainy_minor"]), offerText: z.string().max(80).nullable().optional() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }
  const m = await manager(parsed.data.garageId)
  if (!m) return { ok: false, error: { code: "FORBIDDEN", message: "No permission" } }
  const [g] = await db().select({ name: garages.name, slug: garages.slug }).from(garages).where(eq(garages.id, parsed.data.garageId)).limit(1)
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://fixam.app").replace(/\/$/, "")
  const offer = parsed.data.offerText?.trim() ? ` ${parsed.data.offerText.trim().replace(/[.!]?$/, ".")}` : ""
  const r = renderTemplate(SEASON_INFO[parsed.data.season].templateKey, "sms", {
    customer_first_name: "Kofi", garage_name: g?.name ?? "Your garage", plate: "GR 1234-24",
    checklist: checklistLine(parsed.data.season), offer_line: offer,
    booking_link: `${base}/b/${g?.slug ?? "garage"}`, stop_link: `${base}/u/xxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx`,
  })
  return { ok: true, data: { sms: r.body, length: r.body.length } }
}

/** Public: the customer taps "stop" (or "undo") on the opt-out page. */
export async function confirmSeasonalOptOut(raw: unknown): Promise<ActionResult<{ optedOut: boolean; garageName: string }>> {
  const parsed = z.object({ token: z.string().max(60), optOut: z.boolean() }).safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid link" } }
  const customerId = readOptOutToken(parsed.data.token)
  if (!customerId) return { ok: false, error: { code: "NOT_FOUND", message: "This link isn't valid" } }
  const res = await setSeasonalOptOut(customerId, parsed.data.optOut)
  if (!res) return { ok: false, error: { code: "NOT_FOUND", message: "This link isn't valid" } }
  return { ok: true, data: { optedOut: parsed.data.optOut, garageName: res.garageName } }
}
