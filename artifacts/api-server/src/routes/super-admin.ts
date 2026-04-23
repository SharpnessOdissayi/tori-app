import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable, appointmentsTable, smsMessagesTable, smsPackPurchasesTable, reviewsTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";
import { updateSto } from "../lib/tranzilaCharge";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin";
import {
  SuperAdminCreateBusinessBody,
  SuperAdminDeleteBusinessParams,
  SuperAdminUpdateBusinessParams,
  SuperAdminUpdateBusinessBody,
} from "@workspace/api-zod";

// The auto-generated SuperAdminUpdateBusinessBody (from openapi.yaml) only
// lists a handful of fields — name/slug/email/password/plan/etc. But the
// SuperAdmin UI also posts phone, address, city, websiteUrl, instagramUrl,
// businessDescription, businessCategories, username, maxAppointmentsPerMonth.
// zod.object() strips unknown keys silently by default, so those updates
// were disappearing — clearing the phone field looked like it saved but
// the DB row was untouched, and the UI's re-fetch reported an inconsistency.
// .passthrough() keeps the extra keys on bodyParsed.data so the subsequent
// update logic (which reads them via `(bodyParsed.data as any).fieldName`)
// actually sees them.
const SuperAdminUpdateBusinessBodyExtended = (SuperAdminUpdateBusinessBody as any).passthrough();

const router = Router();

