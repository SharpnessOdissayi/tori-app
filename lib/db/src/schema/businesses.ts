import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  username: text("username").unique(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  // Split of ownerName into first + last name, stored separately so that a
  // multi-word surname (e.g. "בן עמי") and a multi-word first name
  // (e.g. "לילך ספיר") are preserved across reloads. When these are set,
  // Settings uses them directly; ownerName is derived from first + " " + last
  // on save for backwards compat with every other consumer.
  ownerFirstName: text("owner_first_name"),
  ownerLastName:  text("owner_last_name"),
  ownerGender: text("owner_gender"), // "male" | "female" | "other" | null
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
  requirePhoneVerification: boolean("require_phone_verification").notNull().default(true),
  phone: text("phone"),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  maxServicesAllowed: integer("max_services_allowed").notNull().default(5),
  maxAppointmentsPerMonth: integer("max_appointments_per_month").notNull().default(20),
  subscriptionStartDate: timestamp("subscription_start_date", { withTimezone: true }),
  // Flipped to true once the trial-ending-soon email + in-app
  // notification have been sent (24h before subscriptionRenewDate).
  // Stops the cron re-firing the same notice every tick.
  trialEndingNoticeSent: boolean("trial_ending_notice_sent").notNull().default(false),
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
  sendBookingConfirmation: boolean("send_booking_confirmation").notNull().default(true),
  sendReminders: boolean("send_reminders").notNull().default(true),
  requireArrivalConfirmation: boolean("require_arrival_confirmation").notNull().default(false),
  sendWhatsAppReminders: boolean("send_whatsapp_reminders").notNull().default(true),
  // Owner-controlled opt-in: when enabled, a WhatsApp message is sent to
  // the customer whenever the owner cancels their appointment. Default
  // OFF — historically every owner-cancel auto-notified the client, and
  // some owners prefer to call the customer themselves rather than send
  // an impersonal automated message. Reported feedback → fixed.
  notifyOnCancel: boolean("notify_on_cancel").notNull().default(false),
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
  // Tranzila deposit payment
  tranzilaEnabled: boolean("tranzila_enabled").notNull().default(false),
  depositAmountAgorot: integer("deposit_amount_agorot"), // deposit in agorot (100 = 1 ILS), null = no deposit
  // Broadcast messaging quota ($10/month cap, ~150 messages @ $0.06 each)
  broadcastSentThisMonth: integer("broadcast_sent_this_month").notNull().default(0),
  broadcastMonthKey: text("broadcast_month_key"), // "YYYY-MM"
  businessCategories: text("business_categories"), // JSON array of category strings
  city: text("city"), // populated separately for directory filtering
  // Profile page announcement popup
  announcementText: text("announcement_text"),
  announcementValidHours: integer("announcement_valid_hours").notNull().default(24),
  announcementCreatedAt: timestamp("announcement_created_at"),
  // Subscription billing (Tranzila token-based)
  tranzilaToken: text("tranzila_token"),          // stored card token for monthly charge
  tranzilaTokenExpiry: text("tranzila_token_expiry"), // MMYY format
  // Custom domain (Pro-only). Business owners set a hostname they own; the
  // public booking page is then served from that hostname. `verified`
  // becomes true once super admin has added the domain to Railway.
  customDomain: text("custom_domain"),
  customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
  subscriptionRenewDate: timestamp("subscription_renew_date", { withTimezone: true }),
  subscriptionCancelledAt: timestamp("subscription_cancelled_at", { withTimezone: true }),
  tranzilaStorId: integer("tranzila_sto_id"),     // Tranzila Standing Order ID (REST API) — if set, Tranzila manages billing
  // ─── Advanced design (preset + fine-grain overrides) ───
  designPreset: text("design_preset"),                      // "elegant" | "minimal" | "bold" | "spa" | "sport" | "nature" | "dark" | "custom"
  accentColor: text("accent_color"),                        // secondary color
  gradientEnabled: boolean("gradient_enabled").notNull().default(false),
  gradientFrom: text("gradient_from"),                      // CSS color
  gradientTo: text("gradient_to"),                          // CSS color
  gradientAngle: integer("gradient_angle").notNull().default(135), // degrees
  backgroundPattern: text("background_pattern"),            // "none" | "dots" | "grid" | "waves" | "circles"
  heroLayout: text("hero_layout"),                          // "stacked" | "hero-full" | "split" | "compact"
  serviceCardStyle: text("service_card_style"),             // "card" | "minimal" | "grid" | "bubble"
  animationStyle: text("animation_style"),                  // "none" | "subtle" | "bouncy"
  hoverEffect: text("hover_effect"),                        // "none" | "lift" | "glow"
  // ─── Receipt / invoice profile ───
  // Fields that go on every receipt the business issues. Stored here
  // (not on the receipt row) because they change infrequently and the
  // owner fills them once in Settings → קבלות.
  businessTaxId: text("business_tax_id"),                   // ח.פ. / ע.מ. / ת.ז.
  businessLegalType: text("business_legal_type"),           // "exempt" | "authorized" | "company"
  businessLegalName: text("business_legal_name"),           // עוסק מורשה / שם משפטי לקבלה
  invoiceAddress: text("invoice_address"),                  // כתובת הרשומה במע"מ (יכולה להיות שונה מכתובת העסק)
  autoSendReceipts: boolean("auto_send_receipts").notNull().default(false),
  // ─── Geocoded address for Waze / Maps navigation ───
  // Populated by a Nominatim geocode whenever `address` or `city`
  // changes. Waze's ?q= text search is unreliable in Hebrew (sends
  // clients to the wrong city when multiple streets share a name);
  // lat/lng via ?ll= is 100% accurate. Text strings (not numeric) so
  // we keep full precision and don't fight Postgres numeric rounding.
  latitude:  text("latitude"),
  longitude: text("longitude"),
  // ─── Bulk-SMS (Inforu) quota ─────────────────────────────────────────────
  // Each paid tier includes a monthly SMS allotment (Pro = 100, עסקי = 500);
  // Free has 0 but can't send bulk anyway. `smsUsedThisPeriod` increments
  // on every successful send, resets when `smsResetDate` passes.
  // `smsExtraBalance` is topped up by pack purchases and carries over
  // indefinitely — burned down only after the monthly quota is exhausted.
  smsMonthlyQuota:    integer("sms_monthly_quota").notNull().default(0),
  smsUsedThisPeriod:  integer("sms_used_this_period").notNull().default(0),
  smsExtraBalance:    integer("sms_extra_balance").notNull().default(0),
  smsResetDate:       timestamp("sms_reset_date", { withTimezone: true }),
});

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({ id: true, createdAt: true });
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;
