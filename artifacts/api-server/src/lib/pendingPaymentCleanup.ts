/**
 * Cancels stale `pending_payment` appointments where the Tranzila webhook
 * never arrived (network failure, abandoned checkout). Without this, the
 * slot would be permanently reserved.
 */

import { db, appointmentsTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

const STALE_HOURS = 2; // give the user 2h to complete payment, then release the slot

export async function cleanupStalePendingPayment(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

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
