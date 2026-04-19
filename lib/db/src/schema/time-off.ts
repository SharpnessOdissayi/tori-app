import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const timeOffTable = pgTable("time_off", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  // null = constraint applies to the WHOLE business (owner-created closure,
  //         e.g. shop-wide holiday, renovation)
  // set  = constraint applies only to that staff member (their own day off,
  //         doctor appointment, etc.) — other staff stay bookable.
  staffMemberId: integer("staff_member_id"),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time"), // null = full day
  endTime: text("end_time"),     // null = full day
  fullDay: boolean("full_day").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
