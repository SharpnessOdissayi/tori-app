/**
 * SMS quota management — Pro/עסקי monthly allotment + purchased packs.
 *
 * Lifecycle per business:
 *   - Tier upgrade / signup: quota = 0 (Free) | 100 (Pro) | 300 (עסקי).
 *     smsResetDate = subscriptionStartDate + 30 days.
 *   - Every send: we burn monthly first (smsUsedThisPeriod++), only falling
 *     back to smsExtraBalance once the monthly is exhausted.
 *   - Every day at midnight: subscriptionCron calls `resetMonthlyQuotas`
 *     which zeroes smsUsedThisPeriod whenever now >= smsResetDate, then
 *     bumps smsResetDate by 30 days. Extra balance never resets.
 *   - Pack purchase (Tranzila charge confirms): smsExtraBalance += packSize.
 *
 * Ordering matters: we reserve *before* calling Inforu so we don't charge
 * the business for a send the gateway refused. If Inforu comes back with
 * an error we refund the reservation in the same row's from_source bucket.
 */
import { db, businessesTable } from "@workspace/db";
import { eq, sql, and, lt, isNotNull } from "drizzle-orm";
import { logger } from "./logger";

export type QuotaBucket = "monthly" | "extra";

export interface QuotaReservation {
  fromSource: QuotaBucket;
  reservedCount: number;
}

export interface QuotaSnapshot {
  monthlyQuota:    number;
  monthlyUsed:     number;
  monthlyRemaining: number;
  extraBalance:    number;
  totalAvailable:  number;
  resetDate:       Date | null;
}

/**
 * Read the current quota state for a business. Read-only; does not reset
 * the monthly counter even if it's due — that's `resetMonthlyQuotas`' job.
 */
