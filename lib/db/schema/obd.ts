import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { customers, vehicles } from "./customers"
import { garages, users } from "./identity"
import { jobs } from "./workshop"

/**
 * obd_scans — one OBD-II read from a Bluetooth adapter (P8-13).
 * Attached to a job (garage), a vehicle (driver), a repair request, or later
 * a pre-purchase inspection. Clearing codes is staff-only and audited;
 * cleared_at/cleared_by record it here as well.
 */
export const obdScans = pgTable(
  "obd_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").references(() => garages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    customerId: uuid("customer_id").references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    jobId: uuid("job_id").references(() => jobs.id),
    repairRequestId: uuid("repair_request_id"),
    inspectionId: uuid("inspection_id"),
    /** garage | driver */
    source: text("source").notNull(),
    adapterName: text("adapter_name"),
    protocol: text("protocol"),
    vin: text("vin"),
    milOn: boolean("mil_on"),
    /** [{ code, kind: stored|pending|permanent }] */
    dtcs: jsonb("dtcs").notNull().default([]),
    freezeFrame: jsonb("freeze_frame"),
    live: jsonb("live"),
    /** { summary, overallSeverity, codes: [{ code, explanation, severity, likelyParts, checkFirst, partTypes: [{id,name}] }], by } */
    explanation: jsonb("explanation"),
    clearRequestedAt: timestamp("clear_requested_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    clearedBy: uuid("cleared_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("obd_scans_job_idx").on(t.jobId),
    index("obd_scans_vehicle_idx").on(t.vehicleId, t.createdAt),
    index("obd_scans_user_idx").on(t.userId, t.createdAt),
    index("obd_scans_request_idx").on(t.repairRequestId),
  ]
)
