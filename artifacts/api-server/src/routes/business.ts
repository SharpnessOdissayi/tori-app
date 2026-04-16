import { Router } from "express";
import { logBusinessNotification, logClientNotification } from "./notifications";
import { db, businessesTable, servicesTable, workingHoursTable, breakTimesTable, appointmentsTable, waitlistTable, timeOffTable } from "@workspace/db";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { sendClientCancellation, sendClientReschedule, sendClientConfirmation, sendWhatsApp } from "../lib/whatsapp";
import { isBusinessPro } from "../lib/plan";
import {
  UpdateBusinessProfileBody,
  CreateBusinessServiceBody,
  UpdateBusinessServiceBody,
  UpdateBusinessServiceParams,
  DeleteBusinessServiceParams,
  SetWorkingHoursBody,
  SetBreakTimesBody,
  CancelBusinessAppointmentParams,
  UpdateBusinessBrandingBody,
  UpdateBusinessIntegrationsBody,
  RemoveFromWaitlistParams,
} from "@workspace/api-zod";
import { requireBusinessAuth } from "../middlewares/business-auth";

const router = Router();

function parseCreateTimeOffBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const { date, startTime, endTime, fullDay, note } = raw;
  if (typeof date !== "string") return { success: false as const };
  if (startTime !== undefined && startTime !== null && typeof startTime !== "string") return { success: false as const };
  if (endTime !== undefined && endTime !== null && typeof endTime !== "string") return { success: false as const };
  if (fullDay !== undefined && typeof fullDay !== "boolean") return { success: false as const };
  if (note !== undefined && typeof note !== "string") return { success: false as const };
  return { success: true as const, data: { date, startTime, endTime, fullDay, note } };
}

function mapBusiness(b: typeof businessesTable.$inferSelect) {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    ownerName: b.ownerName,
    email: b.email,
    bufferMinutes: b.bufferMinutes,
    notificationEnabled: b.notificationEnabled,
    notificationMessage: b.notificationMessage ?? null,
    primaryColor: b.primaryColor ?? null,
    fontFamily: b.fontFamily ?? null,
    logoUrl: b.logoUrl ?? null,
    bannerUrl: b.bannerUrl ?? null,
    themeMode: b.themeMode ?? null,
    borderRadius: b.borderRadius ?? null,
    welcomeText: b.welcomeText ?? null,
    backgroundColor: b.backgroundColor ?? null,
    whatsappApiKey: b.whatsappApiKey ?? null,
    whatsappPhoneId: b.whatsappPhoneId ?? null,
    googleCalendarEnabled: b.googleCalendarEnabled,
    stripeEnabled: b.stripeEnabled,
    stripePublicKey: b.stripePublicKey ?? null,
    greenApiInstanceId: b.greenApiInstanceId ?? null,
    greenApiToken: b.greenApiToken ?? null,
    requirePhoneVerification: b.requirePhoneVerification,
    phone: b.phone ?? null,
    subscriptionPlan: b.subscriptionPlan,
    maxServicesAllowed: b.maxServicesAllowed,
    maxAppointmentsPerMonth: b.maxAppointmentsPerMonth,
    requireAppointmentApproval: b.requireAppointmentApproval,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
    // Booking restrictions
    minLeadHours: b.minLeadHours,
    cancellationHours: b.cancellationHours,
    maxFutureWeeks: b.maxFutureWeeks,
    futureBookingMode: b.futureBookingMode,
    maxFutureDate: b.maxFutureDate ?? null,
    maxAppointmentsPerCustomer: b.maxAppointmentsPerCustomer ?? null,
    requireActiveSubscription: b.requireActiveSubscription,
    maxAppointmentsPerDay: b.maxAppointmentsPerDay ?? null,
    // Reminders
    buttonRadius: b.buttonRadius ?? null,
    sendBookingConfirmation: b.sendBookingConfirmation ?? true,
    sendReminders: b.sendReminders,
    requireArrivalConfirmation: b.requireArrivalConfirmation,
    sendWhatsAppReminders: b.sendWhatsAppReminders,
    reminderTriggers: b.reminderTriggers ?? null,
    reminderCustomText: b.reminderCustomText ?? null,
    shabbatMode: b.shabbatMode,
    reminderSendTime: b.reminderSendTime,
    // Header display controls
    showBusinessName: b.showBusinessName,
    showLogo: b.showLogo,
    showBanner: b.showBanner,
    headerLayout: b.headerLayout,
    // Profile landing page
    websiteUrl: (b as any).websiteUrl ?? null,
    instagramUrl: (b as any).instagramUrl ?? null,
    wazeUrl: (b as any).wazeUrl ?? null,
    businessDescription: (b as any).businessDescription ?? null,
    galleryImages: (b as any).galleryImages ?? null,
    bannerPosition: (b as any).bannerPosition ?? "center",
    contactPhone: (b as any).contactPhone ?? null,
    address: (b as any).address ?? null,
    city: (b as any).city ?? null,
    businessCategories: (b as any).businessCategories ?? null,
    announcementText: (b as any).announcementText ?? null,
    announcementValidHours: (b as any).announcementValidHours ?? 24,
    announcementCreatedAt: (b as any).announcementCreatedAt ? (b as any).announcementCreatedAt.toISOString() : null,
    // Tranzila
    tranzilaEnabled: (b as any).tranzilaEnabled ?? false,
    depositAmountAgorot: (b as any).depositAmountAgorot ?? null,
    // Subscription timing
    subscriptionRenewDate: (b as any).subscriptionRenewDate ? (b as any).subscriptionRenewDate.toISOString() : null,
    subscriptionCancelledAt: (b as any).subscriptionCancelledAt ? (b as any).subscriptionCancelledAt.toISOString() : null,
    // Stored card token presence (boolean only — never leak the token itself)
    hasTranzilaToken: !!((b as any).tranzilaToken),
    // Custom domain for white-label booking page
    customDomain:         (b as any).customDomain         ?? null,
    customDomainVerified: (b as any).customDomainVerified ?? false,
  };
}

