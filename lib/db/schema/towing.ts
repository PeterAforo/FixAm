import { sql } from "drizzle-orm"
import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { garages, users } from "./identity"

const money = (name: string) => bigint(name, { mode: "bigint" })
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/** tow_operators — breakdown & towing businesses with a FixAm workspace (P8-15). */
export const towOperators = pgTable(
  "tow_operators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name").notNull(),
    phone: text("phone").notNull(),
    city: text("city"),
    region: text("region"),
    /** Where they usually wait, used when no live location is shared. */
    baseLat: numeric("base_lat", { precision: 9, scale: 6 }),
    baseLng: numeric("base_lng", { precision: 9, scale: 6 }),
    serviceRadiusKm: integer("service_radius_km").notNull().default(25),
    /** flatbed | wheel_lift | motorbike | jump_start | tyre */
    services: text("services").array().notNull().default(sql`'{flatbed}'::text[]`),
    baseFee: money("base_fee").notNull().default(sql`0`),
    perKmFee: money("per_km_fee").notNull().default(sql`0`),
    isAvailable: boolean("is_available").notNull().default(false),
    lastLat: numeric("last_lat", { precision: 9, scale: 6 }),
    lastLng: numeric("last_lng", { precision: 9, scale: 6 }),
    lastLocationAt: timestamp("last_location_at", { withTimezone: true }),
    payoutDetailsEncrypted: text("payout_details_encrypted"),
    status: text("status").notNull().default("active"), // active|suspended
    isVerified: boolean("is_verified").notNull().default(false),
    completedJobs: integer("completed_jobs").notNull().default(0),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("tow_operators_available_idx").on(t.isAvailable, t.status)]
)

export const towOperatorMembers = pgTable(
  "tow_operator_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    operatorId: uuid("operator_id").notNull().references(() => towOperators.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: text("role").notNull().default("owner"), // owner|dispatcher|driver
    status: text("status").notNull().default("active"), // active|paused
    ...timestamps,
  },
  (t) => [uniqueIndex("tow_operator_members_uniq").on(t.operatorId, t.userId), index("tow_operator_members_user_idx").on(t.userId)]
)

/**
 * sos_requests — a driver's breakdown call (P8-15).
 * status: searching → assigned → en_route → arrived → towing → completed ·
 * cancelled · expired (nobody accepted)
 */
export const sosRequests = pgTable(
  "sos_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterPhone: text("requester_phone").notNull(),
    requesterName: text("requester_name"),
    vehicleMake: text("vehicle_make"),
    vehicleModel: text("vehicle_model"),
    vehicleYear: integer("vehicle_year"),
    vehiclePlate: text("vehicle_plate"),
    /** wont_start | flat_tyre | accident | overheating | battery | out_of_fuel | locked_out | other */
    problem: text("problem").notNull(),
    notes: text("notes"),
    photoPaths: jsonb("photo_paths").notNull().default([]),
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
    landmark: text("landmark"),
    radiusKm: integer("radius_km").notNull().default(25),
    destinationGarageId: uuid("destination_garage_id").references(() => garages.id),
    status: text("status").notNull().default("searching"),
    operatorId: uuid("operator_id").references(() => towOperators.id),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    quoteAmount: money("quote_amount"),
    quoteNote: text("quote_note"),
    etaMinutes: integer("eta_minutes"),
    operatorLat: numeric("operator_lat", { precision: 9, scale: 6 }),
    operatorLng: numeric("operator_lng", { precision: 9, scale: 6 }),
    operatorLocationAt: timestamp("operator_location_at", { withTimezone: true }),
    /** momo (theTeller, held until completion) | cash (paid to the operator) */
    paymentMethod: text("payment_method"),
    paymentReference: text("payment_reference"),
    paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid|pending|paid|failed|cash
    paidAt: timestamp("paid_at", { withTimezone: true }),
    repairRequestId: uuid("repair_request_id"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sos_requests_number_uniq").on(t.number),
    index("sos_requests_status_idx").on(t.status, t.createdAt),
    index("sos_requests_operator_idx").on(t.operatorId, t.status),
    index("sos_requests_requester_idx").on(t.requesterUserId, t.createdAt),
    index("sos_requests_payment_ref_idx").on(t.paymentReference),
  ]
)

/** Operators an SOS was sent to (only they can see and accept it). */
export const sosRecipients = pgTable(
  "sos_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sosId: uuid("sos_id").notNull().references(() => sosRequests.id, { onDelete: "cascade" }),
    operatorId: uuid("operator_id").notNull().references(() => towOperators.id, { onDelete: "cascade" }),
    distanceKm: numeric("distance_km", { precision: 6, scale: 1 }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sos_recipients_uniq").on(t.sosId, t.operatorId), index("sos_recipients_operator_idx").on(t.operatorId)]
)

/** Timeline of an SOS (status changes, quote, payment). */
export const sosEvents = pgTable(
  "sos_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sosId: uuid("sos_id").notNull().references(() => sosRequests.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    actorUserId: uuid("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sos_events_sos_idx").on(t.sosId)]
)
