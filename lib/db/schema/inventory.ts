import {
  bigint,
  boolean,
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
  poStatusEnum,
  stockMovementTypeEnum,
  vendorOrderOriginEnum,
  vendorOrderStatusEnum,
  vendorStatusEnum,
} from "./enums"
import { branches, garages, users } from "./identity"
import { customers, vehicles } from "./customers"
import { invoices } from "./money"
import { partTypes } from "./parts"

const money = (name: string) => bigint(name, { mode: "bigint" })

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
/** Vendor orders: garage_id is the delivery garage — null when a driver has parts sent home or picks up. */
const optionalTenant = {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id").references(() => garages.id),
}

/** parts — tenant catalogue */
export const parts = pgTable(
  "parts",
  {
    ...tenant,
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category"),
    description: text("description"),
    compatibleVehicles: jsonb("compatible_vehicles"), // [{make,model,year_from,year_to}]
    barcode: text("barcode"),
    unit: text("unit").default("pcs"),
    costPrice: money("cost_price").notNull().default(sql`0`),
    sellingPrice: money("selling_price").notNull().default(sql`0`),
    taxCodes: text("tax_codes").array(),
    photoUrl: text("photo_url"),
    preferredVendorId: uuid("preferred_vendor_id"), // fk:vendors below
    preferredVendorProductId: uuid("preferred_vendor_product_id"),
    partTypeId: uuid("part_type_id").references(() => partTypes.id),
    isServiceItem: boolean("is_service_item").default(false),
    onlineVisible: boolean("online_visible").default(false),
    isActive: boolean("is_active").default(true),
    ...timestamps,
    ...{ deletedAt: timestamp("deleted_at", { withTimezone: true }) },
  },
  (t) => [uniqueIndex("parts_garage_sku_uniq").on(t.garageId, t.sku)]
)

export const stockLevels = pgTable(
  "stock_levels",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    quantityOnHand: numeric("quantity_on_hand", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    quantityReserved: numeric("quantity_reserved", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    reorderLevel: numeric("reorder_level", { precision: 12, scale: 2 }).default("0"),
    reorderQuantity: numeric("reorder_quantity", { precision: 12, scale: 2 }).default("0"),
    binLocation: text("bin_location"),
    averageCost: money("average_cost").default(sql`0`),
    ...timestamps,
  },
  (t) => [uniqueIndex("stock_levels_uniq").on(t.garageId, t.branchId, t.partId)]
)

export const stockMovements = pgTable(
  "stock_movements",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(), // +in / -out
    unitCost: money("unit_cost"),
    referenceType: text("reference_type"), // job|pos_sale|purchase_order|transfer|adjustment
    referenceId: uuid("reference_id"),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("stock_movements_part_idx").on(t.partId)]
)

export const posSales = pgTable("pos_sales", {
  ...tenant,
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  customerId: uuid("customer_id").references(() => customers.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  soldBy: uuid("sold_by").references(() => users.id),
  channel: text("channel").default("counter"), // counter|online
  status: text("status").default("open"), // open|completed|returned
  ...timestamps,
})

/** vendors — platform-facing marketplace vendors */
export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: text("business_name").notNull(),
    slug: text("slug").notNull().unique(),
    logoUrl: text("logo_url"),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    gpsLat: numeric("gps_lat", { precision: 9, scale: 6 }),
    gpsLng: numeric("gps_lng", { precision: 9, scale: 6 }),
    deliveryZones: jsonb("delivery_zones"), // [{region, city?, fee, eta_hours}]
    categories: text("categories").array(),
    payoutMethod: text("payout_method"), // momo|bank
    payoutDetailsEncrypted: text("payout_details_encrypted"),
    paystackSubaccountCode: text("paystack_subaccount_code"),
    commissionBp: integer("commission_bp").default(0),
    status: vendorStatusEnum("status").notNull().default("pending"),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").default(0),
    ...timestamps,
    ...{ deletedAt: timestamp("deleted_at", { withTimezone: true }) },
  }
)

export const vendorMembers = pgTable(
  "vendor_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // vendor_owner|vendor_staff
    ...timestamps,
  },
  (t) => [uniqueIndex("vendor_members_uniq").on(t.vendorId, t.userId)]
)