// ── Pricing & cost constants used by the analytics endpoints ──────────────
// Monthly subscription prices (ILS). Source of truth lives in Tranzila but
// the analytics surface needs a number to compute MRR/LTV without hitting
// the billing provider per row. Keep in sync with whatever Tranzila charges.
const PLAN_PRICE_ILS: Record<string, number> = {
  "free":     0,
  "pro":      100,
  "pro-plus": 150,
};
// Estimated outgoing-WhatsApp cost per message at Meta's direct utility rate
// (~$0.005 × 3.7₪/$). Used for "estimated WhatsApp spend" per business —
// rough by design; the real Meta invoice trumps this for billing.
const WHATSAPP_COST_PER_MSG_ILS = 0.02;
// Average customer lifetime assumed for forward-LTV projection (months).
// Conservative for a young SaaS — bump once we have 12+ months of churn data.
const AVG_LIFETIME_MONTHS = 18;

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
  // עסקי (pro-plus) → 20/month bulk-SMS quota (per owner 2026-04 pricing
  // recalibration — used to be 300 but the real usage pattern was a
  // small fraction of that). Pro gets 100. Free has 0 and the bulk-SMS
  // routes refuse to send anyway.
  const isPaid = plan !== "free";
  const smsMonthlyQuota = plan === "pro-plus" ? 20 : plan === "pro" ? 100 : 0;

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

  const bodyParsed = SuperAdminUpdateBusinessBodyExtended.safeParse(req.body);
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
    // the extra 200 credits immediately without waiting for the next
    // reset. Downgrades keep the overage usable for the rest of the
    // cycle (standard: don't claw back mid-period).
    if (bodyParsed.data.subscriptionPlan === "pro-plus") {
      (updates as any).smsMonthlyQuota = 20;
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

// POST /super-admin/businesses/:id/grant-pro — grant a paid subscription.
// Accepts:
//   · targetPlan: "pro" | "pro-plus"   (default "pro" for backward-compat)
//   · durationDays: number | null      (null = unlimited)
// Paid tiers share the same unlimited services/appointments caps; only
// the SMS quota + plan label differ, which the caller can flip at will
// (a fresh grant always clears any prior cancellation flag).
router.post("/super-admin/businesses/:id/grant-pro", async (req, res): Promise<void> => {
  const { durationDays, targetPlan } = req.body ?? {};

  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const plan: "pro" | "pro-plus" = targetPlan === "pro-plus" ? "pro-plus" : "pro";
  // SMS quota default per plan — pro-plus = 300, pro = 100. Owner can
  // still bump it via the edit dialog afterwards if they want extras.
  const smsQuota = plan === "pro-plus" ? 300 : 100;

  const renewDate = durationDays
    ? new Date(Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000)
    : null;

  const [updated] = await db
    .update(businessesTable)
    .set({
      subscriptionPlan: plan,
      maxServicesAllowed: 999,
      maxAppointmentsPerMonth: 9999,
      smsMonthlyQuota: smsQuota,
      subscriptionRenewDate: renewDate,
      subscriptionCancelledAt: null,
    } as any)
    .where(eq(businessesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Business not found" }); return; }

  res.json({ success: true, plan, renewDate: renewDate?.toISOString() ?? null });
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

// ─── Advanced Analytics ────────────────────────────────────────────────────
//
// One endpoint returns everything the SuperAdmin analytics tab needs:
// - aggregate KPIs (MRR, ARR, churn, ARPU, forecast)
// - per-business breakdown (LTV, WhatsApp/SMS spend, last activity, risk)
// - cohort retention buckets
//
// Heavy join + a few aggregates. Acceptable: super-admin traffic is one
// person, the dashboard is loaded ad-hoc, and the dataset is small. If we
// outgrow this, snapshot nightly into an analytics table.

type BusinessAnalytics = {
  id: number;
  name: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string | null;
  plan: string;
  isActive: boolean;
  signedUpAt: string;             // ISO
  monthsActive: number;
  cancelledAt: string | null;
  renewDate: string | null;
  monthlyFeeIls: number;
  ltvHistoricIls: number;         // months_active × monthly_fee + pack purchases
  ltvProjectedIls: number;        // 18 × monthly_fee (forward expectation)
  packRevenueIls: number;         // total spent on SMS top-up packs
  appointmentsAllTime: number;
  appointmentsLast30: number;
  lastAppointmentAt: string | null;
  reviewsCount: number;
  avgRating: number | null;
  whatsappSentToday: number;
  whatsappEstMonthlyCostIls: number; // appointmentsLast30 × WHATSAPP_COST_PER_MSG × ~3 (each appt ≈ 1 confirm + 2 reminders)
  smsUsedThisPeriod: number;
  smsExtraBalance: number;
  marginIls: number;              // monthlyFee − whatsapp est − sms cost guess
  riskLevel: "low" | "medium" | "high"; // heuristic — see assignment below
};

router.get("/super-admin/analytics", async (_req, res): Promise<void> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10); // appointments use date string

  // 1. All businesses (excluding the synthetic "admin" row)
  const allBiz = await db
    .select()
    .from(businessesTable)
    .orderBy(businessesTable.createdAt);
  const businesses = allBiz.filter(b => b.slug !== "admin");

  // 2. Appointment counts per business (all-time + last 30 days)
  const apptAllTime = await db
    .select({
      businessId: appointmentsTable.businessId,
      n: sql<number>`COUNT(*)::int`,
      lastAt: sql<string | null>`MAX(${appointmentsTable.createdAt})::text`,
    })
    .from(appointmentsTable)
    .groupBy(appointmentsTable.businessId);
  const apptByBiz = new Map(apptAllTime.map(r => [r.businessId, r]));

  const apptRecent = await db
    .select({
      businessId: appointmentsTable.businessId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(appointmentsTable)
    .where(gte(appointmentsTable.appointmentDate, thirtyDaysAgoIso))
    .groupBy(appointmentsTable.businessId);
  const apptRecentByBiz = new Map(apptRecent.map(r => [r.businessId, r.n]));

  // 3. Review counts + avg rating per business
  const reviewAgg = await db
    .select({
      businessId: reviewsTable.businessId,
      n: sql<number>`COUNT(*)::int`,
      avg: sql<number>`AVG(${reviewsTable.rating})::float`,
    })
    .from(reviewsTable)
    .groupBy(reviewsTable.businessId);
  const reviewsByBiz = new Map(reviewAgg.map(r => [r.businessId, r]));

  // 4. SMS pack revenue per business (completed purchases only)
  const packAgg = await db
    .select({
      businessId: smsPackPurchasesTable.businessId,
      totalAgorot: sql<number>`SUM(${smsPackPurchasesTable.pricePaidAgorot})::int`,
    })
    .from(smsPackPurchasesTable)
    .where(eq(smsPackPurchasesTable.status, "completed"))
    .groupBy(smsPackPurchasesTable.businessId);
  const packByBiz = new Map(packAgg.map(r => [r.businessId, (r.totalAgorot ?? 0) / 100]));

  // 5. SMS sent counts (last 30 days, for cost/usage feel)
  const smsRecent = await db
    .select({
      businessId: smsMessagesTable.businessId,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(smsMessagesTable)
    .where(gte(smsMessagesTable.createdAt, thirtyDaysAgo))
    .groupBy(smsMessagesTable.businessId);
  const smsRecentByBiz = new Map(smsRecent.map(r => [r.businessId, r.n]));

  // ── Build per-business rows ─────────────────────────────────────────────
  const perBusiness: BusinessAnalytics[] = businesses.map(b => {
    const plan = b.subscriptionPlan ?? "free";
    const monthlyFee = PLAN_PRICE_ILS[plan] ?? 0;
    const start = b.createdAt ? new Date(b.createdAt) : now;
    const end = (b as any).subscriptionCancelledAt ? new Date((b as any).subscriptionCancelledAt) : now;
    const monthsActive = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const packRevenue = packByBiz.get(b.id) ?? 0;
    const ltvHistoric = monthsActive * monthlyFee + packRevenue;
    const ltvProjected = AVG_LIFETIME_MONTHS * monthlyFee;
    const apptStat = apptByBiz.get(b.id);
    const apptsAll = apptStat?.n ?? 0;
    const apptsRecent = apptRecentByBiz.get(b.id) ?? 0;
    const lastAppt = apptStat?.lastAt ?? null;
    const reviewStat = reviewsByBiz.get(b.id);
    // Estimated WA cost: each appointment in the last 30 days triggers
    // roughly 1 confirmation + ~2 reminders = 3 messages. Add the broadcast
    // count from the same window. Rough — owner's actual Meta invoice wins.
    const estMessages = apptsRecent * 3 + (b.broadcastSentThisMonth ?? 0);
    const whatsappEstMonthlyCost = +(estMessages * WHATSAPP_COST_PER_MSG_ILS).toFixed(2);
    const smsRecentN = smsRecentByBiz.get(b.id) ?? 0;
    // Margin = revenue − message costs (very rough; ignores fixed infra cost)
    const margin = +(monthlyFee - whatsappEstMonthlyCost).toFixed(2);

    // Risk heuristic: paid + no recent activity + cancellation set OR no card
    // → high; paid w/ low activity → medium; otherwise low.
    let risk: BusinessAnalytics["riskLevel"] = "low";
    if (plan !== "free") {
      if ((b as any).subscriptionCancelledAt) risk = "high";
      else if (apptsRecent === 0) risk = "high";
      else if (apptsRecent < 5) risk = "medium";
    }

    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      ownerName: b.ownerName,
      email: b.email,
      phone: b.phone ?? null,
      plan,
      isActive: b.isActive,
      signedUpAt: b.createdAt.toISOString(),
      monthsActive: +monthsActive.toFixed(1),
      cancelledAt: (b as any).subscriptionCancelledAt ? new Date((b as any).subscriptionCancelledAt).toISOString() : null,
      renewDate: (b as any).subscriptionRenewDate ? new Date((b as any).subscriptionRenewDate).toISOString() : null,
      monthlyFeeIls: monthlyFee,
      ltvHistoricIls: +ltvHistoric.toFixed(2),
      ltvProjectedIls: +ltvProjected.toFixed(2),
      packRevenueIls: +packRevenue.toFixed(2),
      appointmentsAllTime: apptsAll,
      appointmentsLast30: apptsRecent,
      lastAppointmentAt: lastAppt,
      reviewsCount: reviewStat?.n ?? 0,
      avgRating: reviewStat?.avg ?? null,
      whatsappSentToday: 0,
      whatsappEstMonthlyCostIls: whatsappEstMonthlyCost,
      smsUsedThisPeriod: (b as any).smsUsedThisPeriod ?? 0,
      smsExtraBalance: (b as any).smsExtraBalance ?? 0,
      marginIls: margin,
      riskLevel: risk,
    };
  });

  // ── Aggregate KPIs ───────────────────────────────────────────────────────
  const paidBiz = perBusiness.filter(b => b.plan !== "free");
  const totalMRR = +paidBiz.reduce((s, b) => s + b.monthlyFeeIls, 0).toFixed(2);
  const totalARR = +(totalMRR * 12).toFixed(2);
  const newThisMonth = perBusiness.filter(b => new Date(b.signedUpAt) >= thirtyDaysAgo).length;
  const churnedLast30 = perBusiness.filter(b => b.cancelledAt && new Date(b.cancelledAt) >= thirtyDaysAgo).length;
  const activeAtMonthStart = paidBiz.length + churnedLast30;
  const churnRate = activeAtMonthStart > 0 ? +(100 * churnedLast30 / activeAtMonthStart).toFixed(1) : 0;
  const arpu = paidBiz.length > 0 ? +(totalMRR / paidBiz.length).toFixed(2) : 0;
  // Forecast: assume current churn rate applies forward. Steady-state monthly
  // retention = 1 − churnRate. Growth from new signups not modeled — gives a
  // pessimistic floor, useful for "how bad could it get if we stop selling?".
  const retentionPct = (100 - churnRate) / 100;
  const forecast30 = +(totalMRR * Math.pow(retentionPct, 1)).toFixed(2);
  const forecast60 = +(totalMRR * Math.pow(retentionPct, 2)).toFixed(2);
  const forecast90 = +(totalMRR * Math.pow(retentionPct, 3)).toFixed(2);

  // Total estimated WhatsApp spend across all businesses for the month
  const totalWhatsappCost = +perBusiness.reduce((s, b) => s + b.whatsappEstMonthlyCostIls, 0).toFixed(2);
  const totalAppointmentsAllTime = perBusiness.reduce((s, b) => s + b.appointmentsAllTime, 0);
  const totalAppointmentsRecent = perBusiness.reduce((s, b) => s + b.appointmentsLast30, 0);
  const totalReviews = perBusiness.reduce((s, b) => s + b.reviewsCount, 0);
  const totalPackRevenue = +perBusiness.reduce((s, b) => s + b.packRevenueIls, 0).toFixed(2);

  // Loyalty: bucket businesses by months-since-signup. Helps see how long
  // owners stick around — straight signup-cohort, not classic cohort table
  // (that would need a snapshots table to be honest).
  const loyaltyBuckets = [
    { bucket: "0-1 חודשים",  min: 0,   max: 1   },
    { bucket: "1-3 חודשים",  min: 1,   max: 3   },
    { bucket: "3-6 חודשים",  min: 3,   max: 6   },
    { bucket: "6-12 חודשים", min: 6,   max: 12  },
    { bucket: "12+ חודשים",  min: 12,  max: 999 },
  ].map(({ bucket, min, max }) => ({
    bucket,
    total: perBusiness.filter(b => b.monthsActive >= min && b.monthsActive < max).length,
    paid:  paidBiz.filter(b => b.monthsActive >= min && b.monthsActive < max).length,
  }));

  res.json({
    aggregate: {
      totalBusinesses: perBusiness.length,
      activeBusinesses: perBusiness.filter(b => b.isActive).length,
      paidBusinesses: paidBiz.length,
      freeBusinesses: perBusiness.length - paidBiz.length,
      newThisMonth,
      churnedLast30,
      churnRatePct: churnRate,
      mrrIls: totalMRR,
      arrIls: totalARR,
      arpuIls: arpu,
      forecast30Ils: forecast30,
      forecast60Ils: forecast60,
      forecast90Ils: forecast90,
      totalWhatsappCostMonthIls: totalWhatsappCost,
      totalPackRevenueIls: totalPackRevenue,
      totalAppointmentsAllTime,
      totalAppointmentsLast30: totalAppointmentsRecent,
      totalReviews,
      grossMarginIls: +(totalMRR - totalWhatsappCost).toFixed(2),
    },
    loyaltyBuckets,
    perBusiness,
  });
});

// CSV export of the per-business rows. Excel-friendly — UTF-8 BOM so the
// Hebrew column headers render right when the owner double-clicks the file.
router.get("/super-admin/analytics/export.csv", async (_req, res): Promise<void> => {
  const all = await db.select().from(businessesTable).orderBy(businessesTable.createdAt);
  const businesses = all.filter(b => b.slug !== "admin");

  const rows = businesses.map(b => {
    const plan = b.subscriptionPlan ?? "free";
    const monthlyFee = PLAN_PRICE_ILS[plan] ?? 0;
    const start = b.createdAt ? new Date(b.createdAt) : new Date();
    const end = (b as any).subscriptionCancelledAt ? new Date((b as any).subscriptionCancelledAt) : new Date();
    const monthsActive = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      ownerName: b.ownerName,
      email: b.email,
      phone: b.phone ?? "",
      plan,
      isActive: b.isActive ? "כן" : "לא",
      signedUpAt: b.createdAt.toISOString().slice(0, 10),
      monthsActive: monthsActive.toFixed(1),
      monthlyFeeIls: monthlyFee,
      estLtvIls: (monthsActive * monthlyFee).toFixed(2),
      smsUsedThisPeriod: (b as any).smsUsedThisPeriod ?? 0,
      smsExtraBalance: (b as any).smsExtraBalance ?? 0,
      cancelledAt: (b as any).subscriptionCancelledAt ? new Date((b as any).subscriptionCancelledAt).toISOString().slice(0, 10) : "",
      renewDate: (b as any).subscriptionRenewDate ? new Date((b as any).subscriptionRenewDate).toISOString().slice(0, 10) : "",
    };
  });

  const headers = [
    "ID","שם עסק","Slug","בעלים","אימייל","טלפון","מנוי","פעיל","נרשם בתאריך",
    "חודשי פעילות","מחיר חודשי","LTV עד היום","WhatsApp היום","SMS חודש נוכחי",
    "SMS יתרה נוספת","תאריך ביטול","חידוש הבא",
  ];

  const escape = (v: any): string => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    headers.join(","),
    ...rows.map(r => [
      r.id, r.name, r.slug, r.ownerName, r.email, r.phone, r.plan, r.isActive, r.signedUpAt,
      r.monthsActive, r.monthlyFeeIls, r.estLtvIls, r.whatsappSentToday, r.smsUsedThisPeriod,
      r.smsExtraBalance, r.cancelledAt, r.renewDate,
    ].map(escape).join(",")),
  ];

  // BOM so Excel detects UTF-8; otherwise Hebrew columns render as gibberish.
  const csv = "\uFEFF" + lines.join("\r\n");
  const filename = `kavati-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;
