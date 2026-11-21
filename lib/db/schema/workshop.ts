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
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import {
  approvalMethodEnum,
  approvalStatusEnum,
  bookingStatusEnum,
  dueItemTypeEnum,
  estimateStatusEnum,
  findingSeverityEnum,
  jobItemTypeEnum,
  jobPriorityEnum,
  jobStatusEnum,
} from "./enums"
import { bays, branches, garages, users } from "./identity"
import { customers, vehicles } from "./customers"
import { renewalRequests, dueItems } from "./renewals"
import { parts, vendorOrders } from "./inventory"

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

export const jobTemplates = pgTable("job_templates", {
  ...tenant,
  name: text("name").notNull(),
  description: text("description"),
  defaultItems: jsonb("default_items"), // list of job_item drafts
  checklist: jsonb("checklist"), // list of {label, required}
  estimatedMinutes: integer("estimated_minutes"),
  depositPercent: integer("deposit_percent"),
  createsDueItemType: dueItemTypeEnum("creates_due_item_type"),
  isActive: boolean("is_active").default(true),
  ...timestamps,
})

export const bookings = pgTable(
  "bookings",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    customerId: uuid("customer_id").references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    guestPlate: text("guest_plate"),
    serviceType: text("service_type").notNull(),
    jobTemplateId: uuid("job_template_id").references(() => jobTemplates.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    bayId: uuid("bay_id").references(() => bays.id),
    status: bookingStatusEnum("status").notNull().default("requested"),
    notes: text("notes"),
    source: text("source").default("staff"), // public_page|reminder|staff|portal
    dueItemId: uuid("due_item_id").references(() => dueItems.id),
    jobId: uuid("job_id"), // fk:jobs self-ref added below via jobs.bookingId
    otpHash: text("otp_hash"), // sha256 of SMS confirmation code (public bookings)
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("bookings_branch_time_idx").on(t.branchId, t.startsAt),
    index("bookings_vehicle_idx").on(t.vehicleId),
  ]
)

export const jobs = pgTable(
  "jobs",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    number: text("number").notNull(), // JOB-... assigned on create
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    jobTemplateId: uuid("job_template_id").references(() => jobTemplates.id),
    bayId: uuid("bay_id").references(() => bays.id),
    status: jobStatusEnum("status").notNull().default("checked_in"),
    priority: jobPriorityEnum("priority").default("normal"),
    complaint: text("complaint"),
    checkInOdometerKm: integer("check_in_odometer_km"),
    oilGrade: text("oil_grade"), // mineral|semi_synthetic|fully_synthetic|diesel_commercial
    oilBrand: text("oil_brand"),
    oilQuantityMl: integer("oil_quantity_ml"),
    oilFilters: text("oil_filters"), // comma-separated filter names replaced
    checkInFuelLevel: integer("check_in_fuel_level"), // 0-100
    checkInItems: text("check_in_items"),
    checkInSignaturePath: text("check_in_signature_path"),
    promisedAt: timestamp("promised_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    serviceAdvisorId: uuid("service_advisor_id").references(() => users.id),
    qcSignedOffBy: uuid("qc_signed_off_by").references(() => users.id),
    qcSignedOffAt: timestamp("qc_signed_off_at", { withTimezone: true }),
    warrantyParentJobId: uuid("warranty_parent_job_id").references((): AnyPgColumn => jobs.id),
    isWarranty: boolean("is_warranty").default(false),
    renewalRequestId: uuid("renewal_request_id").references(() => renewalRequests.id),
    vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id),
    trackerTokenHash: text("tracker_token_hash"),
    internalNotes: text("internal_notes"),
    ...timestamps,
    ...{ deletedAt: timestamp("deleted_at", { withTimezone: true }) },
  },
  (t) => [
    uniqueIndex("jobs_garage_number_uniq").on(t.garageId, t.number),
    index("jobs_board_idx").on(t.garageId, t.branchId, t.status),
    index("jobs_vehicle_idx").on(t.vehicleId),
    index("jobs_customer_idx").on(t.customerId),
  ]
)

export const jobStatusEvents = pgTable(
  "job_status_events",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    actorUserId: uuid("actor_user_id"),
    note: text("note"),
    customerVisible: boolean("customer_visible").default(true),
    ...timestamps,
  },
  (t) => [index("job_status_events_job_idx").on(t.jobId)]
)

