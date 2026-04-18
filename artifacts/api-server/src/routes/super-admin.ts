import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { updateSto } from "../lib/tranzilaCharge";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin";
import {
  SuperAdminCreateBusinessBody,
  SuperAdminDeleteBusinessParams,
  SuperAdminUpdateBusinessParams,
  SuperAdminUpdateBusinessBody,
} from "@workspace/api-zod";

const router = Router();

// Every route in this file requires super-admin credentials. The middleware
// reads them from the X-Admin-Password header (preferred) or from the legacy
// query/body `adminPassword` field (flagged for migration).
//
// CRITICAL: scope this middleware to /super-admin/* ONLY. The router is
// mounted at the API root (app.use(superAdminRouter)), so a bare
// router.use(requireSuperAdmin) would reject every unrelated request
// (e.g. /auth/business/login) with 401 — that locked every user out of
// the system in production.
router.use((req, res, next) => {
  if (req.path.startsWith("/super-admin")) {
    return requireSuperAdmin(req, res, next);
  }
  next();
});

function mapAdminBusiness(b: typeof businessesTable.$inferSelect) {
  return {
    id: b.id,
    slug: b.slug,
    username: (b as any).username ?? null,
    name: b.name,
    ownerName: b.ownerName,
    email: b.email,
    phone: b.phone ?? null,
    isActive: b.isActive,
    subscriptionPlan: b.subscriptionPlan,
    maxServicesAllowed: b.maxServicesAllowed,
    createdAt: b.createdAt.toISOString(),
    // Subscription details
    subscriptionRenewDate: (b as any).subscriptionRenewDate ? new Date((b as any).subscriptionRenewDate).toISOString() : null,
    subscriptionCancelledAt: (b as any).subscriptionCancelledAt ? new Date((b as any).subscriptionCancelledAt).toISOString() : null,
    hasToken: !!((b as any).tranzilaToken),
    // Profile fields
    address: b.address ?? null,
    city: b.city ?? null,
    websiteUrl: b.websiteUrl ?? null,
    instagramUrl: b.instagramUrl ?? null,
    businessDescription: b.businessDescription ?? null,
    businessCategories: b.businessCategories ?? null,
  };
}

router.get("/super-admin/businesses", async (_req, res): Promise<void> => {
  const businesses = await db
    .select()
    .from(businessesTable)
    .orderBy(businessesTable.createdAt);

  res.json(businesses.filter(b => b.slug !== "admin").map(mapAdminBusiness));
});

router.post("/super-admin/businesses", async (req, res): Promise<void> => {
  const bodyParsed = SuperAdminCreateBusinessBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const {
    name, slug, ownerName, email, password,
    phone, subscriptionPlan, address, city, websiteUrl, instagramUrl,
  } = bodyParsed.data;
  // Accepted values: "free" | "pro" | "pro-plus". Anything else collapses
  // to "free" so a bad input from the UI can't silently escalate.
  const plan =
    subscriptionPlan === "pro-plus" ? "pro-plus"
    : subscriptionPlan === "pro"    ? "pro"
    : "free";
  const passwordHash = await bcrypt.hash(password, 10);

  // Paid tiers share the "unlimited" caps; only Free gets hard limits.
  // עסקי (pro-plus) additionally gets a 500/month bulk-SMS quota; Pro
  // gets 100. Free has 0 and the bulk-SMS routes refuse to send anyway.
  const isPaid = plan !== "free";
  const smsMonthlyQuota = plan === "pro-plus" ? 500 : plan === "pro" ? 100 : 0;

  const [business] = await db
    .insert(businessesTable)
    .values({
      slug, name, ownerName, email, passwordHash,
      phone: phone ?? null,
      subscriptionPlan: plan,
      maxServicesAllowed: isPaid ? 999 : 3,
      maxAppointmentsPerMonth: isPaid ? 9999 : 20,
      address: address || null,
      city: city || null,
      websiteUrl: websiteUrl || null,
      instagramUrl: instagramUrl || null,
      smsMonthlyQuota,
    } as any)
    .returning();

  await db.insert(workingHoursTable).values(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      businessId: business.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "18:00",
      isEnabled: [0, 1, 2, 3, 4].includes(day),
    }))
  );

  res.status(201).json({
    id: business.id,
    slug: business.slug,
    name: business.name,
    ownerName: business.ownerName,
    email: business.email,
    password,
    createdAt: business.createdAt.toISOString(),
  });
});

