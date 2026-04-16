/**
 * Receipt service — two issuer types:
 *
 *   1. Kavati → business-owner  (Kavati is עוסק פטור, wife's ת.ז.)
 *      Triggered on successful Tranzila subscription payments.
 *      Single global numbering sequence across all customers.
 *
 *   2. Business-owner → their client  (the dashboard "receipts" tab)
 *      Each business keeps its own per-issuer numbering sequence.
 *      The business's own tax_id / legal_name / invoice_address go on
 *      the receipt, not Kavati's.
 *
 * Israeli tax law notes:
 *   - עוסק פטור may issue קבלה (receipt) but NOT חשבונית מס.
 *   - Receipts need a strictly monotonic per-issuer number — no gaps.
 *   - No Tax Authority allocation number is required for receipts under
 *     ~20,000 ILS per transaction.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

// ─── Kavati's own details (עוסק פטור — אשתי של אופק) ─────────────────────
// Hard-coded so they can't drift — these are the legal identifiers on every
// receipt Kavati issues. Change only with intent.
export const KAVATI_ISSUER = {
  legalName: "Kavati",
  legalType: "exempt",                    // עוסק פטור
  taxId:     "207975202",                 // ת.ז. של אשתי (הגורם הרשמי)
  address:   "הרב אומן 8, אומן",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatILS(agorot: number): string {
  return `₪${(agorot / 100).toFixed(2)}`;
}

function formatDateIL(d: Date = new Date()): string {
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Atomic next-number grab for Kavati's global sequence.
// Wrapped in a serialisable transaction so two webhook firings don't race
// each other to the same MAX+1 and collide on the unique receipt_number.
async function nextKavatiReceiptNumber(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(MAX(receipt_number), 0) + 1 AS n FROM kavati_receipts
  `);
  return Number((rows.rows[0] as any).n ?? 1);
}

// Per-business numbering sequence. Uses a parameterised query — the previous
// sql.raw + string interpolation exposed the endpoint to SQL injection via
// businessId had it ever been user-controlled (it isn't today, but the helper
// should be safe regardless of caller).
async function nextBusinessReceiptNumber(businessId: number): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(MAX(receipt_number), 0) + 1 AS n
    FROM business_receipts
    WHERE business_id = ${businessId}
  `);
  return Number((rows.rows[0] as any).n ?? 1);
}

// ─── Issue: Kavati → Business Owner (subscription) ────────────────────────

export interface IssueKavatiReceiptParams {
  businessId:       number;
  businessName:     string;
  businessEmail:    string;
  businessTaxId?:   string | null;
  amountAgorot:     number;
  paymentMethod?:   string;         // 'credit_card'
  paymentReference?: string;        // Tranzila ConfirmationCode
  purpose:          "subscription_initial" | "subscription_renewal";
  description?:     string;
}

export async function issueKavatiReceipt(params: IssueKavatiReceiptParams): Promise<{ receiptNumber: number }> {
  const receiptNumber = await nextKavatiReceiptNumber();
  const description = params.description ?? (
    params.purpose === "subscription_initial"
      ? "מנוי פרו — חיוב ראשון"
      : "מנוי פרו — חידוש חודשי"
  );

  await db.execute(sql`
    INSERT INTO kavati_receipts
      (receipt_number, business_id, business_name, business_email, business_tax_id,
       amount_agorot, payment_method, payment_reference, purpose, description)
    VALUES
      (${receiptNumber}, ${params.businessId}, ${params.businessName}, ${params.businessEmail}, ${params.businessTaxId ?? null},
       ${params.amountAgorot}, ${params.paymentMethod ?? "credit_card"}, ${params.paymentReference ?? null}, ${params.purpose}, ${description})
  `);

  const html = renderKavatiReceiptHtml({
    receiptNumber,
    date:              formatDateIL(),
    clientName:        params.businessName,
    clientEmail:       params.businessEmail,
    clientTaxId:       params.businessTaxId ?? null,
    description,
    amount:            formatILS(params.amountAgorot),
    paymentMethod:     params.paymentMethod === "credit_card" ? "כרטיס אשראי" : (params.paymentMethod ?? ""),
    paymentReference:  params.paymentReference ?? "",
  });

  try {
    await sendEmail(params.businessEmail, `קבלה מספר ${receiptNumber} — Kavati`, html);
  } catch (e) {
    logger.error({ err: e, receiptNumber, to: params.businessEmail }, "[receipts] Kavati receipt email failed");
  }

  logger.info({ receiptNumber, businessId: params.businessId }, "[receipts] Kavati receipt issued");
  return { receiptNumber };
}

// ─── Issue: Business Owner → Client ───────────────────────────────────────

export interface IssueBusinessReceiptParams {
  businessId:       number;
  businessLegalName:string;
  businessTaxId:    string;
  businessLegalType?: "exempt" | "authorized" | "company" | null;
  businessAddress?: string | null;
  clientName?:      string | null;
  clientPhone?:     string | null;
  clientEmail?:     string | null;
  amountAgorot:     number;
  paymentMethod?:   string;
  description?:     string;
  appointmentId?:   number | null;
}

export async function issueBusinessReceipt(params: IssueBusinessReceiptParams): Promise<{ receiptNumber: number }> {
  const receiptNumber = await nextBusinessReceiptNumber(params.businessId);

  await db.execute(sql`
    INSERT INTO business_receipts
      (business_id, receipt_number, client_name, client_phone, client_email,
       amount_agorot, payment_method, description, appointment_id)
    VALUES
      (${params.businessId}, ${receiptNumber}, ${params.clientName ?? null}, ${params.clientPhone ?? null}, ${params.clientEmail ?? null},
       ${params.amountAgorot}, ${params.paymentMethod ?? "credit_card"}, ${params.description ?? null}, ${params.appointmentId ?? null})
  `);

  // Email only if we have a client email address.
  if (params.clientEmail) {
    const html = renderBusinessReceiptHtml({
      receiptNumber,
      date:              formatDateIL(),
      issuerName:        params.businessLegalName,
      issuerTaxId:       params.businessTaxId,
      issuerLegalType:   legalTypeLabel(params.businessLegalType),
      issuerAddress:     params.businessAddress ?? "",
      clientName:        params.clientName ?? "",
      description:       params.description ?? "תשלום עבור שירות",
      amount:            formatILS(params.amountAgorot),
      paymentMethod:     params.paymentMethod === "credit_card" ? "כרטיס אשראי" : (params.paymentMethod ?? ""),
    });
    try {
      await sendEmail(params.clientEmail, `קבלה מספר ${receiptNumber} — ${params.businessLegalName}`, html);
    } catch (e) {
      logger.error({ err: e, receiptNumber }, "[receipts] business receipt email failed");
    }
  }

  return { receiptNumber };
}

function legalTypeLabel(t?: string | null): string {
  if (t === "exempt") return "עוסק פטור";
  if (t === "authorized") return "עוסק מורשה";
  if (t === "company") return "חברה בע\"מ";
  return "";
}

// ─── Email HTML templates ─────────────────────────────────────────────────

interface KavatiReceiptView {
  receiptNumber:    number;
  date:             string;
  clientName:       string;
  clientEmail:      string;
  clientTaxId:      string | null;
  description:      string;
  amount:           string;
  paymentMethod:    string;
  paymentReference: string;
}

function renderKavatiReceiptHtml(v: KavatiReceiptView): string {
  return `
  <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
    <div style="text-align:center; padding-bottom: 16px; border-bottom: 2px solid #111;">
      <h1 style="margin: 0; font-size: 24px;">קבלה</h1>
      <p style="margin: 8px 0 0; font-size: 18px; font-weight: bold;">מספר ${v.receiptNumber}</p>
    </div>
    <div style="margin: 20px 0; display: flex; justify-content: space-between; gap: 16px;">
      <div style="flex: 1;">
        <p style="margin: 0 0 4px; color: #666; font-size: 12px;">מוציא הקבלה</p>
        <p style="margin: 0; font-weight: bold;">${KAVATI_ISSUER.legalName}</p>
        <p style="margin: 2px 0 0; font-size: 13px;">עוסק פטור · ת.ז. ${KAVATI_ISSUER.taxId}</p>
        <p style="margin: 2px 0 0; font-size: 13px;">${KAVATI_ISSUER.address}</p>
      </div>
      <div style="flex: 1; text-align: left;">
        <p style="margin: 0 0 4px; color: #666; font-size: 12px;">תאריך</p>
        <p style="margin: 0; font-weight: bold;">${v.date}</p>
      </div>
    </div>
    <div style="margin: 16px 0; padding: 12px; background: #f5f5f5; border-radius: 8px;">
      <p style="margin: 0 0 4px; color: #666; font-size: 12px;">משלם</p>
      <p style="margin: 0; font-weight: bold;">${v.clientName}</p>
      ${v.clientTaxId ? `<p style="margin: 2px 0 0; font-size: 13px;">ח.פ / ת.ז. ${v.clientTaxId}</p>` : ""}
      <p style="margin: 2px 0 0; font-size: 13px;">${v.clientEmail}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${v.description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: left; font-weight: bold;">${v.amount}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-size: 16px; font-weight: bold;">סה"כ לתשלום</td>
        <td style="padding: 12px; text-align: left; font-size: 20px; font-weight: bold;">${v.amount}</td>
      </tr>
    </table>
    <div style="margin: 12px 0; font-size: 13px; color: #444;">
      אופן תשלום: ${v.paymentMethod}${v.paymentReference ? ` · מס' אישור: ${v.paymentReference}` : ""}
    </div>
    <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #888;">
      מסמך זה מהווה קבלה בלבד. כעוסק פטור, Kavati אינה גובה מע"מ ואינה מוציאה חשבונית מס.
    </div>
  </div>`;
}

interface BusinessReceiptView {
  receiptNumber:    number;
  date:             string;
  issuerName:       string;
  issuerTaxId:      string;
  issuerLegalType:  string;
  issuerAddress:    string;
  clientName:       string;
  description:      string;
  amount:           string;
  paymentMethod:    string;
}

function renderBusinessReceiptHtml(v: BusinessReceiptView): string {
  return `
  <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
    <div style="text-align:center; padding-bottom: 16px; border-bottom: 2px solid #111;">
      <h1 style="margin: 0; font-size: 24px;">קבלה</h1>
      <p style="margin: 8px 0 0; font-size: 18px; font-weight: bold;">מספר ${v.receiptNumber}</p>
    </div>
    <div style="margin: 20px 0; display: flex; justify-content: space-between; gap: 16px;">
      <div style="flex: 1;">
        <p style="margin: 0 0 4px; color: #666; font-size: 12px;">מוציא הקבלה</p>
        <p style="margin: 0; font-weight: bold;">${v.issuerName}</p>
        ${v.issuerLegalType ? `<p style="margin: 2px 0 0; font-size: 13px;">${v.issuerLegalType}</p>` : ""}
        <p style="margin: 2px 0 0; font-size: 13px;">ח.פ / ת.ז. ${v.issuerTaxId}</p>
        ${v.issuerAddress ? `<p style="margin: 2px 0 0; font-size: 13px;">${v.issuerAddress}</p>` : ""}
      </div>
      <div style="flex: 1; text-align: left;">
        <p style="margin: 0 0 4px; color: #666; font-size: 12px;">תאריך</p>
        <p style="margin: 0; font-weight: bold;">${v.date}</p>
      </div>
    </div>
    ${v.clientName ? `
    <div style="margin: 16px 0; padding: 12px; background: #f5f5f5; border-radius: 8px;">
      <p style="margin: 0 0 4px; color: #666; font-size: 12px;">משלם</p>
      <p style="margin: 0; font-weight: bold;">${v.clientName}</p>
    </div>` : ""}
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${v.description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd; text-align: left; font-weight: bold;">${v.amount}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-size: 16px; font-weight: bold;">סה"כ לתשלום</td>
        <td style="padding: 12px; text-align: left; font-size: 20px; font-weight: bold;">${v.amount}</td>
      </tr>
    </table>
    <div style="margin: 12px 0; font-size: 13px; color: #444;">
      אופן תשלום: ${v.paymentMethod}
    </div>
  </div>`;
}
