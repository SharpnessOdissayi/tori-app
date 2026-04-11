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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkingHourSchema = createInsertSchema(workingHoursTable).omit({ id: true, createdAt: true });
export type InsertWorkingHour = z.infer<typeof insertWorkingHourSchema>;
export type WorkingHour = typeof workingHoursTable.$inferSelect;
