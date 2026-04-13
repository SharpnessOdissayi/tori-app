import { Router } from "express";
import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";

const router = Router();

// GET /api/client/appointments?phone=XXX
// Returns all appointments for a given phone number across all businesses
router.get("/client/appointments", async (req, res): Promise<void> => {
  const { phone } = req.query;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "phone required" });
    return;
  }

  const normalizedPhone = phone.trim();

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
    .where(eq(appointmentsTable.phoneNumber, normalizedPhone))
    .orderBy(appointmentsTable.appointmentDate, appointmentsTable.appointmentTime);

  res.json(appointments.map(a => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  })));
});

export default router;
