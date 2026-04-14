import bcrypt from "bcryptjs";
import { db, businessesTable, servicesTable, workingHoursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const DEMO_SLUG = "demo";

const DEMO_SERVICES = [
  { name: "תספורת נשים", price: 120, durationMinutes: 45, description: "תספורת + פן מקצועי" },
  { name: "תספורת גברים", price: 70, durationMinutes: 30, description: "תספורת + עיצוב זקן" },
  { name: "צביעת שיער", price: 250, durationMinutes: 90, description: "צביעה מלאה עם חומרים מובחרים" },
  { name: "טיפול שיקום לשיער", price: 180, durationMinutes: 60, description: "טיפול עמוק לשיקום ולחות" },
  { name: "עיצוב ותסרוקת אירוע", price: 200, durationMinutes: 75, description: "עיצוב לאירועים, חתונות ומסיבות" },
];

// 0=Sun 1=Mon ... 6=Sat
const DEMO_HOURS = [
  { dayOfWeek: 0, startTime: "09:00", endTime: "19:00", isEnabled: true }, // ראשון
  { dayOfWeek: 1, startTime: "09:00", endTime: "19:00", isEnabled: true },
  { dayOfWeek: 2, startTime: "09:00", endTime: "19:00", isEnabled: true },
  { dayOfWeek: 3, startTime: "09:00", endTime: "19:00", isEnabled: true },
  { dayOfWeek: 4, startTime: "09:00", endTime: "19:00", isEnabled: true }, // חמישי
  { dayOfWeek: 5, startTime: "09:00", endTime: "14:00", isEnabled: true }, // שישי
  { dayOfWeek: 6, startTime: "09:00", endTime: "18:00", isEnabled: false }, // שבת
];

const DEMO_GALLERY = JSON.stringify([
  "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&h=600&fit=crop",
  "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&h=600&fit=crop",
]);

export async function seedDemoBusiness() {
  try {
    const [existing] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.slug, DEMO_SLUG));

    if (existing) {
      logger.info("Demo business already exists, skipping seed");
      return;
    }

    const passwordHash = await bcrypt.hash("demo123", 10);

    const [business] = await db
      .insert(businessesTable)
      .values({
        slug: DEMO_SLUG,
        name: "סטודיו שיל",
        ownerName: "שיל לוי",
        email: "demo@kavati.net",
        passwordHash,
        subscriptionPlan: "pro",
        maxServicesAllowed: 9999,
        maxAppointmentsPerMonth: 99999,
        isActive: true,
        requirePhoneVerification: false,
        primaryColor: "#7C3AED",
        businessDescription: "סטודיו שיל — מקום שבו כל לקוח מקבל יחס אישי ותוצאה שמדברת בעד עצמה. אנחנו מתמחים בעיצוב שיער, צביעות מתקדמות וטיפולי שיקום. כיסא שלנו = ניסיון שלך.",
        address: "רחוב דיזנגוף 88, תל אביב",
        contactPhone: "054-1234567",
        instagramUrl: "https://www.instagram.com/kavati.net/",
        logoUrl: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&h=400&fit=crop&crop=center",
        bannerUrl: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&h=400&fit=crop",
        galleryImages: DEMO_GALLERY,
        welcomeText: "ברוכים הבאים לסטודיו שיל! קבעו תור בקלות ובמהירות 💜",
        announcementText: "🎉 מבצע חודש יוני — 20% הנחה על כל טיפולי הצביעה! הזדרזו לפני שנגמר.",
        announcementValidHours: 999,
        announcementCreatedAt: new Date(),
        sendBookingConfirmation: true,
        sendReminders: true,
        city: "תל אביב",
      })
      .returning({ id: businessesTable.id });

    await db.insert(servicesTable).values(
      DEMO_SERVICES.map((s) => ({ ...s, businessId: business.id }))
    );

    await db.insert(workingHoursTable).values(
      DEMO_HOURS.map((h) => ({ ...h, businessId: business.id }))
    );

    logger.info("Demo business seeded (slug: demo)");
  } catch (err) {
    logger.error({ err }, "Failed to seed demo business");
  }
}
