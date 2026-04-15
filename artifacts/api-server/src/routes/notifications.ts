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

export async function logBusinessNotification(params: {
  businessId: number;
  type: string;
  appointmentId?: number;
  message: string;
  actorType: "client" | "business";
  actorName?: string;
}) {
  try {
    const msg = params.message.replace(/'/g, "''");
    const actor = (params.actorName ?? "").replace(/'/g, "''");
    await db.execute(sql.raw(
      `INSERT INTO notifications (business_id, type, appointment_id, message, actor_type, actor_name)
       VALUES (${params.businessId}, '${params.type}', ${params.appointmentId ?? "NULL"},
               '${msg}', '${params.actorType}',
               ${actor ? `'${actor}'` : "NULL"})`
    ));
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
    const phone = params.phoneNumber.replace(/'/g, "''");
    const biz = (params.businessName ?? "").replace(/'/g, "''");
    const msg = params.message.replace(/'/g, "''");
    await db.execute(sql.raw(
      `INSERT INTO client_notifications (phone_number, type, appointment_id, business_name, message)
       VALUES ('${phone}', '${params.type}',
               ${params.appointmentId ?? "NULL"},
               ${biz ? `'${biz}'` : "NULL"},
               '${msg}')`
    ));
  } catch {}
}

// ── Business notifications ────────────────────────────────────────────────────

router.get("/notifications/business", requireBusinessAuth, async (req, res): Promise<void> => {
  const bizId = req.business!.businessId;
  const rows = await db.execute(sql.raw(
    `SELECT id, type, appointment_id, message, actor_type, actor_name, is_read, created_at
     FROM notifications WHERE business_id = ${bizId}
     ORDER BY created_at DESC LIMIT 50`
  ));
  const unread = await db.execute(sql.raw(
    `SELECT COUNT(*) as count FROM notifications WHERE business_id = ${bizId} AND is_read = FALSE`
  ));
  res.json({
    notifications: rows.rows,
    unreadCount: parseInt((unread.rows[0] as any).count ?? "0"),
  });
});

router.post("/notifications/business/read-all", requireBusinessAuth, async (req, res): Promise<void> => {
  await db.execute(sql.raw(`UPDATE notifications SET is_read = TRUE WHERE business_id = ${req.business!.businessId}`));
  res.json({ success: true });
});

router.delete("/notifications/business/all", requireBusinessAuth, async (req, res): Promise<void> => {
  await db.execute(sql.raw(`DELETE FROM notifications WHERE business_id = ${req.business!.businessId}`));
  res.json({ success: true });
});

// ── Client notifications ──────────────────────────────────────────────────────

router.get("/notifications/client", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ notifications: [], unreadCount: 0 }); return; }
  const p = phone.replace(/'/g, "''");
  const rows = await db.execute(sql.raw(
    `SELECT id, type, appointment_id, business_name, message, is_read, created_at
     FROM client_notifications WHERE phone_number = '${p}'
     ORDER BY created_at DESC LIMIT 50`
  ));
  const unread = await db.execute(sql.raw(
    `SELECT COUNT(*) as count FROM client_notifications WHERE phone_number = '${p}' AND is_read = FALSE`
  ));
  res.json({
    notifications: rows.rows,
    unreadCount: parseInt((unread.rows[0] as any).count ?? "0"),
  });
});

router.post("/notifications/client/read-all", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ success: true }); return; }
  const p = phone.replace(/'/g, "''");
  await db.execute(sql.raw(`UPDATE client_notifications SET is_read = TRUE WHERE phone_number = '${p}'`));
  res.json({ success: true });
});

router.delete("/notifications/client/all", requireClientAuth, async (req, res): Promise<void> => {
  const phone = (req as any).clientSession?.phoneNumber;
  if (!phone) { res.json({ success: true }); return; }
  const p = phone.replace(/'/g, "''");
  await db.execute(sql.raw(`DELETE FROM client_notifications WHERE phone_number = '${p}'`));
  res.json({ success: true });
});

export default router;
