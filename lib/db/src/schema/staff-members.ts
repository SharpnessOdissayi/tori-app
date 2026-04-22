import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  // ─── Staff login (v2) ────────────────────────────────────────────────
  // Nullable — rows created before logins rolled out have no hash and
  // can't log in. When the owner adds a new staff with an email, the
  // backend generates a random password, stores the hash here, and
  // emails the plaintext to the staff member once (welcome email).
  //
  // Staff log in via the standard /auth/business/login endpoint: we
  // match by email or phone against staff_members and issue a scoped
  // JWT with staffMemberId so the dashboard knows to filter views.
  passwordHash:     text("password_hash"),
  // Timestamp of the last time we sent the welcome email (for "resend
  // credentials" idempotency + rate-limit on the owner-UI side).
  credentialsSentAt: timestamp("credentials_sent_at", { withTimezone: true }),
  // ─── Rotation schedule (optional N-week repeating cycle) ─────────────
  // Three columns that together describe "which rotation week is week X"
  // for a given target date — see availability.ts for the math.
  //   · rotationWeeksCount     : N (2, 3, 4…). NULL = rotation disabled.
  //   · rotationAnchorDate     : a YYYY-MM-DD date (the Sunday of the
  //                              week that anchorWeekIndex refers to).
  //                              Usually today's Sunday at setup time.
  //   · rotationAnchorWeekIndex: 1..N — which rotation week the anchor
  //                              week is. Lets the owner say "I'm
  //                              currently in week 3 of a 4-week cycle".
  // Corresponding hours live on working_hours rows keyed by
  // rotation_week_index (1..N). All three must be non-NULL for
  // rotation to be considered active.
  rotationWeeksCount:      integer("rotation_weeks_count"),
  rotationAnchorDate:      text("rotation_anchor_date"),
  rotationAnchorWeekIndex: integer("rotation_anchor_week_index"),
  // ─── Extra-seat billing (עסקי tier) ──────────────────────────────────
  // Each staff beyond the 2 included has its OWN Tranzila Standing
  // Order for ₪25/mo, independent of the main subscription's STO.
  // NULL = seat is included (one of the first 2), no charge.
  // Populated by the /api/tranzila/notify handler after the owner
  // completes the extra-seat iframe; deactivated (Tranzila-side) when
  // the staff is deleted.
  tranzilaStoId:           integer("tranzila_sto_id"),
  // Per-kind push-notification opt-in for this staff member. Same shape
  // as businesses.pushPrefs — null/missing key = enabled. Staff see only
  // notifications scoped to their own appointments.
  pushPrefs: jsonb("push_prefs").$type<Record<string, boolean>>(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffMemberSchema = createInsertSchema(staffMembersTable).omit({ id: true, createdAt: true });
export type InsertStaffMember = z.infer<typeof insertStaffMemberSchema>;
export type StaffMember = typeof staffMembersTable.$inferSelect;
