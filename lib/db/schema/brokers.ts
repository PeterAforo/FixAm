import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { garages, users } from "./identity"
import { renewalRequests } from "./renewals"

const money = (name: string) => bigint(name, { mode: "bigint" })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/**
 * brokers — insurance brokers and DVLA renewal agents with their own FixAm
 * workspace (platform table). `kind`: insurance | dvla | both.
 */
export const brokers = pgTable(
  "brokers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: text("kind").notNull().default("insurance"), // insurance|dvla|both
    phone: text("phone").notNull(), // E.164
    email: text("email"),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    about: text("about"),
    logoUrl: text("logo_url"),
    nicLicenceNumber: text("nic_licence_number"), // National Insurance Commission
    dvlaAgentNumber: text("dvla_agent_number"),
    insurers: text("insurers").array().notNull().default([]),
    /** Default service fee (pesewas) suggested when quoting. */
    defaultServiceFee: money("default_service_fee"),
    status: text("status").notNull().default("active"), // active|suspended
    isVerified: boolean("is_verified").notNull().default(false),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").notNull().default(0),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("brokers_kind_city_idx").on(t.kind, t.city)]
)

export const brokerMembers = pgTable(
  "broker_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("owner"), // owner|agent
    ...timestamps,
  },
  (t) => [
    uniqueIndex("broker_members_broker_user_uniq").on(t.brokerId, t.userId),
    index("broker_members_user_idx").on(t.userId),
  ]
)

/**
 * broker_requests — a renewal job sent to a broker, either by a driver from
 * their portal or by a garage handing off one of its renewal requests.
 */
export const brokerRequests = pgTable(
  "broker_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(), // BRQ-XXXXXX
    brokerId: uuid("broker_id")
      .notNull()
      .references(() => brokers.id),
    kind: text("kind").notNull(), // insurance|dvla
    serviceType: text("service_type").notNull(), // comprehensive|third_party|roadworthy|registration|...
    source: text("source").notNull(), // driver|garage
    requesterPhone: text("requester_phone").notNull(),
    requesterName: text("requester_name").notNull(),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    garageId: uuid("garage_id").references(() => garages.id),
    renewalRequestId: uuid("renewal_request_id").references(() => renewalRequests.id),
    vehiclePlate: text("vehicle_plate").notNull(),
    vehicleMake: text("vehicle_make"),
    vehicleModel: text("vehicle_model"),
    vehicleYear: integer("vehicle_year"),
    currentExpiry: date("current_expiry"),
    notes: text("notes"),
    status: text("status").notNull().default("requested"), // requested|quoted|accepted|in_progress|completed|declined|cancelled
    officialFee: money("official_fee"),
    serviceFee: money("service_fee"),
    total: money("total"),
    quoteNote: text("quote_note"),
    insurerName: text("insurer_name"),
    completionRef: text("completion_ref"), // policy / sticker / receipt number
    newExpiry: date("new_expiry"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    quotedAt: timestamp("quoted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("broker_requests_broker_status_idx").on(t.brokerId, t.status, t.createdAt),
    index("broker_requests_requester_idx").on(t.requesterPhone),
    index("broker_requests_garage_idx").on(t.garageId),
  ]
)

export const brokerRequestEvents = pgTable(
  "broker_request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => brokerRequests.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    actor: text("actor").notNull(), // broker|driver|garage|system
    actorUserId: uuid("actor_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("broker_request_events_req_idx").on(t.requestId, t.createdAt)]
)