router.get("/business/profile", requireBusinessAuth, async (req, res): Promise<void> => {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json(mapBusiness(business));
});

router.patch("/business/profile", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = UpdateBusinessProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.ownerName !== undefined) updates.ownerName = parsed.data.ownerName;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? undefined;
  if ((parsed.data as any).email !== undefined && (parsed.data as any).email) {
    const newEmail = (parsed.data as any).email as string;
    const [existing] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.email, newEmail));
    if (existing && existing.id !== req.business!.businessId) {
      res.status(409).json({ error: "אימייל זה כבר בשימוש" });
      return;
    }
    updates.email = newEmail;
  }
  if (parsed.data.bufferMinutes !== undefined) updates.bufferMinutes = parsed.data.bufferMinutes;
  if (parsed.data.notificationEnabled !== undefined) updates.notificationEnabled = parsed.data.notificationEnabled;
  if (parsed.data.notificationMessage !== undefined) updates.notificationMessage = parsed.data.notificationMessage ?? undefined;
  if (parsed.data.requireAppointmentApproval !== undefined) updates.requireAppointmentApproval = parsed.data.requireAppointmentApproval;
  if ((parsed.data as any).requirePhoneVerification !== undefined) updates.requirePhoneVerification = (parsed.data as any).requirePhoneVerification;
  // Booking restrictions
  const d = parsed.data as any;
  if (d.minLeadHours !== undefined) updates.minLeadHours = d.minLeadHours ?? 0;
  if (d.cancellationHours !== undefined) updates.cancellationHours = d.cancellationHours ?? 0;
  if (d.maxFutureWeeks !== undefined) updates.maxFutureWeeks = d.maxFutureWeeks ?? 15;
  if (d.futureBookingMode !== undefined) updates.futureBookingMode = d.futureBookingMode ?? "weeks";
  if (d.maxFutureDate !== undefined) updates.maxFutureDate = d.maxFutureDate ?? undefined;
  if (d.maxAppointmentsPerCustomer !== undefined) updates.maxAppointmentsPerCustomer = d.maxAppointmentsPerCustomer ?? undefined;
  if (d.requireActiveSubscription !== undefined) updates.requireActiveSubscription = d.requireActiveSubscription ?? false;
  if (d.maxAppointmentsPerDay !== undefined) updates.maxAppointmentsPerDay = d.maxAppointmentsPerDay ?? undefined;
  // Reminders
  if (d.buttonRadius !== undefined) updates.buttonRadius = d.buttonRadius ?? undefined;
  if (d.sendBookingConfirmation !== undefined) updates.sendBookingConfirmation = d.sendBookingConfirmation ?? true;
  if (d.sendReminders !== undefined) updates.sendReminders = d.sendReminders ?? true;
  if (d.requireArrivalConfirmation !== undefined) updates.requireArrivalConfirmation = d.requireArrivalConfirmation ?? false;
  if (d.sendWhatsAppReminders !== undefined) updates.sendWhatsAppReminders = d.sendWhatsAppReminders ?? true;
  if (d.reminderTriggers !== undefined) updates.reminderTriggers = d.reminderTriggers ?? undefined;
  if (d.reminderCustomText !== undefined) updates.reminderCustomText = d.reminderCustomText ?? undefined;
  if (d.shabbatMode !== undefined) updates.shabbatMode = d.shabbatMode ?? "any";
  if (d.reminderSendTime !== undefined) updates.reminderSendTime = d.reminderSendTime ?? "20:00";
  // Tranzila
  if (d.tranzilaEnabled !== undefined) (updates as any).tranzilaEnabled = d.tranzilaEnabled;
  if (d.depositAmountAgorot !== undefined) (updates as any).depositAmountAgorot = d.depositAmountAgorot ?? null;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  res.json(mapBusiness(updated));
});

