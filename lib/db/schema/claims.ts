import { bigint, boolean, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { brokers } from "./brokers"
import { customers, vehicles } from "./customers"
import { garages, users } from "./identity"
import { estimates, jobs } from "./workshop"

const money = (name: string) => bigint(name, { mode: "bigint" })

/**
 * insurance_claims — a driver's accident claim (P8-17).
 * status: draft → submitted → assessing → approved | partially_approved |
 * rejected → repair_authorised → settled
 */
export const insuranceClaims = pgTable(
  "insurance_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(), // CLM-XXXXXX
    userId: uuid("user_id").notNull().references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    vehicleRef: text("vehicle_ref").notNull(), // free-text plate/description fallback
    brokerId: uuid("broker_id").references(() => brokers.id),
    /** When no broker, the insurer contact from the vehicle's policy. */
    insurerName: text("insurer_name"),
    insurerContact: text("insurer_contact"),
    garageId: uuid("garage_id").references(() => garages.id),
    jobId: uuid("job_id").references(() => jobs.id),
    estimateId: uuid("estimate_id").references(() => estimates.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    location: text("location"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    policeReportNo: text("police_report_no"),
    /** { name, phone, plate, insurer } of the other driver/party. */
    otherParty: jsonb("other_party"),
    injuries: boolean("injuries"),
    description: text("description"),
    /** storage keys: accident photos + police report upload. */
    photos: jsonb("photos").notNull().default([]),
    documents: jsonb("documents").notNull().default([]),
    /** Garage's repair estimate for this claim (pesewas). */
    estimateAmount: money("estimate_amount"),
    approvedAmount: money("approved_amount"),
    /** Autosaved wizard state so a half-finished claim survives. */
    draft: jsonb("draft"),
    status: text("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("insurance_claims_number_uniq").on(t.number),
    index("insurance_claims_user_idx").on(t.userId, t.createdAt),
    index("insurance_claims_broker_idx").on(t.brokerId, t.status),
    index("insurance_claims_garage_idx").on(t.garageId, t.status),
  ]
)

/** Every status change + note — the shared timeline for driver, garage and broker. */
export const insuranceClaimEvents = pgTable(
  "insurance_claim_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => insuranceClaims.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    actor: text("actor").notNull(), // driver|garage|broker|system
    actorUserId: uuid("actor_user_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("insurance_claim_events_claim_idx").on(t.claimId, t.createdAt)]
)
