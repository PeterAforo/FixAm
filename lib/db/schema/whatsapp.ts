import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { garages, users } from "./identity"
import { customers } from "./customers"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

/**
 * whatsapp_conversations — one WhatsApp thread per (garage, customer phone).
 * mode: ai (assistant replies) | human (staff took over — AI paused).
 * pendingGarage: set when the sender matched several garages and we asked
 * which one; cleared once they answer.
 */
export const whatsappConversations = pgTable(
  "whatsapp_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    garageId: uuid("garage_id")
      .notNull()
      .references(() => garages.id),
    customerPhone: text("customer_phone").notNull(), // E.164 digits, no +
    customerId: uuid("customer_id").references(() => customers.id),
    mode: text("mode").notNull().default("ai"), // ai|human
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    /** Garage selection pending: { options: [{id,name}], askedAt } */
    pendingGarage: jsonb("pending_garage"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    /** Start of the current 24 h customer-service window (last inbound). */
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0), // inbound since staff last opened
    ...timestamps,
  },
  (t) => [
    index("wa_conv_garage_phone_idx").on(t.garageId, t.customerPhone),
    index("wa_conv_garage_idx").on(t.garageId, t.lastMessageAt),
  ]
)

/**
 * whatsapp_messages — every inbound and outbound WhatsApp message.
 * type: text|audio|image|template|interactive|system
 */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => whatsappConversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // in|out
    type: text("type").notNull().default("text"),
    body: text("body"),
    mediaPath: text("media_path"),
    transcript: text("transcript"),
    aiToolCalls: jsonb("ai_tool_calls"),
    providerMessageId: text("provider_message_id"),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wa_msg_conv_idx").on(t.conversationId, t.createdAt),
    index("wa_msg_provider_idx").on(t.providerMessageId),
  ]
)
