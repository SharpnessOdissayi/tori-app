import { db, workingHoursTable, breakTimesTable, appointmentsTable, timeOffTable, staffMembersTable } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";

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

/**
 * Compute which rotation week (1..weeksCount) a target date falls on,
 * given the staff's rotation anchor.
 *
 * The anchor_date defines a reference week whose rotation index is
 * `anchorWeekIndex`. Weeks advance by 1 each Sunday → Saturday boundary,
 * and wrap back to 1 after `weeksCount`.
 *
 * Both anchor and target are normalised to the Sunday of their week so
 * a mid-week anchor (e.g. "I set this up on Wednesday of week 3")
 * still yields the correct rotation week for every day of that week.
 *
 * Example: anchor=2026-04-22 (a Wednesday), anchorWeekIndex=3, weeksCount=4
 *   · target 2026-04-20 (Mon of same week) → 3
 *   · target 2026-04-26 (Sun of next week) → 4
 *   · target 2026-05-03 (two weeks out)    → 1
 *   · target 2026-05-17 (four weeks out)   → 3 (cycle repeats)
 */
export function computeRotationWeekIndex(
  targetDate: string,
  anchorDate: string,
  anchorWeekIndex: number,
  weeksCount: number,
): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  const DAY_MS = 86_400_000;
  const anchorUTC = parse(anchorDate);
  const targetUTC = parse(targetDate);
  // Normalise both to Sunday-of-week (Sunday = getUTCDay 0 in the ISO week we use).
  const anchorSunday = anchorUTC - new Date(anchorUTC).getUTCDay() * DAY_MS;
  const targetSunday = targetUTC - new Date(targetUTC).getUTCDay() * DAY_MS;
  const weeksDiff = Math.round((targetSunday - anchorSunday) / (7 * DAY_MS));
  // (anchorIdx - 1 + diff) mod N, then +1 back to 1-based; handle negatives.
  const zeroBased = ((anchorWeekIndex - 1 + weeksDiff) % weeksCount + weeksCount) % weeksCount;
  return zeroBased + 1;
}