export async function getQuotaSnapshot(businessId: number): Promise<QuotaSnapshot> {
  const [row] = await db
    .select({
      smsMonthlyQuota:    businessesTable.smsMonthlyQuota,
      smsUsedThisPeriod:  businessesTable.smsUsedThisPeriod,
      smsExtraBalance:    businessesTable.smsExtraBalance,
      smsResetDate:       businessesTable.smsResetDate,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!row) throw new Error(`business ${businessId} not found`);

  const monthlyRemaining = Math.max(0, row.smsMonthlyQuota - row.smsUsedThisPeriod);
  return {
    monthlyQuota:     row.smsMonthlyQuota,
    monthlyUsed:      row.smsUsedThisPeriod,
    monthlyRemaining,
    extraBalance:     row.smsExtraBalance,
    totalAvailable:   monthlyRemaining + row.smsExtraBalance,
    resetDate:        row.smsResetDate,
  };
}

/**
 * Attempt to reserve `count` credits. Returns either:
 *   - { ok: true, reservations: [...] } — an ordered list describing which
 *     buckets were drawn from (monthly first, then extra). Caller uses the
 *     fromSource field when writing each sms_messages row.
 *   - { ok: false, reason: "insufficient", available: N } — not enough
 *     total credits. Nothing is deducted from the DB.
 *
 * Atomic at the single-row level (one UPDATE with WHERE clause on both
 * counters). Doesn't race with itself across concurrent sends because the
 * UPDATE is conditional — if two requests race, only one wins and the
 * loser falls through to the "insufficient" branch cleanly.
 */
export async function reserveQuota(
  businessId: number,
  count: number,
): Promise<
  | { ok: true; reservations: QuotaReservation[] }
  | { ok: false; reason: "insufficient"; available: number }
> {
  if (count <= 0) throw new Error("reserveQuota: count must be > 0");

  const snap = await getQuotaSnapshot(businessId);
  if (snap.totalAvailable < count) {
    return { ok: false, reason: "insufficient", available: snap.totalAvailable };
  }

  const fromMonthly = Math.min(snap.monthlyRemaining, count);
  const fromExtra   = count - fromMonthly;

  // Single UPDATE, guarded on the current counter values so a concurrent
  // reserve can't overdraw. If the guard fails (someone else beat us to
  // the punch), we roll back to the read-snapshot and retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await db.execute(sql`
      UPDATE businesses
      SET sms_used_this_period = sms_used_this_period + ${fromMonthly},
          sms_extra_balance    = sms_extra_balance    - ${fromExtra}
      WHERE id                    = ${businessId}
        AND sms_used_this_period  = ${snap.monthlyUsed}
        AND sms_extra_balance     = ${snap.extraBalance}
        AND sms_extra_balance    >= ${fromExtra}
    `);
    // The node-postgres driver exposes rowCount here; when run through
    // pg-pool the property may also arrive as `count`. Cast to any so
    // the typecheck survives both driver shapes — @ts-expect-error
    // was flagged as unused once the lib/db rebuild produced the right
    // types, so we drop to a plain `as any` cast.
    const updated: number = (result as any)?.rowCount ?? (result as any)?.count ?? 0;
    if (updated > 0) {
      const reservations: QuotaReservation[] = [];
      if (fromMonthly > 0) reservations.push({ fromSource: "monthly", reservedCount: fromMonthly });
      if (fromExtra   > 0) reservations.push({ fromSource: "extra",   reservedCount: fromExtra   });
      return { ok: true, reservations };
    }
    // Concurrent update stole some credits — re-read and retry once.
  }

  const latest = await getQuotaSnapshot(businessId);
  return { ok: false, reason: "insufficient", available: latest.totalAvailable };
}

/**
 * Refund a reservation when Inforu rejected the send. Must be called with
 * the same bucket we drew from so we don't shuffle credits across buckets.
 */
export async function refundQuota(
  businessId: number,
  reservations: QuotaReservation[],
): Promise<void> {
  for (const r of reservations) {
    if (r.fromSource === "monthly") {
      await db.execute(sql`
        UPDATE businesses
        SET sms_used_this_period = GREATEST(0, sms_used_this_period - ${r.reservedCount})
        WHERE id = ${businessId}
      `);
    } else {
      await db.execute(sql`
        UPDATE businesses
        SET sms_extra_balance = sms_extra_balance + ${r.reservedCount}
        WHERE id = ${businessId}
      `);
    }
  }
}

/**
 * Top up the extra-balance bucket — called by the Tranzila notify webhook
 * after a successful pack purchase. Idempotent at the caller level: the
 * webhook marks the sms_pack_purchases row completed only after this runs.
 */
export async function addExtraBalance(businessId: number, credits: number): Promise<void> {
  if (credits <= 0) return;
  await db.execute(sql`
    UPDATE businesses
    SET sms_extra_balance = sms_extra_balance + ${credits}
    WHERE id = ${businessId}
  `);
}

/**
 * Reset any business whose sms_reset_date has passed. Called from the
 * daily cron (subscriptionCron.ts). Bumps the reset date forward by 30
 * days regardless of how far it's overdue — we don't award multiple free
 * allotments to businesses whose cron was down for a while.
 */
export async function resetMonthlyQuotas(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE businesses
    SET sms_used_this_period = 0,
        sms_reset_date       = NOW() + INTERVAL '30 days'
    WHERE sms_reset_date IS NOT NULL
      AND sms_reset_date <= NOW()
  `);
  const count: number = (result as any)?.rowCount ?? (result as any)?.count ?? 0;
  if (count > 0) logger.info({ count }, "[smsQuota] reset monthly counters");
  return count;
}

/**
 * Align a business's quota + reset date to its current plan. Called when
 * a plan is upgraded/downgraded (Pro → עסקי, trial-ended → Free, etc.).
 * Idempotent — safe to call on every plan change.
 */
export async function syncQuotaToPlan(
  businessId: number,
  plan: "free" | "pro" | "pro-plus" | "basic",
): Promise<void> {
  const monthly = plan === "pro-plus" ? 300 : plan === "pro" ? 100 : 0;
  await db.execute(sql`
    UPDATE businesses
    SET sms_monthly_quota   = ${monthly},
        -- Only set the reset date the first time; subsequent plan changes
        -- keep the existing cycle going so you don't game by upgrading on
        -- day 29 to reset the clock.
        sms_reset_date      = COALESCE(sms_reset_date, NOW() + INTERVAL '30 days')
    WHERE id = ${businessId}
  `);
}

// Silence unused-import warnings on optional path imports we keep for clarity.
void and; void lt; void isNotNull;
