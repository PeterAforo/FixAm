"use server"

import { z } from "zod"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { escrowHolds, garages, payouts, users, vendorOrders, vendors } from "@/lib/db/schema"
import { getSessionUserId } from "@/lib/auth/ensure-user"
import { can } from "@/lib/auth/permissions"
import { resolveMembership, writeAuditLog, type ActionResult } from "@/lib/actions"
import { resolveVendorMembership } from "@/lib/vendors/actions"
import { rateLimit } from "@/lib/rate-limit"
import { decryptPayoutAccount, encryptPayoutAccount, maskPayoutAccount, payoutAccountSchema } from "./payout-account"
import { openDispute, reconcileReference, refundHold, releaseHold, retryPayout, type ReconcileStatus } from "./service"

const fail = (code: "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION" | "NOT_FOUND", message: string) => ({ ok: false as const, error: { code, message } })

async function requirePlatformAdmin(): Promise<string | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const [u] = await db().select({ a: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.a ? userId : null
}

// ---------------------------------------------------------------------------
// Buyers
// ---------------------------------------------------------------------------

/** Re-check a payment after returning from checkout (also used by "I've paid" buttons). */
export async function checkPaymentStatus(rawRef: unknown): Promise<{ status: ReconcileStatus }> {
  const ref = z.string().regex(/^\d{12}$|^[A-Za-z0-9_+\-]{6,120}$/).safeParse(rawRef)
  if (!ref.success) return { status: "unknown" }
  const userId = await getSessionUserId()
  const rl = await rateLimit(`paycheck:${userId ?? "anon"}:${ref.data}`, 20, 600)
  if (!rl.ok) return { status: "pending" }
  return { status: await reconcileReference(ref.data) }
}

/** Garage staff (buyer) report a problem with a paid vendor order — freezes auto-release. */
export async function disputeVendorOrder(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const userId = await getSessionUserId()
  if (!userId) return fail("UNAUTHENTICATED", "Sign in first")
  const parsed = z.object({ garageId: z.string().uuid(), orderId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).safeParse(rawInput)
  if (!parsed.success) return fail("VALIDATION", "Tell us what went wrong (at least 10 characters)")
  const d = parsed.data
  const m = await resolveMembership(userId, d.garageId)
  if (!m || !can({ kind: "staff", role: m.role, garageId: d.garageId, branchId: m.branchId }, "purchase_orders.receive")) return fail("FORBIDDEN", "No permission")
  const [hold] = await db()
    .select({ id: escrowHolds.id })
    .from(escrowHolds)
    .innerJoin(vendorOrders, eq(vendorOrders.id, escrowHolds.entityId))
    .where(and(eq(escrowHolds.entityType, "vendor_order"), eq(escrowHolds.entityId, d.orderId), eq(vendorOrders.garageId, d.garageId)))
    .limit(1)
  if (!hold) return fail("NOT_FOUND", "No payment held for this order")
  const r = await openDispute(hold.id, { userId, reason: d.reason })
  return r.ok ? { ok: true, data: { ok: true } } : fail("VALIDATION", r.message ?? "Can't dispute")
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export type VendorPayoutsView = {
  account: string | null
  accountMethod: "momo" | "bank" | null
  held: number
  releasing: number
  paidOut: number
  rows: { id: string; amount: number; status: string; method: string; createdAt: string; completedAt: string | null; lastError: string | null }[]
}

export async function getVendorPayoutsView(): Promise<VendorPayoutsView | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const m = await resolveVendorMembership(userId)
  if (!m || !can({ kind: "vendor", vendorRole: m.role === "vendor_owner" ? "owner" : "staff" }, "vendor.payouts.view")) return null
  const acct = decryptPayoutAccount(m.vendor.payoutDetailsEncrypted)
  const [holds, rows] = await Promise.all([
    db()
      .select({ status: escrowHolds.status, net: escrowHolds.netAmount })
      .from(escrowHolds)
      .where(and(eq(escrowHolds.payeeType, "vendor"), eq(escrowHolds.payeeId, m.vendor.id), inArray(escrowHolds.status, ["held", "disputed"]))),
    db()
      .select()
      .from(payouts)
      .where(and(eq(payouts.recipientType, "vendor"), eq(payouts.recipientId, m.vendor.id)))
      .orderBy(desc(payouts.createdAt))
      .limit(50),
  ])
  return {
    account: maskPayoutAccount(acct),
    accountMethod: acct?.method ?? null,
    held: holds.reduce((s, h) => s + Number(h.net), 0),
    releasing: rows.filter((r) => r.status !== "succeeded").reduce((s, r) => s + Number(r.amount), 0),
    paidOut: rows.filter((r) => r.status === "succeeded").reduce((s, r) => s + Number(r.amount), 0),
    rows: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      method: r.method,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      lastError: r.status === "needs_attention" ? r.lastError : null,
    })),
  }
}

