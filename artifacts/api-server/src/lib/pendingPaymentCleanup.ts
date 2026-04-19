/**
 * Cancels stale `pending_payment` appointments where the Tranzila webhook
 * never arrived (network failure, abandoned checkout). Without this, the
 * slot would be reserved indefinitely.
 *
 * Owner asked: stop showing "waiting for payment" anywhere in the UI, and
 * don't have pending_payment rows linger. We already hide them from the
 * owner's calendar + lists client-side — this cron keeps the DB honest by
 * cancelling abandoned checkouts quickly so the Inforu/WhatsApp sides
 * (which otherwise could fire a stale confirmation if the webhook arrived
 * hours later) stay in sync.
 */

import { db, appointmentsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

// Short window — Tranzila's iframe checkout takes 30-60 seconds in
// practice. 15 minutes is enough slack for slow typists / network
// blips, and short enough that an abandoned checkout doesn't block
// the slot for the next customer. Was 2 hours; owner wanted it gone.
const STALE_MINUTES = 15;

export async function cleanupStalePendingPayment(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  const result = await db
    .update(appointmentsTable)
    .set({ status: "cancelled" })
    .where(and(
      eq(appointmentsTable.status, "pending_payment"),
      lt(appointmentsTable.createdAt, cutoff),
    ))
    .returning({ id: appointmentsTable.id });

  if (result.length > 0) {
    logger.info({ count: result.length, ids: result.map(r => r.id) }, "[PendingPaymentCleanup] Released stale slots");
  }
}
