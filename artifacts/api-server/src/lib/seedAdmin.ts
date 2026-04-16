import bcrypt from "bcryptjs";
import { db, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function seedAdminUser() {
  // Mirror the requireSuperAdmin middleware check — no fallback password.
  const ADMIN_PASSWORD = (process.env.SUPER_ADMIN_PASSWORD ?? "").trim();
  if (!ADMIN_PASSWORD) {
    logger.error("SUPER_ADMIN_PASSWORD env var missing — admin seed SKIPPED.");
    return;
  }

  try {
    // Check if admin account already exists
    const [existing] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.slug, "admin"));

    if (existing) {
      // Update password in case SUPER_ADMIN_PASSWORD changed
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await db
        .update(businessesTable)
        .set({ passwordHash })
        .where(eq(businessesTable.slug, "admin"));
      logger.info("Admin account password synced");
      return;
    }

    // Create admin account
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.insert(businessesTable).values({
      slug: "admin",
      name: "Admin",
      ownerName: "Admin",
      email: "admin",
      passwordHash,
      subscriptionPlan: "pro",
      maxServicesAllowed: 9999,
      maxAppointmentsPerMonth: 99999,
      isActive: true,
      requirePhoneVerification: false,
    });

    logger.info("Admin account created (email: admin)");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account");
  }
}
