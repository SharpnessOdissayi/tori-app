import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  notificationEnabled: boolean("notification_enabled").notNull().default(false),
  notificationMessage: text("notification_message"),
  primaryColor: text("primary_color"),
  fontFamily: text("font_family"),
  logoUrl: text("logo_url"),
  bannerUrl: text("banner_url"),
  themeMode: text("theme_mode"),
  whatsappApiKey: text("whatsapp_api_key"),
  whatsappPhoneId: text("whatsapp_phone_id"),
  googleCalendarEnabled: boolean("google_calendar_enabled").notNull().default(false),
  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  stripePublicKey: text("stripe_public_key"),
  phone: text("phone"),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  maxServicesAllowed: integer("max_services_allowed").notNull().default(5),
  maxAppointmentsPerMonth: integer("max_appointments_per_month").notNull().default(20),
  subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
