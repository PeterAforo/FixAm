"use server"
import { and, desc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  garageSettings, mechanicBadgeAwards, mechanicStats, users,
} from "@/lib/db/schema"
import { resolveMembership, resolvePrincipal, writeAuditLog, type ActionResult } from "@/lib/actions"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { BADGES } from "./core"

export type MyStats = {
  jobsCompleted: number
  jobsThisWeek: number
  jobsThisMonth: number
  minutesWorked: number
  revenuePesewas: number
  comebacks: number
  currentStreak: number
  bestStreak: number
  lastActiveDate: string | null
  badges: { key: string; name: string; emoji: string; desc: string; awardedAt: string }[]
  leaderboardEnabled: boolean
  leaderboard: { name: string; jobsThisWeek: number; minutesThisWeek: number }[] | null
}

export async function getMyStats(garageId: string): Promise<MyStats | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const ctx = await resolvePrincipal(userId, garageId)
  if (!ctx) return null

  const [garage] = await db().select({ leaderboardEnabled: garageSettings.leaderboardEnabled }).from(garageSettings).where(eq(garageSettings.garageId, garageId)).limit(1)

  const [stats] = await db().select().from(mechanicStats)
    .where(and(eq(mechanicStats.garageId, garageId), eq(mechanicStats.userId, userId))).limit(1)
  const awards = await db().select().from(mechanicBadgeAwards)
    .where(and(eq(mechanicBadgeAwards.garageId, garageId), eq(mechanicBadgeAwards.userId, userId)))
    .orderBy(desc(mechanicBadgeAwards.awardedAt))

  const badgeMeta = new Map(BADGES.map((b) => [b.key, b]))
  const badges = awards.map((a) => {
    const meta = badgeMeta.get(a.badgeKey as (typeof BADGES)[number]["key"])
    return {
      key: a.badgeKey,
      name: meta?.name ?? a.badgeKey,
      emoji: meta?.emoji ?? "🏅",
      desc: meta?.desc ?? "",
      awardedAt: a.awardedAt.toISOString(),
    }
  })

  // Weekly leaderboard: mechanics ranked by jobs completed in last 7 days.
  let leaderboard: MyStats["leaderboard"] = null
  if (garage?.leaderboardEnabled !== false) {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    const rows = await db()
      .select({
        userId: mechanicStats.userId,
        name: users.fullName,
        jobsThisWeek: sql<number>`(select count(*)::int from job_assignments ja join jobs j on j.id = ja.job_id where ja.garage_id = ${garageId} and ja.user_id = ${mechanicStats.userId} and j.status in ('delivered','closed') and j.delivered_at >= ${weekAgo})`,
        minutesThisWeek: sql<number>`(select coalesce(sum(extract(epoch from (tl.ended_at - tl.started_at))/60),0)::int from time_logs tl where tl.garage_id = ${garageId} and tl.user_id = ${mechanicStats.userId} and tl.started_at >= ${weekAgo} and tl.ended_at is not null)`,
      })
      .from(mechanicStats)
      .innerJoin(users, eq(users.id, mechanicStats.userId))
      .where(eq(mechanicStats.garageId, garageId))
      .limit(50)
    leaderboard = rows
      .map((r) => ({ name: r.name, jobsThisWeek: r.jobsThisWeek, minutesThisWeek: r.minutesThisWeek }))
      .sort((a, b) => b.jobsThisWeek - a.jobsThisWeek || b.minutesThisWeek - a.minutesThisWeek)
      .slice(0, 10)
  }

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const jobsSince = async (since: Date) => {
    const rows = await db().execute<{ n: number }>(sql`
      select count(*)::int as n
      from job_assignments ja
      join jobs j on j.id = ja.job_id
      where ja.garage_id = ${garageId} and ja.user_id = ${userId}
        and j.status in ('delivered','closed') and j.delivered_at >= ${since}
        and j.deleted_at is null
    `)
    return Number(rows[0]?.n ?? 0)
  }

  return {
    jobsCompleted: stats?.jobsCompleted ?? 0,
    jobsThisWeek: await jobsSince(new Date(Date.now() - 7 * 86_400_000)),
    jobsThisMonth: await jobsSince(monthStart),
    minutesWorked: stats?.minutesWorked ?? 0,
    revenuePesewas: Number(stats?.revenuePesewas ?? 0),
    comebacks: stats?.comebacks ?? 0,
    currentStreak: stats?.currentStreak ?? 0,
    bestStreak: stats?.bestStreak ?? 0,
    lastActiveDate: stats?.lastActiveDate ?? null,
    badges,
    leaderboardEnabled: garage?.leaderboardEnabled !== false,
    leaderboard,
  }
}

export async function setLeaderboardEnabled(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } }
  const parsed = z.object({ garageId: z.string().uuid(), enabled: z.boolean() }).safeParse(rawInput)
  if (!parsed.success) return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } }

  const membership = await resolveMembership(userId, parsed.data.garageId)
  if (!membership) return { ok: false, error: { code: "FORBIDDEN", message: "Not a member of this garage" } }
  if (!can({ kind: "staff", role: membership.role, garageId: parsed.data.garageId, branchId: membership.branchId }, "garage.settings.manage")) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only the owner can change this" } }
  }

  await db().insert(garageSettings).values({ garageId: parsed.data.garageId, leaderboardEnabled: parsed.data.enabled })
    .onConflictDoUpdate({ target: garageSettings.garageId, set: { leaderboardEnabled: parsed.data.enabled, updatedAt: new Date() } })
  await writeAuditLog({ garageId: parsed.data.garageId, actorUserId: userId, action: "garage.leaderboard.toggle", entityType: "garage", entityId: parsed.data.garageId, after: { enabled: parsed.data.enabled } })
  return { ok: true, data: { ok: true as const } }
}
