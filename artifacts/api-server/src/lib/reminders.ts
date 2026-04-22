import { db, appointmentsTable, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendReminder24h, sendReminder1h, sendReminderMorning } from "./whatsapp";

// Israel is UTC+3 (Apr–Oct) / UTC+2 (Nov–Mar). Server runs UTC on Railway,
// so build the Date with explicit Israel offset.
function parseAppointmentDate(date: string, time: string): Date {
  const month = parseInt(date.split("-")[1], 10);
  const offset = (month >= 4 && month <= 10) ? 3 : 2;
  return new Date(`${date}T${time}:00+0${offset}:00`);
}

/** Day of week: 0=Sun, 5=Fri, 6=Sat */
function getDayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

/**
 * For a trigger amount+unit, return the target Date when the reminder should fire.
 * For "morning": 08:00 on the appointment day (or Friday 08:00 if appointment is Saturday + shabbat mode).
 */
function getTriggerFireTime(
  apptDate: string,
  apptTime: string,
  trigger: { amount: string; unit: string },
  shabbatMode: boolean
): Date | null {
  const apptDateTime = parseAppointmentDate(apptDate, apptTime);

  if (trigger.unit === "morning") {
    const [year, month, day] = apptDate.split("-").map(Number);
    const dayOfWeek = getDayOfWeek(apptDate);

    // If shabbat mode and appointment is on Saturday → send Friday 08:00
    if (shabbatMode && dayOfWeek === 6) {
      const friday = new Date(year, month - 1, day - 1, 8, 0, 0, 0);
      return friday;
    }
    // Otherwise: 08:00 on appointment day
    return new Date(year, month - 1, day, 8, 0, 0, 0);
  }

  const amount = parseInt(trigger.amount) || 0;
  if (amount <= 0) return null;

  let msOffset = 0;
  if (trigger.unit === "minutes") msOffset = amount * 60 * 1000;
  else if (trigger.unit === "hours") msOffset = amount * 60 * 60 * 1000;
  else if (trigger.unit === "days") msOffset = amount * 24 * 60 * 60 * 1000;
  else return null;

  const fireTime = new Date(apptDateTime.getTime() - msOffset);

  // Shabbat rescheduling for non-morning triggers
  if (shabbatMode) {
    const fireDay = fireTime.getDay();
    // Would fire on Saturday → reschedule to Saturday 21:00 (מוצאי שבת)
    if (fireDay === 6) {
      fireTime.setHours(21, 0, 0, 0);
    }
    // Would fire on Friday after 18:00 → reschedule to Friday 08:00
    if (fireDay === 5 && fireTime.getHours() >= 18) {
      fireTime.setHours(8, 0, 0, 0);
    }
  }

  return fireTime;
}

/**
 * Send a WhatsApp reminder for a given trigger.
 * All variants use appointment_reminder_2 with the business slug for the URL button.
 */
async function sendReminderForTrigger(
  trigger: { amount: string; unit: string },
  phone: string,
  clientName: string,
  businessName: string,
  formattedDate: string,
  time: string,
  businessSlug: string,
  businessId: number,
  appointmentId?: number,
) {
  const amount = parseInt(trigger.amount) || 0;
  const isOneHour = trigger.unit === "hours" && amount === 1;
  const isMorning = trigger.unit === "morning";

  if (isOneHour) {
    await sendReminder1h(phone, clientName, businessName, formattedDate, time, businessSlug, businessId, appointmentId);
  } else if (isMorning) {
    await sendReminderMorning(phone, clientName, businessName, formattedDate, time, businessSlug, businessId, appointmentId);
  } else {
    await sendReminder24h(phone, clientName, businessName, formattedDate, time, businessSlug, businessId, appointmentId);
  }
}

