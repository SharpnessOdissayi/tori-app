import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";

/**
 * Many-to-many link: which services each staff member performs.
 *
 * A salon might have Staff A doing hair + blow-dry, Staff B doing lash
 * extensions only, Staff C doing everything. The booking page uses this
 * to filter the staff picker after a client chooses a service.
 *
 * Missing rows for a staff = assumed to do every service (convenient for
 * single-staff shops: the owner row has no links but still shows for all
 * services). The route layer enforces this fallback explicitly.
 */
export const staffServicesTable = pgTable("staff_services", {
  staffMemberId: integer("staff_member_id").notNull(),
  serviceId:     integer("service_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.staffMemberId, t.serviceId] }),
}));

export type StaffServiceLink = typeof staffServicesTable.$inferSelect;
