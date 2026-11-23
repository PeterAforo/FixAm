import "server-only"
import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { escrowHolds, garages, ledgerEntries, payments, payouts, riders, sosRequests, towOperators, vendorOrderEvents, vendorOrders, vendors } from "@/lib/db/schema"
import { paymentProvider, payoutProvider } from "@/lib/integrations/payments"
import { messagingProvider } from "@/lib/integrations"
import { writeAuditLog } from "@/lib/actions"
import { nextPaymentReference } from "@/lib/payments/reference"
import { decryptPayoutAccount } from "./payout-account"
import { computeSplit, fromStatesFor, MAX_PAYOUT_ATTEMPTS, payoutBackoffMs } from "./split"

type Hold = typeof escrowHolds.$inferSelect
type Payout = typeof payouts.$inferSelect

/** Default buyer-protection window after delivery before funds auto-release. */
export const AUTO_RELEASE_HOURS = 72

// ---------------------------------------------------------------------------
// Ledger + alerts
// ---------------------------------------------------------------------------

/** Append a ledger line; a repeated idempotency key is silently ignored. */
async function ledger(e: {
  holdId?: string | null
  payoutId?: string | null
  debit: string
  credit: string
  amount: bigint
  key: string
  memo?: string
  actorUserId?: string | null
  meta?: Record<string, unknown>
}) {
  if (e.amount <= 0n) return
  await db()
    .insert(ledgerEntries)
    .values({
      escrowHoldId: e.holdId ?? null,
      payoutId: e.payoutId ?? null,
      debitAccount: e.debit,
      creditAccount: e.credit,
      amount: e.amount,
      idempotencyKey: e.key,
      memo: e.memo ?? null,
      actorUserId: e.actorUserId ?? null,
      meta: e.meta ?? null,
    })
    .onConflictDoNothing({ target: ledgerEntries.idempotencyKey })
}

async function audit(action: string, entityType: string, entityId: string, after: Record<string, unknown>, actorUserId?: string | null, garageId?: string | null) {
  await writeAuditLog({ garageId: garageId ?? null, actorUserId: actorUserId ?? null, action, entityType, entityId, after }).catch(() => undefined)
}

/** Tell the FixAm team something needs a human (SMS to ADMIN_ALERT_PHONE + audit). */
export async function alertAdmin(subject: string, body: string, entity?: { type: string; id: string }) {
  await audit("admin.alert", entity?.type ?? "platform", entity?.id ?? "00000000-0000-0000-0000-000000000000", { subject, body })
  const to = process.env.ADMIN_ALERT_PHONE
  if (!to) return
  await messagingProvider("sms")
    .send({
      channel: "sms",
      to,
      templateKey: "admin.alert",
      variables: {},
      rendered: { body: `FixAm alert: ${subject}. ${body}`.slice(0, 300) },
      idempotencyKey: `alert:${subject}:${entity?.id ?? ""}:${Math.floor(Date.now() / 3600_000)}`,
    })
    .catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

export async function createHold(input: {
  entityType: "vendor_order"
  entityId: string
  garageId?: string | null
  buyerUserId?: string | null
  payeeType: "vendor" | "garage"
  payeeId: string
  gross: bigint
  commissionAmount?: bigint | null
  commissionBp?: number
  fittingFee?: bigint | null
  fittingGarageId?: string | null
  paymentReference?: string | null
  payerPhone?: string | null
  payerNetwork?: string | null
}): Promise<Hold> {
  const split = computeSplit({
    gross: input.gross,
    commissionAmount: input.commissionAmount,
    commissionBp: input.commissionBp,
    fittingFee: input.fittingFee,
  })
  await db()
    .insert(escrowHolds)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      garageId: input.garageId ?? null,
      buyerUserId: input.buyerUserId ?? null,
      payeeType: input.payeeType,
      payeeId: input.payeeId,
      grossAmount: split.gross,
      commissionAmount: split.commission,
      fittingFeeAmount: split.fittingFee,
      fittingGarageId: input.fittingGarageId ?? null,
      netAmount: split.net,
      paymentReference: input.paymentReference ?? null,
      payerPhone: input.payerPhone ?? null,
      payerNetwork: input.payerNetwork ?? null,
      status: "pending_payment",
    })
    .onConflictDoUpdate({
      target: [escrowHolds.entityType, escrowHolds.entityId],
      // A new checkout attempt for an unpaid order just swaps the reference.
      set: { paymentReference: sql`case when ${escrowHolds.status} = 'pending_payment' then excluded.payment_reference else ${escrowHolds.paymentReference} end`, updatedAt: new Date() },
    })
  const [hold] = await db()
    .select()
    .from(escrowHolds)
    .where(and(eq(escrowHolds.entityType, input.entityType), eq(escrowHolds.entityId, input.entityId)))
    .limit(1)
  return hold!
}