router.patch("/super-admin/businesses/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = SuperAdminUpdateBusinessParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = SuperAdminUpdateBusinessBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;
  if (bodyParsed.data.subscriptionPlan !== undefined) {
    updates.subscriptionPlan = bodyParsed.data.subscriptionPlan;
    // Realign the SMS quota to the new tier. Doesn't reset the cycle —
    // an owner on Pro (100/month) upgraded to עסקי mid-cycle should see
    // the extra 400 credits immediately without waiting for the next
    // reset. Downgrades keep the overage usable for the rest of the
    // cycle (standard: don't claw back mid-period).
    if (bodyParsed.data.subscriptionPlan === "pro-plus") {
      (updates as any).smsMonthlyQuota = 500;
    } else if (bodyParsed.data.subscriptionPlan === "pro") {
      (updates as any).smsMonthlyQuota = 100;
    } else if (bodyParsed.data.subscriptionPlan === "free") {
      (updates as any).smsMonthlyQuota = 0;
    }
    // Demoting → free: stop the Tranzila STO and clear all billing state
    // so re-subscription later creates a fresh STO. Otherwise the old
    // sto_id lingers and the notify handler will skip creating a new one
    // on next signup.
    if (bodyParsed.data.subscriptionPlan === "free") {
      const [before] = await db
        .select({ stoId: (businessesTable as any).tranzilaStorId })
        .from(businessesTable)
        .where(eq(businessesTable.id, paramsParsed.data.id));
      if (before?.stoId) {
        await updateSto(before.stoId, "inactive").catch(() => {});
      }
      (updates as any).tranzilaStorId          = null;
      (updates as any).tranzilaToken           = null;
      (updates as any).tranzilaTokenExpiry     = null;
      (updates as any).subscriptionRenewDate   = null;
      (updates as any).subscriptionCancelledAt = null;
    }
  }
  if (bodyParsed.data.maxServicesAllowed !== undefined) updates.maxServicesAllowed = bodyParsed.data.maxServicesAllowed;
  if (bodyParsed.data.name !== undefined) updates.name = bodyParsed.data.name;
  if (bodyParsed.data.slug !== undefined) updates.slug = bodyParsed.data.slug;
  if ((bodyParsed.data as any).username !== undefined) (updates as any).username = (bodyParsed.data as any).username || null;
  if (bodyParsed.data.ownerName !== undefined) updates.ownerName = bodyParsed.data.ownerName;
  if (bodyParsed.data.email !== undefined) updates.email = bodyParsed.data.email;
  if (bodyParsed.data.password !== undefined) {
    updates.passwordHash = await bcrypt.hash(bodyParsed.data.password, 10);
  }
  if (bodyParsed.data.phone !== undefined) updates.phone = bodyParsed.data.phone || null;
  if ((bodyParsed.data as any).address !== undefined) (updates as any).address = (bodyParsed.data as any).address || null;
  if ((bodyParsed.data as any).city !== undefined) (updates as any).city = (bodyParsed.data as any).city || null;
  if ((bodyParsed.data as any).websiteUrl !== undefined) (updates as any).websiteUrl = (bodyParsed.data as any).websiteUrl || null;
  if ((bodyParsed.data as any).instagramUrl !== undefined) (updates as any).instagramUrl = (bodyParsed.data as any).instagramUrl || null;
  if ((bodyParsed.data as any).businessDescription !== undefined) (updates as any).businessDescription = (bodyParsed.data as any).businessDescription || null;
  if ((bodyParsed.data as any).businessCategories !== undefined) (updates as any).businessCategories = (bodyParsed.data as any).businessCategories || null;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json(mapAdminBusiness(updated));
});

