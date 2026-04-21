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
import { db, staffMembersTable, staffServicesTable, businessesTable, servicesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/auth";
import { sendEmail } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Welcome email sent to a new staff member.
 *
 * Two login options are offered — SMS (phone) and email. Both mint the
 * same JWT and land on the same staff dashboard. The email is framed
 * as a short positive "this is what your account includes" guide; the
 * previous "🔒 things you can't do" section was removed per the owner's
 * request — staff shouldn't be greeted by a list of restrictions.
 */
export async function sendStaffWelcomeEmail(args: {
  to:           string;
  staffName:    string;
  businessName: string;
  staffPhone:   string | null;
}): Promise<void> {
  const dashboardUrl = "https://www.kavati.net/dashboard";
  const phoneHint = args.staffPhone
    ? `הטלפון הרשום: <strong dir="ltr">${args.staffPhone}</strong>`
    : `השתמש/י בטלפון שהמנהל/ת רשמו עבורך.`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; color:#111827;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color:#111827;">ברוך/ה הבא/ה לצוות של ${args.businessName}! 👋</h1>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px;">
        ${args.staffName}, הצטרפת ל-Kavati — מערכת זימון התורים של ${args.businessName}.
        כדי להתחיל, בחר/י איך להיכנס למערכת — שתי האפשרויות זמינות, ללא סיסמאות.
      </p>

      <div style="margin: 20px 0; padding: 16px 18px; background: rgba(60,146,240,0.06); border-right: 4px solid #3c92f0; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-weight: bold; color: #1e6fcf; font-size: 15px;">🚪 שתי דרכי כניסה — בחר/י את הנוחה לך</p>
        <p style="margin: 0 0 10px; color: #4b5563; font-size: 14px; line-height: 1.6;">
          <strong>📱 קוד ב-SMS:</strong> בדף הכניסה הזן/י את מספר הטלפון שלך → יישלח אליך SMS עם קוד חד-פעמי → הזן/י אותו ונכנסת.<br>
          <span style="color:#6b7280; font-size:13px;">${phoneHint}</span>
        </p>
        <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">
          <strong>📧 קוד במייל:</strong> לחץ/י על "כניסה עם אימייל" בדף הכניסה → הזן/י את האימייל שלך (<strong dir="ltr">${args.to}</strong>) → יישלח אליך קוד חד-פעמי לאימייל הזה.
        </p>
      </div>

      <h2 style="margin: 24px 0 10px; font-size: 17px; color:#111827;">📅 מה כלול בחשבון שלך</h2>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">היומן האישי</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          רואה/ה את כל התורים המשובצים אליך בתצוגת יום / שבוע / חודש. לחיצה על תור פותחת את פרטי הלקוח, וניתן לגרור תור למועד אחר.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">אישור תורים</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          בטאב "אישור תורים" ניתן לאשר בקשות חדשות בלחיצה (נשלחת הודעת WhatsApp ללקוח) או לדחות עם סיבה. אפשר גם להפעיל מצב "אישור ידני" מההגדרות.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">שעות עבודה אישיות</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          בטאב "שעות עבודה" את/ה קובע/ת מתי את/ה זמין/ה — הלקוחות יראו את השעות שלך בדף ההזמנה. ניתן לשנות בכל עת.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">אילוצים והיעדרויות</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          ישירות מהיומן אפשר לסמן תאריכים שבהם את/ה לא זמין/ה — חופשה, יום מחלה, הפסקה. לקוחות לא יוכלו לזמן תורים לזמנים שסימנת.
        </p>
      </div>

      <div style="margin: 10px 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #111827; font-size: 14px;">תזכורות ושבת</p>
        <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.55;">
          בטאב "הודעות ותזכורות" אפשר להגדיר מתי יישלחו תזכורות ללקוחות לפני התור (עד 2 תזכורות) ולסמן "עסק שומר שבת" — המערכת תתאים את לוח ההודעות בהתאם.
        </p>
      </div>

      <div style="margin: 28px 0 20px; text-align: center;">
        <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 32px; background: #3c92f0; color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 15px;">כניסה למערכת</a>
      </div>

      <p style="margin: 24px 0 6px; color: #4b5563; font-size: 13px;">נתקלת בבעיה? פנה/י למנהל/ת של ${args.businessName}.</p>
      <p style="margin: 0; color: #6b7280; font-size: 12px;">בהצלחה,<br>צוות Kavati</p>
    </div>`;
  await sendEmail(args.to, `${args.businessName} — הכניסה שלך ל-Kavati`, html, {
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

// ─── GET /api/staff/extra-seat-iframe-url ──────────────────────────────────
// עסקי tier: first 2 active staff come "included" with the plan. Anything
// beyond 2 is an extra seat at ₪25/mo. Instead of modifying the main
// subscription's STO, we open a fresh Tranzila iframe that:
//   1. Charges ₪25 right now (first month)
//   2. Returns a TranzilaTK on the notify webhook
//   3. The webhook then creates a NEW independent STO for ₪25/mo
// Each extra staff carries its own sto_id on staff_members.tranzila_sto_id.
// Deleting the staff deactivates that STO (no more monthly charges).
//
// The staff row is NOT created here — it lands in the webhook once
// payment + STO both succeed. Staff details travel to the webhook as a
// short-lived JWT embedded in the iframe's pdesc.
router.get("/staff/extra-seat-iframe-url", async (req, res): Promise<void> => {
  const ident = (() => {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return null;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { businessId?: number; id?: number; staffMemberId?: number };
      const businessId = payload.businessId ?? payload.id ?? null;
      if (!businessId) return null;
      return { businessId, staffMemberId: payload.staffMemberId ?? null };
    } catch { return null; }
  })();
  if (!ident) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Owner-only — staff can't spend the owner's card.
  if (ident.staffMemberId) { res.status(403).json({ error: "owner_only" }); return; }

  const [biz] = await db
    .select({
      id: businessesTable.id,
      plan: businessesTable.subscriptionPlan,
      name: businessesTable.name,
      ownerName: businessesTable.ownerName,
      email: businessesTable.email,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, ident.businessId));
  if (!biz) { res.status(404).json({ error: "business_not_found" }); return; }
  if (biz.plan !== "pro-plus") {
    res.status(403).json({ error: "pro_plus_required", message: "מושב נוסף זמין רק במסלול עסקי" });
    return;
  }

  // Same cap + uniqueness checks as the main POST so the owner isn't
  // asked to pay only to hit a 400 in the webhook.
  const active = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.businessId, ident.businessId),
      eq(staffMembersTable.isActive, true),
    ));
  const cap = planSeatCap(biz.plan);
  if (active.length >= cap) {
    res.status(403).json({ error: "seat_cap_reached", cap, currentActive: active.length });
    return;
  }

  const name  = String((req.query.name  as string | undefined) ?? "").trim();
  const email = String((req.query.email as string | undefined) ?? "").trim().toLowerCase();
  const phone = String((req.query.phone as string | undefined) ?? "").trim();
  if (!name)  { res.status(400).json({ error: "name_required"  }); return; }
  if (!email) { res.status(400).json({ error: "email_required" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "email_invalid" }); return; }
  if (active.some(r => (r.email ?? "").toLowerCase() === email)) {
    res.status(409).json({ error: "duplicate_email" }); return;
  }
  if (phone && active.some(r => r.phone === phone)) {
    res.status(409).json({ error: "duplicate_phone" }); return;
  }

  // Encode the staff payload as a short-lived signed JWT that travels
  // through Tranzila's pdesc and comes back on the notify webhook. This
  // keeps the flow stateless — a server restart between iframe open and
  // webhook arrival doesn't lose the pending staff record.
  const pendingToken = jwt.sign(
    { kind: "staff_seat", businessId: ident.businessId, name, email, phone },
    JWT_SECRET,
    { expiresIn: "20m" },
  );

  const supplier = (process.env.TRANZILA_SUPPLIER ?? "").trim();
  if (!supplier) { res.status(500).json({ error: "tranzila_supplier_missing" }); return; }
  const iframeBase = `https://direct.tranzila.com/${supplier}/iframenew.php`;
  const p = new URLSearchParams({
    sum:                 "25.00",
    currency:            "1",
    cred_type:           "1",
    tranmode:            "AK",                           // charge + tokenize
    lang:                "il",
    buttonLabel:         "שלם ₪25 והוסף עובד",
    contact:             biz.ownerName ?? biz.name ?? "",
    email:               biz.email ?? "",
    // pdesc carries the businessId + pending JWT so the webhook can
    // reconstruct the staff record. Kept under Tranzila's ~250-char cap.
    pdesc:               `עובד נוסף קבעתי - ${ident.businessId} - ${pendingToken}`,
    success_url_address: `https://www.kavati.net/payment/success?type=extra-seat`,
    fail_url_address:    `https://www.kavati.net/payment/fail?type=extra-seat`,
    notify_url_address:  `https://www.kavati.net/api/tranzila/notify`,
    nologo:              "1",
  });
  res.json({ url: `${iframeBase}?${p.toString()}` });
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
    // Staff-caller allowlist: avatar + their own profile identity
    // (name / phone / email). The owner-only fields — color, isActive,
    // sortOrder — stay out so staff can't reshuffle the team roster
    // or deactivate themselves.
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl || null;
    if (typeof body.name      === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.phone     === "string" || body.phone === null) updates.phone = (body.phone as string | null) || null;
    if (typeof body.email     === "string" || body.email === null) updates.email = ((body.email as string | null) ?? "").toLowerCase().trim() || null;
  } else {
    if (typeof body.name      === "string") updates.name      = body.name.trim();
    if (typeof body.phone     === "string" || body.phone === null) updates.phone = body.phone || null;
    if (typeof body.email     === "string" || body.email === null) updates.email = body.email || null;
    if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl || null;
    if (typeof body.color     === "string" || body.color === null) updates.color = body.color || null;
    if (typeof body.isActive  === "boolean") updates.isActive = body.isActive;
    if (typeof body.sortOrder === "number")  updates.sortOrder = body.sortOrder;
  }

  // Conflict check: if the staff is changing their phone or email,
  // make sure the new value isn't already used by a different
  // business (owner account) or a different staff member. Without
  // this a staff who sets their phone to a business's phone would
  // get routed to the business's owner login on the next SMS-login
  // round-trip (owner-first lookup in auth.ts), effectively locking
  // themselves out.
  if (isStaffCaller) {
    const newPhone = (updates.phone as string | null | undefined);
    const newEmail = (updates.email as string | null | undefined);
    if (newPhone) {
      const digitsOnly = String(newPhone).replace(/\D/g, "");
      const [ownerConflict] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(eq(businessesTable.phone, String(newPhone)));
      const [ownerConflictDigits] = digitsOnly !== String(newPhone)
        ? await db
            .select({ id: businessesTable.id })
            .from(businessesTable)
            .where(eq(businessesTable.phone, digitsOnly))
        : [ownerConflict];
      if (ownerConflict || ownerConflictDigits) {
        res.status(409).json({ error: "phone_taken", message: "מספר הטלפון כבר בשימוש — נסה/י מספר אחר." });
        return;
      }
      const [staffConflict] = await db
        .select({ id: staffMembersTable.id })
        .from(staffMembersTable)
        .where(and(
          eq(staffMembersTable.phone, String(newPhone)),
        ));
      if (staffConflict && staffConflict.id !== staffId) {
        res.status(409).json({ error: "phone_taken", message: "מספר הטלפון כבר בשימוש — נסה/י מספר אחר." });
        return;
      }
    }
    if (newEmail) {
      const [ownerConflict] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(eq(businessesTable.email, String(newEmail)));
      if (ownerConflict) {
        res.status(409).json({ error: "email_taken", message: "האימייל כבר בשימוש — נסה/י אימייל אחר." });
        return;
      }
      const [staffConflict] = await db
        .select({ id: staffMembersTable.id })
        .from(staffMembersTable)
        .where(eq(staffMembersTable.email, String(newEmail)));
      if (staffConflict && staffConflict.id !== staffId) {
        res.status(409).json({ error: "email_taken", message: "האימייל כבר בשימוש — נסה/י אימייל אחר." });
        return;
      }
    }
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
// ─── DELETE /api/staff/me ──────────────────────────────────────────────────
// Staff self-delete. Reads the caller's staffMemberId out of the JWT and
// removes their own row + related data. Owners (no staffMemberId in the
// JWT) get 403 — they have their own DELETE /auth/business/account flow.
// is_owner=true staff rows are also blocked (that row is structural).
//
// Matches the owner's spec: button → confirm → wipe → logout. No request
// queue, no async 'we'll process it' — immediate deletion.
router.delete("/staff/me", async (req, res): Promise<void> => {
  const businessId = getBusinessId(req.headers.authorization ?? "");
  if (!businessId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const staffId = getStaffMemberId(req.headers.authorization ?? "");
  if (!staffId) { res.status(403).json({ error: "owners_use_account_delete" }); return; }

  const [row] = await db
    .select()
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.id, staffId),
      eq(staffMembersTable.businessId, businessId),
    ));
  if (!row) { res.status(404).json({ error: "Staff not found" }); return; }
  if (row.isOwner) { res.status(403).json({ error: "cannot_delete_owner" }); return; }

  // Extra-seat STO cleanup — same best-effort path as DELETE /staff/:id.
  if ((row as any).tranzilaStoId) {
    try {
      const { updateSto } = await import("../lib/tranzilaCharge");
      await updateSto((row as any).tranzilaStoId as number, "inactive");
    } catch (err) {
      logger.error({ err, staffId, sto: (row as any).tranzilaStoId }, "[staff/me] STO deactivate failed");
    }
  }

  // staff_services is keyed on staff_member_id — clear first so the
  // owner-row bridge isn't left with dangling foreign keys.
  try { await db.delete(staffServicesTable).where(eq(staffServicesTable.staffMemberId, staffId)); } catch {}
  // Appointments keep their history: the read path treats a missing
  // staff_members row as 'assigned to the owner', so the owner still
  // sees past bookings even after the staff leaves.
  await db.delete(staffMembersTable).where(eq(staffMembersTable.id, staffId));
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

  // If this staff was backed by an extra-seat STO (₪25/mo), deactivate
  // that STO on Tranzila BEFORE dropping the row so a future charge
  // never fires on an already-deleted seat. Deactivation is best-effort:
  // if it fails we still delete the row and log — the owner can follow
  // up via the Tranzila dashboard.
  if ((row as any).tranzilaStoId) {
    try {
      const { updateSto } = await import("../lib/tranzilaCharge");
      const ok = await updateSto((row as any).tranzilaStoId as number, "inactive");
      if (!ok) logger.warn({ staffId, sto: (row as any).tranzilaStoId }, "[staff] STO deactivate returned false");
    } catch (err) {
      logger.error({ err, staffId, sto: (row as any).tranzilaStoId }, "[staff] STO deactivate threw");
    }
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
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
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

  // Cross-tenant guard: reject silently if ANY serviceId doesn't belong
  // to this business. Without this, an owner can stamp foreign service
  // IDs onto their staff, polluting the staff_services join.
  if (serviceIds.length > 0) {
    const owned = await db
      .select({ id: servicesTable.id })
      .from(servicesTable)
      .where(and(
        inArray(servicesTable.id, serviceIds),
        eq(servicesTable.businessId, businessId),
      ));
    const ownedIds = new Set(owned.map(r => r.id));
    if (ownedIds.size !== serviceIds.length) {
      res.status(400).json({ error: "service_not_owned", message: "חלק מהשירותים לא שייכים לעסק זה" });
      return;
    }
  }

  await db.delete(staffServicesTable).where(eq(staffServicesTable.staffMemberId, staffId));
  if (serviceIds.length > 0) {
    await db.insert(staffServicesTable).values(
      serviceIds.map(sid => ({ staffMemberId: staffId, serviceId: sid })),
    );
  }
  res.json({ ok: true });
});

export default router;
