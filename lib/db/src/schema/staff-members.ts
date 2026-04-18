import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Staff members — the "workers" in the עסקי tier story.
 *
 * v1 (labels-only, this file): each staff is just a record the owner manages
 * from Settings → צוות. The owner still holds the single login and sees all
 * staff calendars. Appointments have a `staff_member_id` column so the week
 * view can render a per-staff tab and clients can pick "אצל מי?" on the
 * public booking page.
 *
 * v2 (not built yet): upgrade rows with (email + password_hash + ...) so
 * each staff can log in and see only their own calendar. Adding columns is
 * non-breaking — v1 rows just have nulls for the auth fields.
 *
 * The owner of the business is auto-seeded as a row with is_owner=TRUE so
 * the existing per-service + per-calendar workflows still work for
 * businesses that never hire anyone. Owner row name = `businesses.owner_name`.
 */
export const staffMembersTable = pgTable("staff_members", {
  id:         serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  name:       text("name").notNull(),
  phone:      text("phone"),
  email:      text("email"),
  avatarUrl:  text("avatar_url"),
  // Hex color used to tint appointments for this staff in the calendar
  // week view. Falls back to the service color when null.
  color:      text("color"),
  // True iff this is the business owner's auto-seeded staff row.
  // Exactly one per business. Blocks deletion (you can't fire yourself).
  isOwner:    boolean("is_owner").notNull().default(false),
  // Soft-delete flag. Inactive staff can't receive new bookings but stay in
  // history so their past appointments remain accessible.
  isActive:   boolean("is_active").notNull().default(true),
  // Display order in the staff list / calendar tabs. Lower = earlier.
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffMemberSchema = createInsertSchema(staffMembersTable).omit({ id: true, createdAt: true });
export type InsertStaffMember = z.infer<typeof insertStaffMemberSchema>;
export type StaffMember = typeof staffMembersTable.$inferSelect;