/** Atomically move a hold between states; returns the updated row or null if it was not in an allowed state. */
async function transition(holdId: string, to: string, set: Partial<typeof escrowHolds.$inferInsert>): Promise<Hold | null> {
  const [row] = await db()
    .update(escrowHolds)
    .set({ ...set, status: to, updatedAt: new Date() })
    .where(and(eq(escrowHolds.id, holdId), inArray(escrowHolds.status, fromStatesFor(to))))
    .returning()
  return row ?? null
}

export async function getHoldForEntity(entityType: string, entityId: string): Promise<Hold | null> {
  const [h] = await db().select().from(escrowHolds).where(and(eq(escrowHolds.entityType, entityType), eq(escrowHolds.entityId, entityId))).limit(1)
  return h ?? null
}

/** Payment confirmed → money is now held. Idempotent. */
export async function markHoldPaid(holdId: string, opts: { releaseAfter?: Date | null } = {}): Promise<Hold | null> {
  const row = await transition(holdId, "held", { heldAt: new Date(), releaseAfter: opts.releaseAfter ?? null })
  if (!row) return null
  await ledger({ holdId, debit: "customer_funds", credit: "escrow", amount: row.grossAmount, key: `hold:${holdId}:held`, memo: `Payment ${row.paymentReference ?? ""}` })
  await audit("escrow.held", "escrow_hold", holdId, { reference: row.paymentReference, gross: Number(row.grossAmount) }, null, row.garageId)
  return row
}

/** Start (or restart) the auto-release timer — e.g. when the vendor marks delivered. */
export async function scheduleAutoRelease(holdId: string, hours = AUTO_RELEASE_HOURS) {
  await db()
    .update(escrowHolds)
    .set({ releaseAfter: new Date(Date.now() + hours * 3600_000), updatedAt: new Date() })
    .where(and(eq(escrowHolds.id, holdId), eq(escrowHolds.status, "held")))
}

export async function cancelHold(holdId: string, reason: string) {
  const row = await transition(holdId, "cancelled", { resolutionNote: reason })
  if (row) await audit("escrow.cancelled", "escrow_hold", holdId, { reason }, null, row.garageId)
}

/** Release funds to the payee: commission + fitting fee booked, payout queued. */
export async function releaseHold(holdId: string, opts: { actorUserId?: string | null; note?: string } = {}): Promise<{ ok: boolean; message?: string }> {
  const row = await transition(holdId, "released", {
    releasedAt: new Date(),
    resolvedBy: opts.actorUserId ?? null,
    resolutionNote: opts.note ?? null,
  })
  if (!row) return { ok: false, message: "Funds are not in a releasable state" }

  const base = `hold:${holdId}:release`
  const payable = row.payeeType === "vendor" ? "vendor_payable" : "garage_payable"
  await ledger({ holdId, debit: "escrow", credit: "fixam_commission", amount: row.commissionAmount, key: `${base}:commission`, actorUserId: opts.actorUserId })
  await ledger({ holdId, debit: "escrow", credit: "garage_payable", amount: row.fittingFeeAmount, key: `${base}:fitting`, actorUserId: opts.actorUserId, meta: { garageId: row.fittingGarageId } })
  await ledger({ holdId, debit: "escrow", credit: payable, amount: row.netAmount, key: `${base}:net`, actorUserId: opts.actorUserId })
  await audit("escrow.released", "escrow_hold", holdId, { net: Number(row.netAmount), commission: Number(row.commissionAmount), note: opts.note }, opts.actorUserId, row.garageId)

  if (row.netAmount > 0n) await queuePayout(row, "vendor_release", row.netAmount)
  if (row.fittingFeeAmount > 0n && row.fittingGarageId) await queuePayout(row, "fitting_fee", row.fittingFeeAmount)
  return { ok: true }
}

