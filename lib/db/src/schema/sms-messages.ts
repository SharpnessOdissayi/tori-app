import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per outbound bulk SMS sent via Inforu. Written at send time with
 * status "queued"; updated by the Inforu delivery-report webhook to
 * "delivered" or "failed" once the carrier confirms.
 *
 * Retained indefinitely — cheap rows, useful for:
 *   - owner-side history ("did that campaign actually go out?")
 *   - analytics (delivery rate per campaign, per day, per sender-name)
 *   - billing disputes
 */
export const smsMessagesTable = pgTable("sms_messages", {
  id:                 serial("id").primaryKey(),
  businessId:         integer("business_id").notNull(),
  recipientPhone:     text("recipient_phone").notNull(),     // normalized 972XXXXXXXXX
  message:            text("message").notNull(),
  status:             text("status").notNull().default("queued"), // queued | pending | delivered | failed
  inforuMessageId:    text("inforu_message_id"),             // Inforu's id, populated on accept
  customerMessageId:  text("customer_message_id"),           // our own ref, sent to Inforu & echoed in DLR
  chargedCredits:     integer("charged_credits").notNull().default(1),
  // Which quota bucket paid for this send: "monthly" (the included allowance)
  // or "extra" (a purchased pack). Useful for analytics and refunds when
  // sending fails: we refund back to the bucket we burned.
  fromSource:         text("from_source").notNull().default("monthly"), // monthly | extra
  statusReason:       text("status_reason"),                 // error text from Inforu or DLR
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt:        timestamp("delivered_at", { withTimezone: true }),
});

export const insertSmsMessageSchema = createInsertSchema(smsMessagesTable).omit({ id: true, createdAt: true });
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;
export type SmsMessage = typeof smsMessagesTable.$inferSelect;