export const jobAssignments = pgTable(
  "job_assignments",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    isLead: boolean("is_lead").default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("job_assignments_uniq").on(t.jobId, t.userId)]
)

export const jobFindings = pgTable(
  "job_findings",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    title: text("title").notNull(),
    description: text("description"),
    severity: findingSeverityEnum("severity").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    customerVisible: boolean("customer_visible").default(true),
    ...timestamps,
  },
  (t) => [index("job_findings_job_idx").on(t.jobId)]
)

export const jobMedia = pgTable(
  "job_media",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    findingId: uuid("finding_id").references(() => jobFindings.id),
    kind: text("kind").notNull(), // photo|video|voice
    stage: text("stage"), // check_in|diagnosis|repair|qc|delivery
    storagePath: text("storage_path").notNull(),
    caption: text("caption"),
    customerVisible: boolean("customer_visible").default(true),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("job_media_job_idx").on(t.jobId)]
)

export const jobItems = pgTable(
  "job_items",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    estimateId: uuid("estimate_id"), // fk added after estimates (self file below)
    findingId: uuid("finding_id").references(() => jobFindings.id),
    type: jobItemTypeEnum("type").notNull(),
    description: text("description").notNull(),
    partId: uuid("part_id").references(() => parts.id),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
    unitPrice: money("unit_price").notNull(),
    unitCost: money("unit_cost"),
    labourHours: numeric("labour_hours", { precision: 6, scale: 2 }),
    discountAmount: money("discount_amount").default(sql`0`),
    taxCodes: text("tax_codes").array(),
    approvalStatus: approvalStatusEnum("approval_status").default("pending"),
    isIssuedFromStock: boolean("is_issued_from_stock").default(false),
    sortOrder: integer("sort_order").default(0),
    ...timestamps,
  },
  (t) => [index("job_items_job_idx").on(t.jobId)]
)

export const jobTasks = pgTable(
  "job_tasks",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    title: text("title").notNull(),
    assignedTo: uuid("assigned_to").references(() => users.id),
    isDone: boolean("is_done").default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    checklistItem: boolean("checklist_item").default(false),
    required: boolean("required").default(false),
    sortOrder: integer("sort_order").default(0),
    ...timestamps,
  },
  (t) => [index("job_tasks_job_idx").on(t.jobId)]
)

export const timeLogs = pgTable(
  "time_logs",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    jobTaskId: uuid("job_task_id").references(() => jobTasks.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    clientId: text("client_id"), // offline queue idempotency key
    ...timestamps,
  },
  (t) => [
    index("time_logs_job_idx").on(t.jobId),
    uniqueIndex("time_logs_client_uniq").on(t.clientId),
  ]
)

export const estimates = pgTable(
  "estimates",
  {
    ...tenant,
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    number: text("number").notNull(), // EST-...
    version: integer("version").notNull().default(1),
    status: estimateStatusEnum("status").notNull().default("draft"),
    subtotal: money("subtotal").notNull().default(sql`0`),
    discountTotal: money("discount_total").notNull().default(sql`0`),
    taxTotal: money("tax_total").notNull().default(sql`0`),
    total: money("total").notNull().default(sql`0`),
    depositRequired: money("deposit_required").default(sql`0`),
    validUntil: date("valid_until"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    tokenHash: text("token_hash"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("estimates_garage_number_version_uniq").on(t.garageId, t.number, t.version),
    index("estimates_job_idx").on(t.jobId),
  ]
)

// FK from job_items.estimate_id → estimates.id (declared after both exist)
export const approvals = pgTable(
  "approvals",
  {
    ...tenant,
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimates.id),
    method: approvalMethodEnum("method").notNull(),
    approvedItemIds: uuid("approved_item_ids").array(),
    declinedItemIds: uuid("declined_item_ids").array(),
    approvedTotal: money("approved_total"),
    signaturePath: text("signature_path"),
    customerId: uuid("customer_id").references(() => customers.id),
    onBehalfUserId: uuid("on_behalf_user_id").references(() => users.id),
    onBehalfReason: text("on_behalf_reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("approvals_estimate_idx").on(t.estimateId)]
)

