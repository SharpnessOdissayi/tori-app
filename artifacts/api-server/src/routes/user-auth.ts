/**
 * Unified auth endpoints (phase 3 of auth rework).
 *
 * All four flows (client OTP, business owner password login, business
 * owner register, super admin login) converge on the users table and a
 * single JWT. Legacy /auth/business/* endpoints remain for backward
 * compatibility during rollout.
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, businessesTable, workingHoursTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { signUserToken, UserRole } from "../lib/auth";
import { requireUserAuth } from "../middlewares/user-auth";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildLoginResponse(user: typeof usersTable.$inferSelect) {
  const token = signUserToken({
    userId:     user.id,
    role:       user.role as UserRole,
    email:      user.email,
    phone:      user.phone,
    businessId: user.businessId ?? null,
  });
  return {
    token,
    user: {
      id:         user.id,
      email:      user.email,
      phone:      user.phone,
      fullName:   user.fullName,
      role:       user.role,
      businessId: user.businessId ?? null,
    },
  };
}

// ─── POST /auth/login ──────────────────────────────────────────────────────
// Identifier can be email or phone. Password required for business owners
// and super admins. Clients with password-less rows (legacy phone-only OTP
// flow) must use /auth/client/request-otp instead.

router.post("/auth/login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body ?? {};

  if (typeof identifier !== "string" || typeof password !== "string" || !identifier || !password) {
    res.status(400).json({ error: "Missing identifier or password" });
    return;
  }

  const id    = identifier.toLowerCase().trim();
  const phone = identifier.trim();

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(
      eq(sql`lower(${usersTable.email})`, id),
      eq(usersTable.phone, phone),
    ));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json(buildLoginResponse(user));
});

// ─── POST /auth/register ───────────────────────────────────────────────────
// Public signup endpoint. Creates a role="client" user by default. To
// become a business owner the client calls /auth/become-business-owner
// afterwards (or the existing /auth/business/register is used).

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, phone, password, fullName } = req.body ?? {};

  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be 6+ characters" });
    return;
  }
  if (!email && !phone) {
    res.status(400).json({ error: "Either email or phone is required" });
    return;
  }

  const emailNormalized = typeof email === "string" ? email.toLowerCase().trim() : null;
  const phoneNormalized = typeof phone === "string" ? phone.trim() : null;

  // Uniqueness check. Either field (if given) must not already exist.
  if (emailNormalized) {
    const [exists] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, emailNormalized));
    if (exists) { res.status(409).json({ error: "email_taken" }); return; }
  }
  if (phoneNormalized) {
    const [exists] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phoneNormalized));
    if (exists) { res.status(409).json({ error: "phone_taken" }); return; }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(usersTable)
    .values({
      email:        emailNormalized,
      phone:        phoneNormalized,
      passwordHash,
      fullName:     typeof fullName === "string" ? fullName.trim() : "",
      role:         "client",
    })
    .returning();

  res.status(201).json(buildLoginResponse(user));
});

// ─── POST /auth/become-business-owner ──────────────────────────────────────
// Upgrades the authenticated user from role="client" to "business_owner"
// by creating a new business row and linking businessId on the user.

router.post("/auth/become-business-owner", requireUserAuth, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role === "business_owner") {
    res.status(409).json({ error: "already_business_owner", businessId: req.user.businessId });
    return;
  }

  const { name, slug, ownerName, subscriptionPlan } = req.body ?? {};
  if (typeof name !== "string" || typeof slug !== "string" || typeof ownerName !== "string") {
    res.status(400).json({ error: "Missing name / slug / ownerName" });
    return;
  }
  if (!["free", "pro"].includes(subscriptionPlan)) {
    res.status(400).json({ error: "Invalid subscriptionPlan" });
    return;
  }

  // Fetch the user to get email/phone for the business row
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }

  // slug must be unique across businesses
  const [slugTaken] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
  if (slugTaken) { res.status(409).json({ error: "slug_taken" }); return; }

  // Email on businesses is non-null; require it here too
  if (!u.email) {
    res.status(400).json({ error: "user_has_no_email", message: "נדרש אימייל בחשבון לפני פתיחת עסק" });
    return;
  }

  const maxServicesAllowed      = subscriptionPlan === "pro" ? 999  : 3;
  const maxAppointmentsPerMonth = subscriptionPlan === "pro" ? 9999 : 20;

  const [business] = await db
    .insert(businessesTable)
    .values({
      slug,
      name,
      ownerName,
      phone:          u.phone ?? "",
      email:          u.email,
      passwordHash:   u.passwordHash ?? "",
      subscriptionPlan,
      maxServicesAllowed,
      maxAppointmentsPerMonth,
      subscriptionStartDate: new Date(),
    } as any)
    .returning();

  // Default working hours: Sun–Thu 09:00–18:00
  await db.insert(workingHoursTable).values(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      businessId: business.id,
      dayOfWeek:  day,
      startTime:  "09:00",
      endTime:    "18:00",
      isEnabled:  [0, 1, 2, 3, 4].includes(day),
    })),
  );

  // Promote the user
  const [updated] = await db
    .update(usersTable)
    .set({ role: "business_owner", businessId: business.id })
    .where(eq(usersTable.id, u.id))
    .returning();

  res.status(201).json(buildLoginResponse(updated));
});

// ─── GET /auth/me ──────────────────────────────────────────────────────────
// Returns the current user + role + businessId. Used on app boot to decide
// where to route the SPA.

router.get("/auth/me", requireUserAuth, async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!u) { res.status(404).json({ error: "User not found" }); return; }
  res.json({
    id:         u.id,
    email:      u.email,
    phone:      u.phone,
    fullName:   u.fullName,
    role:       u.role,
    businessId: u.businessId ?? null,
  });
});

export default router;
