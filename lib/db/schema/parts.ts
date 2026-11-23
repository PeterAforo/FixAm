import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * part_types — FixAm's standard parts list (platform table). Vendors list
 * products against a part type; diagnosis findings and repair requests are
 * matched to part types so offers can be found instantly.
 */
export const partTypes = pgTable(
  "part_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    /** Other names people use — English street names and local-language terms (admin-curated). */
    synonyms: text("synonyms").array().notNull().default([]),
    typicalLabourHours: numeric("typical_labour_hours", { precision: 4, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("part_types_category_idx").on(t.category)]
)
