import { Router } from "express";
import { db, businessesTable, servicesTable, appointmentsTable, waitlistTable } from "@workspace/db";
import { eq, and, gte, sql, countDistinct } from "drizzle-orm";
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
import { sendOtp, verifyOtp, notifyBusinessOwner } from "../lib/whatsapp";
import { isPhoneVerified, consumeVerification, markPhoneVerified } from "../lib/otpStore";

const router = Router();

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

  res.json(services.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
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
  const slots = await computeAvailableSlots(business.id, date, service.durationMinutes, bufferMinutes);
  const availableSlots = slots.filter((s) => s.available).map((s) => s.time);
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
  res.json({ success: true });
});

router.post("/public/:businessSlug/appointments", async (req, res): Promise<void> => {
  const paramsParsed = CreatePublicAppointmentParams.safeParse(req.params);
  const bodyParsed = CreatePublicAppointmentBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { businessSlug } = paramsParsed.data;
  const { serviceId, clientName, phoneNumber, appointmentDate, appointmentTime, notes } = bodyParsed.data;

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(and(eq(businessesTable.slug, businessSlug), eq(businessesTable.isActive, true)));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  // Enforce phone OTP verification only if the business requires it
  if (business.requirePhoneVerification && !isPhoneVerified(phoneNumber)) {
    res.status(403).json({ error: "phone_not_verified", message: "יש לאמת את מספר הטלפון תחילה" });
    return;
  }

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
  const slots = await computeAvailableSlots(business.id, appointmentDate, service.durationMinutes, bufferMinutes);
  const slot = slots.find((s) => s.time === appointmentTime);
  if (!slot || !slot.available) {
    res.status(409).json({ error: "This time slot is no longer available" });
    return;
  }

  const appointmentStatus = business.requireAppointmentApproval ? "pending" : "confirmed";

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

  // Notify business owner via WhatsApp (non-blocking)
  if (business.phone) {
    const [, month, day] = appointmentDate.split("-");
    const formattedDate = `${day}/${month}`;
    notifyBusinessOwner(business.phone, clientName, appointmentTime, formattedDate, service.name).catch(() => {});
  }

  res.status(201).json({ ...appointment, createdAt: appointment.createdAt.toISOString() });
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

export default router;
