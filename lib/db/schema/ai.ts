import { sql } from "drizzle-orm"
import { bigint, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { garages, users } from "./identity"

/**
 * ai_calls — one row per AI / speech provider call (platform table).
 * Used for cost reporting per garage and per user, and for debugging.
 * Never stores prompts or transcripts — only metadata.
 */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id").references(() => garages.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // llm|asr|translate
    provider: text("provider").notNull(), // claude|khaya|mock
    model: text("model"),
    promptKey: text("prompt_key"),
    promptVersion: integer("prompt_version"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    audioSeconds: numeric("audio_seconds", { precision: 8, scale: 2 }),
    /** Cost in micro-USD (1 USD = 1,000,000). */
    costMicroUsd: bigint("cost_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
    status: text("status").notNull().default("ok"), // ok|error
    errorCode: text("error_code"),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_calls_garage_idx").on(t.garageId, t.createdAt),
    index("ai_calls_user_idx").on(t.userId, t.createdAt),
    index("ai_calls_created_idx").on(t.createdAt),
  ]
)
