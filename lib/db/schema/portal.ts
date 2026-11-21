import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/** portal_otps — phone-keyed OTP challenges for customer portal login (platform table) */
export const portalOtps = pgTable("portal_otps", {
  phone: text("phone").primaryKey(), // E.164
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

/** portal_sessions — hashed bearer tokens for the customer portal (platform table) */
export const portalSessions = pgTable(
  "portal_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    phone: text("phone").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("portal_sessions_phone_idx").on(t.phone)]
)


/** portal_profiles — self-registered customer accounts keyed by phone (platform table) */
export const portalProfiles = pgTable("portal_profiles", {
  phone: text("phone").primaryKey(), // E.164
  fullName: text("full_name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  ...timestamps,
})

/** portal_vehicles — vehicles a customer claims before/alongside garage records (platform table) */
export const portalVehicles = pgTable(
  "portal_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone")
      .notNull()
      .references(() => portalProfiles.phone, { onDelete: "cascade" }),
    plateNumber: text("plate_number"),
    plateSearch: text("plate_search"),
    vin: text("vin"),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    color: text("color"),
    bodyType: text("body_type"),
    catalogMakeId: uuid("catalog_make_id"),
    catalogModelId: uuid("catalog_model_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("portal_vehicles_phone_idx").on(t.phone),
    index("portal_vehicles_plate_idx").on(t.plateSearch),
  ]
)
