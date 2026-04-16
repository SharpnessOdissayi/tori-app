/**
 * Monthly subscription — create a Standing Order (STO) on Tranzila.
 *
 * Docs: https://docs.tranzila.com/docs/payments-billing/3wsj0fk3dkhqa-create-a-standing-order (v1)
 *
 * Flow (per Tranzila rep guidance 2026-04-16):
 *   1. 1st month: lilash2 iframe with tranmode=AK charges the card and
 *      returns a TranzilaTK token via the notify webhook.
 *   2. From the dashboard test button OR the monthly cron: we hit
 *      POST https://api.tranzila.com/v1/sto/create with the stored
 *      TranzilaTK. Tranzila then auto-charges the card every month on
 *      charge_dom without us having to do anything.
 *
 * Auth: HMAC-SHA256 — identical to all other Tranzila REST endpoints
 *       (worked on /v1/transaction/credit_card/create, reused verbatim).
 *
 * Env:
 *   TRANZILA_SUPPLIER_TOK    — lilash2tok (token terminal)
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

const TXN_URL = "https://api.tranzila.com/v1/sto/create";

export interface ChargeResult {
  success:      boolean;
  responseCode: string;
  rawResponse:  string;
}

function buildAuthHeaders(): Record<string, string> {
  // Tranzila rep's working Postman example (ticket 209371328):
  //   var timestamp = Math.floor(Date.now() / 1000);  ← SECONDS, not ms
  //   var access_key = CryptoJS.HmacSHA256(app_key, secret + timestamp + nonce)
  //                             .toString(CryptoJS.enc.Hex);
  // i.e. data=app_key, key=secret+timestamp+nonce, digest=HEX, time=SECONDS.
  const nonce       = crypto.randomBytes(20).toString("hex");
  const requestTime = String(Math.floor(Date.now() / 1000)); // Unix seconds

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

  // v1 STO body per docs: single `item` object (not array) + `card.token`
  // (not `card_number`). charge_dom = today capped at 28.
  const body = {
    terminal_name:       TERMINAL,
    sto_payments_number: 12,
    charge_frequency:    "monthly",
    charge_dom:          Math.min(new Date().getDate(), 28),
    item: {
      name:           `מנוי פרו קבעתי - ${businessId}`,
      unit_price:     amountILS,
      units_number:   1,
      price_currency: "ILS",
      price_type:     "G",
    },
    card: {
      token:        token,
      expire_month: expireMonth,
      expire_year:  expireYear,
    },
    response_language: "hebrew",
    created_by_user:   "kavati-cron",
  };

  const headers = buildAuthHeaders();

  // Always-visible request log — console.log bypasses pino truncation so we
  // can see exactly what went out of Railway.
  const reqTimeMs = Number(headers["X-tranzila-api-request-time"]);
  console.log("[TranzilaCharge] request →", {
    url:         TXN_URL,
    terminal:    TERMINAL,
    businessId,
    requestTime: headers["X-tranzila-api-request-time"],
    nonce:       headers["X-tranzila-api-nonce"],
  });

  try {
    const res         = await fetch(TXN_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });
    const rawResponse = await res.text();

    let data: {
      error_code?: number;
      message?:    string;
      sto_id?:     number;
    } = {};
    try { data = JSON.parse(rawResponse); } catch {}

    // STO success = error_code 0 + a numeric sto_id returned.
    // No SHVA processor code here — Tranzila handles charging the card
    // itself later on the configured schedule.
    const success      = res.ok && data.error_code === 0 && !!data.sto_id;
    const responseCode = String(data.error_code ?? res.status);

    console.log("[TranzilaCharge] STO response ←", {
      businessId,
      status:    res.status,
      success,
      errorCode: data.error_code,
      message:   data.message,
      stoId:     data.sto_id,
      rawBody:   rawResponse.slice(0, 500),
    });

    return { success, responseCode, rawResponse };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}
