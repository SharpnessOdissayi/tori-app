import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { BusinessLoginBody } from "@workspace/api-zod";
import { signBusinessToken } from "../lib/auth";
import { requireBusinessAuth } from "../middlewares/business-auth";
import { sendEmail } from "../lib/email";

// In-memory store for password reset codes: email → { code, expiresAt }
const resetCodes = new Map<string, { code: string; expiresAt: number }>();

// In-memory store for email-change OTPs: businessId → { newEmail, code, expiresAt }
const emailChangeCodes = new Map<number, { newEmail: string; code: string; expiresAt: number }>();

const router = Router();

function parseBusinessRegisterBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const {
    name, slug, username, ownerName, phone, email, password, subscriptionPlan,
    businessCategories, address, websiteUrl, instagramHandle,
  } = raw;
  const isString = (v: unknown) => typeof v === "string";
  if (
    !isString(name) || !isString(slug) || !isString(ownerName) || !isString(phone) ||
    !isString(email) || !isString(password) || !["free", "pro"].includes(subscriptionPlan)
  ) {
    return { success: false as const };
  }
  if (username !== undefined && !isString(username)) return { success: false as const };
  if (address !== undefined && !isString(address)) return { success: false as const };
  if (websiteUrl !== undefined && !isString(websiteUrl)) return { success: false as const };
  if (instagramHandle !== undefined && !isString(instagramHandle)) return { success: false as const };
  if (businessCategories !== undefined && (!Array.isArray(businessCategories) || businessCategories.some((c) => !isString(c)))) {
    return { success: false as const };
  }
  return {
    success: true as const,
    data: {
      name, slug, username, ownerName, phone, email, password, subscriptionPlan,
      businessCategories, address, websiteUrl, instagramHandle,
    },
  };
}

function parseChangePasswordBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const { currentPassword, newPassword } = raw;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length === 0) {
    return { success: false as const };
  }
  return { success: true as const, data: { currentPassword, newPassword } };
}

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

// POST /auth/business/login — supports email, phone, or username
router.post("/auth/business/login", async (req, res): Promise<void> => {
  const parsed = BusinessLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email: identifier, password } = parsed.data;
  const identifierNormalized = identifier.toLowerCase().trim();

  // Try email (case-insensitive), phone, or username
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(or(
      eq(sql`lower(${businessesTable.email})`, identifierNormalized),
      eq(businessesTable.phone, identifier.trim()),
      eq(sql`lower(${(businessesTable as any).username})`, identifierNormalized)
    ));

  if (!business) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Verify password BEFORE disclosing account-status. Otherwise an attacker
  // can enumerate valid accounts by probing for the "account_suspended"
  // error message. With this ordering, the suspended-account message only
  // reaches callers who actually know the password.
  const valid = await bcrypt.compare(password, business.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!business.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
    return;
  }

  const token = signBusinessToken({ businessId: business.id, email: business.email });
  res.json(buildLoginResponse(business, token));
});