export async function sendReminders(): Promise<void> {
  const now = new Date();
  const window = 15 * 60 * 1000; // 15-minute window (matches cron interval)

  // Fetch all non-cancelled appointments with their business config
  const appointments = await db
    .select({
      id: appointmentsTable.id,
      clientName: appointmentsTable.clientName,
      phoneNumber: appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      reminder24hSent: appointmentsTable.reminder24hSent,
      reminder1hSent: appointmentsTable.reminder1hSent,
      reminderMorningSent: appointmentsTable.reminderMorningSent,
      status: appointmentsTable.status,
      businessId: businessesTable.id,
      businessName: businessesTable.name,
      businessSlug: businessesTable.slug,
      sendReminders: businessesTable.sendReminders,
      reminderTriggers: businessesTable.reminderTriggers,
      shabbatMode: businessesTable.shabbatMode,
      subscriptionPlan: businessesTable.subscriptionPlan,
    })
    .from(appointmentsTable)
    .innerJoin(businessesTable, eq(appointmentsTable.businessId, businessesTable.id))
    .where(eq(appointmentsTable.status, "confirmed"));

  for (const appt of appointments) {
    if (!appt.sendReminders) continue;
    // Free plan: no reminders sent to clients.
    // Paid tiers (pro + pro-plus/עסקי) both get the reminder pipeline.
    // Earlier this was a strict !== "pro" check, which silently excluded
    // every עסקי customer from reminders even though they pay more.
    if (appt.subscriptionPlan !== "pro" && appt.subscriptionPlan !== "pro-plus") continue;

    const [, month, day] = appt.appointmentDate.split("-");
    const formattedDate = `${day}/${month}`;
    const shabbatMode = appt.shabbatMode === "shabbat";

    // Parse saved triggers (may be null → fall back to legacy 24h + 1h)
    let triggers: Array<{ amount: string; unit: string }> = [
      { amount: "24", unit: "hours" },
      { amount: "1", unit: "hours" },
    ];
    if (appt.reminderTriggers) {
      try {
        const parsed = JSON.parse(appt.reminderTriggers);
        if (Array.isArray(parsed) && parsed.length > 0) triggers = parsed;
      } catch {}
    }

    for (const trigger of triggers) {
      const fireTime = getTriggerFireTime(
        appt.appointmentDate,
        appt.appointmentTime,
        trigger,
        shabbatMode
      );
      if (!fireTime) continue;

      const msUntilFire = fireTime.getTime() - now.getTime();
      // Fire if we're within the ±window of the scheduled time
      if (Math.abs(msUntilFire) > window) continue;

      // Use the right "sent" flag based on trigger type
      const isMorning = trigger.unit === "morning";
      const is24h =
        trigger.unit === "hours" && parseInt(trigger.amount) === 24;
      const is1h =
        trigger.unit === "hours" && parseInt(trigger.amount) === 1;

      // Skip if already sent (use legacy flags for 24h/1h for backwards compat)
      if (isMorning && appt.reminderMorningSent) continue;
      if (is24h && appt.reminder24hSent) continue;
      if (is1h && appt.reminder1hSent) continue;
      // For other triggers, check morning flag as generic "sent" (best effort)
      if (!isMorning && !is24h && !is1h && appt.reminderMorningSent) continue;

      try {
        await sendReminderForTrigger(
          trigger,
          appt.phoneNumber,
          appt.clientName,
          appt.businessName,
          formattedDate,
          appt.appointmentTime,
          appt.businessSlug,
          appt.businessId,
          appt.id,
        );

        // Mark as sent
        if (isMorning) {
          await db
            .update(appointmentsTable)
            .set({ reminderMorningSent: true })
            .where(eq(appointmentsTable.id, appt.id));
        } else if (is24h) {
          await db
            .update(appointmentsTable)
            .set({ reminder24hSent: true })
            .where(eq(appointmentsTable.id, appt.id));
        } else if (is1h) {
          await db
            .update(appointmentsTable)
            .set({ reminder1hSent: true })
            .where(eq(appointmentsTable.id, appt.id));
        } else {
          await db
            .update(appointmentsTable)
            .set({ reminderMorningSent: true })
            .where(eq(appointmentsTable.id, appt.id));
        }

        console.log(
          `[Reminders] Sent ${trigger.unit === "morning" ? "morning" : `${trigger.amount}${trigger.unit}`} reminder to ${appt.phoneNumber}`
        );
      } catch (e) {
        console.error(
          `[Reminders] Failed ${trigger.unit} reminder for appointment ${appt.id}:`,
          e
        );
      }
    }
  }
}
