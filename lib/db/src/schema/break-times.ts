import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const breakTimesTable = pgTable("break_times", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBreakTimeSchema = createInsertSchema(breakTimesTable).omit({ id: true, createdAt: true });
export type InsertBreakTime = z.infer<typeof insertBreakTimeSchema>;
export type BreakTime = typeof breakTimesTable.$inferSelect;