router.patch("/business/branding", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = UpdateBusinessBrandingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.primaryColor !== undefined) updates.primaryColor = parsed.data.primaryColor ?? undefined;
  if (parsed.data.fontFamily !== undefined) updates.fontFamily = parsed.data.fontFamily ?? undefined;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl ?? undefined;
  if (parsed.data.bannerUrl !== undefined) updates.bannerUrl = parsed.data.bannerUrl ?? undefined;
  if (parsed.data.themeMode !== undefined) updates.themeMode = parsed.data.themeMode ?? undefined;
  if (parsed.data.borderRadius !== undefined) updates.borderRadius = parsed.data.borderRadius ?? undefined;
  if (parsed.data.buttonRadius !== undefined) updates.buttonRadius = parsed.data.buttonRadius ?? undefined;
  if (parsed.data.welcomeText !== undefined) updates.welcomeText = parsed.data.welcomeText ?? undefined;
  if (parsed.data.backgroundColor !== undefined) updates.backgroundColor = parsed.data.backgroundColor ?? undefined;
  if (parsed.data.showBusinessName !== undefined) updates.showBusinessName = parsed.data.showBusinessName;
  if (parsed.data.showLogo !== undefined) updates.showLogo = parsed.data.showLogo;
  if (parsed.data.showBanner !== undefined) updates.showBanner = parsed.data.showBanner;
  if (parsed.data.headerLayout !== undefined) updates.headerLayout = parsed.data.headerLayout;
  // Profile landing page fields
  const bd = parsed.data as any;
  if (bd.websiteUrl !== undefined) (updates as any).websiteUrl = bd.websiteUrl ?? null;
  if (bd.instagramUrl !== undefined) (updates as any).instagramUrl = bd.instagramUrl ?? null;
  if (bd.wazeUrl !== undefined) (updates as any).wazeUrl = bd.wazeUrl ?? null;
  if (bd.businessDescription !== undefined) (updates as any).businessDescription = bd.businessDescription ?? null;
  if (bd.galleryImages !== undefined) (updates as any).galleryImages = bd.galleryImages ?? null;
  if (bd.bannerPosition !== undefined) (updates as any).bannerPosition = bd.bannerPosition ?? "center";
  if (bd.contactPhone !== undefined) (updates as any).contactPhone = bd.contactPhone ?? null;
  if (bd.address !== undefined) (updates as any).address = bd.address ?? null;
  if (bd.city !== undefined) (updates as any).city = bd.city ?? null;
  if (bd.businessCategories !== undefined) (updates as any).businessCategories = bd.businessCategories ?? null;
  if ((bd as any).announcementText !== undefined) {
    (updates as any).announcementText = (bd as any).announcementText || null;
    if ((bd as any).announcementText) (updates as any).announcementCreatedAt = new Date();
    else (updates as any).announcementCreatedAt = null;
  }
  if ((bd as any).announcementValidHours !== undefined) (updates as any).announcementValidHours = Number((bd as any).announcementValidHours) || 24;
  // Advanced design fields (preset + fine-grain)
  if (bd.designPreset !== undefined) (updates as any).designPreset = bd.designPreset ?? null;
  if (bd.accentColor !== undefined) (updates as any).accentColor = bd.accentColor ?? null;
  if (bd.gradientEnabled !== undefined) (updates as any).gradientEnabled = !!bd.gradientEnabled;
  if (bd.gradientFrom !== undefined) (updates as any).gradientFrom = bd.gradientFrom ?? null;
  if (bd.gradientTo !== undefined) (updates as any).gradientTo = bd.gradientTo ?? null;
  if (bd.gradientAngle !== undefined) (updates as any).gradientAngle = Number(bd.gradientAngle) || 135;
  if (bd.backgroundPattern !== undefined) (updates as any).backgroundPattern = bd.backgroundPattern ?? null;
  if (bd.heroLayout !== undefined) (updates as any).heroLayout = bd.heroLayout ?? null;
  if (bd.serviceCardStyle !== undefined) (updates as any).serviceCardStyle = bd.serviceCardStyle ?? null;
  if (bd.animationStyle !== undefined) (updates as any).animationStyle = bd.animationStyle ?? null;
  if (bd.hoverEffect !== undefined) (updates as any).hoverEffect = bd.hoverEffect ?? null;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  res.json(mapBusiness(updated));
});

