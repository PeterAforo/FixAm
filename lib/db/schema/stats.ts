import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { garages, users } from "./identity"

const money = (name: string) => bigint(name, { mode: "bigint" })

const tenant = {
  id: uuid("id").primaryKey().defaultRandom(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
}

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/** Rolling per-mechanic performance stats, recomputed nightly. */
export const mechanicStats = pgTable(
  "mechanic_stats",
  {
    ...tenant,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    jobsCompleted: integer("jobs_completed").notNull().default(0),
    minutesWorked: integer("minutes_worked").notNull().default(0),
    revenuePesewas: money("revenue_pesewas").notNull().default(sql`0`),
    comebacks: integer("comebacks").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    ...timestamps,
  },
  (t) => [uniqueIndex("mechanic_stats_uniq").on(t.garageId, t.userId)]
)

/** Badges awarded to mechanics by the nightly stats job. */
export const mechanicBadgeAwards = pgTable(
  "mechanic_badge_awards",
  {
    ...tenant,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    badgeKey: text("badge_key").notNull(), // first_fix|zero_comebacks|speed_demon|hundred_jobs|streak_7
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mechanic_badge_awards_uniq").on(t.garageId, t.userId, t.badgeKey),
    index("mechanic_badge_awards_user_idx").on(t.garageId, t.userId),
  ]
)
