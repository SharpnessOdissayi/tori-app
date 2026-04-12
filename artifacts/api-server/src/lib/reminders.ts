import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq, and, isNull, not } from "drizzle-orm";
import { sendWhatsApp } from "./twilio";

function parseAppointmentDate(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export async function sendReminders(): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const window = 15 * 60 * 1000; // 15 minute window

  const appointments = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phoneNumber: appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      reminder24hSent: appointmentsTable.reminder24hSent,
      reminder1hSent: appointmentsTable.reminder1hSent,
      status: appointmentsTable.status,
      businessName: businessesTable.name,
    })
    .from(appointmentsTable)
    .innerJoin(businessesTable, eq(appointmentsTable.businessId, businessesTable.id))
    .where(not(eq(appointmentsTable.status, "cancelled")));

  for (const appt of appointments) {
    const apptTime = parseAppointmentDate(appt.appointmentDate, appt.appointmentTime);
    const msUntil = apptTime.getTime() - now.getTime();

    // 24h reminder
    if (!appt.reminder24hSent && msUntil > 0 && Math.abs(msUntil - 24 * 60 * 60 * 1000) < window) {
      const msg = `שלום ${appt.clientName}! תזכורת: יש לך תור ב${appt.businessName} מחר בשעה ${appt.appointmentTime}. לביטול צור קשר עם העסק.`;
      try {
        await sendWhatsApp(appt.phoneNumber, msg);
        await db.update(appointmentsTable).set({ reminder24hSent: true }).where(eq(appointmentsTable.id, appt.id));
        console.log(`[Reminders] Sent 24h reminder to ${appt.phoneNumber}`);
      } catch (e) {
        console.error(`[Reminders] Failed 24h reminder for appointment ${appt.id}:`, e);
      }
    }

    // 1h reminder
    if (!appt.reminder1hSent && msUntil > 0 && Math.abs(msUntil - 60 * 60 * 1000) < window) {
      const msg = `שלום ${appt.clientName}! תזכורת: יש לך תור ב${appt.businessName} בעוד שעה בשעה ${appt.appointmentTime}.`;
      try {
        await sendWhatsApp(appt.phoneNumber, msg);
        await db.update(appointmentsTable).set({ reminder1hSent: true }).where(eq(appointmentsTable.id, appt.id));
        console.log(`[Reminders] Sent 1h reminder to ${appt.phoneNumber}`);
      } catch (e) {
        console.error(`[Reminders] Failed 1h reminder for appointment ${appt.id}:`, e);
      }
    }
  }
}
