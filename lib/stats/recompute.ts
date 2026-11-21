import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  garages, jobAssignments, jobItems, jobs, mechanicBadgeAwards,
  mechanicStats, memberships, timeLogs,
} from "@/lib/db/schema"
import { badgeFor, computeStreak, SPEED_DEMON_MS, type BadgeKey } from "./core"

const COMPLETED = ["delivered", "closed"] as const

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Recompute stats + badge awards for every mechanic in a garage. */
export async function recomputeGarageStats(garageId: string): Promise<{ users: number; badges: number }> {
  const mechs = await db()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.garageId, garageId), eq(memberships.role, "mechanic"), eq(memberships.status, "active"), isNotNull(memberships.userId)))

  let badgesAwarded = 0
  for (const { userId } of mechs) {
    if (!userId) continue
    // Time logs → minutes worked + activity dates
    const logs = await db()
      .select({ startedAt: timeLogs.startedAt, endedAt: timeLogs.endedAt })
      .from(timeLogs)
      .where(and(eq(timeLogs.garageId, garageId), eq(timeLogs.userId, userId)))

    let minutesWorked = 0
    const activityDates = new Set<string>()
    for (const l of logs) {
      activityDates.add(toDateStr(l.startedAt))
      if (l.endedAt) minutesWorked += Math.max(0, Math.round((l.endedAt.getTime() - l.startedAt.getTime()) / 60_000))
    }

    // Assigned jobs that reached delivery/closed
    const assigned = await db()
      .select({
        id: jobs.id,
        isWarranty: jobs.isWarranty,
        warrantyParentJobId: jobs.warrantyParentJobId,
        checkedInAt: jobs.checkedInAt,
        deliveredAt: jobs.deliveredAt,
      })
      .from(jobAssignments)
      .innerJoin(jobs, eq(jobs.id, jobAssignments.jobId))
      .where(and(
        eq(jobAssignments.garageId, garageId),
        eq(jobAssignments.userId, userId),
        inArray(jobs.status, [...COMPLETED]),
        isNull(jobs.deletedAt),
      ))

    const jobIds = assigned.map((j) => j.id)
    const jobsCompleted = jobIds.length
    const comebacks = assigned.filter((j) => j.isWarranty || j.warrantyParentJobId).length
    const speedDemon = assigned.some(
      (j) => j.checkedInAt && j.deliveredAt && j.deliveredAt.getTime() - j.checkedInAt.getTime() <= SPEED_DEMON_MS
    )
    for (const j of assigned) if (j.deliveredAt) activityDates.add(toDateStr(j.deliveredAt))

    // Revenue: job_items on those delivered jobs (labour + parts, less discounts)
    let revenuePesewas = 0n
    if (jobIds.length > 0) {
      const items = await db()
        .select({ unitPrice: jobItems.unitPrice, quantity: jobItems.quantity, discount: jobItems.discountAmount })
        .from(jobItems)
        .where(and(eq(jobItems.garageId, garageId), inArray(jobItems.jobId, jobIds)))
      for (const it of items) {
        const qty = Number(it.quantity)
        const line = BigInt(Math.round(Number(it.unitPrice) * qty)) - (it.discount ?? 0n)
        if (line > 0n) revenuePesewas += line
      }
    }

    const today = toDateStr(new Date())
    const { current, best } = computeStreak([...activityDates], today)

    const existing = await db()
      .select()
      .from(mechanicStats)
      .where(and(eq(mechanicStats.garageId, garageId), eq(mechanicStats.userId, userId)))
      .limit(1)

    const statsRow = {
      jobsCompleted,
      minutesWorked,
      revenuePesewas,
      comebacks,
      currentStreak: current,
      bestStreak: Math.max(best, existing[0]?.bestStreak ?? 0),
      lastActiveDate: [...activityDates].sort().at(-1) ?? null,
      updatedAt: new Date(),
    }
    if (existing[0]) {
      await db().update(mechanicStats).set(statsRow).where(eq(mechanicStats.id, existing[0].id))
    } else {
      await db().insert(mechanicStats).values({ garageId, userId, ...statsRow })
    }

    // Badge awards
    const earned = badgeFor({ jobsCompleted, comebacks, speedDemon, currentStreak: current })
    if (earned.length > 0) {
      const have = await db()
        .select({ badgeKey: mechanicBadgeAwards.badgeKey })
        .from(mechanicBadgeAwards)
        .where(and(eq(mechanicBadgeAwards.garageId, garageId), eq(mechanicBadgeAwards.userId, userId)))
      const haveSet = new Set(have.map((h) => h.badgeKey))
      const fresh = earned.filter((b) => !haveSet.has(b))
      if (fresh.length > 0) {
        await db().insert(mechanicBadgeAwards).values(
          fresh.map((badgeKey: BadgeKey) => ({ garageId, userId, badgeKey }))
        ).onConflictDoNothing()
        badgesAwarded += fresh.length
      }
    }
  }

  return { users: mechs.length, badges: badgesAwarded }
}

/** Nightly sweep across all garages. */
export async function recomputeAllStats() {
  const garageRows = await db()
    .select({ id: garages.id })
    .from(garages)
    .where(and(isNull(garages.deletedAt), or(eq(garages.status, "active"), isNull(garages.status))))
  let users = 0
  let badges = 0
  for (const g of garageRows) {
    const r = await recomputeGarageStats(g.id)
    users += r.users
    badges += r.badges
  }
  return { garages: garageRows.length, users, badges }
}