// ─── Custom domain (Pro-only) ──────────────────────────────────────────────
//
// PATCH /api/business/domain — set/clear the business's custom hostname.
// Accepts { domain: string | null }. When `null`, clears the domain (also
// removes it from Railway). When a string, validates shape, stores it
// lowercased, and registers it with Railway's custom-domains API. The
// `verified` flag flips to true later once the domainPoller cron job
// confirms Railway finished DNS verification + SSL provisioning.

router.patch("/business/domain", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const [biz] = await db
    .select({
      subscriptionPlan: businessesTable.subscriptionPlan,
      currentDomain:    (businessesTable as any).customDomain,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (biz.subscriptionPlan !== "pro") {
    res.status(403).json({ error: "pro_only", message: "פיצ'ר זה זמין רק במנוי פרו" });
    return;
  }

  const raw = (req.body ?? {}).domain;
  let domain: string | null;
  if (raw == null || raw === "") {
    domain = null;
  } else if (typeof raw !== "string") {
    res.status(400).json({ error: "Invalid domain" });
    return;
  } else {
    // Strip protocol + trailing slash if the owner pasted a full URL.
    const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    // Basic hostname validation: label.label[.label...] with letters/digits/hyphens.
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleaned)) {
      res.status(400).json({ error: "invalid_domain_format", message: "דומיין לא תקין — דוגמה תקינה: book.yoursalon.co.il" });
      return;
    }
    // Block obvious self-references.
    if (cleaned === "kavati.net" || cleaned.endsWith(".kavati.net")) {
      res.status(400).json({ error: "reserved_domain", message: "לא ניתן להשתמש בדומיין של קבעתי" });
      return;
    }
    domain = cleaned;
  }

  // Uniqueness across businesses (case-insensitive).
  if (domain) {
    const [existing] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(sql`lower(${(businessesTable as any).customDomain})`, domain));
    if (existing && existing.id !== businessId) {
      res.status(409).json({ error: "domain_taken", message: "הדומיין כבר רשום לעסק אחר" });
      return;
    }
  }

  const [updated] = await db
    .update(businessesTable)
    .set({
      customDomain:         domain,
      customDomainVerified: false,   // every change resets verification
    } as any)
    .where(eq(businessesTable.id, businessId))
    .returning();

  // Railway-side update — fire-and-forget so the HTTP response doesn't wait
  // on Railway's network. If it fails the domainPoller will retry.
  const previous = (biz.currentDomain as string | null) ?? null;
  (async () => {
    const { addCustomDomain, removeCustomDomain } = await import("../lib/railwayApi");
    if (previous && previous !== domain) {
      await removeCustomDomain(previous).catch(() => {});
    }
    if (domain) {
      const result = await addCustomDomain(domain);
      if (!result.ok) {
        console.warn(`[domain] Railway add failed for "${domain}": ${result.error}`);
      } else {
        console.log(`[domain] Registered "${domain}" on Railway (id=${result.id ?? "n/a"})`);
      }
    }
  })().catch(err => console.error("[domain] Railway sync error:", err));

  res.json(mapBusiness(updated));
});

router.patch("/business/integrations", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = UpdateBusinessIntegrationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.whatsappApiKey !== undefined) updates.whatsappApiKey = parsed.data.whatsappApiKey ?? undefined;
  if (parsed.data.whatsappPhoneId !== undefined) updates.whatsappPhoneId = parsed.data.whatsappPhoneId ?? undefined;
  if (parsed.data.googleCalendarEnabled !== undefined) updates.googleCalendarEnabled = parsed.data.googleCalendarEnabled;
  if (parsed.data.stripeEnabled !== undefined) updates.stripeEnabled = parsed.data.stripeEnabled;
  if (parsed.data.stripePublicKey !== undefined) updates.stripePublicKey = parsed.data.stripePublicKey ?? undefined;
  if (parsed.data.greenApiInstanceId !== undefined) updates.greenApiInstanceId = parsed.data.greenApiInstanceId ?? undefined;
  if (parsed.data.greenApiToken !== undefined) updates.greenApiToken = parsed.data.greenApiToken ?? undefined;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  res.json(mapBusiness(updated));
});

