import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, businessesTable, workingHoursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  SuperAdminListBusinessesQueryParams,
  SuperAdminCreateBusinessBody,
  SuperAdminCreateBusinessQueryParams,
  SuperAdminDeleteBusinessParams,
  SuperAdminDeleteBusinessQueryParams,
  SuperAdminUpdateBusinessParams,
  SuperAdminUpdateBusinessQueryParams,
  SuperAdminUpdateBusinessBody,
} from "@workspace/api-zod";

const router = Router();
const SUPER_ADMIN_PASSWORD = (process.env.SUPER_ADMIN_PASSWORD ?? "superadmin123").trim();

function isAdmin(password: string): boolean {
  return password.trim() === SUPER_ADMIN_PASSWORD;
}

function mapAdminBusiness(b: typeof businessesTable.$inferSelect) {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    ownerName: b.ownerName,
    email: b.email,
    isActive: b.isActive,
    subscriptionPlan: b.subscriptionPlan,
    maxServicesAllowed: b.maxServicesAllowed,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/super-admin/businesses", async (req, res): Promise<void> => {
  const parsed = SuperAdminListBusinessesQueryParams.safeParse(req.query);
  if (!parsed.success || !isAdmin(parsed.data.adminPassword)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const businesses = await db
    .select()
    .from(businessesTable)
    .orderBy(businessesTable.createdAt);

  res.json(businesses.map(mapAdminBusiness));
});

router.post("/super-admin/businesses", async (req, res): Promise<void> => {
  const queryParsed = SuperAdminCreateBusinessQueryParams.safeParse(req.query);
  if (!queryParsed.success || !isAdmin(queryParsed.data.adminPassword)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const bodyParsed = SuperAdminCreateBusinessBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const { name, slug, ownerName, email, password } = bodyParsed.data;
  const passwordHash = await bcrypt.hash(password, 10);

  const [business] = await db
    .insert(businessesTable)
    .values({ slug, name, ownerName, email, passwordHash })
    .returning();

  await db.insert(workingHoursTable).values(
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      businessId: business.id,
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "18:00",
      isEnabled: [0, 1, 2, 3, 4].includes(day),
    }))
  );

  res.status(201).json({
    id: business.id,
    slug: business.slug,
    name: business.name,
    ownerName: business.ownerName,
    email: business.email,
    password,
    createdAt: business.createdAt.toISOString(),
  });
});

router.patch("/super-admin/businesses/:id", async (req, res): Promise<void> => {
  const queryParsed = SuperAdminUpdateBusinessQueryParams.safeParse(req.query);
  if (!queryParsed.success || !isAdmin(queryParsed.data.adminPassword)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = SuperAdminUpdateBusinessParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = SuperAdminUpdateBusinessBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;
  if (bodyParsed.data.subscriptionPlan !== undefined) updates.subscriptionPlan = bodyParsed.data.subscriptionPlan;
  if (bodyParsed.data.maxServicesAllowed !== undefined) updates.maxServicesAllowed = bodyParsed.data.maxServicesAllowed;
  if (bodyParsed.data.name !== undefined) updates.name = bodyParsed.data.name;
  if (bodyParsed.data.slug !== undefined) updates.slug = bodyParsed.data.slug;
  if (bodyParsed.data.ownerName !== undefined) updates.ownerName = bodyParsed.data.ownerName;
  if (bodyParsed.data.email !== undefined) updates.email = bodyParsed.data.email;
  if (bodyParsed.data.password !== undefined) {
    updates.passwordHash = await bcrypt.hash(bodyParsed.data.password, 10);
  }

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json(mapAdminBusiness(updated));
});

router.delete("/super-admin/businesses/:id", async (req, res): Promise<void> => {
  const queryParsed = SuperAdminDeleteBusinessQueryParams.safeParse(req.query);
  if (!queryParsed.success || !isAdmin(queryParsed.data.adminPassword)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = SuperAdminDeleteBusinessParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(businessesTable)
    .where(eq(businessesTable.id, paramsParsed.data.id))
    .returning({ id: businessesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json({ success: true, message: "Business deleted" });
});

export default router;
