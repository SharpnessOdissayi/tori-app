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

const TERMINAL   = process.env.TRANZILA_SUPPLIER       ?? "";
const PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";

const TXN_URL = "https://api.tranzila.com/v1/transaction/credit_card/create";

export interface ChargeResult {
  success:      boolean;
  responseCode: string;
  rawResponse:  string;
}

function buildAuthHeaders(): Record<string, string> {
  const nonce = crypto.randomBytes(20).toString("hex");

  // Tranzila support told us "request-time must be in Israel-clock time".
  // Unix timestamps are timezone-independent by definition, but their
  // validator may be comparing naively against Asia/Jerusalem local time.
  // So we add IDT offset (+3h) to ms-since-epoch. TRANZILA_TIME_UTC=true
  // reverts to standard Unix time.
  const ISRAEL_OFFSET_MS = 3 * 60 * 60 * 1000;
  const useUtc           = process.env.TRANZILA_TIME_UTC === "true";
  const requestTime      = String(Date.now() + (useUtc ? 0 : ISRAEL_OFFSET_MS));

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
    reqTimeAsIL:     new Date(reqTimeMs).toISOString().replace("Z", " (UTC→read as IL wall clock)"),
    actualUTCnow:    new Date().toISOString(),
    serverTZoffset:  -new Date().getTimezoneOffset() / 60 + "h",
    nonce:           headers["X-tranzila-api-nonce"],
    accessTokenHead: headers["X-tranzila-api-access-token"].slice(0, 16) + "…",
    publicKeyLen:    PUBLIC_KEY.length,
    secretLen:       SECRET_KEY.length,
    timeMode:        process.env.TRANZILA_TIME_UTC === "true" ? "UTC" : "IL (+3h)",
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
