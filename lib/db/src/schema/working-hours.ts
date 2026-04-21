import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workingHoursTable = pgTable("working_hours", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull().default("09:00"),
  endTime: text("end_time").notNull().default("18:00"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  // Per-staff working hours (עסקי tier multi-staff).
  // NULL = inherits the business-level hours (current single-calendar
  // behaviour). Non-null = those hours apply only to that staff member.
  staffMemberId: integer("staff_member_id"),
  // Rotation mode — optional N-week repeating schedule.
  //   NULL = standard weekly row (used when the staff/business has no
  //          rotation configured, or as the "week 0" default).
  //   1..N = this row applies ONLY when the target date falls on the
  //          Nth week of the staff's rotation cycle. N-week rotation
  //          produces N rows per day; availability.ts picks the row
  //          matching the computed rotation week for that date.
  // Rotation config (weeks_count, anchor_date, anchor_week_index) lives
  // on staff_members — working_hours just tags each row with the week it
  // belongs to.
  rotationWeekIndex: integer("rotation_week_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkingHourSchema = createInsertSchema(workingHoursTable).omit({ id: true, createdAt: true });
export type InsertWorkingHour = z.infer<typeof insertWorkingHourSchema>;
export type WorkingHour = typeof workingHoursTable.$inferSelect;
