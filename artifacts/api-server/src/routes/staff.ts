/**
 * Staff members — the "workers" behind the עסקי tier multi-staff feature.
 *
 * v1 (this file): owner-only CRUD. Staff don't have their own logins;
 * they're labels the owner manages from Settings → צוות. The owner's own
 * is_owner=TRUE row is auto-created by the migration script and cannot be
 * deleted — only renamed.
 *
 * v2 (future): add email+passwordHash columns so each staff can log in and
 * see only their own calendar. Non-breaking — the columns are nullable.
 *
 * Seat enforcement: ACTIVE staff (including owner) are counted against the
 * plan cap. Pro = 1 active staff (owner only). עסקי = 2 included + up to
 * 3 paid extras (cap at 5 total). Inactive rows don't count toward the cap.
 *
 * Routes:
 *   GET    /api/staff                       — list all staff for the business
 *   POST   /api/staff                       — create a new staff member
 *   PATCH  /api/staff/:id                   — update fields (name, phone, color, is_active, …)
 *   DELETE /api/staff/:id                   — delete (blocked if is_owner=TRUE)
 *   POST   /api/staff/:id/services          — replace the service-link set
 */

import { Router } from "express";
import { db, staffMembersTable, staffServicesTable, businessesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Training-focused welcome email sent to a new staff member.
 *
 * The credentials-based flow is gone: staff log in with phone + SMS OTP,
 * so there's nothing secret to email. Instead we send a short "how to
 * use the system" guide so the staff knows what their role can do and
 * how to get started. The login instruction is a single line at the
 * bottom ("היכנס/י ב-kavati.net עם הטלפון שלך").
 */
async function sendStaffWelcomeEmail(args: {
  to:           string;
  staffName:    string;
  businessName: string;
  staffPhone:   string | null;
}): Promise<void> {
  const dashboardUrl = "https://www.kavati.net/dashboard";
  const phoneHint = args.staffPhone
    ? `הטלפון הרשום: <strong dir="ltr">${args.staffPhone}</strong>`
    : `הכנס/י את הטלפון שהמנהל/ת רשמו עבורך בעת פתיחת החשבון.`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; color:#111827;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color:#111827;">ברוך/ה הבא/ה לצוות של ${args.businessName}! 👋</h1>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px;">
        ${args.staffName}, הצטרפת ל-Kavati — מערכת זימון התורים של ${args.businessName}.
        ריכזנו כאן מדריך קצר עם כל מה שאת/ה יכול/ה לעשות במערכת.
      </p>

      <div style="margin: 20px 0; padding: 16px 18px; background: rgba(60,146,240,0.06); border-right: 4px solid #3c92f0; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-weight: bold; color: #1e6fcf; font-size: 15px;">🚪 כניסה למערכת</p>
        <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
          הכניסה היא ב-<strong>קוד חד-פעמי ב-SMS</strong> — בלי סיסמאות. בדף הכניסה הזן/י את מספר הטלפון שלך, תקבל/י SMS עם קוד אימות, הזן/י אותו וזהו.<br>
          ${phoneHint}
        </p>
      </div>

      <h2 style="margin: 24px 0 10px; font-size: 17px; color:#111827;">📅 מה את/ה יכול/ה לעשות במערכת</h2>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">יומן אישי</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          רואה/ה את כל התורים המשובצים אליך בתצוגת יום / שבוע / חודש. לחיצה על תור פותחת את פרטי הלקוח, ניתן לגרור תור למועד אחר.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">אישור / דחיית בקשות תורים</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          אם העסק עובד במצב "אישור ידני" — תקבל/י התראה על כל בקשת תור חדש. בטאב "ממתינים לאישור" אפשר לאשר בלחיצה (נשלח WhatsApp ללקוח), או לדחות עם סיבה.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">ביטול תורים</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          לחיצה על תור → "בטל" → בחר/י סיבה (ברז / לקוח התחרט / אחר). הלקוח יקבל הודעת ביטול אוטומטית ב-WhatsApp (אם העסק מוגדר לשלוח הודעות כאלו).
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">הגדרת שירותים ושעות</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          בטאב "הגדרות" → "שעות פעילות" את/ה יכול/ה להגדיר את שעות העבודה שלך באופן אישי (שונה מהעסק הכללי אם צריך). בטאב "שירותים" תראה/י אילו שירותים משויכים אליך — פנה/י למנהל/ת אם חסר משהו.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">אילוצים והיעדרויות</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          בטאב "אילוצים" אפשר לחסום תאריכים בהם את/ה לא זמין/ה — חופשה, יום מחלה, הפסקה ארוכה. הלקוחות לא יוכלו לזמן תורים לזמנים שסומנו.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">פרופיל אישי</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          תמונת פרופיל, שם תצוגה, וצבע אישי שמבדיל את התורים שלך בלוח השנה של העסק. הכל דרך "הגדרות" → "פרופיל צוות".
        </p>
      </div>

      <h2 style="margin: 24px 0 10px; font-size: 17px; color:#111827;">🔒 מה את/ה לא יכול/ה לעשות</h2>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 13px; line-height: 1.55;">
        הגדרות חשבון בעל העסק (חיוב, מנוי, קישור דומיין, עיצוב פרופיל ציבורי, רשימת תפוצה ופרטי חיוב) זמינות רק למנהל/ת הראשי/ת. לכל בקשה שקשורה לאלה — פנה/י למנהל/ת.
      </p>

      <div style="margin: 28px 0 20px; text-align: center;">
        <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: #3c92f0; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px;">כניסה למערכת</a>
      </div>

      <p style="margin: 24px 0 6px; color: #4b5563; font-size: 13px;">נתקלת בבעיה? פנה/י למנהל/ת של ${args.businessName} ישירות.</p>
      <p style="margin: 0; color: #6b7280; font-size: 12px;">בהצלחה,<br>צוות Kavati</p>
    </div>`;
  await sendEmail(args.to, `${args.businessName} — מדריך הכניסה שלך ל-Kavati`, html, {
    from: "Kavati <welcome@kavati.net>",
  });
}

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

// Returns the staffMemberId baked into a staff JWT, or null for owner tokens.
// Used to scope PATCH operations so a staff member can only modify their own
// row (avatar, etc.) without being able to mutate other workers' records.
function getStaffMemberId(authHeader: string): number | null {
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { staffMemberId?: number };
    return payload.staffMemberId ?? null;
  } catch {
    return null;
  }
}

function planSeatCap(plan: string): number {
  // Seat caps per tier. See register page + docs.
  if (plan === "pro-plus") return 5; // 2 included + up to 3 paid extras
  if (plan === "pro")      return 1; // solo tier — owner only
  return 1;                          // free tier — owner only
}

// ─── GET /api/staff ────────────────────────────────────────────────────────
// Returns every staff row for the business, ordered by sortOrder then name.
// Including inactive rows so the Settings UI can show + re-activate them.
router.get("/staff", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(staffMembersTable)
    .where(eq(staffMembersTable.businessId, businessId));

  // Stable sort: owner first, then by sortOrder, then by name.
  rows.sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "he");
  });

  // For each staff, fetch linked services (may be empty → "does every service").
  const staffIds = rows.map(r => r.id);
  const links = staffIds.length
    ? await db
        .select()
        .from(staffServicesTable)
        .where(eq(staffServicesTable.staffMemberId, staffIds[0]))
        // drizzle doesn't have inArray from this import; re-query per-staff if needed.
        // simpler: fetch all links for the business scope? we don't have business_id on
        // the link table. For now bulk-load one query per staff lazily on the client.
    : [];
  void links; // lint-quiet; linkage is returned via a separate endpoint if needed.

  res.json(rows.map(r => ({
    id:                r.id,
    name:              r.name,
    phone:             r.phone,
    email:             r.email,
    avatarUrl:         r.avatarUrl,
    color:             r.color,
    isOwner:           r.isOwner,
    isActive:          r.isActive,
    sortOrder:         r.sortOrder,
    credentialsSentAt: r.credentialsSentAt?.toISOString() ?? null,
    createdAt:         r.createdAt.toISOString(),
  })));
});

// ─── POST /api/staff ───────────────────────────────────────────────────────
// Body: { name, email, phone?, color?, avatarUrl?, sortOrder? }
// Email is required for new staff because that's the channel we use to
// send the staff their login credentials. Phone is optional (can be used
// as a secondary login handle later).
//
// Flow on success:
//   1. Enforce seat cap
//   2. Generate a temp password, bcrypt-hash it for staff_members
//   3. Insert the row with the hash
//   4. Email the plaintext password + login URL to the staff directly
//   5. Return {id, credentialsSentTo: email}
router.post("/staff", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const biz = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId)).then(r => r[0]);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  const body = req.body as Record<string, unknown>;
  const name  = String(body?.name  ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const phone = String(body?.phone ?? "").trim();
  if (!name)  { res.status(400).json({ error: "name is required"  }); return; }
  // Email is required for login flow. Reject early with a clear error so
  // the UI can surface it inline on the email field.
  if (!email) { res.status(400).json({ error: "email_required" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "email_invalid" });
    return;
  }

  // Seat cap check — only count ACTIVE staff. Inactive rows are archived
  // and don't chip away at the budget.
  const activeRows = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.businessId, businessId),
      eq(staffMembersTable.isActive, true),
    ));
  const cap = planSeatCap(biz.subscriptionPlan);
  if (activeRows.length >= cap) {
    res.status(403).json({
      error: "seat_cap_reached",
      plan: biz.subscriptionPlan,
      cap,
      currentActive: activeRows.length,
      upgradeHint: biz.subscriptionPlan === "pro" ? "עסקי" : null,
    });
    return;
  }

  // Duplicate email guard — friendly error instead of a Postgres unique
  // constraint violation. Phone is handled by a similar guard below.
  const emailDup = activeRows.find(r => (r.email ?? "").toLowerCase() === email);
  if (emailDup) { res.status(409).json({ error: "duplicate_email" }); return; }
  if (phone) {
    const phoneDup = activeRows.find(r => r.phone === phone);
    if (phoneDup) { res.status(409).json({ error: "duplicate_phone" }); return; }
  }

  // No temp password — staff log in via phone + SMS OTP. passwordHash
  // is nullable in the schema so we skip it entirely.
  const [inserted] = await db
    .insert(staffMembersTable)
    .values({
      businessId,
      name,
      email,
      phone:     phone || null,
      avatarUrl: (body.avatarUrl as string | undefined) || null,
      color:     (body.color     as string | undefined) || null,
      isOwner:   false,
      isActive:  true,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
    } as any)
    .returning();

  // Fire-and-forget — if the email fails (e.g. Resend misconfigured) we
  // still created the staff row. The owner can use the "resend invite"
  // action later; logs capture the failure.
  sendStaffWelcomeEmail({
    to:           email,
    staffName:    name,
    businessName: biz.name,
    staffPhone:   phone || null,
  })
    .then(() => db.update(staffMembersTable)
      .set({ credentialsSentAt: new Date() })
      .where(eq(staffMembersTable.id, inserted.id)))
    .catch((err) => logger.error({ err, staffId: inserted.id }, "[staff] welcome email failed"));

  res.status(201).json({
    id: inserted.id,
    credentialsSentTo: email,
  });
});

// ─── POST /api/staff/:id/resend-invite ────────────────────────────────────
// Owner-initiated re-send of the welcome/training email. No password
// reset — staff log in via SMS OTP, so there's nothing to rotate.
router.post("/staff/:id/resend-invite", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = Number(req.params.id);
  if (!staffId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [biz]   = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId));
  const [staff] = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ));
  if (!biz || !staff) { res.status(404).json({ error: "Staff not found" }); return; }
  if (staff.isOwner)  { res.status(400).json({ error: "cannot_resend_owner" }); return; }
  if (!staff.email)   { res.status(400).json({ error: "staff_has_no_email" }); return; }

  try {
    await sendStaffWelcomeEmail({
      to:           staff.email,
      staffName:    staff.name,
      businessName: biz.name,
      staffPhone:   staff.phone ?? null,
    });
    await db
      .update(staffMembersTable)
      .set({ credentialsSentAt: new Date() })
      .where(eq(staffMembersTable.id, staffId));
    res.json({ ok: true, sentTo: staff.email });
  } catch (err) {
    logger.error({ err, staffId }, "[staff] resend welcome email failed");
    res.status(502).json({ error: "email_send_failed" });
  }
});

// ─── PATCH /api/staff/:id ──────────────────────────────────────────────────
router.patch("/staff/:id", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = Number(req.params.id);
  if (!staffId) { res.status(400).json({ error: "Invalid id" }); return; }

  // Staff-token callers can only edit their OWN row, and only avatarUrl.
  // Owner tokens (no staffMemberId on the JWT) keep full edit access.
  const callerStaffId = getStaffMemberId(req.headers.authorization ?? "");
  const isStaffCaller = callerStaffId !== null;
  if (isStaffCaller && callerStaffId !== staffId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (isStaffCaller) {
    // Strict allowlist: staff can only swap their own profile photo.
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl || null;
  } else {
    if (typeof body.name      === "string") updates.name      = body.name.trim();
    if (typeof body.phone     === "string" || body.phone === null) updates.phone = body.phone || null;
    if (typeof body.email     === "string" || body.email === null) updates.email = body.email || null;
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl || null;
    if (typeof body.color     === "string" || body.color === null) updates.color = body.color || null;
    if (typeof body.isActive  === "boolean") updates.isActive = body.isActive;
    if (typeof body.sortOrder === "number")  updates.sortOrder = body.sortOrder;
  }

  // Seat cap check: if we're reactivating an inactive row, ensure cap isn't
  // already full. Doesn't matter for rename/phone edits.
  if (updates.isActive === true) {
    const biz = await db.select().from(businessesTable).where(eq(businessesTable.id, businessId)).then(r => r[0]);
    const activeRows = await db
      .select()
      .from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.businessId, businessId),
        eq(staffMembersTable.isActive, true),
      ));
    const cap = planSeatCap(biz?.subscriptionPlan ?? "free");
    if (activeRows.length >= cap) {
      res.status(403).json({ error: "seat_cap_reached", cap });
      return;
    }
  }

  const [updated] = await db
    .update(staffMembersTable)
    .set(updates)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ))
    .returning();

  if (!updated) { res.status(404).json({ error: "Staff not found" }); return; }
  res.json({ ok: true });
});

// ─── DELETE /api/staff/:id ─────────────────────────────────────────────────
// Blocked for is_owner rows — the owner row is structural and shouldn't be
// removable. Deleting a non-owner clears the FK on appointments (set to NULL
// = falls back to "the owner" everywhere).
router.delete("/staff/:id", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = Number(req.params.id);
  if (!staffId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ));
  if (!row) { res.status(404).json({ error: "Staff not found" }); return; }
  if (row.isOwner) {
    res.status(403).json({ error: "cannot_delete_owner" });
    return;
  }

  await db.delete(staffMembersTable).where(eq(staffMembersTable.id, staffId));
  // Unlink from staff_services (no cascade in v1 — clean up explicitly).
  await db.delete(staffServicesTable).where(eq(staffServicesTable.staffMemberId, staffId));
  // Appointments keep their reference for history; the lookup path already
  // treats missing staff rows as "assigned to the owner".

  res.json({ ok: true });
});

// ─── GET /api/staff/:id/services ───────────────────────────────────────────
// Returns the list of service IDs currently linked to this staff member.
// Scoped by the caller's businessId so a leaked staff token can't peek
// at another business's assignments.
router.get("/staff/:id/services", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = Number(req.params.id);
  if (!staffId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ));
  if (!row) { res.status(404).json({ error: "Staff not found" }); return; }

  const links = await db
    .select({ serviceId: staffServicesTable.serviceId })
    .from(staffServicesTable)
    .where(eq(staffServicesTable.staffMemberId, staffId));
  res.json({ serviceIds: links.map(l => l.serviceId) });
});

// ─── POST /api/staff/:id/services ──────────────────────────────────────────
// Body: { serviceIds: number[] }
// Replaces all existing links with the provided set. Empty array means
// "this staff does every service" (the route layer's convention).
router.post("/staff/:id/services", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Owner-only: the staff themselves can't decide which services they
  // perform — the business owner assigns. Staff tokens carry staffMemberId
  // in the JWT; absence of that claim marks an owner caller.
  if (getStaffMemberId(req.headers.authorization ?? "")) {
    res.status(403).json({ error: "owner_only", message: "רק בעל/ת העסק יכול/ה לקבוע אילו שירותים כל עובד/ת מבצע/ת." });
    return;
  }

  const staffId = Number(req.params.id);
  if (!staffId) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as Record<string, unknown>;
  const ids = Array.isArray(body.serviceIds) ? body.serviceIds : [];
  const serviceIds = ids.map(n => Number(n)).filter(Number.isFinite) as number[];

  // Verify the staff actually belongs to this business before rewriting links.
  const [row] = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ));
  if (!row) { res.status(404).json({ error: "Staff not found" }); return; }

  await db.delete(staffServicesTable).where(eq(staffServicesTable.staffMemberId, staffId));
  if (serviceIds.length > 0) {
    await db.insert(staffServicesTable).values(
      serviceIds.map(sid => ({ staffMemberId: staffId, serviceId: sid })),
    );
  }
  res.json({ ok: true });
});

export default router;
