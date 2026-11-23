import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { customers, vehicles } from "./customers"
import { garages } from "./identity"

/**
 * seasonal_campaigns — one harmattan / rainy-season campaign per garage per
 * season per year (P8-11). Created a week before the send day so the garage
 * can add an offer or skip it.
 *
 * status: scheduled → sending → sent · skipped (garage said no) ·
 * expired (window passed before anything could send)
 */
export const seasonalCampaigns = pgTable(
  "seasonal_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").notNull().references(() => garages.id, { onDelete: "cascade" }),
    /** harmattan | rainy_major | rainy_minor */
    season: text("season").notNull(),
    sendOn: date("send_on").notNull(),
    /** north | middle | coast — from the garage's region when created. */
    zone: text("zone").notNull(),
    status: text("status").notNull().default("scheduled"),
    /** Optional line the garage adds, e.g. "Free wiper check this month". */
    offerText: text("offer_text"),
    recipientsCount: integer("recipients_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    bookingsCount: integer("bookings_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("seasonal_campaigns_garage_season_day_uniq").on(t.garageId, t.season, t.sendOn),
    index("seasonal_campaigns_status_idx").on(t.status, t.sendOn),
  ]
)

/**
 * seasonal_campaign_sends — one row per customer per campaign.
 * status: pending → sent · failed · skipped (opted out, inactive, no phone…)
 */
export const seasonalCampaignSends = pgTable(
  "seasonal_campaign_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").notNull().references(() => garages.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => seasonalCampaigns.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    channel: text("channel"),
    status: text("status").notNull().default("pending"),
    reason: text("reason"),
    providerMessageId: text("provider_message_id"),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("seasonal_campaign_sends_campaign_customer_uniq").on(t.campaignId, t.customerId),
    index("seasonal_campaign_sends_pending_idx").on(t.campaignId, t.status),
    index("seasonal_campaign_sends_customer_idx").on(t.customerId, t.sentAt),
  ]
)
