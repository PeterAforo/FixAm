import { sql } from "drizzle-orm"
import { bigint, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { customers, vehicles } from "./customers"
import { garages, users } from "./identity"

const money = (name: string) => bigint(name, { mode: "bigint" })
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/**
 * inspections — pre-purchase inspections (P8-20).
 * A driver books an inspection for a car they plan to buy, at the seller's
 * location or at the garage, pays via theTeller, and an inspector runs the
 * ~120-point checklist. The finished report is shared by a hashed link
 * (/i/<token>) and can be attached to the vehicle passport once bought.
 *
 * status: awaiting_payment → booked → in_progress → completed · cancelled · no_show
 */
export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(), // INS-XXXXXX
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    branchId: uuid("branch_id"),
    /** Driver who booked (portal user). */
    customerId: uuid("customer_id").references(() => customers.id),
    driverPhone: text("driver_phone").notNull(),
    driverUserId: uuid("driver_user_id").references(() => users.id),
    /** Car being inspected — details captured at booking (may not be owned yet). */
    vehicleDetails: jsonb("vehicle_details").notNull(), // { make?, model?, year?, plate?, vin?, bodyType?, colour? }
    vehicleId: uuid("vehicle_id").references(() => vehicles.id), // set if driver later buys & links it
    /** seller | garage */
    locationKind: text("location_kind").notNull().default("garage"),
    sellerName: text("seller_name"),
    sellerPhone: text("seller_phone"),
    sellerAddress: text("seller_address"),
    sellerLat: numeric("seller_lat", { precision: 9, scale: 6 }),
    sellerLng: numeric("seller_lng", { precision: 9, scale: 6 }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    price: money("price").notNull().default(sql`0`),
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid|pending|paid|failed|refunded
    paymentReference: text("payment_reference"),
    status: text("status").notNull().default("awaiting_payment"),
    inspectorId: uuid("inspector_id").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** sha256 of the public share token — raw token only returned once. */
    shareTokenHash: text("share_token_hash"),
    shareTokenIssuedAt: timestamp("share_token_issued_at", { withTimezone: true }),
    /** AI output: { summary, costs: [{ item, estimatePesewas, note }], grounded, generatedAt } */
    aiReport: jsonb("ai_report"),
    testDriveNotes: text("test_drive_notes"),
    internalNotes: text("internal_notes"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("inspections_number_uniq").on(t.number),
    uniqueIndex("inspections_share_uniq").on(t.shareTokenHash),
    index("inspections_garage_idx").on(t.garageId, t.status, t.scheduledAt),
    index("inspections_driver_idx").on(t.driverPhone, t.createdAt),
    index("inspections_payment_idx").on(t.paymentReference),
  ]
)

/**
 * inspection_items — one checklist result per inspection.
 * result: pass | attention | fail | na
 */
export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id").notNull().references(() => inspections.id, { onDelete: "cascade" }),
    section: text("section").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    result: text("result").notNull().default("na"), // pass|attention|fail|na
    photoPath: text("photo_path"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inspection_items_uniq").on(t.inspectionId, t.itemKey),
    index("inspection_items_insp_idx").on(t.inspectionId),
  ]
)
