import { Router } from "express";
import { logBusinessNotification } from "./notifications";
import { db, businessesTable, servicesTable, appointmentsTable, waitlistTable, workingHoursTable, clientSessionsTable } from "@workspace/db";
import { eq, and, gte, sql, countDistinct, count, ilike, or, gt } from "drizzle-orm";
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
import { sendOtp, verifyOtp, notifyBusinessOwner, sendClientConfirmation, sendClientCancellation, sendTemplate } from "../lib/whatsapp";
import { isPhoneVerified, consumeVerification, markPhoneVerified } from "../lib/otpStore";
import { signPhoneVerificationToken, verifyPhoneVerificationToken } from "../lib/phoneVerificationJwt";

const router = Router();

// Israel is UTC+3 in summer (Apr–Oct) and UTC+2 in winter
function israelTimeToUTC(dateStr: string, timeStr: string): Date {
  const month = parseInt(dateStr.split("-")[1], 10);
  const offset = (month >= 4 && month <= 10) ? 3 : 2;
  return new Date(`${dateStr}T${timeStr}:00+0${offset}:00`);
}

// GET /public/directory — must be before /:businessSlug to avoid slug capture
router.get("/public/directory", async (req, res): Promise<void> => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const city = typeof req.query.city === "string" ? req.query.city : undefined;

  const rows = await db
    .select({
      slug: businessesTable.slug,
      name: businessesTable.name,
      logoUrl: businessesTable.logoUrl,
      primaryColor: businessesTable.primaryColor,
      address: businessesTable.address,
      city: (businessesTable as any).city,
      businessCategories: (businessesTable as any).businessCategories,
      businessDescription: (businessesTable as any).businessDescription,
    })
    .from(businessesTable)
    .where(eq(businessesTable.isActive, true));

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
    .orderBy(servicesTable.createdAt);

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
  const slots = await computeAvailableSlots(business.id, date, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay);

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
    await sendOtp(phone);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? "Failed to send OTP" });
  }
});

// POST /public/:businessSlug/otp/verify
router.post("/public/:businessSlug/otp/verify", async (req, res): Promise<void> => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) {
    res.status(400).json({ error: "Missing phone or code" });
    return;
  }
  const ok = await verifyOtp(phone, String(code));
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
      if (session?.phoneNumber && session.phoneNumber.trim() === phoneNumber.trim()) {
        verifiedByClientSession = true;
      }
    }

    if (!verifiedByMemory && !verifiedByToken && !verifiedByClientSession) {
      res.status(403).json({ error: "phone_not_verified", message: "יש לאמת את מספר הטלפון תחילה" });
      return;
    }
  }

  // ── Booking restrictions ──────────────────────────────────────────────────

  // 1. Min lead time: appointment must be at least minLeadHours from now
  if (business.minLeadHours > 0) {
    const apptDateTime = new Date(`${appointmentDate}T${appointmentTime}:00`);
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
  const slots = await computeAvailableSlots(business.id, appointmentDate, service.durationMinutes, bufferMinutes, business.maxAppointmentsPerDay);
  const slot = slots.find((s) => s.time === appointmentTime);
  if (!slot || !slot.available) {
    res.status(409).json({ error: "This time slot is no longer available" });
    return;
  }

  const tranzilaEnabled = (business as any).tranzilaEnabled ?? false;
  const depositAmountAgorot = (business as any).depositAmountAgorot ?? null;
  const requiresPayment = tranzilaEnabled && depositAmountAgorot && depositAmountAgorot > 0;
  const appointmentStatus = requiresPayment ? "pending_payment" : business.requireAppointmentApproval ? "pending" : "confirmed";

  const [appointment] = await db
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

  // Notify business owner via WhatsApp (non-blocking)
  if (business.phone) {
    notifyBusinessOwner(business.phone, clientName, business.name, service.name, formattedDate, appointmentTime, business.slug)
      .catch((e: any) => console.error("[WhatsApp] notifyBusinessOwner failed:", e?.response?.data ?? e?.message));
  }

  // Send confirmation to client only if business enabled it and appointment is immediately confirmed (non-blocking)
  if (appointmentStatus === "confirmed" && (business as any).sendBookingConfirmation !== false) {
    // Check if client has opted out of notifications
    const [clientPref] = await db
      .select({ receiveNotifications: clientSessionsTable.receiveNotifications })
      .from(clientSessionsTable)
      .where(eq(clientSessionsTable.phoneNumber, phoneNumber))
      .limit(1);
    if (!clientPref || clientPref.receiveNotifications !== false) {
      sendClientConfirmation(phoneNumber, clientName, business.name, service.name, formattedDate, appointmentTime, business.slug)
        .catch((e: any) => console.error("[WhatsApp] sendClientConfirmation failed:", e?.response?.data ?? e?.message));
    }
  }

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

  res.status(201).json({ success: true, message: "Added to waitlist" });
});

// POST /public/:businessSlug/appointments/:id/cancel — client cancels their own appointment
// Requires phoneNumber in body to verify ownership
router.post("/public/:businessSlug/appointments/:id/cancel", async (req, res): Promise<void> => {
  const { businessSlug, id } = req.params;
  const { phoneNumber } = req.body ?? {};

  if (!phoneNumber) { res.status(400).json({ error: "phoneNumber required" }); return; }

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
      eq(appointmentsTable.id, parseInt(id)),
      eq(businessesTable.slug, businessSlug),
      eq(appointmentsTable.phoneNumber, phoneNumber),
    ));

  if (!appt) { res.status(404).json({ error: "תור לא נמצא" }); return; }
  if (appt.status === "cancelled") { res.status(400).json({ error: "התור כבר בוטל" }); return; }

  // Check cancellation hours policy
  const [business] = await db
    .select({ cancellationHours: businessesTable.cancellationHours, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, appt.businessId));

  if (business?.cancellationHours) {
    const apptTime = new Date(`${appt.appointmentDate}T${appt.appointmentTime}:00`);
    const hoursUntil = (apptTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < (business.cancellationHours ?? 0)) {
      res.status(400).json({ error: "cancellation_too_late", message: `לא ניתן לבטל פחות מ-${business.cancellationHours} שעות לפני התור` });
      return;
    }
  }

  await db.update(appointmentsTable).set({ status: "cancelled" }).where(eq(appointmentsTable.id, appt.id));

  // Notify client of cancellation via WhatsApp (non-blocking)
  const [, cancelMonth, cancelDay] = appt.appointmentDate.split("-");
  const cancelFormattedDate = `${cancelDay}/${cancelMonth}`;
  sendClientCancellation(appt.phoneNumber, appt.clientName, business?.name ?? "העסק", cancelFormattedDate, appt.appointmentTime)
    .catch((e: any) => console.error("[WhatsApp] sendClientCancellation failed:", e?.response?.data ?? e?.message));

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
      eq(appointmentsTable.id, parseInt(id)),
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

export default router;