export async function computeAvailableSlots(
  businessId: number,
  date: string,
  serviceDurationMinutes: number,
  bufferMinutes: number,
  maxAppointmentsPerDay?: number | null,
  excludeAppointmentId?: number | null,
  // Optional: when provided, compute slots only for this staff member.
  // Working hours prefer a per-staff override (working_hours.staff_member_id)
  // falling back to the business-wide row. Only THIS staff's appointments
  // block the slot, so a second stylist isn't blocked by the first's day.
  // Time-off and breaks remain business-wide (schema doesn't have a
  // staff_member_id on those tables yet).
  staffMemberId?: number | null
): Promise<{ time: string; available: boolean }[]> {
  const dayOfWeek = dayOfWeekFromISO(date);

  // If the staff has a rotation configured, figure out which week of the
  // cycle the target date falls on — working_hours rows tagged with that
  // rotation_week_index win over the non-rotation fallback rows.
  let rotationWeekIndex: number | null = null;
  if (staffMemberId) {
    const [staff] = await db
      .select({
        weeksCount:     (staffMembersTable as any).rotationWeeksCount,
        anchorDate:     (staffMembersTable as any).rotationAnchorDate,
        anchorWeekIdx:  (staffMembersTable as any).rotationAnchorWeekIndex,
      })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffMemberId));
    if (staff?.weeksCount && staff?.anchorDate && staff?.anchorWeekIdx) {
      rotationWeekIndex = computeRotationWeekIndex(
        date, staff.anchorDate, staff.anchorWeekIdx, staff.weeksCount,
      );
    }
  }

  // Prefer per-staff hours when a staff is specified. If none exist for
  // this day, fall back to the business-level row (staff_member_id IS NULL).
  // When rotation is active we first look for a row tagged with the current
  // rotation_week_index; failing that we use the staff's non-rotation row
  // (NULL rotation_week_index), then the business-level default.
  let workingHour: typeof workingHoursTable.$inferSelect | undefined;
  if (staffMemberId && rotationWeekIndex != null) {
    const [rotHour] = await db
      .select()
      .from(workingHoursTable)
      .where(
        and(
          eq(workingHoursTable.businessId, businessId),
          eq(workingHoursTable.dayOfWeek, dayOfWeek),
          eq((workingHoursTable as any).staffMemberId, staffMemberId),
          eq((workingHoursTable as any).rotationWeekIndex, rotationWeekIndex),
        )
      );
    workingHour = rotHour;
  }
  // Only fall back to the staff's non-rotation row when rotation ISN'T
  // active. If rotation is active the PUT endpoint always inserts all
  // 7×N rows, so a miss on the rotation query means "this day is a day
  // off in that week" — NOT "use the staff's standard hours". Falling
  // back here would re-open a day the owner explicitly disabled in the
  // rotation editor.
  if (!workingHour && staffMemberId && rotationWeekIndex == null) {
    const [staffHour] = await db
      .select()
      .from(workingHoursTable)
      .where(
        and(
          eq(workingHoursTable.businessId, businessId),
          eq(workingHoursTable.dayOfWeek, dayOfWeek),
          eq((workingHoursTable as any).staffMemberId, staffMemberId),
          isNull((workingHoursTable as any).rotationWeekIndex),
        )
      );
    workingHour = staffHour;
  }
  // Business-level default fallback — same gating as the staff row
  // fallback above. When rotation is active the staff's rotation rows
  // are authoritative: missing data there means "closed", not "use the
  // business default".
  if (!workingHour && rotationWeekIndex == null) {
    const [defaultHour] = await db
      .select()
      .from(workingHoursTable)
      .where(
        and(
          eq(workingHoursTable.businessId, businessId),
          eq(workingHoursTable.dayOfWeek, dayOfWeek),
          isNull((workingHoursTable as any).staffMemberId),
          isNull((workingHoursTable as any).rotationWeekIndex),
        )
      );
    workingHour = defaultHour;
  }

  if (!workingHour || !workingHour.isEnabled) {
    return [];
  }

  // Time off — one-off days/partial days marked as closed in the dashboard.
  // A matching full-day entry blocks the whole date; partial-day entries
  // layer on top of the regular weekly break schedule below.
  //
  // Staff scoping (fixed): originally this query loaded EVERY time_off row
  // for the business on that date, regardless of staff_member_id. That meant
  // a stylist's personal day off silently zeroed out the owner's calendar
  // (and every other stylist's) — so the owner reported their constraints
  // "disappearing". Now:
  //   · caller passed a staffMemberId → include rows that are business-wide
  //     (staff_member_id IS NULL) OR target this specific staff
  //   · no staffMemberId (business-default view) → only business-wide rows;
  //     individual staff's personal days off don't block the shared view
  //     because another staff may still be available for that slot.
  const timeOffEntries = await db
    .select()
    .from(timeOffTable)
    .where(
      and(
        eq(timeOffTable.businessId, businessId),
        eq(timeOffTable.date, date),
        staffMemberId
          ? or(
              isNull((timeOffTable as any).staffMemberId),
              eq((timeOffTable as any).staffMemberId, staffMemberId),
            )!
          : isNull((timeOffTable as any).staffMemberId),
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

  // Appointments to subtract from slots. When a staff is specified we only
  // block on THEIR appointments — a second worker's calendar shouldn't be
  // consumed by the first worker's day. Legacy rows where staff_member_id
  // is NULL are treated as the owner's, so when the caller IS the owner
  // (no staffMemberId) they still see everything.
  const allAppointments = await db
    .select({
      id: appointmentsTable.id,
      appointmentTime: appointmentsTable.appointmentTime,
      durationMinutes: appointmentsTable.durationMinutes,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(
      staffMemberId
        ? and(
            eq(appointmentsTable.businessId, businessId),
            eq(appointmentsTable.appointmentDate, date),
            eq((appointmentsTable as any).staffMemberId, staffMemberId),
          )
        : and(
            eq(appointmentsTable.businessId, businessId),
            eq(appointmentsTable.appointmentDate, date),
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
