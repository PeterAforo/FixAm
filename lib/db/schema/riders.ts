import { sql } from "drizzle-orm"
import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { users } from "./identity"
import { vendorOrders } from "./inventory"

const money = (name: string) => bigint(name, { mode: "bigint" })
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/**
 * riders — FixAm delivery riders (P8-18).
 * status: pending (awaiting admin approval) | active | suspended.
 * Ghana Card number is stored AES-256-GCM encrypted; only the last 4 are kept
 * in the clear. Verified by admin — never logged.
 */
export const riders = pgTable(
  "riders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    fullName: text("full_name"),
    bikePlate: text("bike_plate"),
    motorbikePhotoPath: text("motorbike_photo_path"),
    licencePhotoPath: text("licence_photo_path"),
    ghanaCardEncrypted: text("ghana_card_encrypted"),
    ghanaCardLast4: text("ghana_card_last4"),
    ghanaCardVerified: boolean("ghana_card_verified").notNull().default(false),
    /** AES-256-GCM PayoutAccount JSON (MoMo) — same helper as vendors/garages. */
    payoutDetailsEncrypted: text("payout_details_encrypted"),
    isOnline: boolean("is_online").notNull().default(false),
    lastLat: numeric("last_lat", { precision: 9, scale: 6 }),
    lastLng: numeric("last_lng", { precision: 9, scale: 6 }),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
    completedJobs: integer("completed_jobs").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending|active|suspended
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("riders_user_uniq").on(t.userId), index("riders_online_idx").on(t.isOnline, t.status)]
)

/**
 * deliveries — a courier job (P8-18). Mostly parts to garages/homes on a
 * vendor order; `kind` leaves room for broker documents.
 * status: offered → assigned → picked_up → delivered · failed · cancelled
 * `offered` means broadcast to nearby online riders; `assigned` once one accepts.
 */
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(), // DLV-XXXXXX
    vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id),
    /** part | document | other */
    kind: text("kind").notNull().default("part"),
    courier: text("courier").notNull().default("fixam_rider"), // vendor|fixam_rider|partner
    riderId: uuid("rider_id").references(() => riders.id),
    /** Snapshots of where to collect and where to drop. */
    pickup: jsonb("pickup").notNull(), // { name, phone, address, city, lat?, lng? }
    dropoff: jsonb("dropoff").notNull(),
    pickupPin: text("pickup_pin"),
    dropoffPin: text("dropoff_pin"),
    fee: money("fee").notNull().default(sql`0`),
    riderEarning: money("rider_earning"),
    status: text("status").notNull().default("offered"),
    proofPhotoPath: text("proof_photo_path"),
    /** Dispatch: offer radius in km and when the offer expires. */
    offerRadiusKm: integer("offer_radius_km").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    offeredAt: timestamp("offered_at", { withTimezone: true }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("deliveries_rider_idx").on(t.riderId, t.status),
    index("deliveries_order_idx").on(t.vendorOrderId),
    index("deliveries_status_idx").on(t.status, t.expiresAt),
  ]
)

/** Per-rider offer log — who was offered a delivery (dedupe + audit). */
export const deliveryOffers = pgTable(
  "delivery_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliveryId: uuid("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    riderId: uuid("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("delivery_offers_uniq").on(t.deliveryId, t.riderId), index("delivery_offers_rider_idx").on(t.riderId)]
)