/** Refund the buyer (MoMo payout to the payer, or card reversal). */
export async function refundHold(holdId: string, opts: { actorUserId?: string | null; note?: string } = {}): Promise<{ ok: boolean; message?: string }> {
  const row = await transition(holdId, "refunded", {
    refundedAt: new Date(),
    resolvedBy: opts.actorUserId ?? null,
    resolutionNote: opts.note ?? null,
  })
  if (!row) return { ok: false, message: "Funds are not in a refundable state" }
  await ledger({ holdId, debit: "escrow", credit: "refund", amount: row.grossAmount, key: `hold:${holdId}:refund`, actorUserId: opts.actorUserId })
  await audit("escrow.refunded", "escrow_hold", holdId, { gross: Number(row.grossAmount), note: opts.note }, opts.actorUserId, row.garageId)

  if (row.payerPhone && row.payerNetwork) {
    await queuePayout(row, "refund", row.grossAmount)
  } else if (row.paymentReference) {
    // Card (or unknown) payment — try a gateway reversal.
    try {
      await paymentProvider().refund({ reference: row.paymentReference, amountPesewas: row.grossAmount })
    } catch (e) {
      await alertAdmin("Manual refund needed", `Hold ${holdId}: ${(e as Error).message}`, { type: "escrow_hold", id: holdId })
    }
  }
  return { ok: true }
}

export async function openDispute(holdId: string, opts: { userId: string; reason: string }): Promise<{ ok: boolean; message?: string }> {
  const row = await transition(holdId, "disputed", { disputeReason: opts.reason, disputeOpenedBy: opts.userId, disputeOpenedAt: new Date() })
  if (!row) return { ok: false, message: "This order can no longer be disputed" }
  await audit("escrow.disputed", "escrow_hold", holdId, { reason: opts.reason }, opts.userId, row.garageId)
  await alertAdmin("Dispute opened", `${opts.reason.slice(0, 120)}`, { type: "escrow_hold", id: holdId })
  return { ok: true }
}

export async function resolveDispute(holdId: string, opts: { adminId: string; decision: "release" | "refund"; note: string }) {
  return opts.decision === "release"
    ? releaseHold(holdId, { actorUserId: opts.adminId, note: opts.note })
    : refundHold(holdId, { actorUserId: opts.adminId, note: opts.note })
}

