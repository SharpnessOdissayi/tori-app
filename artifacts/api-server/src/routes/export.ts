/**
 * Data export — עסקי-tier downloads for customers / appointments /
 * revenue in CSV format (opens cleanly in Excel + Google Sheets).
 *
 * Routes:
 *   GET /api/export/customers.csv     — one row per customer
 *   GET /api/export/appointments.csv  — one row per appointment
 *   GET /api/export/revenue.csv       — one row per month
 *
 * All three stream the file to the browser with `Content-Disposition:
 * attachment` so a plain `<a href>` in the UI triggers a download. No
 * auth header on the CSV link itself — we use a short-lived signed URL
 * per the frontend's `getExportUrl()` helper (token inherited from the
 * JWT; query-param `auth` is just the token base64-encoded).
 *
 * CSV formatting notes:
 *   · UTF-8 BOM (EF BB BF) prepended so Excel on Windows autodetects
 *     Hebrew text instead of rendering it as "?????".
 *   · Fields quoted only when they contain comma / quote / newline.
 *   · Doubled quotes inside quoted fields per RFC 4180.
 *   · Dates in YYYY-MM-DD; times in HH:MM; money in plain integers (₪).
 */

import { Router } from "express";
import type { Response } from "express";
import { db, appointmentsTable, servicesTable, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/auth";

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

/** RFC 4180 field escaping. Only quotes when required. */
function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV body from headers + rows. Prepends a UTF-8 BOM. */
function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}

/**
 * Send a CSV string as a downloadable file. Takes care of the
 * Content-Type, charset, and Content-Disposition filename per RFC 6266
 * so Hebrew filenames survive the round-trip to the browser.
 */
