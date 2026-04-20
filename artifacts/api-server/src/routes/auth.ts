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
  // Email is now optional — the register form dropped the email field in
  // favour of SMS phone-verification. Everything downstream that needs to
  // know an email address (welcome email, Kavati receipts) falls back to
  // a placeholder generated from the slug when the caller omits it.
  if (
    !isString(name) || !isString(slug) || !isString(ownerName) || !isString(phone) ||
    !isString(password) || !["free", "pro", "pro-plus"].includes(subscriptionPlan)
  ) {
    return { success: false as const };
  }
  if (email !== undefined && email !== null && email !== "" && !isString(email)) {
    return { success: false as const };
  }
  if (username !== undefined && !isString(username)) return { success: false as const };
  if (address !== undefined && !isString(address)) return { success: false as const };
  if (websiteUrl !== undefined && !isString(websiteUrl)) return { success: false as const };
  if (instagramHandle !== undefined && !isString(instagramHandle)) return { success: false as const };
  if (businessCategories !== undefined && (!Array.isArray(businessCategories) || businessCategories.some((c) => !isString(c)))) {
    return { success: false as const };
  }
  // Normalise email to undefined when blank so we don't collide with existing
  // unique() DB constraint on empty strings.
  const cleanEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : undefined;
  return {
    success: true as const,
    data: {
      name, slug, username, ownerName, phone, password, subscriptionPlan,
      email: cleanEmail,
      businessCategories, address, websiteUrl, instagramHandle,
    },
  };
}

function parseChangePasswordBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const { currentPassword, newPassword } = raw;
  // currentPassword is required only for owner-initiated changes from the
  // settings tab. Staff first-login forced changes (auto-detected by
  // mustChangePassword in the staff branch) skip it because the JWT
  // already proves the staff knows the temp password.
  if (typeof newPassword !== "string" || newPassword.length === 0) {
    return { success: false as const };
  }
  if (currentPassword !== undefined && typeof currentPassword !== "string") {
    return { success: false as const };
  }
  return { success: true as const, data: { currentPassword: currentPassword ?? "", newPassword } };
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
// GET /auth/me — who's behind this JWT? Returns the business context +
// (for staff tokens) the staff-member info so the dashboard can scope
// views. Used on app boot to rehydrate the staff flag across reloads
// (JWT isn't decoded on the frontend — this endpoint is the source of
// truth).
router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const jwt = await import("jsonwebtoken");
  const { JWT_SECRET } = await import("../lib/auth");
  let payload: any;
  try { payload = jwt.default.verify(token, JWT_SECRET); }
  catch { res.status(401).json({ error: "Unauthorized" }); return; }

  const businessId = payload.businessId ?? payload.id;
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  let staff: { id: number; name: string; isOwner: boolean; email: string | null; phone: string | null; avatarUrl: string | null; mustChangePassword: boolean } | null = null;
  if (payload.staffMemberId) {
    const { staffMembersTable } = await import("@workspace/db");
    const [row] = await db.select().from(staffMembersTable).where(eq(staffMembersTable.id, payload.staffMemberId));
    if (row) {
      // mustChangePassword: when credentialsSentAt is set we know the staff
      // is still on the auto-generated welcome-email password — they
      // haven't successfully called /change-password yet, which clears the
      // timestamp. Used by the dashboard to force a password change modal
      // before any other interaction.
      staff = {
        id: row.id,
        name: row.name,
        isOwner: row.isOwner,
        email: row.email,
        phone: row.phone,
        avatarUrl: (row as any).avatarUrl ?? null,
        mustChangePassword: !!(row as any).credentialsSentAt,
      };
    }
  }

  res.json({
    businessId:      biz.id,
    businessName:    biz.name,
    businessSlug:    biz.slug,
    ownerEmail:      biz.email,
    // When staff is set, the frontend should scope views (calendar
    // filtered to their appointments, settings/billing hidden, etc.)
    staff,
  });
});

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

  if (business) {
    // Verify password BEFORE disclosing account-status. Otherwise an
    // attacker can enumerate valid accounts by probing for the
    // "account_suspended" error message. With this ordering, the
    // suspended-account message only reaches callers who know the password.
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
    return;
  }

  // ─── Staff login fallback ─────────────────────────────────────────────
  // No business matched — try matching a staff_members row. Staff log in
  // via the same form; the JWT carries businessId + staffMemberId so the
  // dashboard can scope views. Staff lookup uses case-insensitive email
  // or exact phone match; we enforce DB-level uniqueness within a business
  // so the lookup can't be ambiguous.
  const { staffMembersTable } = await import("@workspace/db");
  const staffRows = await db
    .select()
    .from(staffMembersTable)
    .where(or(
      eq(sql`lower(${staffMembersTable.email})`, identifierNormalized),
      eq(staffMembersTable.phone, identifier.trim()),
    ));
  if (staffRows.length > 0) {
    // Try each matching row's password. Usually only one row matches, but
    // in edge cases (e.g. same email at two businesses) we let the password
    // disambiguate.
    for (const staff of staffRows) {
      if (!staff.passwordHash || !staff.isActive) continue;
      const valid = await bcrypt.compare(password, staff.passwordHash);
      if (!valid) continue;

      const [owningBusiness] = await db.select().from(businessesTable).where(eq(businessesTable.id, staff.businessId));
      if (!owningBusiness || !owningBusiness.isActive) {
        res.status(403).json({ error: "account_suspended" });
        return;
      }

      // Scoped business token that ALSO carries the staffMemberId. Frontend
      // dashboard reads this flag and restricts views to the staff's own
      // calendar + hides billing/settings tabs.
      const token = signBusinessToken({
        businessId:    owningBusiness.id,
        email:         owningBusiness.email,
        staffMemberId: staff.id,
      });
      res.json({
        ...buildLoginResponse(owningBusiness, token),
        staff: {
          id:      staff.id,
          name:    staff.name,
          isOwner: staff.isOwner,
        },
      });
      return;
    }
  }

  res.status(401).json({ error: "Invalid credentials" });
});