// POST /auth/business/register — self-service registration
router.post("/auth/business/register", async (req, res): Promise<void> => {
  const parsed = parseBusinessRegisterBody(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { name, slug, username, ownerName, phone, email, password, subscriptionPlan, businessCategories, address, websiteUrl, instagramHandle } = parsed.data;

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

  if (username) {
    const [existingUsername] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(sql`lower(${(businessesTable as any).username})`, username.toLowerCase().trim()));
    if (existingUsername) {
      res.status(409).json({ error: "username_taken", message: "שם המשתמש כבר תפוס, בחר שם אחר" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Every new business gets a 14-day Pro trial — no card needed.
  // The owner picks "free" or "pro" in the register flow to signal
  // which tier they *intend* to stay on after the trial; during the
  // trial itself they get full Pro access so they can evaluate the
  // product without the free-tier ceilings.
  // If they don't add a payment method before subscriptionRenewDate,
  // the subscription cron auto-downgrades them to free.
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  const [business] = await db
    .insert(businessesTable)
    .values({
      slug,
      name,
      ownerName,
      phone,
      email,
      passwordHash,
      // Always start as Pro for the trial window — pricing copy promises
      // 14 days of full Pro at signup regardless of the plan they picked.
      subscriptionPlan: "pro",
      maxServicesAllowed: 999,
      maxAppointmentsPerMonth: 9999,
      subscriptionStartDate: new Date(),
      subscriptionRenewDate: trialEndsAt,
      // Trial allowance = 50 bulk SMS for the 14-day window. When the
      // trial converts to a paid tier (Tranzila notify webhook), the
      // quota is bumped to 100 (פרו) or 500 (עסקי). When the trial
      // lapses to free, the cron sets it to 0.
      smsMonthlyQuota: 50,
      smsResetDate: trialEndsAt,
      businessCategories: businessCategories ? JSON.stringify(businessCategories) : null,
      address: address || null,
      websiteUrl: websiteUrl || null,
      instagramUrl: instagramHandle ? `https://www.instagram.com/${instagramHandle.replace(/^@/, "").trim()}` : null,
      ...(username ? { username: username.toLowerCase().trim() } : {}),
    } as any)
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

  // Background geocode — Waze button uses lat/lng for reliable
  // navigation. Doesn't gate signup so the owner isn't waiting on
  // Nominatim; fire-and-forget and the row will have coords before
  // any client ever taps the Waze button.
  if (address) {
    (async () => {
      try {
        const { geocodeAddress } = await import("../lib/geocode");
        const coords = await geocodeAddress(address, null);
        if (coords) {
          await db.update(businessesTable)
            .set({ latitude: coords.latitude, longitude: coords.longitude } as any)
            .where(eq(businessesTable.id, business.id));
        }
      } catch {}
    })();
  }

  // Send welcome email (fire-and-forget — doesn't gate the signup).
  // password is the plaintext value the user picked; it's only in memory
  // here, immediately after hashing above — never stored or logged.
  (async () => {
    const { sendWelcomeEmail } = await import("../lib/emailAuth");
    await sendWelcomeEmail({
      email,
      ownerName,
      plan: subscriptionPlan as "free" | "pro",
      slug,
      username: username ?? null,
      password,
    });
  })().catch(() => {});

  res.status(201).json(buildLoginResponse(business, token));
});

// POST /auth/email/send-verification — send a 6-digit code to an email
router.post("/auth/email/send-verification", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  const { sendEmailVerificationCode } = await import("../lib/emailAuth");
  await sendEmailVerificationCode(email.toLowerCase().trim(), "signup");
  res.json({ success: true });
});

// POST /auth/email/verify — exchange email + code for verification success
router.post("/auth/email/verify", async (req, res): Promise<void> => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    res.status(400).json({ error: "Missing email or code" });
    return;
  }
  const { verifyEmailCode } = await import("../lib/emailAuth");
  const ok = await verifyEmailCode(email.toLowerCase().trim(), String(code), "signup");
  if (!ok) {
    res.status(400).json({ error: "invalid_code", message: "הקוד שגוי או פג תוקף" });
    return;
  }
  // If the email belongs to an already-registered business, flip
  // email_verified. Use raw SQL because the column isn't mirrored in the
  // Drizzle schema yet — the typed builder can't map it to the right
  // column name otherwise.
  const normalized = email.toLowerCase().trim();
  try {
    await db.execute(sql`
      UPDATE businesses SET email_verified = TRUE
      WHERE LOWER(email) = ${normalized}
    `);
  } catch (e) {
    // Column might be missing if migrations haven't run yet — never fail
    // the user's verification on a secondary write.
    console.warn("[auth] email_verified flag write failed:", e);
  }
  res.json({ success: true });
});

// POST /auth/business/change-password — change own password
router.post("/auth/business/change-password", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = parseChangePasswordBody(req.body);
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

  const { sendOtp, OtpRateLimitError } = await import("../lib/whatsapp");
  try {
    await sendOtp(phone, "password_reset");
    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof OtpRateLimitError) {
      res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
      return;
    }
    console.error("[forgot-password] OTP send failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

// POST /auth/reset-password — verify OTP and set new password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { phone, code, newPassword } = req.body;
  if (!phone || !code || !newPassword) { res.status(400).json({ error: "Missing fields" }); return; }

  // Mirror the email-reset path's min-length check. A 1-character password
  // after a password-reset was previously accepted, making credential-
  // stuffing trivial post-reset.
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים" });
    return;
  }

  const { verifyOtp } = await import("../lib/whatsapp");
  const { consumeVerification } = await import("../lib/otpStore");

  // Purpose-tagged — only OTPs minted via /auth/forgot-password will pass.
  // An OTP minted for /client/send-otp (portal login) cannot be replayed here.
  const valid = await verifyOtp(phone, code, "password_reset");
  if (!valid) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  consumeVerification(phone);

  const bcryptLib = await import("bcryptjs");
  const hash = await bcryptLib.hash(newPassword, 10);

  await db.update(businessesTable).set({ passwordHash: hash }).where(eq(businessesTable.phone, phone));
  res.json({ ok: true });
});

export default router;