function sendCsv(res: Response, body: string, filename: string): void {
  const encoded = encodeURIComponent(filename);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  // Use `filename*` with UTF-8 encoding so Chrome/Firefox accept the
  // Hebrew filename. The plain `filename=` fallback is also included for
  // ancient browsers.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="kavati-export.csv"; filename*=UTF-8''${encoded}`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

/** Quick guard — 401 on no token, 403 on not-pro-plus. Shared by all three. */
async function requirePlanPlus(authHeader: string) {
  const businessId = getBusinessId(authHeader);
  if (!businessId) return { status: 401 as const, reason: "Unauthorized" };
  const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  if (!biz) return { status: 404 as const, reason: "Business not found" };
  if (biz.subscriptionPlan !== "pro-plus") {
    return { status: 403 as const, reason: "plan_gated" };
  }
  return { status: 200 as const, businessId, business: biz };
}

// ─── GET /api/export/customers.csv ────────────────────────────────────────
router.get("/export/customers.csv", async (req, res): Promise<void> => {
  const guard = await requirePlanPlus(req.headers.authorization ?? "");
  if (guard.status !== 200) { res.status(guard.status).json({ error: guard.reason }); return; }

  const rows = await db
    .select({
      clientName:      appointmentsTable.clientName,
      phoneNumber:     appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
      status:          appointmentsTable.status,
      priceAgorot:     servicesTable.price,   // agorot — divide by 100 for ILS
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(servicesTable.id, appointmentsTable.serviceId))
    .where(eq(appointmentsTable.businessId, guard.businessId));

  // Aggregate by normalized phone.
  type Agg = {
    name: string; phone: string;
    firstVisit: string; lastVisit: string;
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    totalSpent: number;
  };
  const byPhone = new Map<string, Agg>();
  for (const r of rows) {
    const key = (r.phoneNumber ?? "").replace(/\D/g, "");
    if (!key) continue;
    let a = byPhone.get(key);
    if (!a) {
      a = {
        name: r.clientName,
        phone: r.phoneNumber,
        firstVisit: r.appointmentDate,
        lastVisit: r.appointmentDate,
        totalAppointments: 0,
        completedAppointments: 0,
        cancelledAppointments: 0,
        totalSpent: 0,
      };
      byPhone.set(key, a);
    }
    a.totalAppointments += 1;
    if (r.status === "cancelled" || r.status === "no_show") {
      a.cancelledAppointments += 1;
    } else {
      // Only count as attended/revenue when the appointment ACTUALLY
      // happened — completed/done, or past-dated confirmed. Future
      // confirmed bookings shouldn't show as "הושלמו" or inflate the
      // customer's totalSpent. Matches the analytics aggregator fix.
      const todayIso = new Date().toISOString().slice(0, 10);
      const isCompleted = r.status === "completed" || r.status === "done";
      const isPastConfirmed = r.status === "confirmed" && r.appointmentDate < todayIso;
      if (isCompleted || isPastConfirmed) {
        a.completedAppointments += 1;
        // services.price is AGOROT (cents) — divide by 100 for ILS display.
        a.totalSpent += (r.priceAgorot ?? 0) / 100;
      }
    }
    if (r.appointmentDate < a.firstVisit) a.firstVisit = r.appointmentDate;
    if (r.appointmentDate > a.lastVisit)  a.lastVisit  = r.appointmentDate;
  }

  const headers = ["שם", "טלפון", "ביקור ראשון", "ביקור אחרון", "סה״כ תורים", "הושלמו", "בוטלו", "סה״כ הכנסה (₪)"];
  const csvRows = Array.from(byPhone.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .map(c => [c.name, c.phone, c.firstVisit, c.lastVisit, c.totalAppointments, c.completedAppointments, c.cancelledAppointments, c.totalSpent]);

  const stamp = new Date().toISOString().slice(0, 10);
  sendCsv(res, buildCsv(headers, csvRows), `לקוחות-${stamp}.csv`);
});

// ─── GET /api/export/appointments.csv ─────────────────────────────────────
router.get("/export/appointments.csv", async (req, res): Promise<void> => {
  const guard = await requirePlanPlus(req.headers.authorization ?? "");
  if (guard.status !== 200) { res.status(guard.status).json({ error: guard.reason }); return; }

  const rows = await db
    .select({
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      serviceName:     appointmentsTable.serviceName,
      clientName:      appointmentsTable.clientName,
      phoneNumber:     appointmentsTable.phoneNumber,
      durationMinutes: appointmentsTable.durationMinutes,
      status:          appointmentsTable.status,
      notes:           appointmentsTable.notes,
      priceAgorot:     servicesTable.price,   // agorot — divide by 100 for ILS
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(servicesTable.id, appointmentsTable.serviceId))
    .where(eq(appointmentsTable.businessId, guard.businessId));

  // Oldest first — most accountants want chronological order for filing.
  rows.sort((a, b) => {
    if (a.appointmentDate !== b.appointmentDate) return a.appointmentDate < b.appointmentDate ? -1 : 1;
    return (a.appointmentTime ?? "") < (b.appointmentTime ?? "") ? -1 : 1;
  });

  const statusLabel = (s: string) => {
    if (s === "confirmed") return "אושר";
    if (s === "completed" || s === "done") return "הושלם";
    if (s === "cancelled") return "בוטל";
    if (s === "no_show")  return "לא הגיע";
    if (s === "pending")  return "ממתין";
    return s;
  };

  const headers = ["תאריך", "שעה", "שירות", "לקוח", "טלפון", "משך (דק׳)", "סטטוס", "מחיר (₪)", "הערות"];
  const csvRows = rows.map(r => [
    r.appointmentDate,
    r.appointmentTime,
    r.serviceName,
    r.clientName,
    r.phoneNumber,
    r.durationMinutes,
    statusLabel(r.status),
    r.priceAgorot != null ? (r.priceAgorot / 100).toFixed(2) : "",
    r.notes ?? "",
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  sendCsv(res, buildCsv(headers, csvRows), `תורים-${stamp}.csv`);
});

// ─── GET /api/export/revenue.csv ──────────────────────────────────────────
router.get("/export/revenue.csv", async (req, res): Promise<void> => {
  const guard = await requirePlanPlus(req.headers.authorization ?? "");
  if (guard.status !== 200) { res.status(guard.status).json({ error: guard.reason }); return; }

  const rows = await db
    .select({
      appointmentDate: appointmentsTable.appointmentDate,
      serviceName:     appointmentsTable.serviceName,
      status:          appointmentsTable.status,
      priceAgorot:     servicesTable.price,   // agorot — divide by 100 for ILS
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(servicesTable.id, appointmentsTable.serviceId))
    .where(eq(appointmentsTable.businessId, guard.businessId));

  type Month = {
    month: string;
    revenue: number;
    appointments: number;
    cancelledCount: number;
    averageTicket: number;
    topService: string;
  };
  const byMonth = new Map<string, Month & { byService: Map<string, number> }>();
  for (const r of rows) {
    const month = r.appointmentDate.slice(0, 7); // YYYY-MM
    let m = byMonth.get(month);
    if (!m) {
      m = { month, revenue: 0, appointments: 0, cancelledCount: 0, averageTicket: 0, topService: "", byService: new Map() };
      byMonth.set(month, m);
    }
    if (r.status === "cancelled" || r.status === "no_show") {
      m.cancelledCount += 1;
    } else {
      // Only count as attended/revenue when the appointment actually
      // happened — completed/done OR past-dated confirmed. Future
      // confirmed bookings don't belong in the revenue column.
      const todayIso = new Date().toISOString().slice(0, 10);
      const isCompleted = r.status === "completed" || r.status === "done";
      const isPastConfirmed = r.status === "confirmed" && r.appointmentDate < todayIso;
      if (isCompleted || isPastConfirmed) {
        // services.price is AGOROT (cents) — divide by 100 for ILS.
        const ils = (r.priceAgorot ?? 0) / 100;
        m.revenue += ils;
        m.appointments += 1;
        m.byService.set(r.serviceName, (m.byService.get(r.serviceName) ?? 0) + ils);
      }
    }
  }
  for (const m of byMonth.values()) {
    m.averageTicket = m.appointments > 0 ? Math.round(m.revenue / m.appointments) : 0;
    let top = "", topRev = 0;
    for (const [name, rev] of m.byService) {
      if (rev > topRev) { top = name; topRev = rev; }
    }
    m.topService = top;
  }

  const headers = ["חודש", "הכנסה (₪)", "תורים שהושלמו", "ביטולים", "ממוצע לתור (₪)", "השירות המכניס"];
  const csvRows = Array.from(byMonth.values())
    .sort((a, b) => a.month.localeCompare(b.month)) // chronological
    .map(m => [m.month, m.revenue, m.appointments, m.cancelledCount, m.averageTicket, m.topService]);

  const stamp = new Date().toISOString().slice(0, 10);
  sendCsv(res, buildCsv(headers, csvRows), `הכנסות-${stamp}.csv`);
});

export default router;
