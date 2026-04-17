import { db, workingHoursTable, breakTimesTable, appointmentsTable, timeOffTable } from "@workspace/db";
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

/**
 * Compute the day-of-week for a YYYY-MM-DD date string without leaking the
 * server's local timezone into the result. Using `new Date(dateStr)` then
 * `.getUTCDay()` technically works (the ISO date-only form is parsed as UTC),
 * but some older engines interpret date-only strings as local time, which
 * would give the wrong day near midnight. Parsing the components explicitly
 * with Date.UTC sidesteps all of that.
 */
function dayOfWeekFromISO(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export async function computeAvailableSlots(
  businessId: number,
  date: string,
  serviceDurationMinutes: number,
  bufferMinutes: number,
  maxAppointmentsPerDay?: number | null,
  excludeAppointmentId?: number | null
): Promise<{ time: string; available: boolean }[]> {
  const dayOfWeek = dayOfWeekFromISO(date);

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

  // Time off — one-off days/partial days the owner marked as closed in the
  // dashboard. A matching full-day entry blocks the whole date outright;
  // partial-day entries are treated as extra breaks layered on top of the
  // regular weekly break schedule below. Previously this table was never
  // consulted by the booking flow, so a day flagged as "יום חופש" still
  // appeared bookable to clients.
  const timeOffEntries = await db
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.businessId, businessId),
        eq(timeOffTable.date, date)
      )
    );
  if (timeOffEntries.some(t => t.fullDay || (!t.startTime && !t.endTime))) {
    return [];
  }
  const partialTimeOff = timeOffEntries.filter(t => !t.fullDay && t.startTime && t.endTime);

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
      id: appointmentsTable.id,
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

  // Also exclude the appointment being rescheduled — otherwise a client
  // picking "same day, 30 min later" sees the slot as blocked by the
  // very appointment they're trying to move.
  const existingAppointments = allAppointments.filter(
    a => a.status !== "cancelled"
      && a.status !== "no_show"
      && a.status !== "pending_payment"
      && (excludeAppointmentId == null || a.id !== excludeAppointmentId)
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

    // Partial time-off blocks — same overlap logic as breaks.
    if (available) {
      for (const off of partialTimeOff) {
        const offStart = timeToMinutes(off.startTime!);
        const offEnd   = timeToMinutes(off.endTime!);
        if (slotStart < offEnd && slotEnd > offStart) {
          available = false;
          break;
        }
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
