import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Purchases of SMS top-up packs (250 / 500 credits) billed one-off via
 * Tranzila. Row written in "pending" when the Tranzila charge is initiated;
 * flipped to "completed" in the notify webhook after the charge succeeds
 * (and smsExtraBalance on the business is bumped at the same transaction).
 *
 * We keep failed rows for auditing — so we can see how often customers
 * abandon the purchase flow.
 */
export const smsPackPurchasesTable = pgTable("sms_pack_purchases", {
  id:                      serial("id").primaryKey(),
  businessId:              integer("business_id").notNull(),
  packSize:                integer("pack_size").notNull(),         // 250 | 500
  pricePaidAgorot:         integer("price_paid_agorot").notNull(), // 3900 (₪39) | 5900 (₪59)
  tranzilaTransactionId:   text("tranzila_transaction_id"),
  status:                  text("status").notNull().default("pending"), // pending | completed | failed
  createdAt:               timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt:             timestamp("completed_at", { withTimezone: true }),
});

export const insertSmsPackPurchaseSchema = createInsertSchema(smsPackPurchasesTable).omit({ id: true, createdAt: true });
export type InsertSmsPackPurchase = z.infer<typeof insertSmsPackPurchaseSchema>;
export type SmsPackPurchase = typeof smsPackPurchasesTable.$inferSelect;
