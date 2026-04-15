import { db, workingHoursTable, breakTimesTable, appointmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function computeAvailableSlots(
  businessId: number,
  date: string,
  serviceDurationMinutes: number,
  bufferMinutes: number,
  maxAppointmentsPerDay?: number | null
): Promise<{ time: string; available: boolean }[]> {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getUTCDay();

  const [workingHour] = await db
    .select()
    .from(workingHoursTable)
    .where(
      and(
        eq(workingHoursTable.businessId, businessId),
        eq(workingHoursTable.dayOfWeek, dayOfWeek)
      )
    );

  if (!workingHour || !workingHour.isEnabled) {
    return [];
  }

  const breaks = await db
    .select()
    .from(breakTimesTable)
    .where(
      and(
        eq(breakTimesTable.businessId, businessId),
        eq(breakTimesTable.dayOfWeek, dayOfWeek)
      )
    );

  const allAppointments = await db
    .select({
      appointmentTime: appointmentsTable.appointmentTime,
      durationMinutes: appointmentsTable.durationMinutes,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.businessId, businessId),
        eq(appointmentsTable.appointmentDate, date)
      )
    );

  const existingAppointments = allAppointments.filter(
    a => a.status !== "cancelled" && a.status !== "pending_payment"
  );

  // If the business has a daily cap and it's already reached by confirmed
  // appointments, the day is full — return zero slots so the calendar /
  // next-slots views don't offer anything bookable for this date.
  if (maxAppointmentsPerDay && existingAppointments.length >= maxAppointmentsPerDay) {
    return [];
  }

  const startMinutes = timeToMinutes(workingHour.startTime);
  const endMinutes = timeToMinutes(workingHour.endTime);
  const slotStep = 30;

  const slots: { time: string; available: boolean }[] = [];

  for (let slotStart = startMinutes; slotStart + serviceDurationMinutes <= endMinutes; slotStart += slotStep) {
    const slotEnd = slotStart + serviceDurationMinutes;

    let available = true;

    for (const br of breaks) {
      const brStart = timeToMinutes(br.startTime);
      const brEnd = timeToMinutes(br.endTime);
      if (slotStart < brEnd && slotEnd > brStart) {
        available = false;
        break;
      }
    }

    if (available) {
      for (const appt of existingAppointments) {
        const apptStart = timeToMinutes(appt.appointmentTime);
        const apptEnd = apptStart + appt.durationMinutes + bufferMinutes;
        if (slotStart < apptEnd && slotEnd > apptStart - bufferMinutes) {
          available = false;
          break;
        }
      }
    }

    slots.push({ time: minutesToTime(slotStart), available });
  }

  return slots;
}
