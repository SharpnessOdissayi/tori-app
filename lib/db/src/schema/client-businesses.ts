import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const clientBusinessesTable = pgTable("client_businesses", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number"),
  googleId: text("google_id"),
  businessId: integer("business_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