router.get("/business/services", requireBusinessAuth, async (req, res): Promise<void> => {
  const services = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.businessId, req.business!.businessId))
    .orderBy(servicesTable.createdAt);

  res.json(services.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/business/services", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = CreateBusinessServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [business] = await db
    .select({ subscriptionPlan: businessesTable.subscriptionPlan, maxServicesAllowed: businessesTable.maxServicesAllowed })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  const FREE_SERVICE_LIMIT = 3;
  const serviceLimit = business?.subscriptionPlan === "free" ? FREE_SERVICE_LIMIT : (business?.maxServicesAllowed ?? 99);

  const [{ serviceCount }] = await db
    .select({ serviceCount: count() })
    .from(servicesTable)
    .where(and(eq(servicesTable.businessId, req.business!.businessId), eq(servicesTable.isActive, true)));

  if (serviceCount >= serviceLimit) {
    res.status(402).json({
      error: "service_limit_reached",
      message: `המנוי החינמי מאפשר עד ${FREE_SERVICE_LIMIT} שירותים. שדרג למנוי פרו כדי להוסיף יותר שירותים.`,
      limit: serviceLimit,
      current: serviceCount,
    });
    return;
  }

  const serviceData: any = { ...parsed.data, businessId: req.business!.businessId };
  const [service] = await db
    .insert(servicesTable)
    .values(serviceData)
    .returning();

  res.status(201).json({ ...service, createdAt: service.createdAt.toISOString() });
});

router.patch("/business/services/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = UpdateBusinessServiceParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateBusinessServiceBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [service] = await db
    .update(servicesTable)
    .set(bodyParsed.data as any)
    .where(and(eq(servicesTable.id, paramsParsed.data.id), eq(servicesTable.businessId, req.business!.businessId)))
    .returning();

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json({ ...service, createdAt: service.createdAt.toISOString() });
});

router.delete("/business/services/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = DeleteBusinessServiceParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(servicesTable)
    .where(and(eq(servicesTable.id, paramsParsed.data.id), eq(servicesTable.businessId, req.business!.businessId)))
    .returning({ id: servicesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json({ success: true, message: "Service deleted" });
});

router.get("/business/working-hours", requireBusinessAuth, async (req, res): Promise<void> => {
  const hours = await db
    .select()
    .from(workingHoursTable)
    .where(eq(workingHoursTable.businessId, req.business!.businessId))
    .orderBy(workingHoursTable.dayOfWeek);

  res.json(hours.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
});

router.put("/business/working-hours", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = SetWorkingHoursBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const businessId = req.business!.businessId;
  await db.delete(workingHoursTable).where(eq(workingHoursTable.businessId, businessId));
  const inserted = await db
    .insert(workingHoursTable)
    .values(parsed.data.hours.map((h) => ({ ...h, businessId })))
    .returning();

  res.json(inserted.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
});

router.get("/business/break-times", requireBusinessAuth, async (req, res): Promise<void> => {
  const breaks = await db
    .select()
    .from(breakTimesTable)
    .where(eq(breakTimesTable.businessId, req.business!.businessId))
    .orderBy(breakTimesTable.dayOfWeek);

  res.json(breaks.map((b) => ({ id: b.id, businessId: b.businessId, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, label: b.label ?? null })));
});

router.put("/business/break-times", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = SetBreakTimesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const businessId = req.business!.businessId;
  await db.delete(breakTimesTable).where(eq(breakTimesTable.businessId, businessId));

  if (parsed.data.breaks.length === 0) {
    res.json([]);
    return;
  }

  const inserted = await db
    .insert(breakTimesTable)
    .values(parsed.data.breaks.map((b) => ({ ...b, businessId, label: b.label ?? undefined })))
    .returning();

  res.json(inserted.map((b) => ({ id: b.id, businessId: b.businessId, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, label: b.label ?? null })));
});

router.get("/business/appointments", requireBusinessAuth, async (req, res): Promise<void> => {
  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, req.business!.businessId))
    .orderBy(appointmentsTable.appointmentDate, appointmentsTable.appointmentTime);

  res.json(appointments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

router.patch("/business/appointments/:id/approve", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: "confirmed" })
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  // Send confirmation to client now that business owner approved
  const [business] = await db
    .select({ name: businessesTable.name, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  if (business) {
    const [, month, day] = updated.appointmentDate.split("-");
    const formattedDate = `${day}/${month}`;
    if (await isBusinessPro(req.business!.businessId)) {
      sendClientConfirmation(updated.phoneNumber, updated.clientName, business.name, updated.serviceName, formattedDate, updated.appointmentTime, business.slug).catch(() => {});
    }
  }

  res.json({ success: true, message: "Appointment approved" });
});

router.patch("/business/appointments/:id/reschedule", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { newDate, newTime } = req.body ?? {};
  if (!newDate || !newTime) {
    res.status(400).json({ error: "newDate and newTime are required" });
    return;
  }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
    })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ appointmentDate: newDate, appointmentTime: newTime, reminder24hSent: false, reminder1hSent: false, reminderMorningSent: false })
    .where(eq(appointmentsTable.id, appt.id))
    .returning();

  // Notify client via WhatsApp (non-blocking) — Pro only
  const [, month, day] = newDate.split("-");
  const formattedDate = `${day}/${month}`;
  if (await isBusinessPro(req.business!.businessId)) {
    sendClientReschedule(appt.phoneNumber, appt.clientName, formattedDate, newTime).catch(() => {});
  }

  // Log notification for business + client
  logBusinessNotification({
    businessId: req.business!.businessId,
    type: "reschedule",
    appointmentId: appt.id,
    message: `שינית תור של ${appt.clientName} ל-${formattedDate} בשעה ${newTime}`,
    actorType: "business",
    actorName: req.business!.businessName,
  });
  logClientNotification({
    phoneNumber: appt.phoneNumber,
    type: "reschedule",
    appointmentId: appt.id,
    businessName: req.business!.businessName,
    message: `התור שלך שונה ל-${formattedDate} בשעה ${newTime}`,
  });

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/business/appointments/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = CancelBusinessAppointmentParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Fetch appointment data before cancelling (needed for notification)
  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
    })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, paramsParsed.data.id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const cancelReason = (req.body?.cancelReason as string | undefined) || null;

  await db
    .update(appointmentsTable)
    .set({ status: "cancelled", ...(({ cancelledBy: "business", cancelReason }) as any) })
    .where(eq(appointmentsTable.id, appt.id));

  // Notify client via WhatsApp (non-blocking) — Pro only
  const [, month, day] = appt.appointmentDate.split("-");
  const formattedDate = `${day}/${month}`;
  if (await isBusinessPro(req.business!.businessId)) {
    sendClientCancellation(appt.phoneNumber, appt.clientName, req.business!.businessName, formattedDate, appt.appointmentTime).catch(() => {});
  }

  // Log notification for client
  logClientNotification({
    phoneNumber: appt.phoneNumber,
    type: "cancellation",
    appointmentId: appt.id,
    businessName: req.business!.businessName,
    message: `התור שלך ב-${formattedDate} בשעה ${appt.appointmentTime} בוטל על ידי העסק`,
  });

  res.json({ success: true, message: "Appointment cancelled" });
});

