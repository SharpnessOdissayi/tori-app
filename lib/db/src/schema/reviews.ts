import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Public reviews. Anonymous reviews supported — clientEmail is
// nullable so a visitor with just a full name can still leave a
// review. When an email IS present (Google-signed-in visitor) the
// (businessId, clientEmail) unique index dedups: a second submission
// overwrites the first. Anonymous rows with NULL email are NOT
// deduped (Postgres treats each NULL as distinct in unique indexes
// by default), so the owner moderates spam via per-review delete.
export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  clientEmail: text("client_email"),
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
