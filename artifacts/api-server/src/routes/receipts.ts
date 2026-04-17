/**
 * Business-owner receipts — list / create / get single.
 * All endpoints require a business auth token; everything is scoped to
 * the authenticated business's own receipts.
 */

import { Router } from "express";
import { db, businessesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireBusinessAuth } from "../middlewares/business-auth";
import { issueBusinessReceipt } from "../lib/receipts";

const router = Router();

// GET /business/receipts — list the authenticated business's receipts
router.get("/business/receipts", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const rows = await db.execute(sql`
    SELECT id, receipt_number, client_name, client_phone, client_email,
           amount_agorot, currency, payment_method, description,
           appointment_id, issued_at
    FROM business_receipts
    WHERE business_id = ${businessId}
    ORDER BY receipt_number DESC
    LIMIT 200
  `);
  res.json(rows.rows);
});

// POST /business/receipts — manually issue a receipt to a client
router.post("/business/receipts", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const { clientName, clientPhone, clientEmail, amountILS, description, paymentMethod, appointmentId } = req.body ?? {};

  const amountNum = Number(amountILS);
  if (!amountNum || amountNum <= 0) {
    res.status(400).json({ error: "invalid_amount", message: "סכום לא תקין" });
    return;
  }

  // Pull the business's own invoice profile (tax id, legal name, address).
  // Without a tax_id we refuse to issue — a receipt without an issuer ID
  // isn't a valid receipt.
  const [biz] = await db
    .select({
      name:        businessesTable.name,
      legalName:   (businessesTable as any).businessLegalName,
      taxId:       (businessesTable as any).businessTaxId,
      legalType:   (businessesTable as any).businessLegalType,
      address:     (businessesTable as any).invoiceAddress,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));

  if (!biz?.taxId) {
    res.status(400).json({
      error: "missing_tax_id",
      message: "חובה למלא ח.פ / ת.ז. בהגדרות העסק לפני הנפקת קבלה",
    });
    return;
  }

  const result = await issueBusinessReceipt({
    businessId,
    businessLegalName: biz.legalName ?? biz.name,
    businessTaxId:     biz.taxId,
    businessLegalType: (biz.legalType as any) ?? null,
    businessAddress:   biz.address ?? null,
    clientName:        clientName ?? null,
    clientPhone:       clientPhone ?? null,
    clientEmail:       clientEmail ?? null,
    amountAgorot:      Math.round(amountNum * 100),
    description:       description ?? null,
    paymentMethod:     paymentMethod ?? "credit_card",
    appointmentId:     appointmentId ?? null,
  });

  res.status(201).json({ receiptNumber: result.receiptNumber });
});

// GET /business/receipts/:id — single receipt detail
router.get("/business/receipts/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db.execute(sql`
    SELECT id, receipt_number, client_name, client_phone, client_email,
           amount_agorot, currency, payment_method, description,
           appointment_id, issued_at
    FROM business_receipts
    WHERE id = ${id} AND business_id = ${businessId}
  `);
  const row = rows.rows[0];
  if (!row) { res.status(404).json({ error: "Receipt not found" }); return; }
  res.json(row);
});

// DELETE /business/receipts/:id — hard-delete a receipt row.
//
// NOTE: Israeli tax law generally expects a "cancellation receipt"
// (קבלת זיכוי) rather than a physical delete. The owner asked for
// an actual delete so the receipt disappears from the dashboard and
// no longer counts in the running total; the row is removed outright.
// If you need to keep a legal audit trail elsewhere, do it before
// calling this endpoint.
router.delete("/business/receipts/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const result = await db.execute(sql`
    DELETE FROM business_receipts
    WHERE id = ${id} AND business_id = ${businessId}
    RETURNING id
  `);
  if (result.rows.length === 0) { res.status(404).json({ error: "Receipt not found" }); return; }
  res.json({ success: true });
});

export default router;
