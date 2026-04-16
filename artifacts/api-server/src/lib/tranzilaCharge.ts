/**
 * Tranzila token-based monthly charge.
 *
 * Flow (per Tranzila docs + support ticket):
 *   1. Customer pays first month via lilash2 iframe (tranmode=AK). The iframe
 *      returns TranzilaTK + expdate in the notify callback.
 *   2. Monthly renewals hit POST https://api.tranzila.com/v1/transaction/create
 *      on lilash2tok (token terminal) using { card: { card_no: TranzilaTK } }.
 *      CVV and card_holder_id are NOT sent — the token terminal accepts
 *      tokenized recurring charges without them.
 *
 * Docs: https://docs.tranzila.com/docs/payments-billing/xsy729b5dsfct-create-a-credit-card-transaction
 *
 * Auth headers (same pattern as every /v1 /v2 Tranzila REST endpoint):
 *   X-tranzila-api-app-key      = public key
 *   X-tranzila-api-request-time = ms epoch
 *   X-tranzila-api-nonce        = 40-byte random
 *   X-tranzila-api-access-token = HMAC-SHA256 per spec
 *
 * Env vars:
 *   TRANZILA_SUPPLIER_TOK       — token terminal name (lilash2tok)
 *   TRANZILA_API_PUBLIC_KEY     — REST API public key
 *   TRANZILA_API_SECRET_KEY     — REST API secret for HMAC
 */

import crypto from "crypto";
import { logger } from "./logger";

const TERMINAL   = process.env.TRANZILA_SUPPLIER_TOK  ?? "";
const PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";

const TXN_URL = "https://api.tranzila.com/v1/transaction/create";

export interface ChargeResult {
  success:      boolean;
  responseCode: string;
  rawResponse:  string;
}

function buildAuthHeaders(): Record<string, string> {
  const nonce       = crypto.randomBytes(20).toString("hex");
  const requestTime = String(Date.now());
  const accessToken = crypto
    .createHmac("sha256", SECRET_KEY + requestTime + nonce)
    .update(PUBLIC_KEY)
    .digest("base64");

  return {
    "Content-Type":                "application/json",
    "Accept":                      "application/json",
    "X-tranzila-api-app-key":      PUBLIC_KEY,
    "X-tranzila-api-request-time": requestTime,
    "X-tranzila-api-nonce":        nonce,
    "X-tranzila-api-access-token": accessToken,
  };
}

/**
 * Charge a stored card token for subscription renewal.
 * @param token       TranzilaTK from initial charge
 * @param expiry      MMYY (e.g. "0928")
 * @param amountILS   Charge amount in shekels
 * @param businessId  For logging / pdesc correlation
 */
export async function chargeToken(
  token:      string,
  expiry:     string,
  amountILS:  number,
  businessId: number,
): Promise<ChargeResult> {
  if (!TERMINAL || !PUBLIC_KEY || !SECRET_KEY) {
    return {
      success:      false,
      responseCode: "ERR",
      rawResponse:  "Tranzila REST env vars missing",
    };
  }

  const expireMonth = parseInt(expiry.slice(0, 2), 10);
  const expireYear  = 2000 + parseInt(expiry.slice(2, 4), 10);

  const body = {
    terminal_name: TERMINAL,
    txn_currency_code: "ILS",
    txn_type:          "debit",
    reference_txn_id:  `kavati-sub-${businessId}-${Date.now()}`,
    card: {
      card_no:      token,      // TranzilaTK in place of PAN — token terminal
      expire_month: expireMonth,
      expire_year:  expireYear,
      // No cvv, no card_holder_id — lilash2tok is configured to skip them
    },
    items: [{
      name:         `חידוש מנוי פרו קבעתי - ${businessId}`,
      type:         "I",
      unit_price:   amountILS,
      units_number: 1,
      price_type:   "G",
    }],
    response_language: "hebrew",
  };

  try {
    const res = await fetch(TXN_URL, {
      method:  "POST",
      headers: buildAuthHeaders(),
      body:    JSON.stringify(body),
    });
    const rawResponse = await res.text();

    let data: { error_code?: number; processor_response_code?: string } = {};
    try { data = JSON.parse(rawResponse); } catch {}

    // Tranzila returns error_code=0 + processor_response_code="000" on success
    const responseCode = data.processor_response_code
      ?? String(data.error_code ?? res.status);
    const success = res.ok && data.error_code === 0 && data.processor_response_code === "000";

    logger.info({ businessId, status: res.status, responseCode, success }, "[TranzilaCharge] Token charge result");
    return { success, responseCode, rawResponse };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}
