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
  borderRadius: text("border_radius"),
  welcomeText: text("welcome_text"),
  backgroundColor: text("background_color"),
  requireAppointmentApproval: boolean("require_appointment_approval").notNull().default(false),
  whatsappApiKey: text("whatsapp_api_key"),
  whatsappPhoneId: text("whatsapp_phone_id"),
  googleCalendarEnabled: boolean("google_calendar_enabled").notNull().default(false),
  stripeEnabled: boolean("stripe_enabled").notNull().default(false),
  stripePublicKey: text("stripe_public_key"),
  greenApiInstanceId: text("green_api_instance_id"),
  greenApiToken: text("green_api_token"),
  requirePhoneVerification: boolean("require_phone_verification").notNull().default(true),
  phone: text("phone"),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  maxServicesAllowed: integer("max_services_allowed").notNull().default(5),
  maxAppointmentsPerMonth: integer("max_appointments_per_month").notNull().default(20),
  subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Booking restrictions
  minLeadHours: integer("min_lead_hours").notNull().default(0),
  cancellationHours: integer("cancellation_hours").notNull().default(0),
  maxFutureWeeks: integer("max_future_weeks").notNull().default(15),
  futureBookingMode: text("future_booking_mode").notNull().default("weeks"),
  maxFutureDate: text("max_future_date"),
  maxAppointmentsPerCustomer: integer("max_appointments_per_customer"),
  requireActiveSubscription: boolean("require_active_subscription").notNull().default(false),
  maxAppointmentsPerDay: integer("max_appointments_per_day"),
  // Reminders
  buttonRadius: text("button_radius"),
  sendReminders: boolean("send_reminders").notNull().default(true),
  requireArrivalConfirmation: boolean("require_arrival_confirmation").notNull().default(false),
  sendWhatsAppReminders: boolean("send_whatsapp_reminders").notNull().default(true),
  reminderTriggers: text("reminder_triggers"),
  reminderCustomText: text("reminder_custom_text"),
  // Shabbat settings: "any" = send any day | "before" = only before Shabbat (Friday) | "after" = only after Shabbat (Sat night)
  shabbatMode: text("shabbat_mode").notNull().default("any"),
  reminderSendTime: text("reminder_send_time").notNull().default("20:00"),
  // Header display controls
  showBusinessName: boolean("show_business_name").notNull().default(true),
  showLogo: boolean("show_logo").notNull().default(true),
  showBanner: boolean("show_banner").notNull().default(true),
  headerLayout: text("header_layout").notNull().default("stacked"),
  // Profile landing page
  websiteUrl: text("website_url"),
  instagramUrl: text("instagram_url"),
  wazeUrl: text("waze_url"),
  businessDescription: text("business_description"),
  galleryImages: text("gallery_images"), // JSON array of image URLs
  bannerPosition: text("banner_position").notNull().default("center"), // CSS object-position
  contactPhone: text("contact_phone"), // Display phone (overrides login phone in profile)
  address: text("address"), // Business address shown on profile page
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
