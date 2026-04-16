/**
 * Monthly subscription charge via Tranzila REST.
 *
 * Docs: https://docs.tranzila.com/docs/payments-billing/xsy729b5dsfct-create-a-credit-card-transaction
 *
 * Flow:
 *   1. 1st month: lilash2 iframe with tranmode=AK charges the card AND
 *      returns a TranzilaTK token via the notify webhook.
 *   2. Monthly: this module POSTs to /v1/transaction/credit_card/create
 *      with card_number=<TranzilaTK>. No CVV, no card_holder_id — the
 *      terminal is configured to accept token-based recurring charges.
 *
 * Auth: HMAC-SHA256 (same across all Tranzila REST endpoints).
 *
 * Env:
 *   TRANZILA_SUPPLIER        — lilash2
 *   TRANZILA_API_PUBLIC_KEY
 *   TRANZILA_API_SECRET_KEY
 */

import crypto from "crypto";
import { logger } from "./logger";

// Monthly token charges run on the TOK terminal (lilash2tok), which is
// configured to accept TranzilaTK without CVV or card_holder_id.
// The initial iframe charge runs on lilash2 (TRANZILA_SUPPLIER) and returns
// a token that is valid across sibling terminals in the same account.
const TERMINAL   = process.env.TRANZILA_SUPPLIER_TOK   ?? "";
const PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";

const TXN_URL = "https://api.tranzila.com/v1/transaction/credit_card/create";

export interface ChargeResult {
  success:      boolean;
  responseCode: string;
  rawResponse:  string;
}

function buildAuthHeaders(): Record<string, string> {
  // Tranzila rep's exact formula (ticket 537114012):
  //   CryptoJS.HmacSHA256(app_key, secret + timestamp + nonce).toString(CryptoJS.enc.Hex)
  // i.e. data=app_key, key=secret+timestamp+nonce, digest=HEX (not base64).
  const nonce       = crypto.randomBytes(20).toString("hex");
  const requestTime = String(Date.now()); // plain Unix ms, UTC

  const accessToken = crypto
    .createHmac("sha256", SECRET_KEY + requestTime + nonce)
    .update(PUBLIC_KEY)
    .digest("hex");

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
 * Charge the stored TranzilaTK token for one monthly subscription fee.
 * @param token       TranzilaTK from iframe tranmode=AK
 * @param expiry      MMYY (e.g. "0928")
 * @param amountILS   Amount in shekels
 * @param businessId  For logging + item name
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
    terminal_name:     TERMINAL,
    txn_currency_code: "ILS",
    txn_type:          "debit",
    expire_month:      expireMonth,
    expire_year:       expireYear,
    card_number:       token,   // TranzilaTK in place of PAN
    // NO cvv, NO card_holder_id — terminal accepts token without them
    items: [{
      name:         `חידוש מנוי פרו קבעתי - ${businessId}`,
      type:         "I",
      unit_price:   amountILS,
      units_number: 1,
      price_type:   "G",
    }],
    response_language: "hebrew",
    created_by_user:   "kavati-cron",
    created_by_system: "kavati",
  };

  const headers = buildAuthHeaders();

  // Always-visible request log — console.log bypasses pino truncation so we
  // can see exactly what went out of Railway.
  const reqTimeMs = Number(headers["X-tranzila-api-request-time"]);
  console.log("[TranzilaCharge] request →", {
    url:             TXN_URL,
    terminal:        TERMINAL,
    businessId,
    requestTime:     headers["X-tranzila-api-request-time"],
    nonce:           headers["X-tranzila-api-nonce"],
    accessToken:     headers["X-tranzila-api-access-token"], // full hex, for debugging
    publicKeyHead:   PUBLIC_KEY.slice(0, 20) + "…" + PUBLIC_KEY.slice(-10),
    publicKeyLen:    PUBLIC_KEY.length,
    secretLen:       SECRET_KEY.length,
  });

  try {
    const res         = await fetch(TXN_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });
    const rawResponse = await res.text();

    let data: {
      error_code?:         number;
      message?:            string;
      transaction_result?: { processor_response_code?: string };
    } = {};
    try { data = JSON.parse(rawResponse); } catch {}

    const responseCode = data.transaction_result?.processor_response_code
      ?? String(data.error_code ?? res.status);
    const success = res.ok
      && data.error_code === 0
      && data.transaction_result?.processor_response_code === "000";

    console.log("[TranzilaCharge] response ←", {
      businessId,
      status:        res.status,
      success,
      errorCode:     data.error_code,
      message:       data.message,
      responseCode,
      processorCode: data.transaction_result?.processor_response_code,
      rawBody:       rawResponse.slice(0, 500),
    });

    return { success, responseCode, rawResponse };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}