export const vendorProducts = pgTable(
  "vendor_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null = platform vendor catalogue; set when a garage overrides/imports
    garageId: uuid("garage_id").references(() => garages.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    category: text("category").notNull(),
    description: text("description"),
    compatibleVehicles: jsonb("compatible_vehicles"),
    unit: text("unit").default("pcs"),
    price: money("price").notNull(),
    stockStatus: text("stock_status"), // in_stock|low|out|on_order
    quantityAvailable: integer("quantity_available"),
    minOrderQty: integer("min_order_qty").default(1),
    leadTimeHours: integer("lead_time_hours"),
    photos: text("photos").array(),
    isActive: boolean("is_active").default(true),
    // Standard parts list + fitment (P8-01)
    partTypeId: uuid("part_type_id").references(() => partTypes.id),
    condition: text("condition"), // genuine|aftermarket|home_used
    fitMake: text("fit_make"),
    fitModel: text("fit_model"),
    fitYearFrom: integer("fit_year_from"),
    fitYearTo: integer("fit_year_to"),
    oemNumber: text("oem_number"),
    warrantyDays: integer("warranty_days"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vendor_products_vendor_sku_uniq").on(t.vendorId, t.sku),
    index("vendor_products_name_idx").on(t.name),
    index("vendor_products_part_type_idx").on(t.partTypeId, t.fitMake, t.fitModel),
  ]
)

// Fix tenant spread: vendor_products is vendor-scoped, garage_id should be nullable.
// (kept garage_id column for tenant consistency; null = platform catalog)

export const vendorOrders = pgTable(
  "vendor_orders",
  {
    ...optionalTenant,
    number: text("number").notNull(), // VO-...
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    branchId: uuid("branch_id").references(() => branches.id),
    purchaseOrderId: uuid("purchase_order_id"), // fk:purchase_orders below
    origin: vendorOrderOriginEnum("origin").notNull(),
    orderedByUserId: uuid("ordered_by_user_id").references(() => users.id),
    orderedByCustomerId: uuid("ordered_by_customer_id").references(() => customers.id),
    jobId: uuid("job_id"), // FK to jobs declared without reference to avoid module cycle
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    status: vendorOrderStatusEnum("status").notNull().default("placed"),
    subtotal: money("subtotal").notNull(),
    deliveryFee: money("delivery_fee").default(sql`0`),
    commissionAmount: money("commission_amount").default(sql`0`),
    total: money("total").notNull(),
    paymentStatus: text("payment_status").default("pending"),
    paystackReference: text("paystack_reference"),
    expectedDeliveryAt: timestamp("expected_delivery_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    // P8-03 — drivers buying parts
    buyerUserId: uuid("buyer_user_id").references(() => users.id),
    buyerPhone: text("buyer_phone"),
    destinationType: text("destination_type").notNull().default("garage"), // garage|home|pickup
    deliveryAddress: text("delivery_address"),
    deliveryRegion: text("delivery_region"),
    deliveryCity: text("delivery_city"),
    fittingFee: money("fitting_fee").notNull().default(sql`0`),
    courier: text("courier"), // vendor|partner
    riderName: text("rider_name"),
    riderPhone: text("rider_phone"),
    courierReference: text("courier_reference"),
    receivedPhotoPath: text("received_photo_path"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("vendor_orders_vendor_idx").on(t.vendorId, t.status),
    index("vendor_orders_buyer_idx").on(t.buyerUserId, t.createdAt),
    index("vendor_orders_garage_idx").on(t.garageId, t.status),
  ]
)

export const vendorOrderItems = pgTable("vendor_order_items", {
  ...optionalTenant,
  vendorOrderId: uuid("vendor_order_id")
    .notNull()
    .references(() => vendorOrders.id),
  vendorProductId: uuid("vendor_product_id")
    .notNull()
    .references(() => vendorProducts.id),
  partId: uuid("part_id").references(() => parts.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  quantityDelivered: integer("quantity_delivered").default(0),
  quantityReceived: integer("quantity_received").default(0),
  ...timestamps,
})

export const vendorOrderEvents = pgTable("vendor_order_events", {
  ...optionalTenant,
  vendorOrderId: uuid("vendor_order_id")
    .notNull()
    .references(() => vendorOrders.id),
  status: vendorOrderStatusEnum("status").notNull(),
  actorUserId: uuid("actor_user_id"),
  note: text("note"),
  ...timestamps,
})

export const vendorReviews = pgTable(
  "vendor_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),
    vendorOrderId: uuid("vendor_order_id")
      .notNull()
      .unique()
      .references(() => vendorOrders.id),
    garageId: uuid("garage_id").notNull(),
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    ...timestamps,
  }
)

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...tenant,
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    number: text("number").notNull(), // PO-...
    vendorId: uuid("vendor_id").references(() => vendors.id),
    externalSupplierName: text("external_supplier_name"),
    status: poStatusEnum("status").notNull().default("draft"),
    isAutoGenerated: boolean("is_auto_generated").default(false),
    subtotal: money("subtotal").notNull().default(sql`0`),
    total: money("total").notNull().default(sql`0`),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("purchase_orders_garage_number_uniq").on(t.garageId, t.number)]
)

export const purchaseOrderItems = pgTable("purchase_order_items", {
  ...tenant,
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  partId: uuid("part_id")
    .notNull()
    .references(() => parts.id),
  vendorProductId: uuid("vendor_product_id").references(() => vendorProducts.id),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitCost: money("unit_cost").notNull(),
  quantityReceived: numeric("quantity_received", { precision: 12, scale: 2 }).default("0"),
  ...timestamps,
})

export const goodsReceipts = pgTable("goods_receipts", {
  ...tenant,
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  vendorOrderId: uuid("vendor_order_id").references(() => vendorOrders.id),
  receivedBy: uuid("received_by")
    .notNull()
    .references(() => users.id),
  lines: jsonb("lines").notNull(), // [{part_id, quantity, unit_cost, condition}]
  notes: text("notes"),
  ...timestamps,
})
