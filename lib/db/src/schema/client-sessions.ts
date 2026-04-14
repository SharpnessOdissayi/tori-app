import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const clientSessionsTable = pgTable("client_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  phoneNumber: text("phone_number"),
  googleId: text("google_id"),
  facebookId: text("facebook_id"),
  email: text("email"),
  clientName: text("client_name").notNull().default(""),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
