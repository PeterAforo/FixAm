import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import {
  contactChannelEnum,
  dueItemStatusEnum,
  dueItemTypeEnum,
  dvlaRecordTypeEnum,
  insurancePolicyTypeEnum,
  messageCategoryEnum,
  messageStatusEnum,
  renewalKindEnum,
  renewalStatusEnum,
} from "./enums"
import { garages, users } from "./identity"
import { customers, vehicles, insurancePartners } from "./customers"
import { invoices } from "./money"

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

export const renewalRequests = pgTable(
  "renewal_requests",
  {
    ...tenant,
    number: text("number").notNull(), // REN-...
    kind: renewalKindEnum("kind").notNull(),
    dvlaRecordType: dvlaRecordTypeEnum("dvla_record_type"),
    insurancePolicyType: insurancePolicyTypeEnum("insurance_policy_type"),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    dueItemId: uuid("due_item_id"), // fk:due_items self-file below
    status: renewalStatusEnum("status").notNull().default("requested"),
    partnerId: uuid("partner_id").references(() => insurancePartners.id),
    officialFee: money("official_fee"),
    serviceFee: money("service_fee"),
    total: money("total"),
    quoteDetails: jsonb("quote_details"),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    assignedTo: uuid("assigned_to").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    tokenHash: text("token_hash"),
    requiredDocuments: text("required_documents").array(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("renewals_garage_number_uniq").on(t.garageId, t.number),
    index("renewals_vehicle_idx").on(t.vehicleId),
  ]
)

export const renewalEvents = pgTable(
  "renewal_events",
  {
    ...tenant,
    renewalRequestId: uuid("renewal_request_id")
      .notNull()
      .references(() => renewalRequests.id),
    status: renewalStatusEnum("status").notNull(),
    actorUserId: uuid("actor_user_id"),
    note: text("note"),
    customerVisible: boolean("customer_visible").default(true),
    ...timestamps,
  },
  (t) => [index("renewal_events_req_idx").on(t.renewalRequestId)]
)

export const dueItems = pgTable(
  "due_items",
  {
    ...tenant,
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    type: dueItemTypeEnum("type").notNull(),
    title: text("title").notNull(),
    dueDate: date("due_date"),
    dueMileageKm: integer("due_mileage_km"),
    predictedDueDate: date("predicted_due_date"),
    effectiveDueDate: date("effective_due_date").notNull(),
    status: dueItemStatusEnum("status").notNull().default("scheduled"),
    escalationStage: integer("escalation_stage").notNull().default(0),
    nextReminderAt: timestamp("next_reminder_at", { withTimezone: true }),
    sourceType: text("source_type"), // job|insurance_policy|dvla_record|instalment|credit_account|manual
    sourceId: uuid("source_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dismissedReason: text("dismissed_reason"),
    actionTokenHash: text("action_token_hash"),
    ...timestamps,
  },
  (t) => [
    index("due_items_vehicle_idx").on(t.vehicleId),
    index("due_items_status_idx").on(t.garageId, t.status, t.effectiveDueDate),
  ]
)

export const messageSends = pgTable(
  "message_sends",
  {
    ...tenant,
    customerId: uuid("customer_id").references(() => customers.id),
    dueItemIds: uuid("due_item_ids").array().notNull(),
    channel: contactChannelEnum("channel").notNull(),
    templateKey: text("template_key").notNull(),
    renderedBody: text("rendered_body").notNull(),
    status: messageStatusEnum("status").notNull().default("queued"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    costUnits: integer("cost_units").default(1),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    failedReason: text("failed_reason"),
    convertedBookingId: uuid("converted_booking_id"),
    convertedRenewalId: uuid("converted_renewal_id"),
    ...timestamps,
  },
  (t) => [index("message_sends_customer_idx").on(t.customerId)]
)

/** message_templates — garage_id null = platform default */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").references(() => garages.id),
    key: text("key").notNull(),
    channel: contactChannelEnum("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    whatsappTemplateName: text("whatsapp_template_name"),
    isActive: boolean("is_active").default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("message_templates_garage_key_channel_uniq").on(t.garageId, t.key, t.channel)]
)

// message_log-like per-send audit (customer-facing comms log)
export const messageLogs = pgTable(
  "message_logs",
  {
    ...tenant,
    customerId: uuid("customer_id").references(() => customers.id),
    userId: uuid("user_id").references(() => users.id),
    channel: contactChannelEnum("channel").notNull(),
    category: messageCategoryEnum("category").notNull(),
    templateKey: text("template_key"),
    to: text("to").notNull(),
    status: messageStatusEnum("status").notNull(),
    providerMessageId: text("provider_message_id"),
    costUnits: integer("cost_units").default(1),
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),
    ...timestamps,
  },
  (t) => [index("message_logs_customer_idx").on(t.customerId)]
)