// Hard-delete a cancelled appointment (permanent)
router.delete("/business/appointments/:id/permanent", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [appt] = await db
    .select({ id: appointmentsTable.id, status: appointmentsTable.status })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appt.status !== "cancelled") { res.status(400).json({ error: "ניתן למחוק רק תורים מבוטלים" }); return; }

  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.json({ success: true });
});

// Appointments by phone (for analytics drilldown)
router.get("/business/appointments/by-phone", requireBusinessAuth, async (req, res): Promise<void> => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : null;
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }

  const appts = await db
    .select({
      id: appointmentsTable.id,
      serviceName: appointmentsTable.serviceName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      status: appointmentsTable.status,
      cancelledBy: sql<string>`appointments.cancelled_by`,
      cancelReason: sql<string>`appointments.cancel_reason`,
    })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, req.business!.businessId),
      eq(appointmentsTable.phoneNumber, phone),
      eq(appointmentsTable.status, "cancelled")
    ))
    .orderBy(appointmentsTable.appointmentDate);

  res.json(appts);
});

router.get("/business/stats", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const todayStr = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  const all = await db
    .select({ appointmentDate: appointmentsTable.appointmentDate, status: appointmentsTable.status })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, businessId));

  const active = all.filter(a => a.status !== "cancelled" && a.status !== "pending_payment");
  const totalAppointments = active.length;
  const todayCount = active.filter((a) => a.appointmentDate === todayStr).length;
  const thisWeekCount = active.filter((a) => a.appointmentDate >= todayStr && a.appointmentDate < nextWeekStr).length;
  const upcomingCount = active.filter((a) => a.appointmentDate >= todayStr).length;

  res.json({ totalAppointments, todayCount, thisWeekCount, upcomingCount });
});

router.get("/business/customers", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const appointments = await db
    .select({
      clientName: appointmentsTable.clientName,
      phoneNumber: appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
      status: appointmentsTable.status,
      price: sql<number>`COALESCE(${servicesTable.price}, 0)`.as("price"),
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(eq(appointmentsTable.businessId, businessId))
    .orderBy(appointmentsTable.appointmentDate);

  const customerMap = new Map<string, {
    clientName: string;
    phoneNumber: string;
    totalVisits: number;
    totalRevenue: number;
    lastVisitDate: string;
    firstVisitDate: string;
  }>();

  for (const a of appointments) {
    // Skip cancelled / unpaid appointments from visit counts
    if (a.status === "cancelled" || a.status === "pending_payment") continue;
    const key = a.phoneNumber;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        clientName: a.clientName,
        phoneNumber: a.phoneNumber,
        totalVisits: 0,
        totalRevenue: 0,
        firstVisitDate: a.appointmentDate,
        lastVisitDate: a.appointmentDate,
      });
    }
    const record = customerMap.get(key)!;
    record.totalVisits += 1;
    record.totalRevenue += Number(a.price) || 0;
    if (a.appointmentDate > record.lastVisitDate) record.lastVisitDate = a.appointmentDate;
    if (a.appointmentDate < record.firstVisitDate) record.firstVisitDate = a.appointmentDate;
  }

  res.json(Array.from(customerMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue));
});

