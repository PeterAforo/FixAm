import "server-only"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { branches, memberships, plans, subscriptions } from "@/lib/db/schema"

const GRACE_DAYS = 7
const DAY = 86_400_000

export type GarageBilling = {
  planCode: string | null
  planName: string | null
  features: string[]
  maxStaff: number | null
  maxBranches: number | null
  status: string
  isComplimentary: boolean
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
  /** Plan costs nothing (driver, seller, broker, tow, rider entry plans): never locks. */
  isFreePlan?: boolean
}

export async function garageBilling(garageId: string): Promise<GarageBilling | null> {
  const [row] = await db()
    .select({
      planCode: plans.code, planName: plans.name, features: plans.features,
      maxStaff: plans.maxStaff, maxBranches: plans.maxBranches,
      status: subscriptions.status, isComplimentary: subscriptions.isComplimentary,
      trialEndsAt: subscriptions.trialEndsAt, currentPeriodEnd: subscriptions.currentPeriodEnd,
      priceMonthly: plans.priceMonthly,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.garageId, garageId))
    .limit(1)
  if (!row) return null
  const { priceMonthly, ...rest } = row
  return {
    ...rest,
    features: row.features ?? [],
    isComplimentary: row.isComplimentary ?? false,
    isFreePlan: Number(priceMonthly ?? 0) <= 0,
  }
}

export type AccessState = "ok" | "grace" | "readonly"

/**
 * Write-access state for a garage:
 *  - complimentary / active → ok
 *  - trialing past trial end, or past_due/unpaid/cancelled past period end + grace → readonly
 *  - within the 7-day grace window → grace (writes still allowed, banner shown)
 */
export function accessState(b: GarageBilling | null, now = new Date()): { state: AccessState; reason: string | null } {
  if (!b) return { state: "ok", reason: null }
  if (b.isComplimentary || b.isFreePlan) return { state: "ok", reason: null }

  const limit =
    b.status === "trialing" ? b.trialEndsAt
    : ["past_due", "unpaid", "cancelled", "incomplete"].includes(b.status) ? b.currentPeriodEnd
    : null

  if (!limit) return { state: "ok", reason: null }
  const overdueMs = now.getTime() - limit.getTime()
  if (overdueMs <= 0) return { state: "ok", reason: null }
  if (overdueMs <= GRACE_DAYS * DAY) {
    return { state: "grace", reason: b.status === "trialing" ? "trial ended" : "payment overdue" }
  }
  return { state: "readonly", reason: b.status === "trialing" ? "trial expired" : "subscription lapsed" }
}

/** Returns an error message when the garage is read-only, else null. */
export async function writeBlockReason(garageId: string): Promise<string | null> {
  const b = await garageBilling(garageId)
  const { state, reason } = accessState(b)
  if (state !== "readonly") return null
  return `This garage is read-only (${reason}) — update your subscription to continue`
}

export async function countActiveStaff(garageId: string): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.garageId, garageId), inArray(memberships.status, ["active", "invited"])))
  return r?.n ?? 0
}

export async function countBranches(garageId: string): Promise<number> {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(branches)
    .where(and(eq(branches.garageId, garageId), isNull(branches.deletedAt)))
  return r?.n ?? 0
}
