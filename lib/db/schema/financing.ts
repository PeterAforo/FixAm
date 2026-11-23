import { sql } from "drizzle-orm"
import { bigint, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { customers } from "./customers"
import { garages } from "./identity"
import { invoices, payments } from "./money"
import { jobs } from "./workshop"

const money = (name: string) => bigint(name, { mode: "bigint" })

/**
 * financing_applications — "fix now, pay later" with a partner lender (P8-14).
 * Applied for from the estimate approval page or the invoice page. Once
 * approved and the invoice exists, the lender pays the garage and the invoice
 * gets a "financing" payment. The Ghana Card number goes to the lender only;
 * it is never stored here.
 *
 * status: pending → approved → disbursed → completed · declined · cancelled
 */
export const financingApplications = pgTable(
  "financing_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull(),
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    customerId: uuid("customer_id").references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    estimateId: uuid("estimate_id"),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    applicantName: text("applicant_name").notNull(),
    applicantPhone: text("applicant_phone").notNull(),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    status: text("status").notNull().default("pending"),
    declineReason: text("decline_reason"),
    /** Amount applied for (pesewas). */
    amountRequested: money("amount_requested").notNull(),
    /** Amount the lender actually paid the garage. */
    amountFinanced: money("amount_financed"),
    months: integer("months").notNull(),
    maxMonths: integer("max_months"),
    monthlyRateBp: integer("monthly_rate_bp"),
    rateLabel: text("rate_label"),
    totalRepayable: money("total_repayable"),
    monthlyPayment: money("monthly_payment"),
    paymentId: uuid("payment_id").references(() => payments.id),
    disbursementRef: text("disbursement_ref"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("financing_applications_reference_uniq").on(t.reference),
    index("financing_applications_phone_idx").on(t.applicantPhone),
    index("financing_applications_job_idx").on(t.jobId),
    index("financing_applications_invoice_idx").on(t.invoiceId),
    index("financing_applications_status_idx").on(t.status),
  ]
)

/** One row per monthly repayment of a disbursed application. */
export const financingRepayments = pgTable(
  "financing_repayments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull().references(() => financingApplications.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    paidAmount: money("paid_amount").notNull().default(sql`0`),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Last reminder stage sent (0 none, 1 three days before, 2 due today, 3/4 late). */
    reminderStage: integer("reminder_stage").notNull().default(0),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("financing_repayments_app_seq_uniq").on(t.applicationId, t.sequence),
    index("financing_repayments_due_idx").on(t.dueDate),
  ]
)
