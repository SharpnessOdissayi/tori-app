/**
 * Business category catalog.
 *
 * - GET  /public/categories              — anyone; used by Register + Dashboard
 * - POST /super-admin/categories          — super-admin; add a new category
 * - PATCH /super-admin/categories/:id     — super-admin; rename / reorder
 * - DELETE /super-admin/categories/:id    — super-admin; remove
 *
 * Super-admin gating uses the existing requireSuperAdmin middleware
 * (already mounted as a path-scoped wrapper in routes/super-admin.ts).
 * To avoid double-gating we scope the middleware here with the same
 * pattern rather than relying on the super-admin router.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireSuperAdmin } from "../middlewares/requireSuperAdmin";

const router = Router();

// Any super-admin path in THIS file also goes through the credential check.
router.use((req, res, next) => {
  if (req.path.startsWith("/super-admin")) {
    return requireSuperAdmin(req, res, next);
  }
  next();
});

// ─── Public read ──────────────────────────────────────────────────────────

router.get("/public/categories", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT id, name, sort_order
    FROM business_categories
    ORDER BY sort_order ASC, name ASC
  `);
  res.json(rows.rows);
});

// ─── Super-admin CRUD ─────────────────────────────────────────────────────

router.get("/super-admin/categories", async (_req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT id, name, sort_order, created_at
    FROM business_categories
    ORDER BY sort_order ASC, name ASC
  `);
  res.json(rows.rows);
});

router.post("/super-admin/categories", async (req, res): Promise<void> => {
  const name = String(req.body?.name ?? "").trim();
  const sortOrder = Number(req.body?.sortOrder ?? 100);
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  try {
    const rows = await db.execute(sql`
      INSERT INTO business_categories (name, sort_order)
      VALUES (${name}, ${sortOrder})
      RETURNING id, name, sort_order
    `);
    res.status(201).json(rows.rows[0]);
  } catch (e: any) {
    // Unique constraint on name
    if (/duplicate|unique/i.test(e?.message ?? "")) {
      res.status(409).json({ error: "duplicate", message: "הקטגוריה כבר קיימת" });
      return;
    }
    throw e;
  }
});

router.patch("/super-admin/categories/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const name: string | undefined      = req.body?.name  !== undefined ? String(req.body.name).trim() : undefined;
  const sortOrder: number | undefined = req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined;

  if (name !== undefined && name === "") { res.status(400).json({ error: "name cannot be empty" }); return; }

  try {
    if (name !== undefined && sortOrder !== undefined) {
      await db.execute(sql`UPDATE business_categories SET name = ${name}, sort_order = ${sortOrder} WHERE id = ${id}`);
    } else if (name !== undefined) {
      await db.execute(sql`UPDATE business_categories SET name = ${name} WHERE id = ${id}`);
    } else if (sortOrder !== undefined) {
      await db.execute(sql`UPDATE business_categories SET sort_order = ${sortOrder} WHERE id = ${id}`);
    }
    res.json({ success: true });
  } catch (e: any) {
    if (/duplicate|unique/i.test(e?.message ?? "")) {
      res.status(409).json({ error: "duplicate", message: "הקטגוריה כבר קיימת" });
      return;
    }
    throw e;
  }
});

router.delete("/super-admin/categories/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.execute(sql`DELETE FROM business_categories WHERE id = ${id}`);
  res.json({ success: true });
});

export default router;
