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
import { planAudienceEnum, subscriptionStatusEnum } from "./enums"
import { garages } from "./identity"

const moneyCol = (name: string) => bigint(name, { mode: "bigint" })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  audience: planAudienceEnum("audience").notNull().default("garage"),
  tagline: text("tagline"),
  priceMonthly: moneyCol("price_monthly").notNull(),
  maxBranches: integer("max_branches"), // null = unlimited
  maxStaff: integer("max_staff"), // null = unlimited
  messageAllowance: integer("message_allowance").notNull(),
  features: text("features").array().notNull(),
  paystackPlanCode: text("paystack_plan_code"),
  isActive: boolean("is_active").default(true),
  ...timestamps,
})

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .unique()
      .references(() => garages.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    paystackSubscriptionCode: text("paystack_subscription_code"),
    paystackCustomerCode: text("paystack_customer_code"),
    pendingPaymentReference: text("pending_payment_reference"),
    isComplimentary: boolean("is_complimentary").default(false),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    ...timestamps,
  },
  (t) => [index("subscriptions_garage_idx").on(t.garageId)]
)

/**
 * Subscriptions for every non-garage workspace (driver, vendor, broker, tow,
 * rider). Garages keep using `subscriptions` (keyed by garage_id).
 * owner_id points at the workspace row: vendors.id / brokers.id /
 * tow_operators.id / riders.id (uuid) or portal_profiles.phone (driver, E.164).
 */
export const accountSubscriptions = pgTable(
  "account_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerKind: planAudienceEnum("owner_kind").notNull(),
    // uuid for vendors/brokers/towOperators/riders/users; E.164 phone for drivers
    ownerId: text("owner_id").notNull(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    isComplimentary: boolean("is_complimentary").default(false),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    pendingPaymentReference: text("pending_payment_reference"),
    lastPaymentReference: text("last_payment_reference"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("account_subscriptions_owner_uniq").on(t.ownerKind, t.ownerId),
    index("account_subscriptions_plan_idx").on(t.planId),
    index("account_subscriptions_trial_idx").on(t.status, t.trialEndsAt),
  ]
)

export const messageUsage = pgTable(
  "message_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    periodStart: date("period_start").notNull(),
    allowance: integer("allowance").notNull(),
    addonUnits: integer("addon_units").default(0),
    usedUnits: integer("used_units").default(0),
    alert80SentAt: timestamp("alert_80_sent_at", { withTimezone: true }),
    alert100SentAt: timestamp("alert_100_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("message_usage_garage_period_uniq").on(t.garageId, t.periodStart),
  ]
)

/** Webhook idempotency log — non-tenant, service-role writes only. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type"),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_uniq").on(t.provider, t.eventId),
  ]
)

/** Insert-only audit trail — UPDATE/DELETE revoked via RLS migration. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id"), // null = platform-level
    actorUserId: uuid("actor_user_id"),
    actorCustomerId: uuid("actor_customer_id"),
    impersonatedBy: uuid("impersonated_by"),
    action: text("action").notNull(), // e.g. invoice.issue
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_garage_created_idx").on(t.garageId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ]
)


/** Fixed-window rate limit counters for public endpoints. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Data subject requests (export / deletion) — Ghana Data Protection Act 843. */
export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id"),
    customerId: uuid("customer_id"),
    phone: text("phone"),
    email: text("email"),
    type: text("type").notNull(), // export|delete
    status: text("status").notNull().default("requested"), // requested|completed|rejected
    payload: jsonb("payload"), // export bundle for completed exports
    requestedBy: text("requested_by").notNull().default("customer"), // customer|admin
    handledBy: uuid("handled_by"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("privacy_requests_status_idx").on(t.status, t.createdAt)]
)


/** Platform vehicle catalogue — public reference data (no tenant scope). */
export const vehicleMakes = pgTable(
  "vehicle_makes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    country: text("country"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  }
)

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => vehicleMakes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    yearStart: integer("year_start"),
    yearEnd: integer("year_end"),
    bodyType: text("body_type"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vehicle_models_make_slug_uniq").on(t.makeId, t.slug),
    index("vehicle_models_make_idx").on(t.makeId),
  ]
)
