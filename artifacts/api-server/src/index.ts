// v1.0.1
import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendReminders } from "./lib/reminders";
import { seedAdminUser } from "./lib/seedAdmin";
import { seedDemoBusiness } from "./lib/seedDemo";
import { runMigrations } from "./lib/migrate";
import { runSubscriptionBilling } from "./lib/subscriptionCron";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Run DB column migrations (safe, idempotent)
  runMigrations();

  // Seed admin account (creates or syncs password from SUPER_ADMIN_PASSWORD)
  seedAdminUser();

  // Seed demo business for homepage "how it looks" button
  seedDemoBusiness();

  // Run reminders every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    sendReminders().catch(e => logger.error(e, "Reminders job failed"));
  });
  logger.info("Reminders cron started (every 15 minutes)");

  // Subscription billing — daily at 08:00 Israel time (UTC+3 = 05:00 UTC)
  // Charges stored card tokens for Pro subscribers whose renewal date is due.
  // Cancel = subscriptionCancelledAt is set → cron skips. No charge. Period.
  cron.schedule("0 5 * * *", () => {
    runSubscriptionBilling().catch(e => logger.error(e, "Subscription billing job failed"));
  });
  logger.info("Subscription billing cron started (daily 08:00 IL)");

});