router.delete("/super-admin/businesses/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = SuperAdminDeleteBusinessParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(businessesTable)
    .where(eq(businessesTable.id, paramsParsed.data.id))
    .returning({ id: businessesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({ success: true, message: "Business deleted" });
});

// POST /super-admin/businesses/:id/grant-pro — grant/revoke Pro subscription
router.post("/super-admin/businesses/:id/grant-pro", async (req, res): Promise<void> => {
  const { durationDays } = req.body ?? {};

  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const renewDate = durationDays
    ? new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000)
    : null;

  const [updated] = await db
    .update(businessesTable)
    .set({
      subscriptionPlan: "pro",
      maxServicesAllowed: 999,
      maxAppointmentsPerMonth: 9999,
      subscriptionRenewDate: renewDate,
      subscriptionCancelledAt: null,
    } as any)
    .where(eq(businessesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Business not found" }); return; }

  res.json({ success: true, renewDate: renewDate?.toISOString() ?? null });
});

// POST /super-admin/businesses/:id/revoke-pro — revert to free
// Also deactivates the Tranzila STO (if any) and clears the stored id
// so a re-subscription later creates a fresh active STO.
router.post("/super-admin/businesses/:id/revoke-pro", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Grab existing sto_id first so we can ask Tranzila to stop charging.
  const [before] = await db
    .select({ stoId: (businessesTable as any).tranzilaStorId })
    .from(businessesTable)
    .where(eq(businessesTable.id, id));
  if (before?.stoId) {
    await updateSto(before.stoId, "inactive").catch(() => {});
  }

  const [updated] = await db
    .update(businessesTable)
    .set({
      subscriptionPlan:        "free",
      maxServicesAllowed:      3,
      maxAppointmentsPerMonth: 20,
      subscriptionRenewDate:   null,
      subscriptionCancelledAt: null,
      tranzilaStorId:          null,
    } as any)
    .where(eq(businessesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Business not found" }); return; }

  res.json({ success: true });
});

// POST /super-admin/businesses/:id/cancel-subscription — soft cancel
// (access stays until renewDate, but future charges stop immediately)
router.post("/super-admin/businesses/:id/cancel-subscription", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [before] = await db
    .select({ stoId: (businessesTable as any).tranzilaStorId })
    .from(businessesTable)
    .where(eq(businessesTable.id, id));
  if (before?.stoId) {
    await updateSto(before.stoId, "inactive").catch(() => {});
  }

  const [updated] = await db
    .update(businessesTable)
    .set({
      subscriptionCancelledAt: new Date(),
      tranzilaStorId:          null,
    } as any)
    .where(eq(businessesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Business not found" }); return; }

  res.json({ success: true, cancelledAt: new Date().toISOString() });
});

// ─── Custom-domain management (Super Admin only) ────────────────────────────
//
// GET  /super-admin/domains              — list all businesses that set a
//                                          custom domain, newest first
// POST /super-admin/domains/:id/verify   — flip customDomainVerified=true
//                                          (call AFTER adding domain to Railway)
// POST /super-admin/domains/:id/unverify — flip back to false (e.g. domain
//                                          removed from Railway / CNAME changed)

router.get("/super-admin/domains", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id:                   businessesTable.id,
      name:                 businessesTable.name,
      slug:                 businessesTable.slug,
      customDomain:         (businessesTable as any).customDomain,
      customDomainVerified: (businessesTable as any).customDomainVerified,
      subscriptionPlan:     businessesTable.subscriptionPlan,
    })
    .from(businessesTable)
    .where(sql`${(businessesTable as any).customDomain} IS NOT NULL`);

  res.json(rows);
});

router.post("/super-admin/domains/:id/verify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(businessesTable)
    .set({ customDomainVerified: true } as any)
    .where(eq(businessesTable.id, id));

  res.json({ success: true });
});

router.post("/super-admin/domains/:id/unverify", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(businessesTable)
    .set({ customDomainVerified: false } as any)
    .where(eq(businessesTable.id, id));

  res.json({ success: true });
});

export default router;