/** Cron: release held funds whose buyer-protection window has passed. */
export async function autoReleaseDue(limit = 50): Promise<number> {
  const due = await db()
    .select({ id: escrowHolds.id })
    .from(escrowHolds)
    .where(and(eq(escrowHolds.status, "held"), isNotNull(escrowHolds.releaseAfter), lte(escrowHolds.releaseAfter, new Date())))
    .limit(limit)
  let n = 0
  for (const h of due) if ((await releaseHold(h.id, { note: "Auto-released after buyer-protection window" })).ok) n++
  return n
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

type PayoutTarget =
  | { method: "momo"; phone: string; network: "mtn" | "telecel" | "airteltigo"; accountName: string | null }
  | { method: "bank"; bankCode: string; accountNumber: string; accountName: string | null }

async function accountFor(type: "vendor" | "garage" | "tow_operator" | "rider", id: string): Promise<PayoutTarget | null> {
  const [row] =
    type === "vendor"
      ? await db().select({ details: vendors.payoutDetailsEncrypted }).from(vendors).where(eq(vendors.id, id)).limit(1)
      : type === "tow_operator"
        ? await db().select({ details: towOperators.payoutDetailsEncrypted }).from(towOperators).where(eq(towOperators.id, id)).limit(1)
        : type === "rider"
          ? await db().select({ details: riders.payoutDetailsEncrypted }).from(riders).where(eq(riders.id, id)).limit(1)
          : await db().select({ details: garages.payoutDetailsEncrypted }).from(garages).where(eq(garages.id, id)).limit(1)
  const acct = decryptPayoutAccount(row?.details)
  if (!acct) return null
  return acct.method === "momo"
    ? { method: "momo", phone: acct.phone, network: acct.network, accountName: acct.accountName }
    : { method: "bank", bankCode: acct.bankCode, accountNumber: acct.accountNumber, accountName: acct.accountName }
}

async function recipientAccount(hold: Hold, purpose: string): Promise<PayoutTarget | null> {
  if (purpose === "refund") {
    return hold.payerPhone && hold.payerNetwork
      ? { method: "momo", phone: hold.payerPhone, network: hold.payerNetwork as "mtn" | "telecel" | "airteltigo", accountName: null }
      : null
  }
  if (purpose === "fitting_fee") return hold.fittingGarageId ? accountFor("garage", hold.fittingGarageId) : null
  return accountFor(hold.payeeType === "vendor" ? "vendor" : "garage", hold.payeeId)
}

async function queuePayout(hold: Hold, purpose: "vendor_release" | "refund" | "fitting_fee", amount: bigint) {
  const acct = await recipientAccount(hold, purpose)
  const recipientType = purpose === "refund" ? "customer" : purpose === "fitting_fee" ? "garage" : hold.payeeType
  const recipientId = purpose === "refund" ? hold.buyerUserId : purpose === "fitting_fee" ? hold.fittingGarageId : hold.payeeId
  await insertPayout({ holdId: hold.id, purpose, recipientType, recipientId, acct, amount })
}

/** Queue a payout row (idempotent by hold+purpose or by key) and kick off sending. */
async function insertPayout(input: {
  holdId?: string | null
  key?: string
  purpose: string
  recipientType: string
  recipientId: string | null
  acct: PayoutTarget | null
  amount: bigint
}) {
  const { acct } = input
  const transactionId = await nextPaymentReference()
  const lastError = acct ? null : input.recipientType === "customer" ? "No account to refund to" : `The ${input.recipientType} has no payout account`
  const [p] = await db()
    .insert(payouts)
    .values({
      escrowHoldId: input.holdId ?? null,
      idempotencyKey: input.key ?? null,
      purpose: input.purpose,
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      method: acct?.method ?? "momo",
      network: acct && acct.method === "momo" ? acct.network : null,
      bankCode: acct && acct.method === "bank" ? acct.bankCode : null,
      accountNumber: acct ? (acct.method === "momo" ? acct.phone : acct.accountNumber) : "",
      accountName: acct?.accountName ?? null,
      amount: input.amount,
      transactionId,
      status: acct ? "queued" : "needs_attention",
      lastError,
    })
    .onConflictDoNothing()
    .returning()
  if (!p) return // already queued
  await audit("payout.queued", "payout", p.id, { purpose: input.purpose, amount: Number(input.amount), status: p.status })
  if (!acct) {
    await alertAdmin("Payout blocked", `${lastError} (${input.purpose})`, { type: "payout", id: p.id })
    return
  }
  try {
    const { inngest } = await import("@/lib/inngest/client")
    await inngest.send({ name: "payout/queued", data: { payoutId: p.id } })
  } catch {
    // the payout cron picks it up
  }
}

/**
 * Money a customer paid FixAm on a garage's behalf (online invoice payments —
 * theTeller has no split payments). Books it to garage_payable and queues a
 * payout to the garage. Idempotent per key.
 */
/** P8-15: a tow paid by MoMo (held by FixAm) is paid out to the operator once the job is done. */
export async function queueTowSettlement(input: { operatorId: string; amount: bigint; key: string; memo: string }) {
  if (input.amount <= 0n) return
  await ledger({ debit: "customer_funds", credit: "tow_payable", amount: input.amount, key: `${input.key}:collected`, memo: input.memo, meta: { operatorId: input.operatorId } })
  const acct = await accountFor("tow_operator", input.operatorId)
  await insertPayout({ key: input.key, purpose: "tow_settlement", recipientType: "tow_operator", recipientId: input.operatorId, acct, amount: input.amount })
}

/** P8-18: a confirmed delivery pays the FixAm rider's earning to their MoMo. Funded by FixAm's float. */
export async function queueRiderSettlement(input: { riderId: string; amount: bigint; key: string; memo: string }) {
  if (input.amount <= 0n) return
  await ledger({ debit: "fixam_float", credit: "rider_payable", amount: input.amount, key: `${input.key}:collected`, memo: input.memo, meta: { riderId: input.riderId } })
  const acct = await accountFor("rider", input.riderId)
  await insertPayout({ key: input.key, purpose: "rider_earning", recipientType: "rider", recipientId: input.riderId, acct, amount: input.amount })
}

export async function queueGarageSettlement(input: { garageId: string; amount: bigint; key: string; memo: string }) {
  if (input.amount <= 0n) return
  await ledger({ debit: "customer_funds", credit: "garage_payable", amount: input.amount, key: `${input.key}:collected`, memo: input.memo, meta: { garageId: input.garageId } })
  const acct = await accountFor("garage", input.garageId)
  await insertPayout({ key: input.key, purpose: "invoice_settlement", recipientType: "garage", recipientId: input.garageId, acct, amount: input.amount })
}

/**
 * Send one payout. Safe to call concurrently and repeatedly: the row is
 * claimed with a conditional update, and before a retry the previous
 * transaction id is re-checked so money is never sent twice.
 */
export async function processPayout(payoutId: string): Promise<Payout["status"] | "skipped"> {
  const now = new Date()
  const [claimed] = await db()
    .update(payouts)
    .set({ status: "processing", attempts: sql`${payouts.attempts} + 1`, updatedAt: now })
    .where(and(eq(payouts.id, payoutId), eq(payouts.status, "queued"), or(lte(payouts.nextAttemptAt, now), sql`${payouts.nextAttemptAt} is null`)))
    .returning()
  if (!claimed) return "skipped"

  const provider = payoutProvider()
  let txnId = claimed.transactionId
  if (claimed.attempts > 1 || claimed.lastError) {
    // Did the previous attempt actually land?
    const prev = await provider.verifyTransfer(txnId).catch(() => null)
    if (prev?.status === "success") return finishPayout(claimed, prev.providerReference)
    if (prev?.status === "pending") return markPendingConfirmation(claimed)
    txnId = await nextPaymentReference()
    await db().update(payouts).set({ transactionId: txnId }).where(eq(payouts.id, claimed.id))
  }

  const description = claimed.purpose === "refund" ? "FixAm refund" : "FixAm payout"
  const result =
    claimed.method === "bank"
      ? await provider.transferBank({
          amountPesewas: claimed.amount,
          accountNumber: claimed.accountNumber,
          bankCode: claimed.bankCode ?? "",
          transactionId: txnId,
          description,
          expectedName: claimed.accountName ?? undefined,
        })
      : await provider.transferMomo({
          amountPesewas: claimed.amount,
          phone: claimed.accountNumber,
          network: (claimed.network ?? "mtn") as "mtn" | "telecel" | "airteltigo",
          transactionId: txnId,
          description,
        })

  if (result.status === "success") return finishPayout(claimed, result.providerReference)
  if (result.status === "pending") return markPendingConfirmation(claimed, result.providerReference)

  const exhausted = !result.retryable || claimed.attempts >= MAX_PAYOUT_ATTEMPTS
  await db()
    .update(payouts)
    .set({
      status: exhausted ? "needs_attention" : "queued",
      lastError: `${result.code}: ${result.message}`,
      nextAttemptAt: exhausted ? null : new Date(Date.now() + payoutBackoffMs(claimed.attempts)),
      updatedAt: new Date(),
    })
    .where(eq(payouts.id, claimed.id))
  await audit("payout.failed", "payout", claimed.id, { attempt: claimed.attempts, code: result.code, final: exhausted })
  if (exhausted) await alertAdmin("Payout failed", `${result.message} — GH₵${(Number(claimed.amount) / 100).toFixed(2)}`, { type: "payout", id: claimed.id })
  return exhausted ? "needs_attention" : "queued"
}

async function finishPayout(p: Payout, providerReference?: string) {
  await db()
    .update(payouts)
    .set({ status: "succeeded", completedAt: new Date(), providerReference: providerReference ?? p.providerReference, lastError: null, updatedAt: new Date() })
    .where(eq(payouts.id, p.id))
  const from = p.purpose === "refund" ? "refund" : p.recipientType === "vendor" ? "vendor_payable" : p.recipientType === "tow_operator" ? "tow_payable" : p.recipientType === "rider" ? "rider_payable" : "garage_payable" // fitting fees + invoice settlements
  await ledger({ holdId: p.escrowHoldId, payoutId: p.id, debit: from, credit: "payout_clearing", amount: p.amount, key: `payout:${p.id}:sent`, memo: `${p.method} ${p.transactionId}` })
  await audit("payout.succeeded", "payout", p.id, { amount: Number(p.amount), transactionId: p.transactionId })
  return "succeeded" as const
}

async function markPendingConfirmation(p: Payout, providerReference?: string) {
  await db()
    .update(payouts)
    .set({ status: "pending_confirmation", providerReference: providerReference ?? p.providerReference, updatedAt: new Date() })
    .where(eq(payouts.id, p.id))
  return "pending_confirmation" as const
}

/** Cron: confirm payouts the gateway left pending; send due queued payouts. */
export async function sweepPayouts(limit = 25): Promise<{ sent: number; confirmed: number }> {
  const provider = payoutProvider()
  let confirmed = 0
  const pending = await db().select().from(payouts).where(eq(payouts.status, "pending_confirmation")).limit(limit)
  for (const p of pending) {
    const r = await provider.verifyTransfer(p.transactionId).catch(() => null)
    if (r?.status === "success") {
      await finishPayout(p, r.providerReference)
      confirmed++
    } else if (r?.status === "failed") {
      await db()
        .update(payouts)
        .set({ status: "queued", lastError: `${r.code}: ${r.message}`, nextAttemptAt: new Date(Date.now() + payoutBackoffMs(p.attempts)), updatedAt: new Date() })
        .where(and(eq(payouts.id, p.id), eq(payouts.status, "pending_confirmation")))
    }
  }
  const due = await db()
    .select({ id: payouts.id })
    .from(payouts)
    .where(and(eq(payouts.status, "queued"), or(lte(payouts.nextAttemptAt, new Date()), sql`${payouts.nextAttemptAt} is null`)))
    .limit(limit)
  let sent = 0
  for (const p of due) if ((await processPayout(p.id)) === "succeeded") sent++
  return { sent, confirmed }
}

/** Admin: retry a payout that needs attention (e.g. after the vendor fixed their account). */
export async function retryPayout(payoutId: string, adminId: string): Promise<{ ok: boolean; message?: string }> {
  const [p] = await db().select().from(payouts).where(eq(payouts.id, payoutId)).limit(1)
  if (!p || !["needs_attention", "queued"].includes(p.status)) return { ok: false, message: "Payout can't be retried" }
  let patch: Partial<typeof payouts.$inferInsert> = {}
  if (p.purpose !== "refund") {
    let acct: PayoutTarget | null = null
    if (p.escrowHoldId) {
      const [hold] = await db().select().from(escrowHolds).where(eq(escrowHolds.id, p.escrowHoldId)).limit(1)
      acct = hold ? await recipientAccount(hold, p.purpose) : null
    } else if (p.recipientId && (p.recipientType === "garage" || p.recipientType === "vendor" || p.recipientType === "tow_operator")) {
      acct = await accountFor(p.recipientType, p.recipientId)
    }
    if (!acct) return { ok: false, message: `The ${p.recipientType} still has no valid payout account` }
    patch = {
      method: acct.method,
      network: acct.method === "momo" ? acct.network : null,
      bankCode: acct.method === "bank" ? acct.bankCode : null,
      accountNumber: acct.method === "momo" ? acct.phone : acct.accountNumber,
      accountName: acct.accountName,
    }
  }
  await db()
    .update(payouts)
    .set({ ...patch, status: "queued", attempts: p.status === "needs_attention" ? 0 : p.attempts, nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(eq(payouts.id, p.id))
  await audit("payout.retry", "payout", p.id, {}, adminId)
  const status = await processPayout(p.id)
  return { ok: true, message: status === "succeeded" ? "Payout sent" : `Payout ${status.replace("_", " ")}` }
}

// ---------------------------------------------------------------------------
// Reconciling collections (redirect handler + poller)
// ---------------------------------------------------------------------------

export type ReconcileStatus = "success" | "pending" | "failed" | "unknown"

/**
 * Confirm a payment reference with the gateway and settle whatever it paid
 * for (invoice payments, vendor orders + escrow holds). Idempotent.
 */
export async function reconcileReference(reference: string): Promise<ReconcileStatus> {
  // 1. Garage invoice / instalment payments.
  const [p] = await db().select({ id: payments.id, status: payments.status }).from(payments).where(eq(payments.paystackReference, reference)).limit(1)
  if (p) {
    if (p.status === "succeeded") return "success"
    if (p.status === "failed") return "failed"
    const v = await paymentProvider().verify(reference)
    if (v.status === "pending") return "pending"
    const { handlePaystackEvent } = await import("@/lib/money/paystack-webhook")
    await handlePaystackEvent({ event: v.status === "success" ? "charge.success" : "charge.failed", data: { reference } })
    return v.status
  }

  // 2. SOS tow payments (P8-15).
  const [sos] = await db().select({ id: sosRequests.id, paymentStatus: sosRequests.paymentStatus }).from(sosRequests).where(eq(sosRequests.paymentReference, reference)).limit(1)
  if (sos) {
    if (sos.paymentStatus === "paid") return "success"
    const v = await paymentProvider().verify(reference)
    if (v.status === "pending") return "pending"
    const { markSosPayment } = await import("@/lib/towing/service")
    await markSosPayment(sos.id, v.status === "success", v.amountPesewas)
    return v.status
  }

  // 3. Vendor orders (one reference may cover several vendors' orders).
  const orders = await db().select().from(vendorOrders).where(eq(vendorOrders.paystackReference, reference))
  if (orders.length === 0) return "unknown"
  if (orders.every((o) => o.paymentStatus === "paid")) return "success"

  const v = await paymentProvider().verify(reference)
  if (v.status === "pending") return "pending"
  const expected = orders.reduce((s, o) => s + o.total + (o.fittingFee ?? 0n), 0n)

  if (v.status === "failed") {
    for (const o of orders) {
      if (o.paymentStatus === "paid") continue
      await db().update(vendorOrders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(eq(vendorOrders.id, o.id))
      const hold = await getHoldForEntity("vendor_order", o.id)
      if (hold) await cancelHold(hold.id, "Payment failed")
    }
    return "failed"
  }

  if (v.amountPesewas > 0n && v.amountPesewas < expected) {
    await alertAdmin("Underpayment", `Reference ${reference}: paid ${v.amountPesewas} of ${expected} pesewas`, { type: "vendor_order", id: orders[0]!.id })
    return "pending"
  }

  for (const o of orders) {
    if (o.paymentStatus === "paid") continue
    const [updated] = await db()
      .update(vendorOrders)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(and(eq(vendorOrders.id, o.id), sql`${vendorOrders.paymentStatus} is distinct from 'paid'`))
      .returning({ id: vendorOrders.id })
    if (!updated) continue
    await db().insert(vendorOrderEvents).values({ garageId: o.garageId, vendorOrderId: o.id, status: o.status, note: `Payment confirmed (${reference})` })
    const hold =
      (await getHoldForEntity("vendor_order", o.id)) ??
      (await createHold({
        entityType: "vendor_order",
        entityId: o.id,
        garageId: o.garageId,
        buyerUserId: o.buyerUserId ?? o.orderedByUserId,
        payeeType: "vendor",
        payeeId: o.vendorId,
        gross: o.total + (o.fittingFee ?? 0n),
        commissionAmount: o.commissionAmount ?? 0n,
        fittingFee: o.fittingFee ?? 0n,
        fittingGarageId: o.fittingFee && o.fittingFee > 0n ? o.garageId : null,
        paymentReference: reference,
        payerPhone: o.buyerPhone,
      }))
    // Already delivered/received before payment confirmed? Start the release clock now.
    const releaseAfter = ["delivered", "received"].includes(o.status) ? new Date(Date.now() + AUTO_RELEASE_HOURS * 3600_000) : null
    await markHoldPaid(hold.id, { releaseAfter })
    await audit("vendor_order.paid", "vendor_order", o.id, { reference, total: Number(o.total) }, null, o.garageId)
    const { smsBuyer } = await import("@/lib/parts-shop/notify")
    const [v] = await db().select({ phone: vendors.phone }).from(vendors).where(eq(vendors.id, o.vendorId)).limit(1)
    await smsBuyer(v?.phone, `FixAm: new paid order ${o.number} (GH₵${(Number(o.total) / 100).toFixed(2)}). Accept it on your FixAm vendor page.`, `vo-paid-vendor:${o.id}`)
    if (o.buyerPhone) await smsBuyer(o.buyerPhone, `FixAm: payment received for ${o.number}. We hold it safely until your part arrives.`, `vo-paid-buyer:${o.id}`)
  }
  return "success"
}

/** Cron: references still pending after a couple of minutes (theTeller has no webhooks). */
export async function pendingReferences(limit = 100): Promise<string[]> {
  const olderThan = new Date(Date.now() - 2 * 60_000)
  const newerThan = new Date(Date.now() - 48 * 3600_000)
  const [pay, orders, sos] = await Promise.all([
    db()
      .selectDistinct({ ref: payments.paystackReference })
      .from(payments)
      .where(and(eq(payments.status, "pending"), isNotNull(payments.paystackReference), lte(payments.createdAt, olderThan), sql`${payments.createdAt} > ${newerThan.toISOString()}`))
      .limit(limit),
    db()
      .selectDistinct({ ref: vendorOrders.paystackReference })
      .from(vendorOrders)
      .where(and(eq(vendorOrders.paymentStatus, "pending"), isNotNull(vendorOrders.paystackReference), lte(vendorOrders.updatedAt, olderThan), sql`${vendorOrders.createdAt} > ${newerThan.toISOString()}`))
      .limit(limit),
    db()
      .selectDistinct({ ref: sosRequests.paymentReference })
      .from(sosRequests)
      .where(and(eq(sosRequests.paymentStatus, "pending"), isNotNull(sosRequests.paymentReference), lte(sosRequests.updatedAt, olderThan), sql`${sosRequests.createdAt} > ${newerThan.toISOString()}`))
      .limit(limit),
  ])
  return [...new Set([...pay, ...orders, ...sos].map((r) => r.ref).filter((r): r is string => Boolean(r)))]
}
