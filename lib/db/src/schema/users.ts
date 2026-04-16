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

import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Unified users table.
 *
 * Who logs in to the system / mobile app:
 *   - business_owner (always — the app is built for them)
 *   - super_admin    (extra flag on top of business_owner — manages the
 *                     platform AND can also run their own business)
 *
 * Clients of the end-customers do NOT log in to the app — they only
 * interact via the public /book/<slug> page (no auth). That's why there's
 * no "client" role.
 */
export const usersTable = pgTable("users", {
  id:           serial("id").primaryKey(),

  // Identity — either email or phone MUST be set. Each is unique when present.
  email:        text("email").unique(),
  phone:        text("phone").unique(),

  // bcrypt hash. Required at the application level for all users.
  passwordHash: text("password_hash"),

  fullName:     text("full_name").notNull().default(""),

  // Primary role the user operates as.
  role:         text("role").notNull().default("business_owner"), // "business_owner"

  // Orthogonal capability — a user can be a business_owner AND a super admin
  // at the same time (manages their business + the whole platform).
  // Promotion/demotion happens from the SuperAdmin UI.
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),

  // FK to businesses.id — the business this user manages.
  businessId:   integer("business_id"),

  createdAt:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
