import { Router, Request, Response, NextFunction } from "express";
import { logBusinessNotification } from "./notifications";
import { db, appointmentsTable, businessesTable, clientSessionsTable, clientBusinessesTable } from "@workspace/db";
import { eq, and, or, gt } from "drizzle-orm";
import { sendOtp, verifyOtp } from "../lib/whatsapp";
import { randomUUID } from "crypto";

const router = Router();

const SESSION_DAYS = 30;

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

// ─── OTP ─────────────────────────────────────────────────────────────────────

router.post("/client/send-otp", async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }
  try {
    await sendOtp(phone.trim());
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

router.post("/client/verify-otp", async (req, res): Promise<void> => {
  const { phone, code } = req.body;
  if (!phone || !code) { res.status(400).json({ error: "שדות חסרים" }); return; }

  const ok = await verifyOtp(phone.trim(), String(code));
  if (!ok) { res.status(400).json({ error: "קוד שגוי או פג תוקף" }); return; }

  // Get name from latest appointment
  const [latest] = await db
    .select({ clientName: appointmentsTable.clientName })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.phoneNumber, phone.trim()))
    .orderBy(appointmentsTable.createdAt)
    .limit(1);

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(clientSessionsTable).values({
    token,
    phoneNumber: phone.trim(),
    clientName: latest?.clientName ?? "",
    expiresAt,
  });

  res.json({ token, clientName: latest?.clientName ?? "", phone: phone.trim() });
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

    await db.insert(clientSessionsTable).values({ token, googleId, email, clientName, expiresAt });

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

    await db.insert(clientSessionsTable).values({ token, facebookId, email, clientName, expiresAt });

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

  await db.update(clientSessionsTable).set(updates).where(eq(clientSessionsTable.token, session.token));
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
      address: businessesTable.address,
    })
    .from(clientBusinessesTable)
    .innerJoin(businessesTable, eq(clientBusinessesTable.businessId, businessesTable.id))
    .where(identCondition(ident));

  res.json(rows);
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
      clientName: appointmentsTable.clientName,
      serviceName: appointmentsTable.serviceName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      durationMinutes: appointmentsTable.durationMinutes,
      status: appointmentsTable.status,
      notes: appointmentsTable.notes,
      createdAt: appointmentsTable.createdAt,
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

  // Log notification for business owner
  const [, month, day] = appt.appointmentDate.split("-");
  logBusinessNotification({
    businessId: appt.businessId,
    type: "cancellation",
    appointmentId: appt.id,
    message: `${appt.clientName} ביטל/ה את התור של ${appt.serviceName} ב-${day}/${month} בשעה ${appt.appointmentTime}`,
    actorType: "client",
    actorName: appt.clientName,
  });

  res.json({ success: true });
});

export default router;
