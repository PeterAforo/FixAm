import { sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, numeric, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { garages, users } from "./identity"

const money = (name: string) => bigint(name, { mode: "bigint" })
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

export const repairRequestSeq = pgSequence("repair_request_seq", { startWith: 1001, increment: 1 })

/**
 * repair_requests — a driver's complaint, posted before choosing a garage
 * (P8-06). Sent to one preferred garage or broadcast to matching garages
 * nearby; garages reply with offers; accepting one books the visit.
 * Status: open → offered → booked | cancelled | expired.
 */
export const repairRequests = pgTable(
  "repair_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(), // RR-1001
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterPhone: text("requester_phone").notNull(),
    requesterName: text("requester_name"),
    vehicleMake: text("vehicle_make"),
    vehicleModel: text("vehicle_model"),
    vehicleYear: integer("vehicle_year"),
    vehiclePlate: text("vehicle_plate"),
    complaint: text("complaint").notNull(), // English (translated if spoken/typed in a local language)
    complaintOriginal: text("complaint_original"),
    complaintLanguage: text("complaint_language").notNull().default("en"),
    warningLights: text("warning_lights").array().notNull().default(sql`'{}'::text[]`),
    gpsLat: numeric("gps_lat", { precision: 9, scale: 6 }),
    gpsLng: numeric("gps_lng", { precision: 9, scale: 6 }),
    region: text("region"),
    city: text("city"),
    mode: text("mode").notNull().default("broadcast"), // preferred|broadcast
    preferredGarageId: uuid("preferred_garage_id").references(() => garages.id),
    radiusKm: integer("radius_km").notNull().default(15),
    triage: jsonb("triage"), // TriageResult
    urgency: text("urgency"), // stop_driving|soon|can_wait
    specialty: text("specialty"),
    status: text("status").notNull().default("open"),
    acceptedOfferId: uuid("accepted_offer_id"),
    bookingId: uuid("booking_id"),
    jobId: uuid("job_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("repair_requests_requester_idx").on(t.requesterUserId, t.createdAt),
    index("repair_requests_phone_idx").on(t.requesterPhone),
    index("repair_requests_status_idx").on(t.status, t.createdAt),
    index("repair_requests_booking_idx").on(t.bookingId),
  ]
)

export const repairRequestMedia = pgTable(
  "repair_request_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => repairRequests.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // photo|video|voice
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("repair_request_media_req_idx").on(t.requestId)]
)

/** Garages a request was sent to (the garage Leads inbox). */
export const repairRequestRecipients = pgTable(
  "repair_request_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => repairRequests.id, { onDelete: "cascade" }),
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    distanceKm: numeric("distance_km", { precision: 6, scale: 1 }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repair_request_recipients_uniq").on(t.requestId, t.garageId),
    index("repair_request_recipients_garage_idx").on(t.garageId, t.createdAt),
  ]
)

export const repairRequestOffers = pgTable(
  "repair_request_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => repairRequests.id, { onDelete: "cascade" }),
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    priceMin: money("price_min"),
    priceMax: money("price_max"),
    inspectionFee: money("inspection_fee").notNull().default(sql`0`),
    earliestAt: timestamp("earliest_at", { withTimezone: true }).notNull(),
    message: text("message"),
    status: text("status").notNull().default("sent"), // sent|accepted|declined|withdrawn
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("repair_request_offers_uniq").on(t.requestId, t.garageId),
    index("repair_request_offers_req_idx").on(t.requestId),
  ]
)
