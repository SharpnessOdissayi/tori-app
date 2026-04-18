/**
 * Advanced analytics — עסקי-tier-only dashboard.
 *
 * One endpoint returns every aggregate the Analytics UI renders, so the
 * frontend can paint the full dashboard in a single request without
 * chasing a dozen smaller endpoints. Everything comes out of appointments
 * + services; no new tables needed.
 *
 * All monetary values in the response are in ILS (whole shekels).
 * services.price is stored in AGOROT (the frontend divides by 100 when
 * rendering — see Book.tsx / ServicesTab), so we divide by 100 here too
 * before summing. An earlier revision of this file treated agorot as
 * shekels, which inflated every revenue number by 100×.
 *
 * Route:
 *   GET /api/analytics/overview  → JSON payload (see AnalyticsOverview below)
 *
 * Gated to pro-plus (עסקי). Pro users can't hit it — the route layer
 * checks the plan and returns 403.
 */

import { Router } from "express";
import { db, appointmentsTable, servicesTable, businessesTable } from "@workspace/db";
import { eq, and, sql, desc, gte } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

function getBusinessId(authHeader: string): number | null {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { businessId?: number; id?: number };
    return payload.businessId ?? payload.id ?? null;
  } catch {
    return null;
  }
}

// ─── utility helpers ─────────────────────────────────────────────────────────

function daysAgoIsoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD — matches the string format appointments.appointmentDate uses
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ─── GET /api/analytics/overview ──────────────────────────────────────────
router.get("/analytics/overview", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }
  if (biz.subscriptionPlan !== "pro-plus") {
    res.status(403).json({ error: "plan_gated", upgradeTo: "pro-plus" });
    return;
  }

  try {
    // Load every appointment for this business that isn't a raw cancel
    // BEFORE the first visit. We only join services to get the price;
    // we fall back to 0 for orphaned rows (service deleted after
    // booking). Duration + date/time come off the appointments row.
    const rowsRaw = await db
      .select({
        id:              appointmentsTable.id,
        clientName:      appointmentsTable.clientName,
        phoneNumber:     appointmentsTable.phoneNumber,
        appointmentDate: appointmentsTable.appointmentDate,
        appointmentTime: appointmentsTable.appointmentTime,
        serviceId:       appointmentsTable.serviceId,
        serviceName:     appointmentsTable.serviceName,
        status:          appointmentsTable.status,
        createdAt:       appointmentsTable.createdAt,
        priceAgorot:     servicesTable.price, // agorot — divide by 100 for ILS
      })
      .from(appointmentsTable)
      .leftJoin(servicesTable, eq(servicesTable.id, appointmentsTable.serviceId))
      .where(eq(appointmentsTable.businessId, businessId));

    // Convert every row's agorot → shekels up front so the rest of the
    // aggregation code can use `price` as ILS like it reads. Null prices
    // (service deleted) become 0, not null, so the sum stays numeric.
    const rows = rowsRaw.map(r => ({
      ...r,
      price: (r.priceAgorot ?? 0) / 100,
    }));

    // Counts by status — used for cancel + no-show rate.
    const statusCounts: Record<string, number> = {};
    for (const a of rows) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    const totalAppointments = rows.length;
    const cancelRate = totalAppointments > 0 ? (statusCounts.cancelled ?? 0) / totalAppointments : 0;
    const noShowRate = totalAppointments > 0 ? (statusCounts.no_show ?? 0) / totalAppointments : 0;

    // ─── "Active" appointments = appointments that HAVE ACTUALLY
    //     HAPPENED — so they count toward revenue + customer LTV +
    //     monthly aggregates. An earlier version treated every
    //     "confirmed" row as active, which rolled future bookings
    //     (e.g. next week) into total revenue and claimed them as
    //     "הושלמו". Bug report: "lilash doesn't have 19 appointments
    //     that were completed — they're future/upcoming."
    //     Fix: only completed/done OR past-dated confirmed count.
    //     Cancelled/no-show stay out entirely (counted separately
    //     for the rate metrics).
    const todayIso = new Date().toISOString().slice(0, 10);
    const active = rows.filter(a => {
      if (a.status === "completed" || a.status === "done") return true;
      if (a.status === "confirmed" && a.appointmentDate < todayIso) return true;
      return false;
    });
    const revenueTotal = active.reduce((sum, a) => sum + (a.price ?? 0), 0);

    // ─── Last 30 days window ─────────────────────────────────────────
    const ago30 = daysAgoIsoDate(30);
    const ago60 = daysAgoIsoDate(60);
    const ago90 = daysAgoIsoDate(90);
    const last30 = active.filter(a => a.appointmentDate >= ago30);
    const revenueLast30 = last30.reduce((s, a) => s + (a.price ?? 0), 0);

    // ─── Customers ──────────────────────────────────────────────────
    // Keyed by normalized phone (digits only) — clientName variations
    // ("משה" vs "משה כהן") don't split a person into two rows.
    function normPhone(p: string): string {
      return (p ?? "").replace(/\D/g, "");
    }
    type CustomerAgg = {
      name:         string;
      phone:        string;
      visits:       number;
      totalSpent:   number;
      firstVisit:   string;
      lastVisit:    string;
    };
    const customers = new Map<string, CustomerAgg>();
    for (const a of active) {
      const key = normPhone(a.phoneNumber);
      if (!key) continue;
      const existing = customers.get(key);
      if (!existing) {
        customers.set(key, {
          name:       a.clientName,
          phone:      a.phoneNumber,
          visits:     1,
          totalSpent: a.price ?? 0,
          firstVisit: a.appointmentDate,
          lastVisit:  a.appointmentDate,
        });
      } else {
        existing.visits += 1;
        existing.totalSpent += a.price ?? 0;
        if (a.appointmentDate < existing.firstVisit) existing.firstVisit = a.appointmentDate;
        if (a.appointmentDate > existing.lastVisit)  existing.lastVisit  = a.appointmentDate;
      }
    }
    const totalCustomers = customers.size;
    const ltvPerCustomer = totalCustomers > 0 ? revenueTotal / totalCustomers : 0;
    const newCustomersLast30 = Array.from(customers.values())
      .filter(c => c.firstVisit >= ago30).length;

    // Top customers by total spent, capped at 10.
    const topCustomers = Array.from(customers.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map(c => ({
        name:        c.name,
        phone:       c.phone,
        visits:      c.visits,
        totalSpent:  c.totalSpent,
        firstVisit:  c.firstVisit,
        lastVisit:   c.lastVisit,
      }));

    // ─── Top services ───────────────────────────────────────────────
    type ServiceAgg = {
      serviceId:   number | null;
      serviceName: string;
      bookings:    number;
      revenue:     number;
      cancelled:   number;
    };
    const serviceAggs = new Map<number | string, ServiceAgg>();
    for (const a of rows) {
      const key = a.serviceId ?? `name:${a.serviceName}`;
      let agg = serviceAggs.get(key);
      if (!agg) {
        agg = {
          serviceId:   a.serviceId,
          serviceName: a.serviceName,
          bookings:    0,
          revenue:     0,
          cancelled:   0,
        };
        serviceAggs.set(key, agg);
      }
      if (a.status === "cancelled" || a.status === "no_show") {
        agg.cancelled += 1;
      } else {
        agg.bookings += 1;
        agg.revenue  += a.price ?? 0;
      }
    }
    const topServices = Array.from(serviceAggs.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map(s => ({
        serviceId:    s.serviceId,
        serviceName:  s.serviceName,
        bookings:     s.bookings,
        revenue:      s.revenue,
        cancelled:    s.cancelled,
        avgPrice:     s.bookings > 0 ? s.revenue / s.bookings : 0,
        cancelRate:   (s.bookings + s.cancelled) > 0 ? s.cancelled / (s.bookings + s.cancelled) : 0,
      }));

    // ─── Hour-of-week heatmap (day 0..6, hour 0..23) ────────────────
    const heatmap: Array<Array<number>> = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const a of active) {
      const d = new Date(`${a.appointmentDate}T${a.appointmentTime || "00:00"}:00`);
      if (Number.isNaN(d.getTime())) continue;
      const dow = d.getDay();
      const hr  = d.getHours();
      heatmap[dow][hr] += 1;
    }

    // ─── Monthly revenue (last 12 months) ──────────────────────────
    const now = new Date();
    const monthsWindow = 12;
    const monthMap = new Map<string, { revenue: number; appointments: number }>();
    for (let i = monthsWindow - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthMap.set(monthKey(d), { revenue: 0, appointments: 0 });
    }
    for (const a of active) {
      const d = new Date(`${a.appointmentDate}T00:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      const key = monthKey(d);
      const bucket = monthMap.get(key);
      if (!bucket) continue; // older than 12 months
      bucket.revenue += a.price ?? 0;
      bucket.appointments += 1;
    }
    const monthlyRevenue = Array.from(monthMap.entries()).map(([month, b]) => ({
      month,
      revenue:      b.revenue,
      appointments: b.appointments,
    }));

    // ─── Forecast next 30 days (simple linear: avg of last 90) ──────
    const activeLast90 = active.filter(a => a.appointmentDate >= ago90);
    const revenueLast90 = activeLast90.reduce((s, a) => s + (a.price ?? 0), 0);
    const forecastNext30Revenue      = Math.round((revenueLast90 / 90) * 30);
    const forecastNext30Appointments = Math.round((activeLast90.length / 90) * 30);

    // Also include the 30-day prior window for trend comparison
    // (last30 vs. the 30 days before that = "trend %").
    const prior30 = active.filter(a => a.appointmentDate >= ago60 && a.appointmentDate < ago30);
    const priorRevenue30 = prior30.reduce((s, a) => s + (a.price ?? 0), 0);
    const revenueTrendPct = priorRevenue30 > 0 ? ((revenueLast30 - priorRevenue30) / priorRevenue30) : 0;

    // ─── Retention cohorts (first-visit month → visit in later months) ─
    // Simple Kaplan-Meier-ish cohort table: for every customer's first
    // visit month, count how many returned in month+1, month+2, ...
    // We only look at the last 6 cohorts so the JSON stays compact.
    const cohortWindow = 6;
    const cohorts: Array<{ cohortMonth: string; cohortSize: number; retention: number[] }> = [];
    const firstVisitMonth = new Map<string, string>();
    for (const c of customers.values()) {
      const key = normPhone(c.phone);
      if (!key) continue;
      const d = new Date(`${c.firstVisit}T00:00:00`);
      if (!Number.isNaN(d.getTime())) firstVisitMonth.set(key, monthKey(d));
    }
    // Build the visit-set per customer per month.
    const visitsByCustomerMonth = new Map<string, Set<string>>(); // phone → Set<YYYY-MM>
    for (const a of active) {
      const key = normPhone(a.phoneNumber);
      if (!key) continue;
      const d = new Date(`${a.appointmentDate}T00:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      const mk = monthKey(d);
      let s = visitsByCustomerMonth.get(key);
      if (!s) { s = new Set(); visitsByCustomerMonth.set(key, s); }
      s.add(mk);
    }
    // Pick the 6 most recent cohort months (excluding the current month,
    // which has no "next month" yet).
    const cohortMonths: string[] = [];
    for (let i = cohortWindow; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      cohortMonths.push(monthKey(d));
    }
    for (const cm of cohortMonths) {
      const cohortCustomers: string[] = [];
      for (const [phone, fm] of firstVisitMonth.entries()) {
        if (fm === cm) cohortCustomers.push(phone);
      }
      const retention: number[] = [];
      // Current month + up to 5 following months
      const baseDate = new Date(`${cm}-01T00:00:00`);
      for (let offset = 0; offset < 6; offset++) {
        const target = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
        if (target > now) break;
        const tk = monthKey(target);
        const retained = cohortCustomers.filter(p => visitsByCustomerMonth.get(p)?.has(tk)).length;
        retention.push(cohortCustomers.length > 0 ? retained / cohortCustomers.length : 0);
      }
      cohorts.push({
        cohortMonth: cm,
        cohortSize:  cohortCustomers.length,
        retention,
      });
    }

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalCustomers,
        newCustomersLast30,
        totalAppointments,
        revenueTotal,
        revenueLast30,
        revenueTrendPct,         // -0.15 = -15%, 0.20 = +20%
        ltvPerCustomer,
        cancelRate,
        noShowRate,
        forecastNext30Revenue,
        forecastNext30Appointments,
      },
      topServices,
      topCustomers,
      heatmap,                   // 7 × 24 matrix
      monthlyRevenue,            // last 12 months
      cohorts,                   // last 6 cohorts
    });
  } catch (err) {
    logger.error({ err, businessId }, "[analytics] overview failed");
    res.status(500).json({ error: "analytics_failed" });
  }
});

// Silence unused-import warnings on imports we keep for future endpoints.
void and; void sql; void desc; void gte;

export default router;
