import { pgEnum } from "drizzle-orm/pg-core"

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "manager",
  "service_advisor",
  "mechanic",
  "storekeeper",
  "accountant",
])

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
])

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "paused",
])

export const notificationKindEnum = pgEnum("notification_kind", [
  "booking_new",
  "estimate_approved",
  "estimate_declined",
  "part_arrived",
  "payment_received",
  "low_stock",
  "vendor_order_update",
  "renewal_update",
  "job_assigned",
  "qc_required",
  "system",
])

export const valuationMethodEnum = pgEnum("valuation_method", [
  "weighted_average",
  "fifo",
])
