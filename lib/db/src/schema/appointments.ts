import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  serviceId: integer("service_id").notNull(),
  serviceName: text("service_name").notNull(),
  clientName: text("client_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  appointmentDate: text("appointment_date").notNull(),
  appointmentTime: text("appointment_time").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("confirmed"),
  reminder24hSent: boolean("reminder_24h_sent").notNull().default(false),
  reminder1hSent: boolean("reminder_1h_sent").notNull().default(false),
  reminderMorningSent: boolean("reminder_morning_sent").notNull().default(false),
  // WhatsApp message audit trail — timestamps of when each non-OTP
  // message was dispatched to the client. Used by the appointment
  // details modal to show "what did the client actually receive".
  // NULL = never sent / skipped (free plan, opt-out, Meta API error).
  confirmationSentAt:   timestamp("confirmation_sent_at",   { withTimezone: true }),
  rescheduleSentAt:     timestamp("reschedule_sent_at",     { withTimezone: true }),
  cancellationSentAt:   timestamp("cancellation_sent_at",   { withTimezone: true }),
  reminder24hSentAt:    timestamp("reminder_24h_sent_at",   { withTimezone: true }),
  reminder1hSentAt:     timestamp("reminder_1h_sent_at",    { withTimezone: true }),
  reminderMorningSentAt: timestamp("reminder_morning_sent_at", { withTimezone: true }),
  // Which staff member this appointment is for (עסקי tier multi-staff).
  // NULL for pre-migration rows or solo businesses — treated as "the owner".
  // FK intentionally omitted at the schema level; enforced at the app layer.
  staffMemberId: integer("staff_member_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
