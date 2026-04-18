import { Router } from "express";
import { logBusinessNotification } from "./notifications";
import { db, businessesTable, servicesTable, appointmentsTable, waitlistTable, workingHoursTable, clientSessionsTable, reviewsTable } from "@workspace/db";
import { eq, and, gte, sql, countDistinct, count, ilike, or, gt, desc } from "drizzle-orm";
import {
  GetPublicBusinessParams,
  GetPublicServicesParams,
  GetPublicAvailabilityParams,
  GetPublicAvailabilityQueryParams,
  CreatePublicAppointmentParams,
  CreatePublicAppointmentBody,
  JoinWaitlistParams,
  JoinWaitlistBody,
} from "@workspace/api-zod";
import { computeAvailableSlots } from "../lib/availability";
import { sendOtp, verifyOtp, notifyBusinessOwner, sendClientConfirmation, sendClientCancellation, sendTemplate, OtpRateLimitError } from "../lib/whatsapp";
import { isPhoneVerified, consumeVerification, markPhoneVerified, normalizePhone } from "../lib/otpStore";
import { signPhoneVerificationToken, verifyPhoneVerificationToken } from "../lib/phoneVerificationJwt";

const router = Router();

// Thrown from inside db.transaction() when the requested slot is already
// gone by the time we hold the advisory lock. Caught one frame out to
// translate it to a 409 response — letting it bubble would surface as a
// generic 500 to clients.
class SlotNoLongerAvailableError extends Error {
  constructor() { super("slot_unavailable"); this.name = "SlotNoLongerAvailableError"; }
}

// Israel is UTC+3 in summer (Apr–Oct) and UTC+2 in winter
function israelTimeToUTC(dateStr: string, timeStr: string): Date {
  const month = parseInt(dateStr.split("-")[1], 10);
  const offset = (month >= 4 && month <= 10) ? 3 : 2;
  return new Date(`${dateStr}T${timeStr}:00+0${offset}:00`);
}

// GET /public/resolve-host/:hostname — front-end bootstrap lookup.
// The SPA asks "this hostname — which business slug is it?" so the Book
// page can load without a slug in the URL (white-label flow).
// Returns 404 when the hostname isn't registered.
router.get("/public/resolve-host/:hostname", async (req, res): Promise<void> => {
  const hostname = String(req.params.hostname ?? "").toLowerCase().trim();
  if (!hostname) { res.status(400).json({ error: "hostname required" }); return; }

  const [biz] = await db
    .select({
      slug:                 businessesTable.slug,
      customDomainVerified: (businessesTable as any).customDomainVerified,
    })
    .from(businessesTable)
    .where(eq(sql`lower(${(businessesTable as any).customDomain})`, hostname));

  if (!biz) { res.status(404).json({ error: "unknown_domain" }); return; }

  res.json({
    slug:     biz.slug,
    verified: !!biz.customDomainVerified,
  });
});

// GET /public/directory — must be before /:businessSlug to avoid slug capture
//
// Owner decision: the directory is a Pro-only perk. Free businesses still
// get their own /book/:slug page, but they don't appear in "גלה עסקים"
// until they upgrade. This doubles as a concrete reason to upgrade.
router.get("/public/directory", async (req, res): Promise<void> => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const city = typeof req.query.city === "string" ? req.query.city : undefined;

  const rows = await db
    .select({
      slug: businessesTable.slug,
      name: businessesTable.name,
      logoUrl: businessesTable.logoUrl,
      bannerUrl: businessesTable.bannerUrl,
      primaryColor: businessesTable.primaryColor,
      fontFamily: businessesTable.fontFamily,
      address: businessesTable.address,
      city: (businessesTable as any).city,
      businessCategories: (businessesTable as any).businessCategories,
      businessDescription: (businessesTable as any).businessDescription,
      // Advanced design fields so directory cards can render each business
      // in its own brand: gradient banner, accent color, etc. Otherwise the
      // 'גלה עסקים' grid looked identical for every business — just white
      // cards with a differently-colored CTA button.
      accentColor:     (businessesTable as any).accentColor,
      gradientEnabled: (businessesTable as any).gradientEnabled,
      gradientFrom:    (businessesTable as any).gradientFrom,
      gradientTo:      (businessesTable as any).gradientTo,
      gradientAngle:   (businessesTable as any).gradientAngle,
    })
    .from(businessesTable)
    .where(and(
      eq(businessesTable.isActive, true),
      eq(businessesTable.subscriptionPlan, "pro"),
      sql`${businessesTable.slug} != 'admin'`,
    ));

  const filtered = rows.filter(b => {
    if (city && (b as any).city && !(b as any).city.includes(city)) return false;
    if (category && (b as any).businessCategories) {
      try {
        const cats: string[] = JSON.parse((b as any).businessCategories);
        if (!cats.includes(category)) return false;
      } catch { return false; }
    } else if (category) {
      return false;
    }
    return true;
  });

  res.json(filtered);
});

