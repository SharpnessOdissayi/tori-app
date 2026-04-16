/**
 * Unified users table.
 *
 * Replaces the separate auth models for businesses (email+password) and
 * clients (phone-only, no password). Every human in the system has a single
 * row here regardless of role — client, business owner, or super admin.
 *
 * A business-owner user references its business via businessId (nullable,
 * since clients and fresh signups have no business yet).
 */

import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id:           serial("id").primaryKey(),

  // Identity — either email or phone MUST be set. Each is unique when present.
  email:        text("email").unique(),
  phone:        text("phone").unique(),

  // bcrypt hash. NULL is allowed for legacy phone-only client rows imported
  // from the old clients flow (OTP login only). For new signups and all
  // business owners / super admins this is required at the application level.
  passwordHash: text("password_hash"),

  fullName:     text("full_name").notNull().default(""),

  // Role hierarchy — super_admin > business_owner > client.
  // A single user has exactly one role; super admins are set manually via the
  // SuperAdmin UI.
  role:         text("role").notNull().default("client"), // "client" | "business_owner" | "super_admin"

  // FK to businesses.id — set only when role = "business_owner".
  businessId:   integer("business_id"),

  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
