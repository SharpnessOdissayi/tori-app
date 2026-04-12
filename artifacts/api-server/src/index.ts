import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { sendReminders } from "./lib/reminders";
import { seedAdminUser } from "./lib/seedAdmin";

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

  // Seed admin account (creates or syncs password from SUPER_ADMIN_PASSWORD)
  seedAdminUser();

  // Run reminders every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    sendReminders().catch(e => logger.error(e, "Reminders job failed"));
  });
  logger.info("Reminders cron started (every 15 minutes)");
});
