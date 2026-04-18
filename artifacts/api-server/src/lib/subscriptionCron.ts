/**
 * Daily subscription billing cron.
 * Charges Pro businesses whose renewal date is due or past, using the
 * stored TranzilaTK token.
 */

import { db, businessesTable } from "@workspace/db";
import { and, isNotNull, isNull, lte, gte, eq } from "drizzle-orm";
import { chargeToken } from "./tranzilaCharge";
import { logger } from "./logger";
import { sendEmail } from "./email";
import { logBusinessNotification } from "../routes/notifications";

// ₪100/mo — matches the STO amount. Only relevant if/when this cron is
// used as a manual fallback; normally Tranzila charges the card itself
// via the STO registered on signup.
const RENEWAL_PRICE_ILS = 100;

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
            // Free tier has 0 bulk-SMS credits — zero the monthly quota
            // so the business can't keep drawing from a stale allowance.
            // Extra balance (purchased packs) carries over untouched.
            smsMonthlyQuota:         0,
          } as any)
          .where(eq(businessesTable.id, biz.id));
      }
    } catch (err) {
      logger.error({ err, businessId: biz.id }, "[SubscriptionCron] Unexpected error");
    }
  }

  // ── Trial-ending notice (24h before expiry) ─────────────────────────
  // Trials are businesses on the "pro" plan without a tranzilaToken.
  // Once they're within a day of subscriptionRenewDate AND we haven't
  // already notified them, fire a bell notification + one email so
  // they have time to add a card before auto-downgrade. trialEnding-
  // NoticeSent gates the cron to one send per trial.
  const endingSoon = await db
    .select({
      id:                    businessesTable.id,
      name:                  businessesTable.name,
      email:                 businessesTable.email,
      subscriptionRenewDate: (businessesTable as any).subscriptionRenewDate,
    })
    .from(businessesTable)
    .where(
      and(
        eq(businessesTable.subscriptionPlan, "pro"),
        isNull((businessesTable as any).tranzilaToken),
        isNull((businessesTable as any).subscriptionCancelledAt),
        gte((businessesTable as any).subscriptionRenewDate, now),
        lte((businessesTable as any).subscriptionRenewDate, chargeThreshold),
        eq((businessesTable as any).trialEndingNoticeSent, false),
      ),
    );
  if (endingSoon.length > 0) {
    logger.info({ count: endingSoon.length }, "[SubscriptionCron] Sending trial-ending notices");
    for (const biz of endingSoon) {
      const endsAt = biz.subscriptionRenewDate as Date | null;
      const fmt = endsAt ? endsAt.toLocaleDateString("he-IL") : "בקרוב";
      const subject = "הניסיון שלך ב-קבעתי עומד להסתיים";
      const html = `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6">
          <h2 style="color:#3c92f0;margin:0 0 16px;">שלום ${biz.name},</h2>
          <p>תקופת הניסיון בת 14 הימים של מנוי <b>פרו</b> שלך עומדת להסתיים ב־<b>${fmt}</b>.</p>
          <p>
            כדי להמשיך ליהנות מכל התכונות של פרו — שירותים ותורים ללא הגבלה,
            תזכורות ב-WhatsApp, עיצוב מותאם ותמיכה מועדפת — היכנסו להגדרות
            החשבון והוסיפו אמצעי תשלום.
          </p>
          <p>
            <a href="https://kavati.net/dashboard" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#3c92f0,#1e6fcf);color:#fff;text-decoration:none;border-radius:12px;font-weight:700;">
              המשך עם פרו
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px;">אם לא תוסיף אמצעי תשלום עד סוף הניסיון, החשבון יעבור אוטומטית למסלול החינמי (עם ההגבלות הרגילות).</p>
        </div>
      `;
      try {
        await sendEmail(biz.email, subject, html);
      } catch (e) {
        logger.warn({ err: e, businessId: biz.id }, "[SubscriptionCron] trial-ending email failed");
      }
      await logBusinessNotification({
        businessId: biz.id,
        type: "trial_ending",
        message: `הניסיון שלך עומד להסתיים ב-${fmt}. הוסף אמצעי תשלום כדי להישאר בפרו.`,
        actorType: "business",
      });
      await db
        .update(businessesTable)
        .set({ trialEndingNoticeSent: true } as any)
        .where(eq(businessesTable.id, biz.id));
    }
  }

  // Trial expiry — businesses without a tranzilaToken are on the
  // 14-day Pro trial. Once their subscriptionRenewDate passes and they
  // still haven't added a payment method, drop them back to free.
  const expiredTrials = await db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(
      and(
        eq(businessesTable.subscriptionPlan, "pro"),
        isNull((businessesTable as any).tranzilaToken),
        lte((businessesTable as any).subscriptionRenewDate, now),
      ),
    );
  if (expiredTrials.length > 0) {
    logger.info({ count: expiredTrials.length }, "[SubscriptionCron] Expiring trials");
    for (const biz of expiredTrials) {
      await db
        .update(businessesTable)
        .set({
          subscriptionPlan:        "free",
          maxServicesAllowed:      3,
          maxAppointmentsPerMonth: 20,
          // Trial expired without a card — drop SMS quota from the
          // 50 trial allowance down to 0 (Free tier has no bulk SMS).
          smsMonthlyQuota:         0,
        } as any)
        .where(eq(businessesTable.id, biz.id));
    }
  }
}
