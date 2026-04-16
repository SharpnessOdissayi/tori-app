/**
 * Daily subscription billing cron.
 * Charges Pro businesses whose renewal date is due or past, using the
 * stored TranzilaTK token.
 */

import { db, businessesTable } from "@workspace/db";
import { and, isNotNull, isNull, lte, eq } from "drizzle-orm";
import { chargeToken } from "./tranzilaCharge";
import { logger } from "./logger";

const TEST_MODE         = process.env.TRANZILA_TEST_MODE === "true";
const RENEWAL_PRICE_ILS = TEST_MODE ? 1 : 100;

export async function runSubscriptionBilling() {
  const now             = new Date();
  // Charge 1 day before renewal to avoid service gaps on transient failures
  const chargeThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const due = await db
    .select({
      id:                    businessesTable.id,
      name:                  businessesTable.name,
      tranzilaToken:         (businessesTable as any).tranzilaToken,
      tranzilaTokenExpiry:   (businessesTable as any).tranzilaTokenExpiry,
      subscriptionRenewDate: (businessesTable as any).subscriptionRenewDate,
    })
    .from(businessesTable)
    .where(
      and(
        eq(businessesTable.subscriptionPlan, "pro"),
        isNotNull((businessesTable as any).tranzilaToken),
        isNull((businessesTable as any).subscriptionCancelledAt),
        lte((businessesTable as any).subscriptionRenewDate, chargeThreshold),
      ),
    );

  if (due.length === 0) return;

  logger.info({ count: due.length }, "[SubscriptionCron] Billing due businesses");

  for (const biz of due) {
    try {
      const result = await chargeToken(
        biz.tranzilaToken,
        biz.tranzilaTokenExpiry,
        RENEWAL_PRICE_ILS,
        biz.id,
      );

      if (result.success) {
        const newRenewDate = new Date();
        newRenewDate.setDate(newRenewDate.getDate() + 30);
        await db
          .update(businessesTable)
          .set({ subscriptionRenewDate: newRenewDate } as any)
          .where(eq(businessesTable.id, biz.id));
        logger.info({ businessId: biz.id, newRenewDate }, "[SubscriptionCron] Renewed");
      } else {
        logger.warn({ businessId: biz.id, code: result.responseCode }, "[SubscriptionCron] Charge failed, downgrading to free");
        await db
          .update(businessesTable)
          .set({
            subscriptionPlan:        "free",
            maxServicesAllowed:      3,
            maxAppointmentsPerMonth: 20,
          } as any)
          .where(eq(businessesTable.id, biz.id));
      }
    } catch (err) {
      logger.error({ err, businessId: biz.id }, "[SubscriptionCron] Unexpected error");
    }
  }
}
