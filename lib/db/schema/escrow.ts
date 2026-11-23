import { sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { garages, users } from "./identity"

const money = (name: string) => bigint(name, { mode: "bigint" })

/**
 * 12-digit numeric payment references (theTeller requires a unique 12-digit
 * transaction_id). Used for every collection and payout regardless of provider.
 */
export const paymentTxnSeq = pgSequence("payment_txn_seq", { startWith: 100000000001, increment: 1, maxValue: 999999999999 })

/**
 * escrow_holds — money FixAm holds on behalf of a payee (vendor or garage)
 * until the buyer confirms receipt, a timer expires, or an admin decides.
 * Status: pending_payment → held → released | refunded; held ⇄ disputed.
 */
export const escrowHolds = pgTable(
  "escrow_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").references(() => garages.id), // buyer garage (null = driver purchase)
    buyerUserId: uuid("buyer_user_id").references(() => users.id),
    entityType: text("entity_type").notNull(), // vendor_order
    entityId: uuid("entity_id").notNull(),
    payeeType: text("payee_type").notNull(), // vendor|garage
    payeeId: uuid("payee_id").notNull(),
    paymentReference: text("payment_reference"),
    payerPhone: text("payer_phone"), // E.164, for MoMo refunds
    payerNetwork: text("payer_network"), // mtn|telecel|airteltigo
    grossAmount: money("gross_amount").notNull(),
    commissionAmount: money("commission_amount").notNull().default(sql`0`),
    /** Fitting fee owed to the fitting garage when a driver buys their own part. */
    fittingFeeAmount: money("fitting_fee_amount").notNull().default(sql`0`),
    fittingGarageId: uuid("fitting_garage_id").references(() => garages.id),
    netAmount: money("net_amount").notNull(),
    status: text("status").notNull().default("pending_payment"),
    heldAt: timestamp("held_at", { withTimezone: true }),
    releaseAfter: timestamp("release_after", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    disputeReason: text("dispute_reason"),
    disputeOpenedBy: uuid("dispute_opened_by").references(() => users.id),
    disputeOpenedAt: timestamp("dispute_opened_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("escrow_holds_entity_uniq").on(t.entityType, t.entityId),
    index("escrow_holds_status_idx").on(t.status, t.releaseAfter),
    index("escrow_holds_payee_idx").on(t.payeeType, t.payeeId, t.status),
    index("escrow_holds_reference_idx").on(t.paymentReference),
  ]
)

/**
 * payouts — money leaving FixAm's float to a vendor, garage or (refund) customer.
 * Status: queued → processing → succeeded | failed (retried with backoff, then needs_attention).
 */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escrowHoldId: uuid("escrow_hold_id").references(() => escrowHolds.id),
    purpose: text("purpose").notNull(), // vendor_release|fitting_fee|refund
    recipientType: text("recipient_type").notNull(), // vendor|garage|customer
    recipientId: uuid("recipient_id"),
    method: text("method").notNull(), // momo|bank
    network: text("network"), // mtn|telecel|airteltigo (momo)
    bankCode: text("bank_code"), // e.g. GCB (bank)
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name"),
    amount: money("amount").notNull(),
    transactionId: text("transaction_id").notNull(), // 12-digit
    providerReference: text("provider_reference"), // bank reference_id
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payouts_transaction_uniq").on(t.transactionId),
    uniqueIndex("payouts_hold_purpose_uniq").on(t.escrowHoldId, t.purpose),
    index("payouts_status_idx").on(t.status, t.nextAttemptAt),
    index("payouts_recipient_idx").on(t.recipientType, t.recipientId),
  ]
)

/**
 * ledger_entries — append-only record of every money movement. `idempotency_key`
 * is unique so replays (poller + redirect, retries) can never double-count.
 * Accounts: customer_funds, escrow, vendor_payable, garage_payable,
 * fixam_commission, payout_clearing, refund.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    escrowHoldId: uuid("escrow_hold_id").references(() => escrowHolds.id),
    payoutId: uuid("payout_id").references(() => payouts.id),
    debitAccount: text("debit_account").notNull(),
    creditAccount: text("credit_account").notNull(),
    amount: money("amount").notNull(),
    memo: text("memo"),
    meta: jsonb("meta"),
    idempotencyKey: text("idempotency_key").notNull(),
    actorUserId: uuid("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_entries_idem_uniq").on(t.idempotencyKey),
    index("ledger_entries_hold_idx").on(t.escrowHoldId),
  ]
)
