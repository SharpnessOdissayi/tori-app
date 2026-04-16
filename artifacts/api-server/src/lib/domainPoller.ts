/**
 * Poll Railway for the DNS/SSL status of every pending custom domain.
 *
 * Scheduled via cron in index.ts. For each business row where
 * `customDomain IS NOT NULL AND customDomainVerified = false`:
 *   1. Query Railway for the hostname's current state.
 *   2. If Railway reports "active" (DNS propagated + SSL issued), flip
 *      customDomainVerified=true in our DB. The booking flow starts
 *      resolving the hostname for this business immediately.
 *   3. If Railway has no record of the hostname (user removed it from
 *      our side then re-added it, or an earlier registration failed),
 *      try to register it again.
 *
 * Keep runs cheap and idempotent — this fires every 2 minutes.
 */

import { db, businessesTable } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { addCustomDomain, getCustomDomainStatus, isRailwayApiEnabled } from "./railwayApi";
import { logger } from "./logger";

export async function pollPendingDomains(): Promise<void> {
  if (!isRailwayApiEnabled()) return;

  // Find every business with a hostname that still needs verification.
  const pending = await db
    .select({
      id:     businessesTable.id,
      domain: (businessesTable as any).customDomain,
    })
    .from(businessesTable)
    .where(and(
      isNotNull((businessesTable as any).customDomain),
      eq((businessesTable as any).customDomainVerified, false),
    ));

  if (pending.length === 0) return;

  for (const row of pending) {
    const domain = row.domain as string | null;
    if (!domain) continue;

    try {
      const status = await getCustomDomainStatus(domain);

      if (status === null) {
        // Domain not registered on Railway — re-register. This handles the
        // case where the first /business/domain PATCH sync failed (network
        // blip, Railway down, etc).
        const result = await addCustomDomain(domain);
        if (!result.ok) {
          logger.warn({ domain, error: result.error }, "[domainPoller] re-register failed");
        } else {
          logger.info({ domain }, "[domainPoller] re-registered on Railway");
        }
        continue;
      }

      if (status.status === "active") {
        await db
          .update(businessesTable)
          .set({ customDomainVerified: true } as any)
          .where(eq(businessesTable.id, row.id));
        logger.info({ domain, businessId: row.id }, "[domainPoller] domain verified");
      } else {
        logger.debug({ domain, status: status.status }, "[domainPoller] still pending");
      }
    } catch (e) {
      logger.error({ err: e, domain }, "[domainPoller] check failed");
    }
  }
}