export async function saveVendorPayoutAccount(rawInput: unknown): Promise<ActionResult<{ account: string }>> {
  const userId = await getSessionUserId()
  if (!userId) return fail("UNAUTHENTICATED", "Sign in first")
  const m = await resolveVendorMembership(userId)
  if (!m || m.role !== "vendor_owner") return fail("FORBIDDEN", "Only the business owner can change where payouts go")
  const parsed = payoutAccountSchema.safeParse(rawInput)
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Check the payout details")
  await db()
    .update(vendors)
    .set({ payoutMethod: parsed.data.method, payoutDetailsEncrypted: encryptPayoutAccount(parsed.data), updatedAt: new Date() })
    .where(eq(vendors.id, m.vendor.id))
  const masked = maskPayoutAccount(parsed.data)!
  await writeAuditLog({ garageId: null, actorUserId: userId, action: "vendor.payout_account.update", entityType: "vendor", entityId: m.vendor.id, after: { account: masked } }).catch(() => undefined)
  // Unblock payouts that were waiting for an account.
  const blocked = await db()
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.recipientType, "vendor"), eq(payouts.recipientId, m.vendor.id), eq(payouts.status, "needs_attention")))
  for (const b of blocked) await retryPayout(b.id, userId).catch(() => undefined)
  return { ok: true, data: { account: masked } }
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

export type AdminEscrowView = {
  holds: {
    id: string
    status: string
    gross: number
    net: number
    commission: number
    vendorName: string | null
    garageName: string | null
    orderNumber: string | null
    disputeReason: string | null
    releaseAfter: string | null
    createdAt: string
  }[]
  payouts: { id: string; amount: number; status: string; method: string; purpose: string; lastError: string | null; attempts: number; createdAt: string }[]
}

export async function adminEscrowView(): Promise<AdminEscrowView | null> {
  if (!(await requirePlatformAdmin())) return null
  const [holds, pays] = await Promise.all([
    db()
      .select({
        h: escrowHolds,
        vendorName: vendors.businessName,
        garageName: garages.name,
        orderNumber: vendorOrders.number,
      })
      .from(escrowHolds)
      .leftJoin(vendors, and(eq(escrowHolds.payeeType, "vendor"), eq(vendors.id, escrowHolds.payeeId)))
      .leftJoin(garages, eq(garages.id, escrowHolds.garageId))
      .leftJoin(vendorOrders, and(eq(escrowHolds.entityType, "vendor_order"), eq(vendorOrders.id, escrowHolds.entityId)))
      .where(inArray(escrowHolds.status, ["held", "disputed"]))
      .orderBy(desc(escrowHolds.status), desc(escrowHolds.createdAt))
      .limit(100),
    db()
      .select()
      .from(payouts)
      .where(or(eq(payouts.status, "needs_attention"), eq(payouts.status, "pending_confirmation"), eq(payouts.status, "queued")))
      .orderBy(desc(payouts.createdAt))
      .limit(100),
  ])
  return {
    holds: holds.map(({ h, vendorName, garageName, orderNumber }) => ({
      id: h.id,
      status: h.status,
      gross: Number(h.grossAmount),
      net: Number(h.netAmount),
      commission: Number(h.commissionAmount),
      vendorName,
      garageName,
      orderNumber,
      disputeReason: h.disputeReason,
      releaseAfter: h.releaseAfter?.toISOString() ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    payouts: pays.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      method: p.method,
      purpose: p.purpose,
      lastError: p.lastError,
      attempts: p.attempts,
      createdAt: p.createdAt.toISOString(),
    })),
  }
}

const decisionSchema = z.object({ holdId: z.string().uuid(), decision: z.enum(["release", "refund"]), note: z.string().trim().min(3).max(500) })

export async function adminDecideHold(rawInput: unknown): Promise<ActionResult<{ ok: true }>> {
  const adminId = await requirePlatformAdmin()
  if (!adminId) return fail("FORBIDDEN", "Platform admin only")
  const parsed = decisionSchema.safeParse(rawInput)
  if (!parsed.success) return fail("VALIDATION", "Add a short note explaining the decision")
  const d = parsed.data
  const r = d.decision === "release" ? await releaseHold(d.holdId, { actorUserId: adminId, note: d.note }) : await refundHold(d.holdId, { actorUserId: adminId, note: d.note })
  return r.ok ? { ok: true, data: { ok: true } } : fail("VALIDATION", r.message ?? "Could not update")
}

export async function adminRetryPayout(rawId: unknown): Promise<ActionResult<{ message: string }>> {
  const adminId = await requirePlatformAdmin()
  if (!adminId) return fail("FORBIDDEN", "Platform admin only")
  const id = z.string().uuid().safeParse(rawId)
  if (!id.success) return fail("VALIDATION", "Invalid payout")
  const r = await retryPayout(id.data, adminId)
  return r.ok ? { ok: true, data: { message: r.message ?? "Retried" } } : fail("VALIDATION", r.message ?? "Could not retry")
}
