import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accountSubscriptions, plans } from "@/lib/db/schema"
import { applyBp, platformSettingsNow } from "./settings"

/**
 * Commission FixAm keeps on a parts seller's order, in basis points.
 *  - A per-seller rate set by an admin (vendors.commission_bp > 0) wins.
 *  - Otherwise Seller Pro pays the reduced rate, everyone else the standard rate.
 */
export async function vendorCommissionBp(vendorId: string, overrideBp: number | null | undefined): Promise<number> {
  if (overrideBp && overrideBp > 0) return overrideBp
  const s = await platformSettingsNow()
  const [sub] = await db()
    .select({ code: plans.code, status: accountSubscriptions.status })
    .from(accountSubscriptions)
    .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
    .where(and(eq(accountSubscriptions.ownerKind, "vendor"), eq(accountSubscriptions.ownerId, vendorId)))
    .limit(1)
  const isPro = sub?.code === "vendor_pro" && (sub.status === "active" || sub.status === "trialing")
  return isPro ? s.vendorProCommissionBp : s.vendorCommissionBp
}

export async function vendorCommission(vendorId: string, overrideBp: number | null | undefined, subtotal: bigint) {
  const bp = await vendorCommissionBp(vendorId, overrideBp)
  return { bp, amount: applyBp(subtotal, bp) }
}

/** Split a paid tow into FixAm's fee and the operator's payout. */
export async function towSplit(gross: bigint): Promise<{ commission: bigint; net: bigint; bp: number }> {
  const { towCommissionBp: bp } = await platformSettingsNow()
  const commission = applyBp(gross, bp)
  return { commission, net: gross - commission, bp }
}

/** A rider's earning from a delivery fee after FixAm's fee. */
export async function riderEarningFrom(fee: bigint): Promise<bigint> {
  const { riderCommissionBp } = await platformSettingsNow()
  return fee - applyBp(fee, riderCommissionBp)
}

/**
 * Quotes a broker may still send this month. Broker Pro (active or trialing)
 * is unlimited (null); the free Broker plan gets the admin-set allowance.
 */
export async function brokerQuotesLeft(brokerId: string): Promise<{ left: number | null; allowance: number; used: number }> {
  const { brokerRequests } = await import("@/lib/db/schema")
  const { gte, sql } = await import("drizzle-orm")
  const s = await platformSettingsNow()
  const [sub] = await db()
    .select({ code: plans.code, status: accountSubscriptions.status })
    .from(accountSubscriptions)
    .innerJoin(plans, eq(accountSubscriptions.planId, plans.id))
    .where(and(eq(accountSubscriptions.ownerKind, "broker"), eq(accountSubscriptions.ownerId, brokerId)))
    .limit(1)
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(brokerRequests)
    .where(and(eq(brokerRequests.brokerId, brokerId), gte(brokerRequests.quotedAt, monthStart)))
  const used = r?.n ?? 0
  const isPro = sub?.code === "broker_pro" && (sub.status === "active" || sub.status === "trialing")
  if (isPro) return { left: null, allowance: s.brokerFreeQuotesPerMonth, used }
  return { left: Math.max(0, s.brokerFreeQuotesPerMonth - used), allowance: s.brokerFreeQuotesPerMonth, used }
}
