// v1.0.1
import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendReminders } from "./lib/reminders";
import { seedAdminUser } from "./lib/seedAdmin";
import { seedDemoBusiness } from "./lib/seedDemo";
import { runMigrations } from "./lib/migrate";
import { runSubscriptionBilling } from "./lib/subscriptionCron";
import { cleanupStalePendingPayment } from "./lib/pendingPaymentCleanup";
import { pollPendingDomains } from "./lib/domainPoller";

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

  // Monthly subscription billing — daily at 08:00 Israel time (UTC+3 = 05:00 UTC)
  // Charges the stored TranzilaTK token via /v1/transaction/credit_card/create.
  // subscriptionCancelledAt set → cron skips. Failed charge → downgrade to free.
  cron.schedule("0 5 * * *", () => {
    runSubscriptionBilling().catch(e => logger.error(e, "Subscription billing job failed"));
  });
  logger.info("Subscription billing cron started (daily 08:00 IL)");

  // Release pending_payment slots whose webhook never arrived (every 30 min)
  cron.schedule("*/30 * * * *", () => {
    cleanupStalePendingPayment().catch(e => logger.error(e, "Pending-payment cleanup failed"));
  });
  logger.info("Pending-payment cleanup cron started (every 30 minutes)");

  // Poll Railway every 2 minutes for pending custom-domain verifications.
  // Businesses that added a domain but haven't finished DNS propagation
  // get auto-verified here once Railway reports "active".
  cron.schedule("*/2 * * * *", () => {
    pollPendingDomains().catch(e => logger.error(e, "Domain poller failed"));
  });
  logger.info("Domain poller cron started (every 2 minutes)");

});

