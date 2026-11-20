import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { notificationKindEnum } from "./enums"
import { garages, users } from "./identity"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull(), // tracker|estimate_approval|invoice_pay|mileage_update|renewal|booking|due_item_action
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    customerId: uuid("customer_id"), // fk:customers added with that table
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedCount: integer("used_count").default(0),
    maxUses: integer("max_uses"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("magic_links_resource_idx").on(t.resourceType, t.resourceId)]
)

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
  ]
)

/** Non-tenant: keyed by user or customer; accessed via server code. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    customerId: uuid("customer_id"), // fk:customers added with that table
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uniq").on(t.endpoint),
  ]
)
