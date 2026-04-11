import { Router } from "express";
import { db, businessesTable, servicesTable, workingHoursTable, breakTimesTable, appointmentsTable, waitlistTable } from "@workspace/db";
import { eq, and, gte, sql, count } from "drizzle-orm";
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
    phone: b.phone ?? null,
    subscriptionPlan: b.subscriptionPlan,
    maxServicesAllowed: b.maxServicesAllowed,
    maxAppointmentsPerMonth: b.maxAppointmentsPerMonth,
    requireAppointmentApproval: b.requireAppointmentApproval,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
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
  if (parsed.data.bufferMinutes !== undefined) updates.bufferMinutes = parsed.data.bufferMinutes;
  if (parsed.data.notificationEnabled !== undefined) updates.notificationEnabled = parsed.data.notificationEnabled;
  if (parsed.data.notificationMessage !== undefined) updates.notificationMessage = parsed.data.notificationMessage ?? undefined;
  if (parsed.data.requireAppointmentApproval !== undefined) updates.requireAppointmentApproval = parsed.data.requireAppointmentApproval;

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
  if (parsed.data.welcomeText !== undefined) updates.welcomeText = parsed.data.welcomeText ?? undefined;
  if (parsed.data.backgroundColor !== undefined) updates.backgroundColor = parsed.data.backgroundColor ?? undefined;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

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

  const [service] = await db
    .insert(servicesTable)
    .values({ ...parsed.data, businessId: req.business!.businessId })
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
    .set(bodyParsed.data)
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
    .returning({ id: appointmentsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  res.json({ success: true, message: "Appointment approved" });
});

router.delete("/business/appointments/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = CancelBusinessAppointmentParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(appointmentsTable)
    .where(and(eq(appointmentsTable.id, paramsParsed.data.id), eq(appointmentsTable.businessId, req.business!.businessId)))
    .returning({ id: appointmentsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  res.json({ success: true, message: "Appointment cancelled" });
});

router.get("/business/stats", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const todayStr = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  const all = await db
    .select({ appointmentDate: appointmentsTable.appointmentDate })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, businessId));

  const totalAppointments = all.length;
  const todayCount = all.filter((a) => a.appointmentDate === todayStr).length;
  const thisWeekCount = all.filter((a) => a.appointmentDate >= todayStr && a.appointmentDate < nextWeekStr).length;
  const upcomingCount = all.filter((a) => a.appointmentDate >= todayStr).length;

  res.json({ totalAppointments, todayCount, thisWeekCount, upcomingCount });
});

router.get("/business/customers", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const appointments = await db
    .select({
      clientName: appointmentsTable.clientName,
      phoneNumber: appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
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

export default router;
