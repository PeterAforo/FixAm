import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

/**
 * vehicle_passports — one public history page per physical car (P8-10).
 *
 * Keyed by the plate (plate_search, the normalised plate key), so service
 * visits at every FixAm garage show on one page. The owner (matched by the
 * phone on their customer record) turns it on or off, chooses what shows,
 * and can regenerate the link — which makes old stickers and links stop
 * working. The page never shows the owner's name, phone or prices.
 */
export const vehiclePassports = pgTable(
  "vehicle_passports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plateSearch: text("plate_search").notNull(),
    /** Phone of the owner who controls the passport (E.164). */
    ownerPhone: text("owner_phone").notNull(),
    /** Public link token: /v/<token>. Rotated on regenerate or new owner. */
    token: text("token").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    showMileage: boolean("show_mileage").notNull().default(true),
    showGarageNames: boolean("show_garage_names").notNull().default(true),
    viewCount: integer("view_count").notNull().default(0),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    regeneratedAt: timestamp("regenerated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicle_passports_plate_uniq").on(t.plateSearch),
    uniqueIndex("vehicle_passports_token_uniq").on(t.token),
    index("vehicle_passports_owner_idx").on(t.ownerPhone),
  ]
)
