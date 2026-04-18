import { db, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Free-plan restrictions — clients never receive WhatsApp messages,
// approval mode is disabled, and analytics/revenue/integrations tabs are hidden.
// Pro-only features are gated both client-side (UI) and server-side.

export async function isBusinessPro(businessId: number): Promise<boolean> {
  const [row] = await db
    .select({ plan: businessesTable.subscriptionPlan })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  return row?.plan === "pro" || row?.plan === "pro-plus";
}
