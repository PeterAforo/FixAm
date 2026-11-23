import {
  bigint,
  boolean,
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
import { membershipRoleEnum, membershipStatusEnum, valuationMethodEnum } from "./enums"

/** money = integer pesewas stored as bigint */
const moneyCol = (name: string) => bigint(name, { mode: "bigint" })

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}

/** users.id mirrors auth.users.id (Supabase-managed; no FK declared). */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").unique(), // null for phone-only accounts
  phone: text("phone").unique(), // E.164
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("en-GH"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
})

export const garages = pgTable("garages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  region: text("region"),
  gpsLat: numeric("gps_lat", { precision: 9, scale: 6 }),
  gpsLng: numeric("gps_lng", { precision: 9, scale: 6 }),
  businessRegNumber: text("business_reg_number"),
  tin: text("tin"),
  brandColor: text("brand_color"),
  invoiceFooter: text("invoice_footer"),
  terms: text("terms"),
  momoMerchantNumber: text("momo_merchant_number"),
  paystackSubaccountCode: text("paystack_subaccount_code"),
  /** Encrypted MoMo/bank account FixAm pays this garage into (lib/escrow/payout-account). */
  payoutDetailsEncrypted: text("payout_details_encrypted"),
  insurancePartnerId: uuid("insurance_partner_id"), // fk added when partners table lands
  status: text("status").notNull().default("active"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps,
  ...softDelete,
})

export const garageSettings = pgTable("garage_settings", {
  garageId: uuid("garage_id")
    .primaryKey()
    .references(() => garages.id),
  taxRules: jsonb("tax_rules").notNull().default(sql`'[]'::jsonb`),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(false),
  defaultLabourRate: moneyCol("default_labour_rate").notNull().default(sql`0`),
  advisorDiscountLimitPercent: integer("advisor_discount_limit_percent").notNull().default(10),
  depositRules: jsonb("deposit_rules").default(sql`'{}'::jsonb`),
  valuationMethod: valuationMethodEnum("valuation_method").default("weighted_average"),
  quietHours: jsonb("quiet_hours").default(sql`'{"start":"21:00","end":"07:00"}'::jsonb`),
  reminderOverrides: jsonb("reminder_overrides").default(sql`'{}'::jsonb`),
  defaultKmPerDay: jsonb("default_km_per_day").default(
    sql`'{"private":40,"commercial":150,"taxi":180,"ride_hailing":200,"fleet":120}'::jsonb`
  ),
  celebrationsEnabled: boolean("celebrations_enabled").default(true),
  leaderboardEnabled: boolean("leaderboard_enabled").default(true),
  autoReorderEnabled: boolean("auto_reorder_enabled").default(false),
  autoReorderSpendLimit: moneyCol("auto_reorder_spend_limit").default(sql`0`),
  lateFeeRule: jsonb("late_fee_rule"),
  /** Drivers may buy their own parts and have them sent here (P8-03). */
  acceptsCustomerParts: boolean("accepts_customer_parts").notNull().default(true),
  /** Flat fee for fitting a part the driver bought, shown before they pay. */
  customerPartFittingFee: moneyCol("customer_part_fitting_fee").notNull().default(sql`0`),
  currency: text("currency").notNull().default("GHS"),
  ...timestamps,
})

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    name: text("name").notNull(),
    code: text("code").notNull(), // 3-5 chars, used in document numbers
    phone: text("phone"),
    address: text("address"),
    gpsLat: numeric("gps_lat", { precision: 9, scale: 6 }),
    gpsLng: numeric("gps_lng", { precision: 9, scale: 6 }),
    openingHours: jsonb("opening_hours"),
    isDefault: boolean("is_default").default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("branches_garage_code_uniq").on(t.garageId, t.code)]
)

export const bays = pgTable("bays", {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  ...timestamps,
  ...softDelete,
})

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    // nullable until the invitee registers (invited_phone/invited_email set)
    userId: uuid("user_id").references(() => users.id),
    branchId: uuid("branch_id").references(() => branches.id), // null = all branches
    role: membershipRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("invited"),
    invitedPhone: text("invited_phone"),
    invitedEmail: text("invited_email"),
    inviteTokenHash: text("invite_token_hash"),
    invitedBy: uuid("invited_by").references(() => users.id),
    hourlyCost: moneyCol("hourly_cost"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("memberships_garage_user_role_branch_uniq").on(
      t.garageId,
      t.userId,
      t.role,
      t.branchId
    ),
  ]
)

export const documentSequences = pgTable("document_sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
  branchId: uuid("branch_id").references(() => branches.id),
  docType: text("doc_type").notNull(), // INV|RCT|EST|PO|JOB|CN|REN
  nextNumber: bigint("next_number", { mode: "bigint" }).notNull().default(sql`1`),
  ...timestamps,
}, (t) => [
  uniqueIndex("document_sequences_garage_branch_doc_uniq").on(
    t.garageId,
    t.branchId,
    t.docType
  ),
])