// POST /business/broadcast — send WhatsApp message to all customers
// Monthly cap: 150 messages (~$10 at ~$0.06/msg)
const BROADCAST_MONTHLY_LIMIT = 150;

router.post("/business/broadcast", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const { message } = req.body ?? {};
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "הודעה נדרשת" }); return;
  }

  // Pro-only feature
  if (!(await isBusinessPro(businessId))) {
    res.status(402).json({ error: "pro_required", message: "שליחת הודעות WhatsApp זמינה רק במנוי פרו" });
    return;
  }

  // Check / reset monthly quota
  const [biz] = await db
    .select({ broadcastSentThisMonth: businessesTable.broadcastSentThisMonth, broadcastMonthKey: businessesTable.broadcastMonthKey })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const sentThisMonth = biz.broadcastMonthKey === currentMonth ? (biz.broadcastSentThisMonth ?? 0) : 0;

  if (sentThisMonth >= BROADCAST_MONTHLY_LIMIT) {
    res.status(429).json({
      error: "quota_exceeded",
      message: `הגעת למגבלת ההודעות החודשית (${BROADCAST_MONTHLY_LIMIT} הודעות). תוכל לשלוח שוב בחודש הבא.`,
      sent: sentThisMonth,
      limit: BROADCAST_MONTHLY_LIMIT,
    });
    return;
  }

  // Get unique phone numbers with at least one non-cancelled appointment
  const rows = await db
    .select({ phoneNumber: appointmentsTable.phoneNumber })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, businessId),
      sql`${appointmentsTable.status} != 'cancelled'`,
      sql`${appointmentsTable.status} != 'pending_payment'`
    ));

  const phones = [...new Set(rows.map(r => r.phoneNumber).filter(Boolean))];

  // Cap at remaining quota
  const remaining = BROADCAST_MONTHLY_LIMIT - sentThisMonth;
  const batch = phones.slice(0, remaining);

  let successCount = 0;
  let failCount = 0;

  for (const phone of batch) {
    try {
      await sendWhatsApp(phone, message.trim());
      successCount++;
    } catch {
      failCount++;
    }
  }

  // Update monthly counter
  await db
    .update(businessesTable)
    .set({
      broadcastSentThisMonth: sentThisMonth + successCount,
      broadcastMonthKey: currentMonth,
    })
    .where(eq(businessesTable.id, businessId));

  res.json({
    success: true,
    sent: successCount,
    failed: failCount,
    total: batch.length,
    remainingThisMonth: BROADCAST_MONTHLY_LIMIT - sentThisMonth - successCount,
  });
});

router.get("/business/broadcast/quota", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const [biz] = await db
    .select({ broadcastSentThisMonth: businessesTable.broadcastSentThisMonth, broadcastMonthKey: businessesTable.broadcastMonthKey })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const sent = biz.broadcastMonthKey === currentMonth ? (biz.broadcastSentThisMonth ?? 0) : 0;
  res.json({ sent, limit: BROADCAST_MONTHLY_LIMIT, remaining: BROADCAST_MONTHLY_LIMIT - sent });
});

router.get("/business/waitlist", requireBusinessAuth, async (req, res): Promise<void> => {
  const entries = await db
    .select()
    .from(waitlistTable)
    .where(eq(waitlistTable.businessId, req.business!.businessId))
    .orderBy(waitlistTable.createdAt);

  res.json(entries.map((e) => ({
    id: e.id,
    businessId: e.businessId,
    serviceId: e.serviceId ?? null,
    serviceName: e.serviceName ?? null,
    clientName: e.clientName,
    phoneNumber: e.phoneNumber,
    preferredDate: e.preferredDate ?? null,
    notes: e.notes ?? null,
    createdAt: e.createdAt.toISOString(),
  })));
});

router.delete("/business/waitlist/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = RemoveFromWaitlistParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(waitlistTable)
    .where(and(eq(waitlistTable.id, paramsParsed.data.id), eq(waitlistTable.businessId, req.business!.businessId)))
    .returning({ id: waitlistTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Waitlist entry not found" });
    return;
  }

  res.json({ success: true, message: "Removed from waitlist" });
});

// GET /business/time-off
router.get("/business/time-off", requireBusinessAuth, async (req, res): Promise<void> => {
  const items = await db.select().from(timeOffTable)
    .where(eq(timeOffTable.businessId, req.business!.businessId))
    .orderBy(timeOffTable.date);
  res.json(items.map(t => ({ id: t.id, date: t.date, startTime: t.startTime ?? null, endTime: t.endTime ?? null, fullDay: t.fullDay, note: t.note ?? null })));
});

