import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// The "admin" business row is a placeholder — it's used ONLY to host
// directory-listing filter logic (slug != 'admin'). No operator ever
// logs in as this row; super-admin flows go through the X-Admin-Password
// header on /api/super-admin/* endpoints instead. Previously the row's
// login password was bcrypt(SUPER_ADMIN_PASSWORD), which meant a leak of
// the super-admin secret also unlocked a business login. We now seed
// (and re-seed) with a fresh ephemeral random — the row exists but is
// not loginable.
function unguessablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("base64"), 10);
}

export async function seedAdminUser() {
  if (!(process.env.SUPER_ADMIN_PASSWORD ?? "").trim()) {
    logger.error("SUPER_ADMIN_PASSWORD env var missing — admin seed SKIPPED.");
    return;
  }

  try {
    const [existing] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(businessesTable.slug, "admin"));

    if (existing) {
      // Row already exists — leave it alone. Previous versions re-synced
      // the password on every boot; that coupled the admin-row secret to
      // SUPER_ADMIN_PASSWORD and made rotation of that secret also
      // surface in this row's bcrypt hash. Drop the sync.
      return;
    }

    const passwordHash = await unguessablePasswordHash();
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

    logger.info("Admin placeholder business created (not loginable)");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account");
  }
}
