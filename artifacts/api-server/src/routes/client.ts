import { Router, Request, Response, NextFunction } from "express";
import { logBusinessNotification } from "./notifications";
import { db, appointmentsTable, businessesTable, clientSessionsTable, clientBusinessesTable } from "@workspace/db";
import { eq, and, or, gt, desc, sql } from "drizzle-orm";
import { sendOtp, verifyOtp, OtpRateLimitError } from "../lib/whatsapp";
import { sendEmail } from "../lib/email";
import { randomUUID } from "crypto";

const router = Router();

const SESSION_DAYS = 30;

// ── Email OTP (interim — WhatsApp Auth template still pending Meta approval)
// Once Meta approves the verify_code template for production, prefer the
// WhatsApp flow (deliverability + UX) and keep email as the fallback only.
const EMAIL_OTP_TTL_MS = 5 * 60 * 1000;
const EMAIL_OTP_RATE_LIMIT_MAX = 5;
const EMAIL_OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const emailOtpStore = new Map<string, { code: string; expiresAt: number }>();
const emailOtpRateLimit = new Map<string, { count: number; windowStart: number }>();
function checkEmailOtpRateLimit(email: string): boolean {
  const now = Date.now();
  const existing = emailOtpRateLimit.get(email);
  if (!existing || now - existing.windowStart > EMAIL_OTP_RATE_LIMIT_WINDOW_MS) {
    emailOtpRateLimit.set(email, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= EMAIL_OTP_RATE_LIMIT_MAX) return false;
  existing.count += 1;
  return true;
}
// Periodic sweep so the in-memory maps don't grow forever (api-server runs
// for weeks on Railway between restarts).
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of emailOtpStore.entries()) {
    if (now > entry.expiresAt) emailOtpStore.delete(email);
  }
  for (const [email, entry] of emailOtpRateLimit.entries()) {
    if (now - entry.windowStart > EMAIL_OTP_RATE_LIMIT_WINDOW_MS) emailOtpRateLimit.delete(email);
  }
}, 5 * 60 * 1000).unref();

// ─── Auth middleware ─────────────────────────────────────────────────────────

async function requireClientAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers["x-client-token"] as string | undefined;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }

  const [session] = await db
    .select()
    .from(clientSessionsTable)
    .where(and(eq(clientSessionsTable.token, token), gt(clientSessionsTable.expiresAt, new Date())));

  if (!session) { res.status(401).json({ error: "פגה תוקף ההתחברות" }); return; }
  (req as any).clientSession = session;
  next();
}

// Find the most recent prior session belonging to the same client so we can
// carry their name + preferences forward when they log in via a new
// device / channel. Matches on whichever identifier we have (googleId,
// facebookId, email, or phoneNumber). The caller should pass only truthy
// identifiers. Previously this function silently ignored `phoneNumber`,
// which meant every SMS re-login landed with an empty profile and the
// welcome modal reopened — even though the client had a saved name from
// a previous session on another device.
async function findPriorSession(ids: { googleId?: string; facebookId?: string; email?: string; phoneNumber?: string }): Promise<typeof clientSessionsTable.$inferSelect | undefined> {
  const conds = [] as any[];
  if (ids.googleId)    conds.push(eq(clientSessionsTable.googleId,    ids.googleId));
  if (ids.facebookId)  conds.push(eq(clientSessionsTable.facebookId,  ids.facebookId));
  if (ids.email)       conds.push(eq(clientSessionsTable.email,       ids.email));
  if (ids.phoneNumber) conds.push(eq(clientSessionsTable.phoneNumber, ids.phoneNumber));
  if (conds.length === 0) return undefined;
  const [row] = await db
    .select()
    .from(clientSessionsTable)
    .where(or(...conds))
    .orderBy(desc(clientSessionsTable.createdAt))
    .limit(1);
  return row;
}

// ─── OTP ─────────────────────────────────────────────────────────────────────

