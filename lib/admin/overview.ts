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
 * The Supabase pooler can take >8s to establish a cold connection, which trips
 * statement_timeout on the first query of a serverless instance. Run the
 * counts sequentially (one warm connection instead of eight cold handshakes)
 * and retry once — by then the pool is warm.
 */
async function countWithRetry(q: () => PromiseLike<{ n: number }[]>) {
  try {
    return await q()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const cause = e instanceof Error ? String((e as { cause?: unknown }).cause ?? "") : ""
    if (!/statement timeout|57014/.test(msg + cause)) throw e
    await new Promise((r) => setTimeout(r, 500))
    return q()
  }
}

/**
 * Counts behind the admin "Needs your attention" card and the sidebar badges.
 * Callers must check platform admin first.
 */
export async function adminAttention(): Promise<AdminAttention> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const d = db()
  // Sequential on purpose: the first query absorbs any cold-start/pooler
  // latency (with one retry); the rest then reuse the warm connection.
  const v = await countWithRetry(() => d.select({ n: count }).from(vendors).where(and(eq(vendors.status, "pending"), isNull(vendors.deletedAt))))
  const r = await countWithRetry(() => d.select({ n: count }).from(riders).where(and(eq(riders.status, "pending"), isNull(riders.deletedAt))))
  const b = await countWithRetry(() => d.select({ n: count }).from(brokers).where(and(eq(brokers.isVerified, false), eq(brokers.status, "active"), isNull(brokers.deletedAt))))
  const t = await countWithRetry(() => d.select({ n: count }).from(towOperators).where(and(eq(towOperators.isVerified, false), eq(towOperators.status, "active"), isNull(towOperators.deletedAt))))
  const dp = await countWithRetry(() => d.select({ n: count }).from(escrowHolds).where(eq(escrowHolds.status, "disputed")))
  const p = await countWithRetry(() => d.select({ n: count }).from(payouts).where(eq(payouts.status, "needs_attention")))
  const pr = await countWithRetry(() => d.select({ n: count }).from(privacyRequests).where(eq(privacyRequests.status, "requested")))
  const g = await countWithRetry(() => d.select({ n: count }).from(garages).where(and(isNull(garages.deletedAt), gte(garages.createdAt, monthStart))))
  return {
    vendorsPending: v[0]?.n ?? 0,
    ridersPending: r[0]?.n ?? 0,
    brokersUnverified: b[0]?.n ?? 0,
    towUnverified: t[0]?.n ?? 0,
    disputes: dp[0]?.n ?? 0,
    payoutsNeedAttention: p[0]?.n ?? 0,
    privacyOpen: pr[0]?.n ?? 0,
    newGaragesThisMonth: g[0]?.n ?? 0,
  }
}

/** Approvals waiting = vendors + riders pending, brokers + tow operators not yet verified. */
export function approvalsWaiting(a: AdminAttention) {
  return a.vendorsPending + a.ridersPending + a.brokersUnverified + a.towUnverified
}