router.get("/public/:businessSlug", async (req, res): Promise<void> => {
  const paramsParsed = GetPublicBusinessParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, paramsParsed.data.businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({
    id: business.id,
    slug: business.slug,
    name: business.name,
    notificationEnabled: business.notificationEnabled,
    notificationMessage: business.notificationMessage ?? null,
    primaryColor: business.primaryColor ?? null,
    fontFamily: business.fontFamily ?? null,
    logoUrl: business.logoUrl ?? null,
    bannerUrl: business.bannerUrl ?? null,
    themeMode: business.themeMode ?? null,
    backgroundColor: business.backgroundColor ?? null,
    borderRadius: business.borderRadius ?? null,
    welcomeText: business.welcomeText ?? null,
    stripeEnabled: business.stripeEnabled,
    depositAmountAgorot: null,
    requirePhoneVerification: business.requirePhoneVerification,
    phone: business.phone ?? null,
    websiteUrl: (business as any).websiteUrl ?? null,
    instagramUrl: (business as any).instagramUrl ?? null,
    wazeUrl: (business as any).wazeUrl ?? null,
    businessDescription: (business as any).businessDescription ?? null,
    galleryImages: (business as any).galleryImages ?? null,
    bannerPosition: (business as any).bannerPosition ?? "center",
    buttonRadius: (business as any).buttonRadius ?? null,
    showBusinessName: (business as any).showBusinessName ?? true,
    showLogo: (business as any).showLogo ?? true,
    showBanner: (business as any).showBanner ?? true,
    contactPhone: (business as any).contactPhone ?? null,
    address: (business as any).address ?? null,
    announcementText: (business as any).announcementText ?? null,
    announcementValidHours: (business as any).announcementValidHours ?? 24,
    announcementCreatedAt: (business as any).announcementCreatedAt ? (business as any).announcementCreatedAt.toISOString() : null,
    // Advanced design / branding fields (preset + gradient + layout effects)
    designPreset:      (business as any).designPreset      ?? null,
    accentColor:       (business as any).accentColor       ?? null,
    gradientEnabled:   (business as any).gradientEnabled   ?? false,
    gradientFrom:      (business as any).gradientFrom      ?? null,
    gradientTo:        (business as any).gradientTo        ?? null,
    gradientAngle:     (business as any).gradientAngle     ?? 135,
    backgroundPattern: (business as any).backgroundPattern ?? null,
    heroLayout:        (business as any).heroLayout        ?? null,
    serviceCardStyle:  (business as any).serviceCardStyle  ?? null,
    animationStyle:    (business as any).animationStyle    ?? null,
    hoverEffect:       (business as any).hoverEffect       ?? null,
    // City + geocoded coords → Waze / Maps buttons on the client.
    city:              (business as any).city              ?? null,
    latitude:          (business as any).latitude          ?? null,
    longitude:         (business as any).longitude         ?? null,
  });
});

router.get("/public/:businessSlug/services", async (req, res): Promise<void> => {
  const paramsParsed = GetPublicServicesParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, paramsParsed.data.businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const services = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.businessId, business.id), eq(servicesTable.isActive, true)))
    .orderBy(servicesTable.sortOrder, servicesTable.createdAt);

  res.json(services.map((s) => ({ ...s, description: (s as any).description ?? null, createdAt: s.createdAt.toISOString() })));
});

router.get("/public/:businessSlug/hours", async (req, res): Promise<void> => {
  const { businessSlug } = req.params;

  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const hours = await db
    .select()
    .from(workingHoursTable)
    .where(eq(workingHoursTable.businessId, business.id))
    .orderBy(workingHoursTable.dayOfWeek);

  res.json(hours.map((h) => ({
    id: h.id,
    businessId: h.businessId,
    dayOfWeek: h.dayOfWeek,
    startTime: h.startTime,
    endTime: h.endTime,
    isEnabled: h.isEnabled,
  })));
});

router.get("/public/:businessSlug/availability", async (req, res): Promise<void> => {
  const paramsParsed = GetPublicAvailabilityParams.safeParse(req.params);
  const queryParsed = GetPublicAvailabilityQueryParams.safeParse(req.query);

  if (!paramsParsed.success || !queryParsed.success) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const { businessSlug } = paramsParsed.data;
  const { date, serviceId } = queryParsed.data;

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, business.id)));

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const bufferMinutes = service.bufferMinutes > 0 ? service.bufferMinutes : business.bufferMinutes;
  // Optional excludeAppointmentId (reschedule flow) — read straight from
  // req.query since the zod QueryParams schema only knows date+serviceId.
  const excludeRaw = req.query.excludeAppointmentId;
  const excludeAppointmentId = typeof excludeRaw === "string" && excludeRaw.trim()
    ? Number(excludeRaw) || null
    : null;
  const slots = await computeAvailableSlots(business.id, date, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay, excludeAppointmentId);

  const minLeadHours: number = (business as any).minLeadHours ?? 0;
  const minAllowed = new Date(Date.now() + minLeadHours * 60 * 60 * 1000);

  const availableSlots = slots
    .filter(s => s.available)
    .map(s => s.time)
    .filter(time => israelTimeToUTC(date, time) >= minAllowed);
  const isFullyBooked = availableSlots.length === 0;

  res.json({ date, slots: availableSlots, isFullyBooked });
});

// POST /public/:businessSlug/otp/send
router.post("/public/:businessSlug/otp/send", async (req, res): Promise<void> => {
  const { phone } = req.body ?? {};
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "Missing phone" });
    return;
  }
  try {
    await sendOtp(phone, "booking_verify");
    res.json({ success: true });
  } catch (e: any) {
    if (e instanceof OtpRateLimitError) {
      res.status(429).json({ error: "יותר מדי בקשות — נסה שוב בעוד כמה דקות" });
      return;
    }
    // Don't leak internal error messages (WhatsApp API errors, network
    // failures) to the client — they get an actionable, generic message.
    console.error("[OTP send] failed:", e?.message ?? e);
    res.status(500).json({ error: "שגיאה בשליחת קוד" });
  }
});