router.post("/client/send-otp", async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }
  try {
    await sendOtp(phone.trim(), "client_login");
    res.json({ success: true });
  } catch (e) {
    if (e instanceof OtpRateLimitError) {
      res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
      return;
    }
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

router.post("/client/verify-otp", async (req, res): Promise<void> => {
  const { phone, code } = req.body;
  if (!phone || !code) { res.status(400).json({ error: "שדות חסרים" }); return; }

  const ok = await verifyOtp(phone.trim(), String(code), "client_login");
  if (!ok) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  // Carry-forward from the most recent session for this same phone — the
  // client has already proven ownership via OTP, so reusing their saved
  // name / email / gender / notification prefs is safe. Without this the
  // portal greeted every SMS re-login with "ברוכים הבאים" and a blank
  // profile, which looked like data loss to the owner.
  //
  // Safety note: the OTP itself is the recycling safeguard here — if a
  // carrier gave this phone to a new owner, they can't complete the OTP
  // without being in physical possession of the SIM, so we only ever
  // carry-forward to callers who just proved receipt of a fresh code.
  const prior = await findPriorSession({ phoneNumber: phone.trim() });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(clientSessionsTable).values({
    token,
    phoneNumber: phone.trim(),
    clientName:           prior?.clientName ?? "",
    email:                prior?.email ?? undefined,
    receiveNotifications: prior?.receiveNotifications ?? true,
    gender:               prior?.gender ?? undefined,
    expiresAt,
  });

  res.json({
    token,
    clientName: prior?.clientName ?? "",
    phone: phone.trim(),
    email: prior?.email ?? null,
  });
});

// ─── Email OTP (interim flow until WhatsApp Auth template is approved) ─────
router.post("/client/send-email-otp", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "אימייל לא תקין" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!checkEmailOtpRateLimit(normalizedEmail)) {
    res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  emailOtpStore.set(normalizedEmail, { code, expiresAt: Date.now() + EMAIL_OTP_TTL_MS });

  try {
    await sendEmail(
      normalizedEmail,
      "קבעתי — קוד אימות לכניסה לפורטל",
      `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1f2937;">
        <h2 style="color:#3c92f0;margin:0 0 16px;font-size:20px;">קוד האימות שלך</h2>
        <p style="font-size:14px;color:#4b5563;margin:0 0 12px;">הזן את הקוד הבא במסך הכניסה לפורטל הלקוחות:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:12px;text-align:center;color:#1e6fcf;background:#eff6ff;padding:18px 12px;border-radius:12px;margin:18px 0;font-family:'Courier New',monospace;">${code}</div>
        <p style="font-size:12px;color:#6b7280;margin:0 0 6px;">הקוד תקף ל-5 דקות בלבד.</p>
        <p style="font-size:12px;color:#6b7280;margin:0;">אם לא ביקשת קוד אימות, אפשר להתעלם מהמייל הזה.</p>
      </div>`
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

router.post("/client/verify-email-otp", async (req, res): Promise<void> => {
  const { email, phone, code, clientName } = req.body;
  // Phone is now OPTIONAL — clients can log in with just an email when
  // they pick the email path on the login screen. The session is still
  // useful (notifications + business list keyed by email + googleId/
  // facebookId), and findPriorSession will fill phoneNumber back in if
  // they verified one before. Required fields: email + code.
  if (!email || !code) { res.status(400).json({ error: "שדות חסרים" }); return; }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
  const trimmedName = typeof clientName === "string" ? clientName.trim() : "";

  const entry = emailOtpStore.get(normalizedEmail);
  if (!entry) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }
  if (Date.now() > entry.expiresAt) {
    emailOtpStore.delete(normalizedEmail);
    res.status(400).json({ error: "קוד פג תוקף — שלח קוד חדש" });
    return;
  }
  if (entry.code !== String(code).trim()) {
    res.status(400).json({ error: "קוד שגוי" });
    return;
  }
  emailOtpStore.delete(normalizedEmail);

  // Carry over preferences from any prior session for this email so a
  // returning user doesn't lose their gender / receiveNotifications choice.
  // The prior session also gives us back a phone number when the caller
  // didn't supply one — common on the email-only login path.
  const prior = await findPriorSession({ email: normalizedEmail });
  const phoneToUse = trimmedPhone || prior?.phoneNumber || null;

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(clientSessionsTable).values({
    token,
    email: normalizedEmail,
    phoneNumber: phoneToUse ?? undefined,
    clientName: trimmedName || prior?.clientName || "",
    receiveNotifications: prior?.receiveNotifications ?? true,
    gender: prior?.gender ?? undefined,
    expiresAt,
  });

  res.json({
    token,
    clientName: trimmedName || prior?.clientName || "",
    phone: phoneToUse,
    email: normalizedEmail,
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.post("/client/google-auth", async (req, res): Promise<void> => {
  const { credential } = req.body;
  if (!credential) { res.status(400).json({ error: "token חסר" }); return; }

  try {
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const info = await infoRes.json();
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!infoRes.ok || !info.sub || (googleClientId && info.aud !== googleClientId)) {
      res.status(400).json({ error: "Google token לא תקין" }); return;
    }

    const googleId = info.sub as string;
    const email = (info.email ?? "") as string;
    const clientName = (info.name ?? info.email ?? "") as string;

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    // Carry over phone + preferences from any previous session for the
    // same google/email identity — otherwise the user sees their portal
    // header "lose" its phone number every time they sign in via Google
    // (they typically verified phone once via OTP on a prior session).
    const prior = await findPriorSession({ googleId, email });

    await db.insert(clientSessionsTable).values({
      token,
      googleId,
      email,
      clientName: clientName || prior?.clientName || "",
      phoneNumber: prior?.phoneNumber ?? undefined,
      receiveNotifications: prior?.receiveNotifications ?? true,
      gender: prior?.gender ?? undefined,
      expiresAt,
    });

    res.json({ token, clientName, email });
  } catch {
    res.status(500).json({ error: "שגיאת Google" });
  }
});

// ─── Facebook OAuth ───────────────────────────────────────────────────────────

router.post("/client/facebook-auth", async (req, res): Promise<void> => {
  const { accessToken, userId } = req.body;
  if (!accessToken || !userId) { res.status(400).json({ error: "token חסר" }); return; }

  try {
    // Verify the token was issued for OUR app using /debug_token
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appId && appSecret) {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${appId}|${appSecret}`
      );
      const debug = await debugRes.json();
      if (debug.data?.error || !debug.data?.is_valid || String(debug.data?.app_id) !== String(appId)) {
        res.status(400).json({ error: "Facebook token לא תקין" }); return;
      }
    }

    const infoRes = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(userId)}?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`
    );
    const info = await infoRes.json();
    // Verify token belongs to the claimed userId and no error
    if (!infoRes.ok || info.error || !info.id || info.id !== String(userId)) {
      res.status(400).json({ error: "Facebook token לא תקין" }); return;
    }

    const facebookId = info.id as string;
    const email = (info.email ?? "") as string;
    const clientName = (info.name ?? "") as string;

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    // Same rationale as Google: pull phone + prefs forward so logging in
    // via Facebook doesn't wipe a phone the user saved on a prior session.
    const prior = await findPriorSession({ facebookId, email });

    await db.insert(clientSessionsTable).values({
      token,
      facebookId,
      email,
      clientName: clientName || prior?.clientName || "",
      phoneNumber: prior?.phoneNumber ?? undefined,
      receiveNotifications: prior?.receiveNotifications ?? true,
      gender: prior?.gender ?? undefined,
      expiresAt,
    });

    res.json({ token, clientName, email });
  } catch {
    res.status(500).json({ error: "שגיאת Facebook" });
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────

router.get("/client/me", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  res.json({
    clientName: session.clientName,
    phone: session.phoneNumber ?? null,
    email: session.email ?? null,
    receiveNotifications: session.receiveNotifications ?? true,
    gender: session.gender ?? null,
  });
});

router.patch("/client/me", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const { clientName, phone, receiveNotifications, gender } = req.body;
  const updates: any = {};
  if (clientName && typeof clientName === "string") updates.clientName = clientName.trim();
  if (phone && typeof phone === "string") updates.phoneNumber = phone.trim();
  if (typeof receiveNotifications === "boolean") updates.receiveNotifications = receiveNotifications;
  if (gender && ["male", "female", "other"].includes(gender)) updates.gender = gender;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "אין שינויים" }); return; }

  // 1. Update the current session (may include a phone-number change).
  await db.update(clientSessionsTable).set(updates).where(eq(clientSessionsTable.token, session.token));

  // 2. Mirror profile-level fields (gender / name / notif preference) to
  //    every other session with the same phone. The dashboard's
  //    /business/customers join uses DISTINCT ON (phone_number) ORDER BY
  //    created_at DESC — without this fan-out, an owner could see a stale
  //    gender pill if the client edited from anything other than their
  //    most-recent login. Phone change itself stays scoped to the current
  //    session so we don't accidentally rewrite history on other devices.
  const canonicalPhone = updates.phoneNumber ?? session.phoneNumber;
  if (canonicalPhone) {
    const propagate: any = {};
    if (updates.clientName           !== undefined) propagate.clientName           = updates.clientName;
    if (updates.gender               !== undefined) propagate.gender               = updates.gender;
    if (updates.receiveNotifications !== undefined) propagate.receiveNotifications = updates.receiveNotifications;
    if (Object.keys(propagate).length > 0) {
      await db.update(clientSessionsTable)
        .set(propagate)
        .where(eq(clientSessionsTable.phoneNumber, canonicalPhone));
    }
  }

  res.json({ success: true });
});

// ─── Businesses ───────────────────────────────────────────────────────────────

function clientIdentifier(session: any): { field: "phoneNumber" | "googleId" | "facebookId"; value: string } | null {
  if (session.phoneNumber) return { field: "phoneNumber", value: session.phoneNumber as string };
  if (session.googleId) return { field: "googleId", value: session.googleId as string };
  if (session.facebookId) return { field: "facebookId", value: session.facebookId as string };
  return null;
}

function identCondition(ident: NonNullable<ReturnType<typeof clientIdentifier>>) {
  if (ident.field === "phoneNumber") return eq(clientBusinessesTable.phoneNumber, ident.value);
  if (ident.field === "googleId") return eq(clientBusinessesTable.googleId, ident.value);
  return eq((clientBusinessesTable as any).facebookId, ident.value);
}

router.get("/client/businesses", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const ident = clientIdentifier(session);
  if (!ident) { res.json([]); return; }

  const rows = await db
    .select({
      businessId: clientBusinessesTable.businessId,
      name: businessesTable.name,
      slug: businessesTable.slug,
      logoUrl: businessesTable.logoUrl,
      primaryColor: businessesTable.primaryColor,
      fontFamily: businessesTable.fontFamily,
      address: businessesTable.address,
    })
    .from(clientBusinessesTable)
    .innerJoin(businessesTable, eq(clientBusinessesTable.businessId, businessesTable.id))
    .where(identCondition(ident));

  // De-duplicate on businessId — legacy data can contain multiple
  // client_businesses rows that point at the same business (pre-uniqueness
  // insertions). Return the first occurrence per business.
  const seen = new Set<number>();
  const unique = rows.filter(r => {
    if (seen.has(r.businessId)) return false;
    seen.add(r.businessId);
    return true;
  });

  res.json(unique);
});

router.post("/client/businesses/:slug", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const ident = clientIdentifier(session);
  if (!ident) { res.status(400).json({ error: "זהות לקוח לא ידועה" }); return; }
  const { slug } = req.params;

  const [business] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
  if (!business) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  const existing = await db.select({ id: clientBusinessesTable.id }).from(clientBusinessesTable).where(
    and(eq(clientBusinessesTable.businessId, business.id), identCondition(ident))
  );

  if (existing.length === 0) {
    await db.insert(clientBusinessesTable).values({
      businessId: business.id,
      phoneNumber: ident.field === "phoneNumber" ? ident.value : null,
      googleId: ident.field === "googleId" ? ident.value : null,
      facebookId: ident.field === "facebookId" ? ident.value : null,
    } as any);
  }

  res.json({ success: true });
});

router.delete("/client/businesses/:slug", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const ident = clientIdentifier(session);
  if (!ident) { res.status(400).json({ error: "זהות לקוח לא ידועה" }); return; }
  const { slug } = req.params;

  const [business] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.slug, slug));
  if (!business) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  await db.delete(clientBusinessesTable).where(
    and(eq(clientBusinessesTable.businessId, business.id), identCondition(ident))
  );

  res.json({ success: true });
});

