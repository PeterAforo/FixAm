import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import {
  contactChannelEnum,
  customerTypeEnum,
  documentTypeEnum,
  dvlaRecordTypeEnum,
  fuelTypeEnum,
  insurancePolicyTypeEnum,
  odometerSourceEnum,
  odometerStatusEnum,
  transmissionEnum,
  vehicleBodyTypeEnum,
  vehicleUsageEnum,
} from "./enums"
import { garages, users } from "./identity"
import { vehicleMakes, vehicleModels } from "./platform"
import { renewalRequests } from "./renewals"
import { jobs } from "./workshop"

const money = (name: string) => bigint(name, { mode: "bigint" })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}
const softDelete = { deletedAt: timestamp("deleted_at", { withTimezone: true }) }
const tenant = {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
}

/** customers — tenant table */
export const customers = pgTable(
  "customers",
  {
    ...tenant,
    userId: uuid("user_id").references(() => users.id), // linked portal account
    type: customerTypeEnum("type").notNull().default("individual"),
    fullName: text("full_name").notNull(),
    companyName: text("company_name"),
    phone: text("phone").notNull(), // E.164
    altPhone: text("alt_phone"),
    email: text("email"),
    whatsappOptIn: boolean("whatsapp_opt_in").default(true),
    marketingOptIn: boolean("marketing_opt_in").default(false),
    /** P8-11: customer said stop to harmattan / rainy-season tips. */
    seasonalOptOut: boolean("seasonal_opt_out").notNull().default(false),
    preferredChannels: contactChannelEnum("preferred_channels").array().default(sql`'{whatsapp,sms}'`),
    nationalIdNumber: text("national_id_number"), // encrypted at rest via pgcrypto
    address: text("address"),
    notes: text("notes"),
    tags: text("tags").array(),
    source: text("source"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customers_garage_phone_uniq").on(t.garageId, t.phone),
    index("customers_name_idx").on(t.garageId, t.fullName),
  ]
)

/** vehicles — tenant table; plate_search is generated upper/no-space */
export const vehicles = pgTable(
  "vehicles",
  {
    ...tenant,
    plateNumber: text("plate_number").notNull(),
    plateSearch: text("plate_search").notNull(),
    vin: text("vin"),
    make: text("make").notNull(),
    model: text("model").notNull(),
    catalogMakeId: uuid("catalog_make_id").references(() => vehicleMakes.id),
    catalogModelId: uuid("catalog_model_id").references(() => vehicleModels.id),
    year: integer("year"),
    color: text("color"),
    colorHex: text("color_hex"),
    bodyType: vehicleBodyTypeEnum("body_type").default("sedan"),
    fuelType: fuelTypeEnum("fuel_type"),
    transmission: transmissionEnum("transmission"),
    engineSize: text("engine_size"),
    usage: vehicleUsageEnum("usage").default("private"),
    currentOwnerId: uuid("current_owner_id").references(() => customers.id),
    lastOdometerKm: integer("last_odometer_km"),
    lastOdometerAt: timestamp("last_odometer_at", { withTimezone: true }),
    kmPerDay: numeric("km_per_day", { precision: 8, scale: 2 }),
    kmPerDayConfidence: text("km_per_day_confidence"), // high|medium|low
    photoUrl: text("photo_url"),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("vehicles_garage_plate_uniq").on(t.garageId, t.plateSearch),
    index("vehicles_plate_idx").on(t.garageId, t.plateSearch),
    index("vehicles_vin_idx").on(t.garageId, t.vin),
    index("vehicles_owner_idx").on(t.currentOwnerId),
  ]
)

export const vehicleOwnerships = pgTable("vehicle_ownerships", {
  ...tenant,
  vehicleId: uuid("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date"),
  isPrimary: boolean("is_primary").default(true),
  ...timestamps,
})

export const odometerReadings = pgTable(
  "odometer_readings",
  {
    ...tenant,
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    readingKm: integer("reading_km").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull(),
    source: odometerSourceEnum("source").notNull(),
    status: odometerStatusEnum("status").notNull().default("valid"),
    flagReason: text("flag_reason"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id),
    recordedByCustomerId: uuid("recorded_by_customer_id").references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    photoUrl: text("photo_url"),
    odometerReplaced: boolean("odometer_replaced").default(false),
    ...timestamps,
  },
  (t) => [index("odometer_vehicle_time_idx").on(t.vehicleId, t.readAt)]
)

export const documents = pgTable(
  "documents",
  {
    ...tenant,
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    customerId: uuid("customer_id").references(() => customers.id),
    jobId: uuid("job_id").references(() => jobs.id),
    renewalRequestId: uuid("renewal_request_id").references(() => renewalRequests.id),
    type: documentTypeEnum("type").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    expiresOn: date("expires_on"),
    uploadedByUserId: uuid("uploaded_by_user_id"),
    uploadedByCustomerId: uuid("uploaded_by_customer_id"),
    ...timestamps,
  },
  (t) => [index("documents_vehicle_idx").on(t.vehicleId)]
)

/** insurance_partners — platform table (tenant: false) */
export const insurancePartners = pgTable("insurance_partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nicLicenceNumber: text("nic_licence_number"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  commissionRule: jsonb("commission_rule"),
  isActive: boolean("is_active").default(true),
  ...timestamps,
})

export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    ...tenant,
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    customerId: uuid("customer_id").references(() => customers.id),
    insurerName: text("insurer_name").notNull(),
    partnerId: uuid("partner_id").references(() => insurancePartners.id),
    policyType: insurancePolicyTypeEnum("policy_type").notNull(),
    policyNumber: text("policy_number"),
    stickerNumber: text("sticker_number"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    premium: money("premium"),
    renewalRequestId: uuid("renewal_request_id").references(() => renewalRequests.id),
    isCurrent: boolean("is_current").default(true),
    ...timestamps,
  },
  (t) => [index("insurance_vehicle_end_idx").on(t.vehicleId, t.endDate)]
)

export const dvlaRecords = pgTable(
  "dvla_records",
  {
    ...tenant,
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    customerId: uuid("customer_id").references(() => customers.id),
    type: dvlaRecordTypeEnum("type").notNull(),
    referenceNumber: text("reference_number"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date").notNull(),
    renewalRequestId: uuid("renewal_request_id").references(() => renewalRequests.id),
    isCurrent: boolean("is_current").default(true),
    ...timestamps,
  },
  (t) => [index("dvla_vehicle_expiry_idx").on(t.vehicleId, t.expiryDate)]
)

/** dvla_fees — platform table */
export const dvlaFees = pgTable("dvla_fees", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordType: dvlaRecordTypeEnum("record_type").notNull(),
  vehicleCategory: text("vehicle_category").notNull(),
  description: text("description"),
  amount: money("amount").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  ...timestamps,
})

