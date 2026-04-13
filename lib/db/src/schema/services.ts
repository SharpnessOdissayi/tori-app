import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull().default(0),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  imageUrl: text("image_url"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServiceSchema = createInsertSchema(servicesTable).omit({ id: true, createdAt: true });
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof servicesTable.$inferSelect;
