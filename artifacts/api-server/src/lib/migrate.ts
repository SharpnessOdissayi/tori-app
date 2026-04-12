import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Runs safe "ADD COLUMN IF NOT EXISTS" migrations.
 * Called once on server startup — idempotent, safe to run every deploy.
 */
export async function runMigrations() {
  try {
    const alterations: string[] = [
      // Booking restrictions
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS min_lead_hours INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cancellation_hours INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_future_weeks INTEGER NOT NULL DEFAULT 15`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS future_booking_mode TEXT NOT NULL DEFAULT 'weeks'`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_future_date TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_appointments_per_customer INTEGER`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_active_subscription BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER`,
      // Branding
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS button_radius TEXT`,
      // Reminders
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS send_reminders BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_arrival_confirmation BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS send_whatsapp_reminders BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_triggers TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_custom_text TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shabbat_mode TEXT NOT NULL DEFAULT 'any'`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_send_time TEXT NOT NULL DEFAULT '20:00'`,
    ];

    for (const stmt of alterations) {
      await db.execute(sql.raw(stmt));
    }

    logger.info("DB migrations applied successfully");
  } catch (err) {
    logger.error({ err }, "DB migration failed");
  }
}
