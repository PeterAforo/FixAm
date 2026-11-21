import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import {
  creditAccountStatusEnum,
  instalmentStatusEnum,
  invoiceSourceEnum,
  invoiceStatusEnum,
  jobItemTypeEnum,
  paymentMethodEnum,
  paymentPlanStatusEnum,
  paymentStatusEnum,
} from "./enums"
import { branches, garages, users } from "./identity"
import { customers, vehicles } from "./customers"
import { jobItems } from "./workshop"
import { parts } from "./inventory"

const money = (name: string) => bigint(name, { mode: "bigint" })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}
const tenant = {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
}

export const invoices = pgTable(
  "invoices",
  {
    ...tenant,
    branchId: uuid("branch_id").references(() => branches.id),
    number: text("number"), // assigned on issue: INV-...
    source: invoiceSourceEnum("source").notNull(),
    sourceId: uuid("source_id"),
    customerId: uuid("customer_id").references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    subtotal: money("subtotal").notNull().default(sql`0`),
    discountTotal: money("discount_total").notNull().default(sql`0`),
    taxTotal: money("tax_total").notNull().default(sql`0`),
    total: money("total").notNull().default(sql`0`),
    amountPaid: money("amount_paid").notNull().default(sql`0`),
    balanceDue: money("balance_due").notNull().default(sql`0`), // total - paid - credits
    depositApplied: money("deposit_applied").default(sql`0`),
    creditAccountId: uuid("credit_account_id"), // fk below
    paymentPlanId: uuid("payment_plan_id"), // fk below
    pdfPath: text("pdf_path"),
    tokenHash: text("token_hash"),
    notes: text("notes"),
    issuedBy: uuid("issued_by").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedBy: uuid("voided_by"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    ...timestamps,
  },
  (t) => [
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_status_idx").on(t.garageId, t.status),
  ]
)

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    ...tenant,
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    type: jobItemTypeEnum("type").notNull(),
    description: text("description").notNull(),
    partId: uuid("part_id").references(() => parts.id),
    jobItemId: uuid("job_item_id").references(() => jobItems.id),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unitPrice: money("unit_price").notNull(),
    discountAmount: money("discount_amount").default(sql`0`),
    taxBreakdown: jsonb("tax_breakdown"), // [{code, rate_bp, amount}]
    lineTotal: money("line_total").notNull(),
    sortOrder: integer("sort_order").default(0),
    ...timestamps,
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)]
)

export const payments = pgTable(
  "payments",
  {
    ...tenant,
    branchId: uuid("branch_id").references(() => branches.id),
    customerId: uuid("customer_id").references(() => customers.id),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    estimateId: uuid("estimate_id"), // fk:estimates (workshop) — plain uuid to avoid cycle
    instalmentId: uuid("instalment_id"), // fk below
    creditAccountId: uuid("credit_account_id"), // fk below
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amount: money("amount").notNull(),
    momoNetwork: text("momo_network"), // mtn|telecel|airteltigo
    payerPhone: text("payer_phone"),
    paystackReference: text("paystack_reference").unique(),
    externalReference: text("external_reference"),
    receivedBy: uuid("received_by").references(() => users.id),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receiptNumber: text("receipt_number"), // RCT-...
    receiptPdfPath: text("receipt_pdf_path"),
    isDeposit: boolean("is_deposit").default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)]
)

export const paymentAllocations = pgTable("payment_allocations", {
  ...tenant,
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: money("amount").notNull(),
  ...timestamps,
})

export const refunds = pgTable("refunds", {
  ...tenant,
  paymentId: uuid("payment_id")
    .notNull()
    .references(() => payments.id),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  method: paymentMethodEnum("method").notNull(),
  paystackRefundId: text("paystack_refund_id"),
  processedBy: uuid("processed_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
})

export const creditNotes = pgTable("credit_notes", {
  ...tenant,
  number: text("number").notNull(), // CN-...
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  lines: jsonb("lines"),
  issuedBy: uuid("issued_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
})

export const paymentPlans = pgTable(
  "payment_plans",
  {
    ...tenant,
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    totalAmount: money("total_amount").notNull(),
    downPayment: money("down_payment").default(sql`0`),
    instalmentCount: integer("instalment_count").notNull(),
    frequency: text("frequency").notNull(), // weekly|fortnightly|monthly|custom
    startDate: date("start_date").notNull(),
    lateFeeRule: jsonb("late_fee_rule"),
    status: paymentPlanStatusEnum("status").notNull().default("active"),
    approvedBy: uuid("approved_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("payment_plans_invoice_idx").on(t.invoiceId)]
)

export const instalments = pgTable(
  "instalments",
  {
    ...tenant,
    paymentPlanId: uuid("payment_plan_id")
      .notNull()
      .references(() => paymentPlans.id),
    sequence: integer("sequence").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    amountPaid: money("amount_paid").default(sql`0`),
    lateFee: money("late_fee").default(sql`0`),
    status: instalmentStatusEnum("status").notNull().default("upcoming"),
    ...timestamps,
  },
  (t) => [index("instalments_plan_idx").on(t.paymentPlanId)]
)

export const creditAccounts = pgTable(
  "credit_accounts",
  {
    ...tenant,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    creditLimit: money("credit_limit").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    balance: money("balance").notNull().default(sql`0`),
    status: creditAccountStatusEnum("status").notNull().default("active"),
    statementDay: integer("statement_day").default(1),
    approvedBy: uuid("approved_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("credit_accounts_customer_uniq").on(t.garageId, t.customerId)]
)

export const creditStatements = pgTable("credit_statements", {
  ...tenant,
  creditAccountId: uuid("credit_account_id")
    .notNull()
    .references(() => creditAccounts.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  openingBalance: money("opening_balance").notNull(),
  charges: money("charges").notNull(),
  payments: money("payments").notNull(),
  closingBalance: money("closing_balance").notNull(),
  ageing: jsonb("ageing"), // {current, d31_60, d61_90, d90_plus}
  pdfPath: text("pdf_path"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  ...timestamps,
})

export const expenseCategories = pgTable(
  "expense_categories",
  {
    ...tenant,
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("expense_categories_garage_name_uniq").on(t.garageId, t.name)]
)

export const expenses = pgTable("expenses", {
  ...tenant,
  branchId: uuid("branch_id").references(() => branches.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => expenseCategories.id),
  description: text("description").notNull(),
  amount: money("amount").notNull(),
  paidOn: date("paid_on").notNull(),
  method: paymentMethodEnum("method"),
  vendorName: text("vendor_name"),
  receiptPath: text("receipt_path"),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id),
  ...timestamps,
})

export const cashUps = pgTable(
  "cash_ups",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    businessDate: date("business_date").notNull(),
    expectedCash: money("expected_cash").notNull(),
    countedCash: money("counted_cash").notNull(),
    difference: money("difference").notNull(),
    expectedByMethod: jsonb("expected_by_method"),
    notes: text("notes"),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cash_ups_branch_date_uniq").on(t.garageId, t.branchId, t.businessDate),
  ]
)

export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    ...tenant,
    branchId: uuid("branch_id").references(() => branches.id),
    periodType: text("period_type").notNull(), // day|month
    periodStart: date("period_start").notNull(),
    metrics: jsonb("metrics").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("report_snapshots_uniq").on(t.garageId, t.branchId, t.periodType, t.periodStart),
  ]
)
