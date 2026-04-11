import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { BusinessLoginBody, BusinessRegisterBody, ChangePasswordBody } from "@workspace/api-zod";
import { signBusinessToken } from "../lib/auth";
import { requireBusinessAuth } from "../middlewares/business-auth";

const router = Router();

function buildLoginResponse(business: typeof businessesTable.$inferSelect, token: string) {
  return {
    token,
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
      ownerName: business.ownerName,
      email: business.email,
      phone: business.phone ?? null,
      bufferMinutes: business.bufferMinutes,
      notificationEnabled: business.notificationEnabled,
      notificationMessage: business.notificationMessage ?? null,
      subscriptionPlan: business.subscriptionPlan,
      maxServicesAllowed: business.maxServicesAllowed,
      maxAppointmentsPerMonth: business.maxAppointmentsPerMonth,
      createdAt: business.createdAt.toISOString(),
    },
  };
}

// POST /auth/business/login — supports email OR phone
router.post("/auth/business/login", async (req, res): Promise<void> => {
  const parsed = BusinessLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email: identifier, password } = parsed.data;

  // Try email first, then phone
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(or(eq(businessesTable.email, identifier), eq(businessesTable.phone, identifier)));

  if (!business) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!business.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
    return;
  }

  const valid = await bcrypt.compare(password, business.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signBusinessToken({ businessId: business.id, email: business.email });
  res.json(buildLoginResponse(business, token));
});

// POST /auth/business/register — self-service registration
router.post("/auth/business/register", async (req, res): Promise<void> => {
  const parsed = BusinessRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { name, slug, ownerName, phone, email, password, subscriptionPlan } = parsed.data;

  // Check uniqueness
  const [existingEmail] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.email, email));
  if (existingEmail) {
    res.status(409).json({ error: "email_taken", message: "כתובת האימייל כבר רשומה במערכת" });
    return;
  }

  const [existingPhone] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.phone, phone));
  if (existingPhone) {
    res.status(409).json({ error: "phone_taken", message: "מספר הטלפון כבר רשום במערכת" });
    return;
  }

  const [existingSlug] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
  if (existingSlug) {
    res.status(409).json({ error: "slug_taken", message: "כתובת העסק כבר תפוסה, בחר כתובת אחרת" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const maxServicesAllowed = subscriptionPlan === "pro" ? 999 : 3;
  const maxAppointmentsPerMonth = subscriptionPlan === "pro" ? 9999 : 20;

  const [business] = await db
    .insert(businessesTable)
    .values({
      slug,
      name,
      ownerName,
      phone,
      email,
      passwordHash,
      subscriptionPlan,
      maxServicesAllowed,
      maxAppointmentsPerMonth,
      subscriptionStartDate: new Date(),
    })
    .returning();

  // Default working hours: Sun–Thu 09:00–18:00
  await db.insert(workingHoursTable).values(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      businessId: business.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "18:00",
      isEnabled: [0, 1, 2, 3, 4].includes(day),
    }))
  );

  const token = signBusinessToken({ businessId: business.id, email: business.email });
  res.status(201).json(buildLoginResponse(business, token));
});

// POST /auth/business/change-password — change own password
router.post("/auth/business/change-password", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.id, req.business!.businessId));
  if (!business) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, business.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "wrong_password", message: "הסיסמה הנוכחית שגויה" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(businessesTable).set({ passwordHash }).where(eq(businessesTable.id, business.id));

  res.json({ success: true });
});

export default router;
