import { sql } from "drizzle-orm"
import { bigint, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { garages } from "./identity"
import { partTypes } from "./parts"

/**
 * price_observations — anonymised prices taken from issued invoices
 * (platform table, P8-09 fair-quote check).
 *
 * One row per priced invoice line we can classify: a part line with a
 * standard part type (unit price), or a labour line with hours (hourly rate).
 * source_garage_id is kept only so we can require prices from several
 * garages and delete rows when an invoice is voided — it is never returned
 * to any customer or garage.
 */
export const priceObservations = pgTable(
  "price_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** part = unit price of a part · labour_rate = labour price per hour */
    kind: text("kind").notNull(),
    partTypeId: uuid("part_type_id").references(() => partTypes.id, { onDelete: "cascade" }),
    /** economy|premium|suv|commercial|motorbike — see lib/fair-quote/core carClass */
    carClass: text("car_class").notNull(),
    /** Lower-cased garage city, or "" when unknown. */
    city: text("city").notNull().default(""),
    /** Pesewas: unit price (part) or price per hour (labour_rate). */
    amount: bigint("amount", { mode: "bigint" }).notNull().default(sql`0`),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
    observedOn: date("observed_on").notNull(),
    sourceGarageId: uuid("source_garage_id").notNull().references(() => garages.id, { onDelete: "cascade" }),
    sourceInvoiceId: uuid("source_invoice_id").notNull(),
    sourceInvoiceLineId: uuid("source_invoice_line_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("price_observations_line_uniq").on(t.sourceInvoiceLineId),
    index("price_observations_lookup_idx").on(t.kind, t.partTypeId, t.carClass, t.city, t.observedOn),
    index("price_observations_invoice_idx").on(t.sourceInvoiceId),
  ]
)