// POST /public/:businessSlug/otp/verify
router.post("/public/:businessSlug/otp/verify", async (req, res): Promise<void> => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) {
    res.status(400).json({ error: "Missing phone or code" });
    return;
  }
  const ok = await verifyOtp(phone, String(code), "booking_verify");
  if (!ok) {
    res.status(400).json({ error: "invalid_code", message: "הקוד שגוי או פג תוקף" });
    return;
  }
  markPhoneVerified(phone);
  const phoneVerificationToken = signPhoneVerificationToken(phone);
  res.json({ success: true, phoneVerificationToken });
});

router.post("/public/:businessSlug/appointments", async (req, res): Promise<void> => {
  const paramsParsed = CreatePublicAppointmentParams.safeParse(req.params);
  const bodyParsed = CreatePublicAppointmentBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    const detail = bodyParsed.success === false
      ? bodyParsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")
      : "invalid slug";
    res.status(400).json({ error: "Invalid input", message: detail });
    return;
  }

  const { businessSlug } = paramsParsed.data;
  const { serviceId, clientName, phoneNumber, appointmentDate, appointmentTime, notes, phoneVerificationToken } =
    bodyParsed.data;

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  // Enforce phone OTP when required: in-memory, signed JWT, or logged-in client with matching phone
  if (business.requirePhoneVerification) {
    const verifiedByMemory = isPhoneVerified(phoneNumber);
    const verifiedByToken =
      phoneVerificationToken && verifyPhoneVerificationToken(phoneVerificationToken, phoneNumber);

    // Client logged-in via portal with a matching phone counts as verified (they passed OTP on login)
    let verifiedByClientSession = false;
    const clientToken = req.headers["x-client-token"] as string | undefined;
    if (clientToken) {
      const [session] = await db
        .select({ phoneNumber: clientSessionsTable.phoneNumber })
        .from(clientSessionsTable)
        .where(and(
          eq(clientSessionsTable.token, clientToken),
          gt(clientSessionsTable.expiresAt, new Date()),
        ));
      if (session?.phoneNumber && normalizePhone(session.phoneNumber) === normalizePhone(phoneNumber)) {
        verifiedByClientSession = true;
      }
    }

    if (!verifiedByMemory && !verifiedByToken && !verifiedByClientSession) {
      res.status(403).json({ error: "phone_not_verified", message: "יש לאמת את מספר הטלפון תחילה" });
      return;
    }
  }

  // ── Booking restrictions ──────────────────────────────────────────────────

  // 1. Min lead time: appointment must be at least minLeadHours from now (Israel time)
  if (business.minLeadHours > 0) {
    const apptDateTime = israelTimeToUTC(appointmentDate, appointmentTime);
    const minAllowed = new Date(Date.now() + business.minLeadHours * 60 * 60 * 1000);
    if (apptDateTime < minAllowed) {
      res.status(400).json({
        error: "too_soon",
        message: `יש לקבוע תור לפחות ${business.minLeadHours} שעות מראש`,
      });
      return;
    }
  }

  // 2. Max future date / weeks
  if (business.futureBookingMode === "weeks" && business.maxFutureWeeks > 0) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + business.maxFutureWeeks * 7);
    if (new Date(appointmentDate) > maxDate) {
      res.status(400).json({
        error: "too_far",
        message: `ניתן לקבוע תור עד ${business.maxFutureWeeks} שבועות מראש`,
      });
      return;
    }
  } else if (business.futureBookingMode === "date" && business.maxFutureDate) {
    if (appointmentDate > business.maxFutureDate) {
      res.status(400).json({
        error: "too_far",
        message: `ניתן לקבוע תור עד תאריך ${business.maxFutureDate}`,
      });
      return;
    }
  }

  // 3. Max appointments per day (total for this business).
  // Exclude `pending_payment` rows so abandoned/expired deposit attempts
  // don't permanently block the day for real customers.
  if (business.maxAppointmentsPerDay) {
    const [{ dayCount }] = await db
      .select({ dayCount: count() })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.businessId, business.id),
        eq(appointmentsTable.appointmentDate, appointmentDate),
        sql`${appointmentsTable.status} NOT IN ('cancelled', 'pending_payment')`
      ));
    if (dayCount >= business.maxAppointmentsPerDay) {
      res.status(409).json({
        error: "day_full",
        message: `היום הזה מלא. ניתן לקבוע עד ${business.maxAppointmentsPerDay} תורים ביום`,
      });
      return;
    }
  }

  // 4. Max appointments per customer — only count UPCOMING, confirmed
  // appointments. Past appointments and abandoned pending_payment rows
  // shouldn't lock a customer out of booking new ones.
  if (business.maxAppointmentsPerCustomer) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [{ customerCount }] = await db
      .select({ customerCount: count() })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.businessId, business.id),
        eq(appointmentsTable.phoneNumber, phoneNumber),
        sql`${appointmentsTable.status} NOT IN ('cancelled', 'pending_payment', 'completed', 'no_show')`,
        sql`${appointmentsTable.appointmentDate} >= ${todayStr}`
      ));
    if (customerCount >= business.maxAppointmentsPerCustomer) {
      res.status(409).json({
        error: "customer_limit",
        message: `הגעת למגבלת ${business.maxAppointmentsPerCustomer} תורים פעילים`,
      });
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const FREE_MONTHLY_CUSTOMER_LIMIT = 20;
  if (business.subscriptionPlan === "free") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [{ monthlyCount }] = await db
      .select({ monthlyCount: countDistinct(appointmentsTable.phoneNumber) })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.businessId, business.id),
        gte(appointmentsTable.createdAt, startOfMonth),
        sql`${appointmentsTable.status} NOT IN ('cancelled', 'pending_payment')`,
      ));

    if (monthlyCount >= FREE_MONTHLY_CUSTOMER_LIMIT) {
      res.status(402).json({
        error: "monthly_limit_reached",
        message: "העסק הגיע למגבלת הלקוחות החודשית של המנוי החינמי (20 לקוחות). נסה שוב בחודש הבא.",
        limit: FREE_MONTHLY_CUSTOMER_LIMIT,
        current: monthlyCount,
      });
      return;
    }
  }

  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, business.id), eq(servicesTable.isActive, true)));

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const bufferMinutes = service.bufferMinutes > 0 ? service.bufferMinutes : business.bufferMinutes;

  const tranzilaEnabled = (business as any).tranzilaEnabled ?? false;
  const depositAmountAgorot = (business as any).depositAmountAgorot ?? null;
  const requiresPayment = tranzilaEnabled && depositAmountAgorot && depositAmountAgorot > 0;
  // Manual approval mode is Pro-only. For free businesses, appointments confirm immediately.
  const isPro = business.subscriptionPlan === "pro";
  const approvalActive = isPro && business.requireAppointmentApproval;
  const appointmentStatus = requiresPayment ? "pending_payment" : approvalActive ? "pending" : "confirmed";

  // Transaction + per-business advisory lock → prevents two clients from
  // both passing the availability check concurrently and double-booking
  // the same slot. pg_advisory_xact_lock serializes any other booking
  // attempt for THIS business until we commit; the lock is automatically
  // released at commit/rollback. Other businesses are unaffected —
  // concurrency across the platform stays high.
  let appointment: typeof appointmentsTable.$inferSelect;
  let idempotent = false;
  try {
    appointment = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${business.id})`);

      // Re-run availability INSIDE the lock — by now every prior concurrent
      // booking for this business has already committed (or rolled back),
      // so the slot list is authoritative for the next insert.
      const slots = await computeAvailableSlots(business.id, appointmentDate, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay);
      const slot = slots.find((s) => s.time === appointmentTime);
      if (!slot || !slot.available) {
        throw new SlotNoLongerAvailableError();
      }

      // Idempotency: identical client+service+date+time on the same
      // (non-cancelled) row → return it instead of creating a duplicate.
      const [existing] = await tx
        .select()
        .from(appointmentsTable)
        .where(and(
          eq(appointmentsTable.businessId, business.id),
          eq(appointmentsTable.serviceId, service.id),
          eq(appointmentsTable.phoneNumber, phoneNumber),
          eq(appointmentsTable.appointmentDate, appointmentDate),
          eq(appointmentsTable.appointmentTime, appointmentTime),
          sql`${appointmentsTable.status} != 'cancelled'`,
        ));
      if (existing) {
        idempotent = true;
        return existing;
      }

      const [row] = await tx
        .insert(appointmentsTable)
        .values({
          businessId: business.id,
          serviceId: service.id,
          serviceName: service.name,
          clientName,
          phoneNumber,
          appointmentDate,
          appointmentTime,
          durationMinutes: service.durationMinutes,
          status: appointmentStatus,
          notes: notes ?? undefined,
        })
        .returning();
      return row;
    });
  } catch (err) {
    if (err instanceof SlotNoLongerAvailableError) {
      res.status(409).json({ error: "This time slot is no longer available" });
      return;
    }
    throw err;
  }

  if (idempotent) {
    res.json({ ...appointment, requiresPayment });
    return;
  }

  if (business.requirePhoneVerification) consumeVerification(phoneNumber);

  const [, month, day] = appointmentDate.split("-");
  const formattedDate = `${day}/${month}`;

  // Log in-app notification for business owner
  logBusinessNotification({
    businessId: business.id,
    type: "new_booking",
    appointmentId: appointment.id,
    message: `תור חדש: ${clientName} קבע ${service.name} ב-${formattedDate} בשעה ${appointmentTime}`,
    actorType: "client",
    actorName: clientName,
  });

  // Notify business owner via WhatsApp (non-blocking).
  // Respects the "קבלי התראה על כל תור חדש" toggle in Integrations tab —
  // when off, the owner still sees the in-app notification logged above.
  if (business.phone && business.notificationEnabled) {
    notifyBusinessOwner(business.phone, clientName, business.name, service.name, formattedDate, appointmentTime, business.slug)
      .catch((e: any) => console.error("[WhatsApp] notifyBusinessOwner failed:", e?.response?.data ?? e?.message));
  }

  // Owner request: on auto-approval businesses, the booking is confirmed
  // immediately and the client sees an on-screen confirmation — a WhatsApp
  // "booking confirmed" ping right after is redundant and annoying. We only
  // send a WA confirmation in the approval flow (business.ts → /approve)
  // once the owner manually approves a pending appointment.

  res.status(201).json({
    ...appointment,
    createdAt: appointment.createdAt.toISOString(),
    requiresPayment: !!requiresPayment,
    depositAmountILS: requiresPayment ? (depositAmountAgorot! / 100) : null,
  });
});

router.post("/public/:businessSlug/waitlist", async (req, res): Promise<void> => {
  const paramsParsed = JoinWaitlistParams.safeParse(req.params);
  const bodyParsed = JoinWaitlistBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { businessSlug } = paramsParsed.data;
  const { serviceId, clientName, phoneNumber, preferredDate, notes } = bodyParsed.data;

  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  let serviceName: string | undefined;
  if (serviceId) {
    const [svc] = await db.select({ name: servicesTable.name }).from(servicesTable).where(eq(servicesTable.id, serviceId));
    serviceName = svc?.name;
  }

  await db.insert(waitlistTable).values({
    businessId: business.id,
    serviceId: serviceId ?? undefined,
    serviceName: serviceName ?? undefined,
    clientName,
    phoneNumber,
    preferredDate: preferredDate ?? undefined,
    notes: notes ?? undefined,
  });

  // In-app notification for the business owner — same surface the
  // booking confirmations use. Owner asked for waitlist joins to
  // ping the bell too, so they can reach out when a slot frees up.
  logBusinessNotification({
    businessId: business.id,
    type: "waitlist_join",
    message: `${clientName} הצטרף/ה לרשימת ההמתנה${serviceName ? ` ל-${serviceName}` : ""}${preferredDate ? ` (${preferredDate})` : ""}`,
    actorType: "client",
    actorName: clientName,
  });

  res.status(201).json({ success: true, message: "Added to waitlist" });
});

// ─── Reviews ────────────────────────────────────────────────────────────────
// Public list + authenticated create/update for the business's review wall.
// One review per (business, client email). Name + avatar are pulled from
// the client's Google profile at submission time and denormalised into
// the row so the review wall keeps working even if the client later
// updates their Google avatar / display name.

// ─── Share page with business-specific OG tags ─────────────────────────────
// Social scrapers (WhatsApp, Facebook, Twitter) don't run JavaScript, so
// the client-side meta updates in Book.tsx aren't visible to them. This
// endpoint returns a minimal HTML page with server-rendered og:* and
// twitter:* tags pulled from the business profile, plus a meta-refresh
// + JS redirect so a human clicking the link lands on the SPA.
//
// Intended as the "share link" the dashboard CopyLinkButton produces.
// URL shape: https://kavati.net/api/s/<slug>  → scrapers see per-business
// preview; humans bounce to /book/<slug>.
function _htmlEscape(s: string): string {
  return String(s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c
  ));
}

router.get("/s/:businessSlug", async (req, res): Promise<void> => {
  const slug = String(req.params.businessSlug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  // Always redirect to the CANONICAL public host, not req.get("host").
  // The api-server is reachable via multiple hostnames (the primary
  // www.kavati.net domain, the raw Railway *.up.railway.app URL, a
  // custom domain per Pro business, …) and only the primary one has
  // the SPA dist available. Hard-coding the canonical target keeps
  // every share link landing on the working page regardless of how
  // the /api/s/:slug URL was reached. Configurable via env for staging.
  const canonical = (process.env.PUBLIC_CANONICAL_HOST || "https://www.kavati.net").replace(/\/$/, "");
  const host = canonical;
  const bookUrl = `${host}/book/${encodeURIComponent(slug)}`;

  // Fall back to a plain redirect when the slug is unknown — the SPA
  // itself handles "business not found" with a friendly screen.
  if (!slug) { res.redirect(302, `${host}/`); return; }

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, slug), eq(businessesTable.isActive, true)));

  if (!business) { res.redirect(302, bookUrl); return; }

  // Owner preference: prefer the logo in link previews — it's the
  // recognisable brand asset. Banner is wide and often gets cropped
  // awkwardly by WhatsApp's square preview card. Fall back to banner
  // only if no logo, and the generic Kavati card only if neither set.
  const rawImg = (business as any).logoUrl || (business as any).bannerUrl || `${host}/opengraph.jpg`;
  const imgAbs = String(rawImg).startsWith("http") ? String(rawImg)
            : `${host}${String(rawImg).startsWith("/") ? "" : "/"}${rawImg}`;

  // Optimise the og:image for social-card scrapers. Huge source images
  // (4k+, multi-MB) get skipped or time out on WhatsApp/FB; tiny ones
  // (< 300×200) get ignored entirely. We hand the scraper a ~1200×630
  // jpg regardless of what the owner uploaded, which is the sweet-spot
  // FB recommends for the summary_large_image card.
  //
  // Two paths:
  //   (a) Cloudinary URLs → inject a resize transformation inline
  //       (no extra hop, images.cloudinary.com already serves the
  //       cropped version directly).
  //   (b) Everything else → pipe the URL through images.weserv.nl,
  //       a free public proxy that resizes + re-encodes any image
  //       URL. Handles Google Cloud Storage, S3, arbitrary hosts,
  //       different aspect ratios + sizes automatically.
  let img = imgAbs;
  if (imgAbs.includes("res.cloudinary.com") && imgAbs.includes("/upload/")) {
    img = imgAbs.replace("/upload/", "/upload/c_fill,g_auto,w_1200,h_630,f_auto,q_auto/");
  } else if (/^https?:\/\//i.test(imgAbs) && !imgAbs.startsWith(host)) {
    // Skip the proxy for images hosted on this server (kavati.net
    // itself) — no size issue there, and proxying them adds latency.
    const stripped = imgAbs.replace(/^https?:\/\//i, "");
    img = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=1200&h=630&fit=cover&a=attention&output=jpg&q=80`;
  }
  const title = _htmlEscape((business as any).name || "קבעתי");
  const desc = _htmlEscape((business as any).businessDescription || `קבעי תור אצל ${(business as any).name}`);
  const imgEsc = _htmlEscape(img);
  const bookUrlEsc = _htmlEscape(bookUrl);

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#ffffff">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="קבעתי">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${imgEsc}">
  <meta property="og:image:secure_url" content="${imgEsc}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title}">
  <meta property="og:url" content="${bookUrlEsc}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${imgEsc}">
  <link rel="canonical" href="${bookUrlEsc}">
  <meta http-equiv="refresh" content="1;url=${bookUrlEsc}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;600;700&display=swap" rel="stylesheet">
  <script>setTimeout(function(){window.location.replace(${JSON.stringify(bookUrl)});}, 350);</script>
  <style>
    html,body{margin:0;padding:0;height:100%}
    html,body{background:#fff}
    body{font-family:'Rubik',system-ui,sans-serif;color:#1f2937;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .wrap{text-align:center;padding:2rem;max-width:28rem}
    .avatar{width:120px;height:120px;border-radius:9999px;object-fit:cover;box-shadow:0 10px 30px -10px rgba(60,146,240,.35);border:4px solid #fff;margin:0 auto 1.25rem;display:block;background:#fff}
    h1{margin:0 0 .5rem;font-size:1.5rem;font-weight:700;color:#111}
    p{margin:0;color:#6b7280;font-size:.95rem;line-height:1.5}
    a{color:#3c92f0;text-decoration:none;font-weight:600}
    .spinner{margin:1.5rem auto 0;width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#3c92f0;border-radius:9999px;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="wrap">
    <img class="avatar" src="${imgEsc}" alt="${title}" onerror="this.style.display='none'" />
    <h1>${title}</h1>
    <p>${desc}</p>
    <div class="spinner" aria-hidden="true"></div>
    <p style="margin-top:1rem;font-size:.8rem">מעביר אותך ל<a href="${bookUrlEsc}">עמוד קביעת התור</a>...</p>
  </div>
</body>
</html>`;

  // Cache for 5 minutes so repeated scraper hits don't re-query the DB;
  // short enough that banner/logo edits propagate quickly.
  res.set("Cache-Control", "public, max-age=300");
  res.type("html").send(html);
});

router.get("/public/:businessSlug/reviews", async (req, res): Promise<void> => {
  const slug = req.params.businessSlug;
  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, slug), eq(businessesTable.isActive, true)));
  if (!business) { res.status(404).json({ error: "Business not found" }); return; }

  // If the caller is a logged-in client, flag the row that belongs to
  // them so the UI can show "שינוי הביקורת" instead of "השאר ביקורת"
  // and pre-fill the composer with the prior rating + text.
  let callerEmail: string | null = null;
  const token = req.headers["x-client-token"] as string | undefined;
  if (token) {
    const [session] = await db
      .select({ email: clientSessionsTable.email })
      .from(clientSessionsTable)
      .where(and(eq(clientSessionsTable.token, token), gt(clientSessionsTable.expiresAt, new Date())));
    callerEmail = (session?.email ?? "").trim().toLowerCase() || null;
  }

  // We need clientEmail for the mine-check; it's never exposed back to
  // the caller — only the computed boolean is, so privacy-wise the
  // endpoint still doesn't leak other reviewers' emails.
  const rows = await db
    .select({
      id: reviewsTable.id,
      clientEmail: reviewsTable.clientEmail,
      clientName: reviewsTable.clientName,
      avatarUrl: reviewsTable.avatarUrl,
      rating: reviewsTable.rating,
      text: reviewsTable.text,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.businessId, business.id))
    .orderBy(desc(reviewsTable.createdAt));

  res.json(rows.map(r => {
    const { clientEmail, ...rest } = r;
    return {
      ...rest,
      createdAt: r.createdAt.toISOString(),
      mine: callerEmail && clientEmail && clientEmail.toLowerCase() === callerEmail ? true : false,
    };
  }));
});

router.post("/public/:businessSlug/reviews", async (req, res): Promise<void> => {
  const slug = req.params.businessSlug;

  // Require a valid client session — reviews are tied to an identity
  // so a single Google account can't flood the wall with dozens of
  // fake reviews.
  const token = req.headers["x-client-token"] as string | undefined;
  if (!token) { res.status(401).json({ error: "auth_required" }); return; }
  const [session] = await db
    .select()
    .from(clientSessionsTable)
    .where(and(eq(clientSessionsTable.token, token), gt(clientSessionsTable.expiresAt, new Date())));
  if (!session) { res.status(401).json({ error: "auth_required" }); return; }

  const email = (session.email ?? "").trim().toLowerCase();
  if (!email) { res.status(400).json({ error: "email_required", message: "יש להתחבר עם חשבון Google כדי להשאיר ביקורת" }); return; }
  if (!session.phoneNumber) { res.status(400).json({ error: "phone_required", message: "יש לצרף מספר טלפון לפני השארת ביקורת" }); return; }

  const rating = Number(req.body?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "invalid_rating" }); return;
  }
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 2000) : null;
  const avatarUrl = typeof req.body?.avatarUrl === "string" ? req.body.avatarUrl.slice(0, 500) : null;
  const clientName = (session.clientName || req.body?.clientName || "").trim().slice(0, 120);
  if (!clientName) { res.status(400).json({ error: "name_required" }); return; }

  const [business] = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, slug), eq(businessesTable.isActive, true)));
  if (!business) { res.status(404).json({ error: "Business not found" }); return; }

  // Upsert — second review for the same (business, email) overwrites
  // the first. Matches the pattern clients intuitively expect when
  // they click "leave a review" twice.
  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.businessId, business.id), eq(reviewsTable.clientEmail, email)));

  if (existing) {
    await db.update(reviewsTable)
      .set({
        rating: Math.round(rating),
        text: text || null,
        clientName,
        avatarUrl: avatarUrl || existing.avatarUrl,
        clientPhone: session.phoneNumber ?? existing.clientPhone,
        updatedAt: new Date(),
      } as any)
      .where(eq(reviewsTable.id, existing.id));
    res.json({ success: true, updated: true });
    return;
  }

  await db.insert(reviewsTable).values({
    businessId: business.id,
    clientEmail: email,
    clientPhone: session.phoneNumber,
    clientName,
    avatarUrl: avatarUrl || undefined,
    rating: Math.round(rating),
    text: text || undefined,
  });

  // Notify the business owner that a new review landed.
  logBusinessNotification({
    businessId: business.id,
    type: "new_review",
    message: `${clientName} השאיר/ה ביקורת חדשה (${Math.round(rating)}★)`,
    actorType: "client",
    actorName: clientName,
  });

  res.status(201).json({ success: true, created: true });
});

// POST /public/:businessSlug/appointments/:id/cancel — client cancels their own appointment
// Requires phoneNumber in body to verify ownership
router.post("/public/:businessSlug/appointments/:id/cancel", async (req, res): Promise<void> => {
  const { businessSlug, id } = req.params;
  const { phoneNumber } = req.body ?? {};

  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber required" }); return; }

  const apptId = parseInt(id);
  if (!apptId || isNaN(apptId)) { res.status(400).json({ error: "id לא תקין" }); return; }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
      businessId: appointmentsTable.businessId,
      status: appointmentsTable.status,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
    })
    .from(appointmentsTable)
    .innerJoin(businessesTable, eq(appointmentsTable.businessId, businessesTable.id))
    .where(and(
      eq(appointmentsTable.id, apptId),
      eq(businessesTable.slug, businessSlug),
      eq(appointmentsTable.phoneNumber, phoneNumber),
    ));

  if (!appt) { res.status(404).json({ error: "תור לא נמצא" }); return; }
  if (appt.status === "cancelled") { res.status(400).json({ error: "התור כבר בוטל" }); return; }

  // Check cancellation hours policy
  const [business] = await db
    .select({ cancellationHours: businessesTable.cancellationHours, name: businessesTable.name, subscriptionPlan: businessesTable.subscriptionPlan })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (business?.cancellationHours) {
    const apptTime = israelTimeToUTC(appt.appointmentDate, appt.appointmentTime);
    const hoursUntil = (apptTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < (business.cancellationHours ?? 0)) {
      res.status(400).json({ error: "cancellation_too_late", message: `לא ניתן לבטל פחות מ-${business.cancellationHours} שעות לפני התור` });
      return;
    }
  }

  await db.update(appointmentsTable).set({ status: "cancelled" }).where(eq(appointmentsTable.id, appt.id));

  // Notify client of cancellation via WhatsApp (non-blocking) — Pro only
  const [, cancelMonth, cancelDay] = appt.appointmentDate.split("-");
  const cancelFormattedDate = `${cancelDay}/${cancelMonth}`;
  if ((business as any)?.subscriptionPlan === "pro") {
    sendClientCancellation(appt.phoneNumber, appt.clientName, business?.name ?? "העסק", cancelFormattedDate, appt.appointmentTime)
      .catch((e: any) => console.error("[WhatsApp] sendClientCancellation failed:", e?.response?.data ?? e?.message));
  }

  res.json({ success: true });
});

// PATCH /public/:businessSlug/appointments/:id/reschedule — client reschedules their appointment
router.patch("/public/:businessSlug/appointments/:id/reschedule", async (req, res): Promise<void> => {
  const { businessSlug, id } = req.params;
  const { phoneNumber, newDate, newTime } = req.body ?? {};

  if (!phoneNumber || !newDate || !newTime) {
    res.status(400).json({ error: "phoneNumber, newDate, newTime required" });
    return;
  }

  const apptId = parseInt(id);
  if (!apptId || isNaN(apptId)) { res.status(400).json({ error: "id לא תקין" }); return; }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
      businessId: appointmentsTable.businessId,
      serviceName: appointmentsTable.serviceName,
      durationMinutes: appointmentsTable.durationMinutes,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .innerJoin(businessesTable, eq(appointmentsTable.businessId, businessesTable.id))
    .where(and(
      eq(appointmentsTable.id, apptId),
      eq(businessesTable.slug, businessSlug),
      eq(appointmentsTable.phoneNumber, phoneNumber),
    ));

  if (!appt) { res.status(404).json({ error: "תור לא נמצא" }); return; }
  if (appt.status === "cancelled") { res.status(400).json({ error: "לא ניתן לדחות תור שבוטל" }); return; }

  // Verify the new slot is available
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (!business) { res.status(404).json({ error: "Business not found" }); return; }

  // Apply the same booking restrictions on the new slot (Israel time)
  if (business.minLeadHours > 0) {
    const newDateTime = israelTimeToUTC(newDate, newTime);
    const minAllowed = new Date(Date.now() + business.minLeadHours * 60 * 60 * 1000);
    if (newDateTime < minAllowed) {
      res.status(400).json({ error: "too_soon", message: `יש לדחות לפחות ${business.minLeadHours} שעות מראש` });
      return;
    }
  }
  if (business.futureBookingMode === "weeks" && business.maxFutureWeeks > 0) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + business.maxFutureWeeks * 7);
    if (new Date(newDate) > maxDate) {
      res.status(400).json({ error: "too_far", message: `ניתן לדחות עד ${business.maxFutureWeeks} שבועות מראש` });
      return;
    }
  } else if (business.futureBookingMode === "date" && business.maxFutureDate) {
    if (newDate > business.maxFutureDate) {
      res.status(400).json({ error: "too_far", message: `ניתן לדחות עד תאריך ${business.maxFutureDate}` });
      return;
    }
  }

  // Check for conflicts at the new time
  const [conflict] = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, appt.businessId),
      eq(appointmentsTable.appointmentDate, newDate),
      eq(appointmentsTable.appointmentTime, newTime),
      sql`${appointmentsTable.status} != 'cancelled'`,
      sql`${appointmentsTable.id} != ${appt.id}`,
    ));

  if (conflict) {
    res.status(409).json({ error: "slot_taken", message: "השעה המבוקשת כבר תפוסה" });
    return;
  }

  await db.update(appointmentsTable)
    .set({ appointmentDate: newDate, appointmentTime: newTime, reminder24hSent: false, reminder1hSent: false, reminderMorningSent: false })
    .where(eq(appointmentsTable.id, appt.id));

  // Send WhatsApp notification — appointment_rescheduled template
  // "Hello {{1}}, Your upcoming appointment with {{שם העסק}} has been rescheduled for {{תאריך}} at {{2}}."
  const [, month, day] = newDate.split("-");
  const formattedDate = `${day}/${month}`;
  sendTemplate(appt.phoneNumber, "appointment_rescheduled", [
    appt.clientName,
    formattedDate,
    newTime,
  ]).catch((e: any) => console.error("[WhatsApp] appointment_rescheduled failed:", e?.response?.data ?? e?.message));

  res.json({ success: true, newDate, newTime });
});

// GET /public/:businessSlug/next-slots?serviceId=X&count=5
// Returns the next N available slot times starting from today
router.get("/public/:businessSlug/next-slots", async (req, res): Promise<void> => {
  const { businessSlug } = req.params;
  const serviceId = Number(req.query.serviceId);
  const count = Math.min(Number(req.query.count) || 5, 20);

  if (!serviceId || isNaN(serviceId)) { res.status(400).json({ error: "serviceId נדרש" }); return; }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.slug, businessSlug));
  if (!business) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  const [service] = await db.select().from(servicesTable).where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, business.id)));
  if (!service) { res.status(404).json({ error: "שירות לא נמצא" }); return; }

  const bufferMinutes = service.bufferMinutes > 0 ? service.bufferMinutes : (business.bufferMinutes ?? 0);
  const results: { date: string; time: string }[] = [];
  const today = new Date();
  const minLeadHoursNS: number = (business as any).minLeadHours ?? 0;
  const minAllowedNS = new Date(Date.now() + minLeadHoursNS * 60 * 60 * 1000);

  for (let dayOffset = 0; dayOffset < 60 && results.length < count; dayOffset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const slots = await computeAvailableSlots(business.id, dateStr, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay);

    for (const slot of slots) {
      if (!slot.available) continue;
      if (israelTimeToUTC(dateStr, slot.time) < minAllowedNS) continue;
      results.push({ date: dateStr, time: slot.time });
      if (results.length >= count) break;
    }
  }

  res.json(results);
});

// GET /public/:businessSlug/available-dates?serviceId=X
// Returns { available: [...], full: [...] } — two lists of dates in the
// business's booking window.
//   available = at least one bookable slot (green in the picker)
//   full      = the business WOULD have worked that day but every slot
//               is taken — still clickable so customers can join the
//               waitlist from inside the day.
// Dates that are in neither list are closed (weekday off / full-day
// time-off) and the picker greys them out like past dates.
router.get("/public/:businessSlug/available-dates", async (req, res): Promise<void> => {
  const { businessSlug } = req.params;
  const serviceId = Number(req.query.serviceId);
  if (!serviceId || isNaN(serviceId)) { res.status(400).json({ error: "serviceId נדרש" }); return; }

  const [business] = await db.select().from(businessesTable).where(eq(businessesTable.slug, businessSlug));
  if (!business) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  const [service] = await db.select().from(servicesTable).where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, business.id)));
  if (!service) { res.status(404).json({ error: "שירות לא נמצא" }); return; }

  const bufferMinutes = service.bufferMinutes > 0 ? service.bufferMinutes : (business.bufferMinutes ?? 0);
  const minLeadHours: number = (business as any).minLeadHours ?? 0;
  const minAllowedNS = new Date(Date.now() + minLeadHours * 60 * 60 * 1000);

  // Booking window: respect futureBookingMode (weeks vs date). Default 15 weeks.
  const today = new Date();
  const mode = (business as any).futureBookingMode ?? "weeks";
  const weeks = (business as any).maxFutureWeeks ?? 15;
  const maxDateStr = (business as any).maxFutureDate as string | null;
  const horizon = new Date(today);
  if (mode === "date" && maxDateStr) {
    const [y, m, d] = maxDateStr.split("-").map(Number);
    if (y && m && d) horizon.setFullYear(y, m - 1, d);
    else horizon.setDate(today.getDate() + weeks * 7);
  } else {
    horizon.setDate(today.getDate() + weeks * 7);
  }
  const totalDays = Math.max(1, Math.ceil((horizon.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
  const cappedDays = Math.min(totalDays, 180); // safety cap — one slot-compute per day

  const available: string[] = [];
  const full: string[] = [];
  for (let off = 0; off < cappedDays; off++) {
    const d = new Date(today);
    d.setDate(today.getDate() + off);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const slots = await computeAvailableSlots(business.id, dateStr, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay);
    if (slots.length === 0) continue; // closed weekday or full-day time-off
    const hasFree = slots.some(s => s.available && israelTimeToUTC(dateStr, s.time) >= minAllowedNS);
    if (hasFree) available.push(dateStr);
    else full.push(dateStr); // would have been a workday but everything's booked
  }

  res.json({ available, full });
});

export default router;
