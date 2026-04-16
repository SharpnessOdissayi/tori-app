// v1.0.1
import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendReminders } from "./lib/reminders";
import { seedAdminUser } from "./lib/seedAdmin";
import { seedDemoBusiness } from "./lib/seedDemo";
import { runMigrations } from "./lib/migrate";
import { cleanupStalePendingPayment } from "./lib/pendingPaymentCleanup";

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

  // Subscription monthly charges are handled by Tranzila itself via
  // recur_transaction in the iframe — no cron on our side.

  // Release pending_payment slots whose webhook never arrived (every 30 min)
  cron.schedule("*/30 * * * *", () => {
    cleanupStalePendingPayment().catch(e => logger.error(e, "Pending-payment cleanup failed"));
  });
  logger.info("Pending-payment cleanup cron started (every 30 minutes)");

});

