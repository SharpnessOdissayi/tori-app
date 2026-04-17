import { Router, Request, Response, NextFunction } from "express";
import { db, clientSessionsTable } from "@workspace/db";
import { sql, eq, and, gt } from "drizzle-orm";
import { requireBusinessAuth } from "../middlewares/business-auth";

const router = Router();

// ── Client auth (local, mirrors client.ts) ────────────────────────────────────
async function requireClientAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers["x-client-token"] as string | undefined;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const [session] = await db.select().from(clientSessionsTable)
    .where(and(eq(clientSessionsTable.token, token), gt(clientSessionsTable.expiresAt, new Date())));
  if (!session) { res.status(401).json({ error: "פגה תוקף ההתחברות" }); return; }
  (req as any).clientSession = session;
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
//
// The notifications and client_notifications tables are not yet mirrored in
// the Drizzle schema package, so we use the `sql` tagged-template form.
// Unlike `sql.raw(...)`, the tagged template automatically parameterizes
// every `${…}` value — no string concatenation, no SQL injection risk even
// if the input contains quotes, backslashes, or Postgres-specific escapes.

export async function logBusinessNotification(params: {
  businessId: number;
  type: string;
  appointmentId?: number;
  message: string;
  actorType: "client" | "business";
  actorName?: string;
}) {
  try {
    await db.execute(sql`
      INSERT INTO notifications (business_id, type, appointment_id, message, actor_type, actor_name)
      VALUES (
        ${params.businessId},
        ${params.type},
        ${params.appointmentId ?? null},
        ${params.message},
        ${params.actorType},
        ${params.actorName ?? null}
      )
    `);
  } catch {}
}

export async function logClientNotification(params: {
  phoneNumber: string;
  type: string;
  appointmentId?: number;
  businessName?: string;
  message: string;
}) {
  try {
    await db.execute(sql`
      INSERT INTO client_notifications (phone_number, type, appointment_id, business_name, message)
      VALUES (
        ${params.phoneNumber},
        ${params.type},
        ${params.appointmentId ?? null},
        ${params.businessName ?? null},
        ${params.message}
      )
    `);
  } catch {}
}

// ── Business notifications ────────────────────────────────────────────────────

router.get("/notifications/business", requireBusinessAuth, async (req, res): Promise<void> => {
  const bizId = req.business!.businessId;
  const rows = await db.execute(sql`
    SELECT id, type, appointment_id, message, actor_type, actor_name, is_read, created_at
    FROM notifications
    WHERE business_id = ${bizId}
    ORDER BY created_at DESC
    LIMIT 50
  `);
  const unread = await db.execute(sql`
    SELECT COUNT(*) as count FROM notifications
    WHERE business_id = ${bizId} AND is_read = FALSE
  `);
  res.json({
    notifications: rows.rows,
    unreadCount: parseInt((unread.rows[0] as any).count ?? "0"),
  });
});

router.post("/notifications/business/read-all", requireBusinessAuth, async (req, res): Promise<void> => {
  await db.execute(sql`
    UPDATE notifications SET is_read = TRUE
    WHERE business_id = ${req.business!.businessId}
  `);
  res.json({ success: true });
});

// POST /notifications/business/:id/read — mark a single notification
// as read. Called when the owner taps a notification row so the
// unread counter + highlight update immediately without waiting for
// "סמן הכל".
router.post("/notifications/business/:id/read", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.execute(sql`
    UPDATE notifications SET is_read = TRUE
    WHERE id = ${id} AND business_id = ${req.business!.businessId}
  `);
  res.json({ success: true });
});

router.delete("/notifications/business/all", requireBusinessAuth, async (req, res): Promise<void> => {
  await db.execute(sql`
    DELETE FROM notifications
    WHERE business_id = ${req.business!.businessId}
  `);
  res.json({ success: true });
});

// ── Client notifications ──────────────────────────────────────────────────────

router.get("/notifications/client", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ notifications: [], unreadCount: 0 }); return; }
  const rows = await db.execute(sql`
    SELECT id, type, appointment_id, business_name, message, is_read, created_at
    FROM client_notifications
    WHERE phone_number = ${phone}
    ORDER BY created_at DESC
    LIMIT 50
  `);
  const unread = await db.execute(sql`
    SELECT COUNT(*) as count FROM client_notifications
    WHERE phone_number = ${phone} AND is_read = FALSE
  `);
  res.json({
    notifications: rows.rows,
    unreadCount: parseInt((unread.rows[0] as any).count ?? "0"),
  });
});

router.post("/notifications/client/read-all", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ success: true }); return; }
  await db.execute(sql`
    UPDATE client_notifications SET is_read = TRUE
    WHERE phone_number = ${phone}
  `);
  res.json({ success: true });
});

router.delete("/notifications/client/all", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ success: true }); return; }
  await db.execute(sql`
    DELETE FROM client_notifications
    WHERE phone_number = ${phone}
  `);
  res.json({ success: true });
});

export default router;
