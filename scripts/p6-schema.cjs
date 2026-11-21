const fs = require('fs')

fs.appendFileSync('lib/db/schema/platform.ts', `

/** Platform vehicle catalogue — public reference data (no tenant scope). */
export const vehicleMakes = pgTable(
  "vehicle_makes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    country: text("country"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  }
)

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    makeId: uuid("make_id")
      .notNull()
      .references(() => vehicleMakes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    yearStart: integer("year_start"),
    yearEnd: integer("year_end"),
    bodyType: text("body_type"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vehicle_models_make_slug_uniq").on(t.makeId, t.slug),
    index("vehicle_models_make_idx").on(t.makeId),
  ]
)
`, 'utf8')

fs.appendFileSync('lib/db/schema/portal.ts', `

/** portal_profiles — self-registered customer accounts keyed by phone (platform table) */
export const portalProfiles = pgTable("portal_profiles", {
  phone: text("phone").primaryKey(), // E.164
  fullName: text("full_name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  ...timestamps,
})

/** portal_vehicles — vehicles a customer claims before/alongside garage records (platform table) */
export const portalVehicles = pgTable(
  "portal_vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone")
      .notNull()
      .references(() => portalProfiles.phone, { onDelete: "cascade" }),
    plateNumber: text("plate_number"),
    plateSearch: text("plate_search"),
    vin: text("vin"),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    color: text("color"),
    bodyType: text("body_type"),
    catalogMakeId: uuid("catalog_make_id"),
    catalogModelId: uuid("catalog_model_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("portal_vehicles_phone_idx").on(t.phone),
    index("portal_vehicles_plate_idx").on(t.plateSearch),
  ]
)
`, 'utf8')

// portal.ts needs boolean in imports
let p = fs.readFileSync('lib/db/schema/portal.ts', 'utf8')
p = p.replace(
  'import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"',
  'import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"'
)
fs.writeFileSync('lib/db/schema/portal.ts', p, 'utf8')

fs.writeFileSync('lib/db/schema/discovery.ts', `import {
  index,
  integer,
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
import { users } from "./identity"

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
`, 'utf8')

// add boolean import to discovery? not needed; add missing boolean import for coverage isActive
let d = fs.readFileSync('lib/db/schema/discovery.ts', 'utf8')
d = d.replace('import {\n  index,', 'import {\n  boolean,\n  index,')
fs.writeFileSync('lib/db/schema/discovery.ts', d, 'utf8')

// vehicles: catalog FKs
let c = fs.readFileSync('lib/db/schema/customers.ts', 'utf8')
c = c.replace(
  'import { garages, users } from "./identity"',
  'import { garages, users } from "./identity"\nimport { vehicleMakes, vehicleModels } from "./platform"'
)
c = c.replace(
  '    model: text("model").notNull(),\n    year: integer("year"),',
  '    model: text("model").notNull(),\n    year: integer("year"),\n    catalogMakeId: uuid("catalog_make_id").references(() => vehicleMakes.id),\n    catalogModelId: uuid("catalog_model_id").references(() => vehicleModels.id),'
)
fs.writeFileSync('lib/db/schema/customers.ts', c, 'utf8')

// vendors: verification
let inv = fs.readFileSync('lib/db/schema/inventory.ts', 'utf8')
inv = inv.replace(
  '    status: vendorStatusEnum("status").notNull().default("pending"),',
  '    status: vendorStatusEnum("status").notNull().default("pending"),\n    isVerified: boolean("is_verified").notNull().default(false),\n    verifiedAt: timestamp("verified_at", { withTimezone: true }),\n    verifiedBy: uuid("verified_by").references(() => users.id),'
)
fs.writeFileSync('lib/db/schema/inventory.ts', inv, 'utf8')

// export discovery from index
let idx = fs.readFileSync('lib/db/schema/index.ts', 'utf8')
idx = idx.replace('export * from "./stats"', 'export * from "./stats"\nexport * from "./discovery"')
fs.writeFileSync('lib/db/schema/index.ts', idx, 'utf8')

console.log('schema updated')
