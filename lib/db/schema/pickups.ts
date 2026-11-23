import { sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { customers } from "./customers"
import { branches, garages, users } from "./identity"
import { bookings, jobs } from "./workshop"

const money = (name: string) => bigint(name, { mode: "bigint" })

/**
 * pickup_runs — a garage driver collecting a customer's car (pickup) or
 * returning it (dropoff) (P8-16). One tracking link per run (/p/<token>);
 * the page shows every run for the same booking or job.
 *
 * status: unconfirmed (public booking awaiting SMS code) → scheduled →
 * assigned → en_route → arrived → done · cancelled
 */
export const pickupRuns = pgTable(
  "pickup_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    branchId: uuid("branch_id").references(() => branches.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    jobId: uuid("job_id").references(() => jobs.id),
    customerId: uuid("customer_id").references(() => customers.id),
    kind: text("kind").notNull(), // pickup | dropoff
    contactName: text("contact_name"),
    contactPhone: text("contact_phone").notNull(),
    vehicleLabel: text("vehicle_label"),
    plate: text("plate"),
    address: text("address").notNull(),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled"),
    driverUserId: uuid("driver_user_id").references(() => users.id),
    driverLat: numeric("driver_lat", { precision: 9, scale: 6 }),
    driverLng: numeric("driver_lng", { precision: 9, scale: 6 }),
    driverLocationAt: timestamp("driver_location_at", { withTimezone: true }),
    fee: money("fee").notNull().default(sql`0`),
    feeJobItemId: uuid("fee_job_item_id"),
    trackerTokenHash: text("tracker_token_hash"),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pickup_runs_garage_time_idx").on(t.garageId, t.scheduledAt),
    index("pickup_runs_driver_idx").on(t.driverUserId, t.status),
    index("pickup_runs_booking_idx").on(t.bookingId),
    index("pickup_runs_job_idx").on(t.jobId),
    index("pickup_runs_token_idx").on(t.trackerTokenHash),
  ]
)

/**
 * condition_reports — the car's state at handover: photos of every side,
 * fuel, mileage, warning lights, notes and the customer's signature.
 */
export const conditionReports = pgTable(
  "condition_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").notNull().references(() => garages.id),
    runId: uuid("run_id").notNull().references(() => pickupRuns.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(), // pickup | dropoff
    /** { front, rear, left, right, interior, dashboard, extra: [] } → storage paths */
    photos: jsonb("photos").notNull().default({}),
    fuelLevel: integer("fuel_level"), // 0–100
    odometerKm: integer("odometer_km"),
    warningLights: text("warning_lights").array().notNull().default(sql`'{}'::text[]`),
    damageNotes: text("damage_notes"),
    signaturePath: text("signature_path"),
    signedByName: text("signed_by_name"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("condition_reports_run_idx").on(t.runId)]
)
