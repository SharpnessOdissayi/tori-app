import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// One public review per (business, client_email).
// Owner asked: customers log in with email (Google), attach a phone
// via popup, then leave a review. Name + avatar pulled from the
// Google profile at the time of review so they match what the
// customer sees on their own Google card.
export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  clientEmail: text("client_email").notNull(),
  clientPhone: text("client_phone"),
  clientName: text("client_name").notNull(),
  avatarUrl: text("avatar_url"),
  rating: integer("rating").notNull(), // 1–5
  text: text("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  businessEmailUniq: uniqueIndex("reviews_business_email_uniq").on(t.businessId, t.clientEmail),
}));

export type Review = typeof reviewsTable.$inferSelect;
