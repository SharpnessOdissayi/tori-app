import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * FCM device-registration tokens for push notifications.
 *
 * One row per (device, user). A business owner who installs the app on
 * both their phone and tablet ends up with two rows; same for staff.
 * `staffMemberId` NULL = owner's device. Set = specific staff's device.
 *
 * We dedupe on `deviceToken` (unique index below) because Firebase
 * guarantees each token is globally unique — if the same token shows up
 * with a new user association (reinstall, login-as-different-user) we
 * overwrite the row rather than stacking duplicates.
 */
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id:             serial("id").primaryKey(),
    businessId:     integer("business_id").notNull(),
    staffMemberId:  integer("staff_member_id"),
    deviceToken:    text("device_token").notNull(),
    // "android" | "ios" | "web" — used by the send helper to pick the
    // right FCM payload shape (iOS needs APNs config, Android uses
    // notification channels).
    platform:       text("platform").notNull().default("android"),
    lastSeenAt:     timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byToken: uniqueIndex("push_tokens_device_token_uniq").on(t.deviceToken),
  }),
);

export type PushToken = typeof pushTokensTable.$inferSelect;
export type InsertPushToken = typeof pushTokensTable.$inferInsert;
