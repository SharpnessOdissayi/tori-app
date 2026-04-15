/**
 * Tranzila REST API v1 client.
 * Used for creating Standing Orders (recurring subscriptions managed by Tranzila).
 *
 * Required env vars:
 *   TRANZILA_API_PUBLIC_KEY  — Application public key supplied by Tranzila
 *   TRANZILA_API_SECRET_KEY  — Secret used for HMAC signing
 *   TRANZILA_SUPPLIER_TOK    — Token-service terminal name (e.g. "lilash2tok")
 *
 * Auth: X-tranzila-api-access-token = HMAC-SHA256(key=secretKey, data=publicKey+requestTime+nonce)
 * Docs: https://docs.tranzila.com/docs/payments-billing/xyajxscasy205-create-a-standing-order
 */

import crypto from "crypto";
import { logger } from "./logger";

const API_PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const API_SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";
const SUPPLIER_TOK   = process.env.TRANZILA_SUPPLIER_TOK ?? "";

const STO_CREATE_URL = "https://api.tranzila.com/v1/sto/create";

function buildAuthHeaders(): Record<string, string> {
  const nonce       = crypto.randomBytes(20).toString("hex"); // 40-char hex string
  const requestTime = String(Date.now());
  const accessToken = crypto
    .createHmac("sha256", API_SECRET_KEY)
    .update(API_PUBLIC_KEY + requestTime + nonce)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-tranzila-api-app-key":      API_PUBLIC_KEY,
    "X-tranzila-api-nonce":        nonce,
    "X-tranzila-api-request-time": requestTime,
    "X-tranzila-api-access-token": accessToken,
  };
}

export interface CreateStoResult {
  success: boolean;
  stoId?: number;
  error?: string;
}

/**
 * Create a monthly Standing Order (STO) on Tranzila.
 * Once created, Tranzila charges the card on charge_dom each month automatically.
 *
 * @param token        - Card token from initial payment webhook
 * @param expiry       - Card expiry in MMYY format (e.g. "0127")
 * @param clientName   - Business owner name
 * @param clientEmail  - Business owner email
 * @param businessId   - Used in item name and logging
 * @param amountILS    - Monthly charge amount in ILS (e.g. 100)
 */
export async function createStandingOrder(params: {
  token: string;
  expiry: string; // MMYY
  clientName: string;
  clientEmail: string;
  businessId: number;
  amountILS: number;
}): Promise<CreateStoResult> {
  if (!API_PUBLIC_KEY || !API_SECRET_KEY) {
    logger.warn("[TranzilaREST] API keys not configured — skipping STO creation");
    return { success: false, error: "API keys not configured" };
  }

  // Parse MMYY → separate month / year integers
  const expireMonth = parseInt(params.expiry.slice(0, 2), 10);
  const expireYear  = 2000 + parseInt(params.expiry.slice(2, 4), 10);

  // Charge on the current day of month (same day each month)
  const chargeDom = Math.min(new Date().getDate(), 28);

  const body = {
    terminal_name:       SUPPLIER_TOK,
    sto_payments_number: 9999,       // effectively unlimited
    charge_frequency:    "monthly",
    charge_dom:          chargeDom,
    client: {
      name:  params.clientName,
      email: params.clientEmail,
    },
    item: {
      name:           `מנוי פרו קבעתי - ${params.businessId}`,
      unit_price:     params.amountILS,
      price_currency: "ILS",
    },
    card: {
      token:        params.token,
      expire_month: expireMonth,
      expire_year:  expireYear,
    },
    response_language: "hebrew",
  };

  try {
    const res = await fetch(STO_CREATE_URL, {
      method:  "POST",
      headers: buildAuthHeaders(),
      body:    JSON.stringify(body),
    });

    const data = await res.json() as { error_code: number; message: string; sto_id?: number };
    logger.info({ businessId: params.businessId, errorCode: data.error_code, stoId: data.sto_id }, "[TranzilaREST] STO create response");

    if (data.error_code === 0 && data.sto_id) {
      return { success: true, stoId: data.sto_id };
    }
    return { success: false, error: data.message };
  } catch (err) {
    logger.error({ err, businessId: params.businessId }, "[TranzilaREST] STO create failed");
    return { success: false, error: String(err) };
  }
}
