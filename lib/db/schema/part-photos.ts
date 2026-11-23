import { boolean, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { garages } from "./identity"
import { partTypes } from "./parts"

/**
 * part_photo_scans — one row per "identify this part" photo (P8-12).
 * The photo itself is not kept. The row records what the AI suggested and
 * what the person picked, so accuracy can be measured (top choice = pick).
 */
export const partPhotoScans = pgTable(
  "part_photo_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** driver | garage | request */
    source: text("source").notNull(),
    userId: uuid("user_id"),
    garageId: uuid("garage_id").references(() => garages.id, { onDelete: "set null" }),
    topPartTypeId: uuid("top_part_type_id").references(() => partTypes.id, { onDelete: "set null" }),
    topConfidence: numeric("top_confidence", { precision: 3, scale: 2 }),
    sure: boolean("sure").notNull().default(false),
    notAPart: boolean("not_a_part").notNull().default(false),
    condition: text("condition"),
    provider: text("provider"),
    chosenPartTypeId: uuid("chosen_part_type_id").references(() => partTypes.id, { onDelete: "set null" }),
    chosenAt: timestamp("chosen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("part_photo_scans_created_idx").on(t.createdAt), index("part_photo_scans_user_idx").on(t.userId)]
)