// POST /auth/business/register — self-service registration
router.post("/auth/business/register", async (req, res): Promise<void> => {
  const parsed = parseBusinessRegisterBody(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { name, slug, username, ownerName, phone, email, password, subscriptionPlan, businessCategories, address, websiteUrl, instagramHandle } = parsed.data;

  // Require an SMS-verified phone before we create the account. The
  // Register form asks the caller to tap "שלח קוד", enter the 6-digit
  // Inforu SMS, and tap "אמת" — /auth/phone/verify parks a 15-min flag in
  // the in-memory otpStore which `isPhoneVerified` reads here.
  const { isPhoneVerified } = await import("../lib/otpStore");
  if (!isPhoneVerified(phone)) {
    res.status(403).json({
      error: "phone_not_verified",
      message: "יש לאמת את מספר הטלפון באמצעות קוד SMS לפני ההרשמה",
    });
    return;
  }

  // Check uniqueness. Email is optional now — only check if provided.
  if (email) {
    const [existingEmail] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.email, email));
    if (existingEmail) {
      res.status(409).json({ error: "email_taken", message: "כתובת האימייל כבר רשומה במערכת" });
      return;
    }
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

  // When no email was supplied, synthesise a unique placeholder from the
  // slug so the businesses.email NOT NULL + UNIQUE constraint still
  // passes. Owners can attach a real email later from Settings → Profile.
  const emailForInsert = email ?? `${slug}@noemail.kavati.net`;

  const [business] = await db
    .insert(businessesTable)
    .values({
      slug,
      name,
      ownerName,
      phone,
      email: emailForInsert,
      passwordHash,
      // Record the tier the owner actually picked so the Tranzila notify
      // webhook (when trial → paid) knows whether to bump SMS quota to
      // 100 (פרו) or 500 (עסקי). Earlier every signup was hard-coded
      // "pro" regardless of choice, which collapsed עסקי registrations
      // down to Pro silently.
      subscriptionPlan:
        subscriptionPlan === "pro-plus" ? "pro-plus"
        : subscriptionPlan === "pro"    ? "pro"
        : "pro", // free plan also gets a 14-day trial of Pro
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
      plan: (subscriptionPlan === "pro-plus" ? "pro-plus" : subscriptionPlan === "pro" ? "pro" : "free") as "free" | "pro" | "pro-plus",
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

// ─── Phone-based signup verification ────────────────────────────────────────
//
// Owner decision: verify new business-owner signups via SMS (Inforu) instead
// of email. Reuses the existing whatsapp.ts OTP store — same 6-digit code,
// same 5-minute expiry, same per-phone rate limit. We tag the OTPs with
// purpose="generic" so they don't get consumed by /client/verify-otp or the
// forgot-password flow (those use different purposes).
//
// Flow:
//   POST /auth/phone/send-verification  { phone }  → SMS with 6-digit code
//   POST /auth/phone/verify             { phone, code }  → { success: true }

router.post("/auth/phone/send-verification", async (req, res): Promise<void> => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== "string" || phone.trim().length < 9) {
    res.status(400).json({ error: "Invalid phone" });
    return;
  }
  const { sendOtp, OtpRateLimitError } = await import("../lib/whatsapp");
  try {
    await sendOtp(phone.trim(), "generic");
    res.json({ success: true });
  } catch (e: any) {
    if (e instanceof OtpRateLimitError) {
      res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
      return;
    }
    console.error("[phone/send-verification] send failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

router.post("/auth/phone/verify", async (req, res): Promise<void> => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) {
    res.status(400).json({ error: "Missing phone or code" });
    return;
  }
  const { verifyOtp } = await import("../lib/whatsapp");
  const ok = await verifyOtp(String(phone).trim(), String(code), "generic");
  if (!ok) {
    res.status(400).json({ error: "invalid_code", message: "הקוד שגוי או פג תוקף" });
    return;
  }
  // Park a short-lived "phone is verified" token the registration endpoint
  // can cross-check later, so a caller can't just POST /auth/business/register
  // with any phone number without first solving the SMS OTP.
  const { markPhoneVerified } = await import("../lib/otpStore");
  markPhoneVerified(String(phone).trim());
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
// Branches on whether the caller is the business owner or a staff member:
//   · staff token (staffMemberId set) → updates staff_members.password_hash
//     and clears credentials_sent_at so /auth/me reports mustChangePassword=false
//   · owner token → updates businesses.password_hash (legacy path)
router.post("/auth/business/change-password", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = parseChangePasswordBody(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const staffMemberId = (req.business as any)?.staffMemberId;
  if (staffMemberId) {
    const { staffMembersTable } = await import("@workspace/db");
    const [staff] = await db.select().from(staffMembersTable).where(eq(staffMembersTable.id, staffMemberId));
    if (!staff || !(staff as any).passwordHash) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Forced first-login change: when credentialsSentAt is still set, the
    // staff is on the auto-mailed temp password. They already proved they
    // know it by getting a valid JWT, so we skip the re-verify and let
    // them set a new password directly. Once cleared (which we do below),
    // any subsequent change must include the current password.
    const isForcedFirstChange = !!(staff as any).credentialsSentAt;
    if (!isForcedFirstChange) {
      const valid = await bcrypt.compare(currentPassword, (staff as any).passwordHash);
      if (!valid) {
        res.status(401).json({ error: "wrong_password", message: "הסיסמה הנוכחית שגויה" });
        return;
      }
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(staffMembersTable)
      .set({ passwordHash, credentialsSentAt: null } as any)
      .where(eq(staffMembersTable.id, staffMemberId));
    res.json({ success: true });
    return;
  }

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

// ─── Business-owner SMS login (passwordless) ────────────────────────────
//
// Alternative to email/phone/username + password. The owner enters the
// phone registered on the account; we send an Inforu SMS with a 6-digit
// code; they enter it; we mint the same JWT the password flow produces.
//
// Reuses whatsapp.ts sendOtp (which routes via Inforu when INFORU_*
// env vars are set) with a dedicated purpose tag so the code can't
// cross-use into forgot-password or client_login verifiers.

router.post("/auth/business/sms-login/send", async (req, res): Promise<void> => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }

  // Look up by phone. Accept exact match + a digit-only fallback so
  // "050-123-4567" and "0501234567" both resolve. Match both owners
  // (businesses.phone) AND staff members (staff_members.phone) —
  // staff log in the same way as owners now, via SMS OTP.
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const { staffMembersTable } = await import("@workspace/db");
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(or(
      eq(businessesTable.phone, trimmed),
      eq(businessesTable.phone, digitsOnly),
    ));
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(or(
      eq(staffMembersTable.phone, trimmed),
      eq(staffMembersTable.phone, digitsOnly),
    ));
  // No-enumeration guarantee: respond 200 even on miss — verify
  // endpoint will reject the code since no OTP was minted.
  if (!business && !staff) {
    res.json({ success: true });
    return;
  }
  if (business && !business.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
    return;
  }
  if (staff && !staff.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם המנהל/ת." });
    return;
  }

  const { sendOtp, OtpRateLimitError } = await import("../lib/whatsapp");
  try {
    await sendOtp(trimmed, "password_reset");
    res.json({ success: true });
  } catch (e: any) {
    if (e instanceof OtpRateLimitError) {
      res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
      return;
    }
    console.error("[business/sms-login/send] OTP send failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

// POST /auth/business/google-auth — Google Sign-In for existing business owners
//
// Accepts a Google ID token (credential) from the GIS client. Verifies it
// against Google's tokeninfo endpoint, then looks up a business by its
// registered email. Issues the same JWT the password / SMS paths mint.
//
// No auto-signup — if no business has this email we return 404 with a
// friendly message. Registration still has to go through the SMS-verified
// form (which gates on phone, not email), keeping the "one phone = one
// business" invariant the rest of the app relies on.
router.post("/auth/business/google-auth", async (req, res): Promise<void> => {
  const { credential } = req.body ?? {};
  if (!credential || typeof credential !== "string") {
    res.status(400).json({ error: "Google token חסר" }); return;
  }

  try {
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    const info = await infoRes.json() as { sub?: string; email?: string; aud?: string };
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    // aud must match our GOOGLE_CLIENT_ID if configured — otherwise anyone
    // could mint a token on their own client ID and hand it to us.
    if (!infoRes.ok || !info.sub || !info.email || (googleClientId && info.aud !== googleClientId)) {
      res.status(400).json({ error: "Google token לא תקין" }); return;
    }
    const email = String(info.email).toLowerCase();

    // Owner first (stronger role), then staff fallback — mirrors the
    // SMS-login + email-OTP-login endpoints. Staff used to bounce off
    // this with "no_business" because we only checked businesses.email;
    // now they get the same Google sign-in convenience as owners.
    const [business] = await db
      .select()
      .from(businessesTable)
      .where(eq(businessesTable.email, email));
    if (business) {
      if (!business.isActive) {
        res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
        return;
      }
      const token = signBusinessToken({ businessId: business.id, email: business.email });
      res.json(buildLoginResponse(business, token));
      return;
    }

    const { staffMembersTable } = await import("@workspace/db");
    const [staff] = await db
      .select()
      .from(staffMembersTable)
      .where(eq(staffMembersTable.email, email));
    if (!staff) {
      res.status(404).json({
        error: "no_account",
        message: "לא נמצא חשבון עם האימייל הזה. הירשמ/י תחילה או התחבר/י עם טלפון.",
      });
      return;
    }
    if (!staff.isActive) {
      res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם המנהל/ת." });
      return;
    }
    const [owningBusiness] = await db
      .select()
      .from(businessesTable)
      .where(eq(businessesTable.id, staff.businessId));
    if (!owningBusiness || !owningBusiness.isActive) {
      res.status(403).json({ error: "account_suspended" });
      return;
    }
    const token = signBusinessToken({
      businessId:    owningBusiness.id,
      email:         owningBusiness.email,
      staffMemberId: staff.id,
    });
    res.json({
      ...buildLoginResponse(owningBusiness, token),
      staff: { id: staff.id, name: staff.name, isOwner: staff.isOwner },
    });
  } catch (e: any) {
    console.error("[business/google-auth] failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאת Google" });
  }
});

router.post("/auth/business/sms-login/verify", async (req, res): Promise<void> => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) { res.status(400).json({ error: "שדות חסרים" }); return; }

  const trimmed = String(phone).trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const { verifyOtp } = await import("../lib/whatsapp");
  const ok = await verifyOtp(trimmed, String(code), "password_reset");
  if (!ok) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  // Try owner first (more common path); if no business matches, fall
  // back to staff. A phone that belongs to both an owner and a staff
  // (rare, but possible when an owner is ALSO added as staff of another
  // business) resolves as owner — that's the stronger role.
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(or(
      eq(businessesTable.phone, trimmed),
      eq(businessesTable.phone, digitsOnly),
    ));
  if (business) {
    if (!business.isActive) {
      res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
      return;
    }
    const token = signBusinessToken({ businessId: business.id, email: business.email });
    res.json(buildLoginResponse(business, token));
    return;
  }

  // Staff fallback — same JWT shape as the password-login staff path,
  // with staffMemberId baked in so the dashboard can scope views.
  const { staffMembersTable } = await import("@workspace/db");
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(or(
      eq(staffMembersTable.phone, trimmed),
      eq(staffMembersTable.phone, digitsOnly),
    ));
  if (!staff) {
    res.status(404).json({ error: "לא נמצא חשבון למספר זה" });
    return;
  }
  if (!staff.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם המנהל/ת." });
    return;
  }
  const [owningBusiness] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, staff.businessId));
  if (!owningBusiness || !owningBusiness.isActive) {
    res.status(403).json({ error: "account_suspended" });
    return;
  }
  const token = signBusinessToken({
    businessId:    owningBusiness.id,
    email:         owningBusiness.email,
    staffMemberId: staff.id,
  });
  res.json({
    ...buildLoginResponse(owningBusiness, token),
    staff: { id: staff.id, name: staff.name, isOwner: staff.isOwner },
  });
});

// ─── Email-OTP login (staff + owners) ────────────────────────────────────
// Parallel to /auth/business/sms-login/{send,verify}: instead of a phone
// number + WhatsApp SMS, the caller identifies themselves by email and
// gets a 6-digit code via transactional email (Resend → SMTP fallback).
// The verify endpoint mints the same JWT — owner token if the email
// matches a businesses row, staff token if it matches a staff_members
// row. Enables the owner's ask: staff can sign in "באמצעות מייל בלבד".

router.post("/auth/business/email-login/send", async (req, res): Promise<void> => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") { res.status(400).json({ error: "אימייל נדרש" }); return; }
  const trimmed = email.trim().toLowerCase();
  // Simple sanity check — server-side Zod in auth.ts is zod-based but
  // this endpoint is small enough to inline.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    res.status(400).json({ error: "אימייל לא תקין" }); return;
  }

  const { staffMembersTable } = await import("@workspace/db");
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.email, trimmed));
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(eq(staffMembersTable.email, trimmed));

  // No-enumeration guarantee: respond 200 even on miss so an attacker
  // can't probe which emails are registered. The verify endpoint will
  // reject because no code was ever minted for that email.
  if (!business && !staff) { res.json({ success: true }); return; }
  if (business && !business.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
    return;
  }
  if (staff && !staff.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם המנהל/ת." });
    return;
  }

  try {
    const { sendEmailVerificationCode } = await import("../lib/emailAuth");
    await sendEmailVerificationCode(trimmed, "email_login");
    res.json({ success: true });
  } catch (e: any) {
    console.error("[business/email-login/send] email send failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

router.post("/auth/business/email-login/verify", async (req, res): Promise<void> => {
  const { email, code } = req.body ?? {};
  if (!email || !code) { res.status(400).json({ error: "שדות חסרים" }); return; }
  const trimmed = String(email).trim().toLowerCase();

  const { verifyEmailCode } = await import("../lib/emailAuth");
  const ok = await verifyEmailCode(trimmed, String(code), "email_login");
  if (!ok) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  // Owner first (stronger role), then staff fallback — mirrors the
  // SMS-login endpoint above.
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.email, trimmed));
  if (business) {
    if (!business.isActive) {
      res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם התמיכה." });
      return;
    }
    const token = signBusinessToken({ businessId: business.id, email: business.email });
    res.json(buildLoginResponse(business, token));
    return;
  }

  const { staffMembersTable } = await import("@workspace/db");
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(eq(staffMembersTable.email, trimmed));
  if (!staff) { res.status(404).json({ error: "לא נמצא חשבון לאימייל זה" }); return; }
  if (!staff.isActive) {
    res.status(403).json({ error: "account_suspended", message: "החשבון מושהה. צור קשר עם המנהל/ת." });
    return;
  }
  const [owningBusiness] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, staff.businessId));
  if (!owningBusiness || !owningBusiness.isActive) {
    res.status(403).json({ error: "account_suspended" });
    return;
  }
  const token = signBusinessToken({
    businessId:    owningBusiness.id,
    email:         owningBusiness.email,
    staffMemberId: staff.id,
  });
  res.json({
    ...buildLoginResponse(owningBusiness, token),
    staff: { id: staff.id, name: staff.name, isOwner: staff.isOwner },
  });
});

// ─── Google Play reviewer login (static creds) ──────────────────────────
// Google Play Console's app-access review form explicitly rejects OTP
// flows: "אם נדרשים בדרך כלל אימות דו-שלבי או סיסמה חד-פעמית להיכנס
// לאפליקציה, יש לספק פרטי התחברות לשימוש חוזר שהתוקף שלהם לא יפוג".
// This endpoint is the ONE backdoor that satisfies that requirement —
// a single username + password pair gated on two env vars:
//
//   GOOGLE_REVIEWER_EMAIL    — the email of the dedicated test business
//   GOOGLE_REVIEWER_PASSWORD — a long random password (32+ chars recommended)
//
// Both env vars must be set, non-empty, and the email must match an
// existing business row — otherwise the endpoint returns 404 and the
// backdoor is inert. NEVER returns the business's real data via email
// enumeration; if any check fails we always respond with the same
// generic message so an attacker can't tell which variable is wrong.
router.post("/auth/business/reviewer-login", async (req, res): Promise<void> => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "שדות חסרים" }); return;
  }
  const expectedEmail = (process.env.GOOGLE_REVIEWER_EMAIL ?? "").trim().toLowerCase();
  const expectedPass  = process.env.GOOGLE_REVIEWER_PASSWORD ?? "";
  // Both env vars required AND non-trivial — a 12+ char password stops a
  // typo'd "password" / "1234" from accidentally turning into a valid key.
  if (!expectedEmail || !expectedPass || expectedPass.length < 12) {
    res.status(404).json({ error: "not_available" }); return;
  }
  const submittedEmail = String(username).trim().toLowerCase();
  if (submittedEmail !== expectedEmail) {
    res.status(401).json({ error: "invalid_credentials" }); return;
  }
  // Constant-time-ish compare. Node's timing-safe compare requires equal
  // length buffers; pad with a known sentinel to avoid length leakage.
  const a = Buffer.from(password);
  const b = Buffer.from(expectedPass);
  const equal = a.length === b.length && (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { timingSafeEqual } = require("crypto");
      return timingSafeEqual(a, b) as boolean;
    } catch { return password === expectedPass; }
  })();
  if (!equal) { res.status(401).json({ error: "invalid_credentials" }); return; }

  // Valid reviewer creds → look up the business (owner flow) or staff.
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.email, expectedEmail));
  if (business) {
    if (!business.isActive) { res.status(403).json({ error: "account_suspended" }); return; }
    const token = signBusinessToken({ businessId: business.id, email: business.email });
    res.json(buildLoginResponse(business, token));
    return;
  }
  const { staffMembersTable } = await import("@workspace/db");
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(eq(staffMembersTable.email, expectedEmail));
  if (!staff) { res.status(404).json({ error: "reviewer_account_missing" }); return; }
  if (!staff.isActive) { res.status(403).json({ error: "account_suspended" }); return; }
  const [owningBusiness] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, staff.businessId));
  if (!owningBusiness || !owningBusiness.isActive) { res.status(403).json({ error: "account_suspended" }); return; }
  const token = signBusinessToken({
    businessId:    owningBusiness.id,
    email:         owningBusiness.email,
    staffMemberId: staff.id,
  });
  res.json({
    ...buildLoginResponse(owningBusiness, token),
    staff: { id: staff.id, name: staff.name, isOwner: staff.isOwner },
  });
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