// POST /business/time-off
router.post("/business/time-off", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = parseCreateTimeOffBody(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }
  const [item] = await db.insert(timeOffTable).values({
    businessId: req.business!.businessId,
    date: parsed.data.date,
    startTime: parsed.data.startTime ?? undefined,
    endTime: parsed.data.endTime ?? undefined,
    fullDay: parsed.data.fullDay ?? true,
    note: parsed.data.note ?? undefined,
  }).returning();
  res.json({ id: item.id, date: item.date, startTime: item.startTime ?? null, endTime: item.endTime ?? null, fullDay: item.fullDay, note: item.note ?? null });
});

// DELETE /business/time-off/:id
router.delete("/business/time-off/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  await db.delete(timeOffTable).where(and(eq(timeOffTable.id, Number(req.params.id)), eq(timeOffTable.businessId, req.business!.businessId)));
  res.json({ ok: true });
});

// GET /business/analytics
router.get("/business/analytics", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const today = new Date().toISOString().split("T")[0];

  const allAppts = await db.select().from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, businessId));

  const future = allAppts.filter(a => a.appointmentDate >= today && a.status !== "cancelled").length;
  const past = allAppts.filter(a => a.appointmentDate < today && a.status !== "cancelled").length;
  const cancelled = allAppts.filter(a => a.status === "cancelled").length;
  const total = allAppts.filter(a => a.status !== "cancelled").length;

  // Monthly averages for trend
  const byMonth: Record<string, number> = {};
  allAppts.filter(a => a.status !== "cancelled").forEach(a => {
    const m = a.appointmentDate.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
  });
  const months = Object.values(byMonth);
  const avg = months.length ? Math.round(months.reduce((a, b) => a + b, 0) / months.length) : 0;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const currentCount = byMonth[currentMonth] || 0;
  const prevCount = byMonth[prevMonth] || 0;
  const trending = currentCount > prevCount;

  // Cancellation rankings
  const cancelledAppts = allAppts.filter(a => a.status === "cancelled");
  const cancelByClient: Record<string, { name: string; phone: string; count: number }> = {};
  const noShowByClient: Record<string, { name: string; phone: string; count: number }> = {};

  cancelledAppts.forEach((a: any) => {
    const key = a.phoneNumber;
    const name = a.clientName;
    const phone = a.phoneNumber;
    if (a.cancelReason === "ברז" || a.cancelReason === "no_show") {
      if (!noShowByClient[key]) noShowByClient[key] = { name, phone, count: 0 };
      noShowByClient[key].count++;
    } else {
      if (!cancelByClient[key]) cancelByClient[key] = { name, phone, count: 0 };
      cancelByClient[key].count++;
    }
  });

  const topCancellers = Object.values(cancelByClient).sort((a, b) => b.count - a.count).slice(0, 10);
  const topNoShows = Object.values(noShowByClient).sort((a, b) => b.count - a.count).slice(0, 10);

  res.json({ total, future, past, cancelled, avg, currentMonth: currentCount, prevMonth: prevCount, trending, topCancellers, topNoShows });
});

// GET /business/revenue
router.get("/business/revenue", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const allAppts = await db.select({
    date: appointmentsTable.appointmentDate,
    status: appointmentsTable.status,
    serviceId: appointmentsTable.serviceId,
  }).from(appointmentsTable).where(eq(appointmentsTable.businessId, businessId));

  const services = await db.select().from(servicesTable)
    .where(eq(servicesTable.businessId, businessId));
  const priceMap: Record<number, number> = {};
  services.forEach(s => { priceMap[s.id] = s.price; });

  const now = new Date();
  const thisMonthStr = now.toISOString().slice(0, 7);
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 7);

  let thisMonth = 0, nextMonth = 0, allTime = 0;

  allAppts.filter(a => a.status !== "cancelled").forEach(a => {
    const price = priceMap[a.serviceId] ?? 0;
    const month = a.date?.slice(0, 7);
    if (month === thisMonthStr) thisMonth += price;
    if (month === nextMonthStr) nextMonth += price;
    allTime += price;
  });

  // forecast next month based on avg of last 3 months
  const last3: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    const total = allAppts.filter(a => a.status !== "cancelled" && a.date?.startsWith(m))
      .reduce((sum, a) => sum + (priceMap[a.serviceId] ?? 0), 0);
    last3.push(total);
  }
  const forecast = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : 0;

  res.json({
    thisMonth: Math.round(thisMonth / 100),
    nextMonthBooked: Math.round(nextMonth / 100),
    forecast: Math.round(forecast / 100),
    allTime: Math.round(allTime / 100),
  });
});

export default router;
