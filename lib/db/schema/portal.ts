import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

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