// ─── Appointments ─────────────────────────────────────────────────────────────

router.get("/client/appointments", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const phone = session.phoneNumber;
  if (!phone) { res.json([]); return; }

  const appointments = await db
    .select({
      id: appointmentsTable.id,
      // Needed by the client portal's reschedule hand-off so Book.tsx can
      // query the availability endpoint with the right service.
      serviceId: appointmentsTable.serviceId,
      clientName: appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      durationMinutes: appointmentsTable.durationMinutes,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      createdAt: appointmentsTable.createdAt,
      // Needed on the client side so the portal can split cancelled
      // appointments into "בוטל על ידי העסק" vs "בוטל על ידי" tabs.
      cancelledBy: sql<string>`appointments.cancelled_by`,
      cancelReason: sql<string>`appointments.cancel_reason`,
      businessId: businessesTable.id,
      businessName: businessesTable.name,
      businessSlug: businessesTable.slug,
      businessLogoUrl: businessesTable.logoUrl,
      businessPrimaryColor: businessesTable.primaryColor,
    })
    .from(appointmentsTable)
    .innerJoin(businessesTable, eq(appointmentsTable.businessId, businessesTable.id))
    .where(eq(appointmentsTable.phoneNumber, phone))
    .orderBy(appointmentsTable.appointmentDate, appointmentsTable.appointmentTime);

  res.json(appointments.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// PATCH /client/appointments/:id/reschedule — the "עדכון תור" button in
// the portal calls this. We verify the appointment phone matches the
// client's session phone, confirm the target slot is actually free
// (same rules as the public booking endpoint), and flip the timestamps.
// Reminder-sent flags are reset so the user still gets the reminder for
// the new time.
router.patch("/client/appointments/:id/reschedule", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const phone = session.phoneNumber;
  if (!phone) { res.status(403).json({ error: "עדכון אפשרי רק עם מספר טלפון" }); return; }

  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "id לא תקין" }); return; }

  const { newDate, newTime } = req.body ?? {};
  if (!newDate || !newTime || typeof newDate !== "string" || typeof newTime !== "string") {
    res.status(400).json({ error: "newDate + newTime חובה" });
    return;
  }

  const [appt] = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.phoneNumber, phone)));

  if (!appt) { res.status(404).json({ error: "תור לא נמצא" }); return; }
  if (appt.status === "cancelled") { res.status(400).json({ error: "לא ניתן לעדכן תור שבוטל" }); return; }

  // Make sure the target slot isn't already taken by someone else.
  const [clash] = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, appt.businessId),
      eq(appointmentsTable.appointmentDate, newDate),
      eq(appointmentsTable.appointmentTime, newTime),
      sql`${appointmentsTable.status} != 'cancelled'`,
    ));
  if (clash && clash.id !== appt.id) {
    res.status(409).json({ error: "slot_taken", message: "השעה הזו כבר תפוסה — בחר שעה אחרת" });
    return;
  }

  await db
    .update(appointmentsTable)
    .set({
      appointmentDate:       newDate,
      appointmentTime:       newTime,
      reminder24hSent:       false,
      reminder1hSent:        false,
      reminderMorningSent:   false,
    })
    .where(eq(appointmentsTable.id, appt.id));

  // Notify the business owner — client-initiated reschedule. Owner asked
  // to see WHO updated and FROM-WHEN → TO-WHEN, so the message quotes
  // both the old and new appointment slots rather than just the new one.
  const [, newMonth, newDay] = newDate.split("-");
  const [, oldMonth, oldDay] = appt.appointmentDate.split("-");
  const fromLabel = `${oldDay}/${oldMonth} ${appt.appointmentTime}`;
  const toLabel   = `${newDay}/${newMonth} ${newTime}`;
  logBusinessNotification({
    businessId:   appt.businessId,
    type:         "reschedule",
    appointmentId: appt.id,
    message:      `${appt.clientName} עדכן/ה את התור של ${appt.serviceName} מ-${fromLabel} ל-${toLabel}`,
    actorType:    "client",
    actorName:    appt.clientName,
    staffMemberId: (appt as any).staffMemberId ?? null,
  });

  res.json({ success: true, newDate, newTime });
});

router.patch("/client/appointments/:id/cancel", requireClientAuth, async (req, res): Promise<void> => {
  const session = (req as any).clientSession;
  const phone = session.phoneNumber;
  if (!phone) { res.status(403).json({ error: "ביטול אפשרי רק עם מספר טלפון" }); return; }

  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "id לא תקין" }); return; }

  const [appt] = await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.phoneNumber, phone)));

  if (!appt) { res.status(404).json({ error: "תור לא נמצא" }); return; }

  await db.update(appointmentsTable).set({ status: "cancelled", ...({ cancelledBy: "client" } as any) }).where(eq(appointmentsTable.id, id));

  // Log notification for business owner + the appointment's assigned
  // staff (if any) so cancellations land in both inboxes.
  const [, month, day] = appt.appointmentDate.split("-");
  logBusinessNotification({
    businessId: appt.businessId,
    type: "cancellation",
    appointmentId: appt.id,
    message: `${appt.clientName} ביטל/ה את התור של ${appt.serviceName} ב-${day}/${month} בשעה ${appt.appointmentTime}`,
    actorType: "client",
    actorName: appt.clientName,
    staffMemberId: (appt as any).staffMemberId ?? null,
  });

  res.json({ success: true });
});

export default router;
