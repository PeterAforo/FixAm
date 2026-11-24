import "server-only"
import { and, eq, gte, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { brokers, escrowHolds, garages, payouts, privacyRequests, riders, towOperators, users, vendors } from "@/lib/db/schema"

/** True when the user is a FixAm platform admin. */
export async function isPlatformAdmin(userId: string) {
  const [u] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.a === true
}

export type AdminAttention = {
  vendorsPending: number
  ridersPending: number
  brokersUnverified: number
  towUnverified: number
  disputes: number
  payoutsNeedAttention: number
  privacyOpen: number
  newGaragesThisMonth: number
}

const count = sql<number>`count(*)::int`

/**
 * Counts behind the admin "Needs your attention" card and the sidebar badges.
 * Callers must check platform admin first.
 */
export async function adminAttention(): Promise<AdminAttention> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [[v], [r], [b], [t], [d], [p], [pr], [g]] = await Promise.all([
    db().select({ n: count }).from(vendors).where(and(eq(vendors.status, "pending"), isNull(vendors.deletedAt))),
    db().select({ n: count }).from(riders).where(and(eq(riders.status, "pending"), isNull(riders.deletedAt))),
    db().select({ n: count }).from(brokers).where(and(eq(brokers.isVerified, false), eq(brokers.status, "active"), isNull(brokers.deletedAt))),
    db().select({ n: count }).from(towOperators).where(and(eq(towOperators.isVerified, false), eq(towOperators.status, "active"), isNull(towOperators.deletedAt))),
    db().select({ n: count }).from(escrowHolds).where(eq(escrowHolds.status, "disputed")),
    db().select({ n: count }).from(payouts).where(eq(payouts.status, "needs_attention")),
    db().select({ n: count }).from(privacyRequests).where(eq(privacyRequests.status, "requested")),
    db().select({ n: count }).from(garages).where(and(isNull(garages.deletedAt), gte(garages.createdAt, monthStart))),
  ])
  return {
    vendorsPending: v?.n ?? 0,
    ridersPending: r?.n ?? 0,
    brokersUnverified: b?.n ?? 0,
    towUnverified: t?.n ?? 0,
    disputes: d?.n ?? 0,
    payoutsNeedAttention: p?.n ?? 0,
    privacyOpen: pr?.n ?? 0,
    newGaragesThisMonth: g?.n ?? 0,
  }
}

/** Approvals waiting = vendors + riders pending, brokers + tow operators not yet verified. */
export function approvalsWaiting(a: AdminAttention) {
  return a.vendorsPending + a.ridersPending + a.brokersUnverified + a.towUnverified
}

