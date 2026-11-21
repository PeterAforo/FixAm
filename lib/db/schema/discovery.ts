import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { garages } from "./identity"
import { customers } from "./customers"
import { vehicleMakes, vehicleModels } from "./platform"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

const tenant = {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
}

/** garage_vehicle_coverage — which makes/models a garage services (tenant table) */
export const garageVehicleCoverage = pgTable(
  "garage_vehicle_coverage",
  {
    ...tenant,
    catalogMakeId: uuid("catalog_make_id").references(() => vehicleMakes.id),
    catalogModelId: uuid("catalog_model_id").references(() => vehicleModels.id),
    make: text("make").notNull(), // denormalised snapshot
    model: text("model"), // null = all models of the make
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("garage_coverage_garage_idx").on(t.garageId, t.isActive)]
)

/** garage_reviews — customer ratings on public garage profiles (tenant table) */
export const garageReviews = pgTable(
  "garage_reviews",
  {
    ...tenant,
    portalPhone: text("portal_phone").notNull(), // reviewer portal identity
    customerId: uuid("customer_id").references(() => customers.id),
    rating: smallint("rating").notNull(), // 1-5
    comment: text("comment"),
    status: text("status").notNull().default("published"), // published|hidden
    ...timestamps,
  },
  (t) => [
    uniqueIndex("garage_reviews_garage_phone_uniq").on(t.garageId, t.portalPhone),
    index("garage_reviews_garage_status_idx").on(t.garageId, t.status),
  ]
)
