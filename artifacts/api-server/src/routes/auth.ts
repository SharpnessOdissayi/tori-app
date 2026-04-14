import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { BusinessLoginBody, BusinessRegisterBody, ChangePasswordBody } from "@workspace/api-zod";
import { signBusinessToken } from "../lib/auth";
import { requireBusinessAuth } from "../middlewares/business-auth";
import { sendEmail } from "../lib/email";

// In-memory store for password reset codes: email → { code, expiresAt }
const resetCodes = new Map<string, { code: string; expiresAt: number }>();

// In-memory store for email-change OTPs: businessId → { newEmail, code, expiresAt }
const emailChangeCodes = new Map<number, { newEmail: string; code: string; expiresAt: number }>();

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
  const identifierNormalized = identifier.toLowerCase().trim();

  // Try email (case-insensitive) first, then phone
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(or(
      eq(sql`lower(${businessesTable.email})`, identifierNormalized),
      eq(businessesTable.phone, identifier.trim())
    ));

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

  const { name, slug, ownerName, phone, email, password, subscriptionPlan, businessCategories } = parsed.data;

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
      businessCategories: businessCategories ? JSON.stringify(businessCategories) : null,
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

// POST /auth/business/forgot-password — send 6-digit reset code to email
router.post("/auth/business/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Missing email" });
    return;
  }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.email, email.toLowerCase().trim()));
  // Always respond OK to avoid email enumeration
  if (!business) {
    res.json({ success: true });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  resetCodes.set(email.toLowerCase().trim(), { code, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min

  await sendEmail(email, "קוד איפוס סיסמה — קבעתי", `
    <div dir="rtl" style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
      <h2>איפוס סיסמה</h2>
      <p>הקוד שלך לאיפוס הסיסמה:</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f1f5f9; border-radius: 12px; margin: 16px 0;">
        ${code}
      </div>
      <p style="color: #888;">הקוד תקף ל-10 דקות.</p>
    </div>
  `);

  res.json({ success: true });
});

// POST /auth/business/reset-password — verify code and set new password
router.post("/auth/business/reset-password", async (req, res): Promise<void> => {
  const { email, code, newPassword } = req.body ?? {};
  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "Missing fields" });
    return;
  }

  const entry = resetCodes.get(email.toLowerCase().trim());
  if (!entry || entry.code !== String(code) || Date.now() > entry.expiresAt) {
    res.status(400).json({ error: "invalid_code", message: "הקוד שגוי או פג תוקף" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" });
    return;
  }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.email, email.toLowerCase().trim()));
  if (!business) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(businessesTable).set({ passwordHash }).where(eq(businessesTable.id, business.id));
  resetCodes.delete(email.toLowerCase().trim());

  res.json({ success: true });
});

// POST /auth/business/request-email-change — send OTP to new email OR existing phone
router.post("/auth/business/request-email-change", requireBusinessAuth, async (req, res): Promise<void> => {
  const { newEmail, via } = req.body ?? {};
  if (!newEmail || typeof newEmail !== "string") {
    res.status(400).json({ error: "Missing newEmail" });
    return;
  }
  if (!["email", "phone"].includes(via)) {
    res.status(400).json({ error: "via must be 'email' or 'phone'" });
    return;
  }

  const normalized = newEmail.toLowerCase().trim();

  // Make sure new email isn't already taken by another business
  const [existing] = await db.select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.email, normalized));
  if (existing && existing.id !== req.business!.businessId) {
    res.status(409).json({ error: "email_taken", message: "כתובת האימייל כבר רשומה במערכת" });
    return;
  }

  const [business] = await db.select().from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));
  if (!business) { res.status(404).json({ error: "Not found" }); return; }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  emailChangeCodes.set(business.id, { newEmail: normalized, code, expiresAt: Date.now() + 10 * 60 * 1000 });

  if (via === "email") {
    await sendEmail(normalized, "אימות שינוי אימייל — קבעתי", `
      <div dir="rtl" style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
        <h2>אימות כתובת אימייל חדשה</h2>
        <p>קיבלת בקשה לשנות את האימייל של העסק שלך בקבעתי לכתובת זו.</p>
        <p>קוד האימות שלך:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f1f5f9; border-radius: 12px; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #888;">הקוד תקף ל-10 דקות. אם לא ביקשת זאת, אנא התעלם.</p>
      </div>
    `);
  } else {
    // via phone — send OTP via WhatsApp to the registered phone
    if (!business.phone) {
      res.status(400).json({ error: "no_phone", message: "לא נמצא מספר טלפון מחובר לחשבון" });
      return;
    }
    const { sendAuthTemplate } = await import("../lib/whatsapp");
    // verify_otp_usecase: AUTHENTICATION template — body {{1}}=code, {{2}}=use-case + copy-code button
    await sendAuthTemplate(business.phone, "verify_otp_usecase", [code, "שינוי אימייל בקבעתי"], code);
  }

  res.json({ success: true });
});

// POST /auth/business/confirm-email-change — verify OTP and apply new email
router.post("/auth/business/confirm-email-change", requireBusinessAuth, async (req, res): Promise<void> => {
  const { code } = req.body ?? {};
  if (!code) { res.status(400).json({ error: "Missing code" }); return; }

  const entry = emailChangeCodes.get(req.business!.businessId);
  if (!entry || String(code) !== entry.code || Date.now() > entry.expiresAt) {
    res.status(400).json({ error: "invalid_code", message: "הקוד שגוי או פג תוקף" });
    return;
  }

  await db.update(businessesTable)
    .set({ email: entry.newEmail })
    .where(eq(businessesTable.id, req.business!.businessId));

  emailChangeCodes.delete(req.business!.businessId);
  res.json({ success: true, newEmail: entry.newEmail });
});

// POST /auth/forgot-password — send OTP via WhatsApp for phone-based reset
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone) { res.status(400).json({ error: "Phone required" }); return; }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.phone, phone));
  if (!business) { res.status(404).json({ error: "מספר טלפון לא נמצא במערכת" }); return; }

  const { sendOtp } = await import("../lib/whatsapp");
  await sendOtp(phone);
  res.json({ ok: true });
});

// POST /auth/reset-password — verify OTP and set new password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { phone, code, newPassword } = req.body;
  if (!phone || !code || !newPassword) { res.status(400).json({ error: "Missing fields" }); return; }

  const { verifyOtp } = await import("../lib/whatsapp");
  const { consumeVerification } = await import("../lib/otpStore");

  const valid = await verifyOtp(phone, code);
  if (!valid) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  consumeVerification(phone);

  const bcryptLib = await import("bcryptjs");
  const hash = await bcryptLib.hash(newPassword, 10);

  await db.update(businessesTable).set({ passwordHash: hash }).where(eq(businessesTable.phone, phone));
  res.json({ ok: true });
});

export default router;
