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
  stoId?:       number;   // populated on createSto success
}

export interface StoInfo {
  stoId:              number;
  stoStatus:          string;            // "active" | "inactive"
  chargeAmount:       number;
  chargeFrequency:    string;            // "monthly" etc.
  chargeDom:          number;
  firstChargeDate:    string | null;     // YYYY-MM-DD
  lastChargeDateTime: string | null;     // ISO timestamp (null if never charged)
  nextChargeDateTime: string | null;     // ISO timestamp
  stoPaymentsNumber:  number;
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
  // (not `card_number`). Both first_charge_date AND charge_dom are
  // required.
  //
  // Business rule: the customer pays the first ₪50 via the iframe on
  // signup day. From then on, the STO re-charges on the SAME day of
  // each month. So if someone signs up on the 16th, they're billed
  // every 16th going forward. Next charge = signup date + 1 month.
  const now             = new Date();
  const firstCharge     = new Date(now);
  firstCharge.setMonth(firstCharge.getMonth() + 1);  // one month from today
  const firstChargeDate = firstCharge.toISOString().slice(0, 10); // YYYY-MM-DD
  const chargeDom       = Math.min(now.getDate(), 28); // Tranzila caps at 28

  const body = {
    terminal_name:       TERMINAL,
    sto_payments_number: 12,
    charge_frequency:    "monthly",
    first_charge_date:   firstChargeDate,
    charge_dom:          chargeDom,
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

    return { success, responseCode, rawResponse, stoId: data.sto_id };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}

// ─── STO retrieval (POST /v1/stos/get) ──────────────────────────────────────
// Same HMAC headers, query-style body. Returns the full STO record
// including `next_charge_date_time` so we can show the customer when
// they'll be charged next.

const STO_GET_URL = "https://api.tranzila.com/v1/stos/get";

export async function getSto(stoId: number): Promise<StoInfo | null> {
  if (!TERMINAL || !PUBLIC_KEY || !SECRET_KEY) return null;

  const body = {
    terminal_name: TERMINAL,
    sto_id:        stoId,
  };

  try {
    const res = await fetch(STO_GET_URL, {
      method:  "POST",
      headers: buildAuthHeaders(),
      body:    JSON.stringify(body),
    });
    const rawResponse = await res.text();

    let data: {
      error_code?: number;
      stos?: Array<{
        sto_id?:                number;
        sto_status?:            string;
        charge_amount?:         number;
        charge_frequency?:      string;
        charge_dom?:            number;
        first_charge_date?:     string;
        last_charge_date_time?: string;
        next_charge_date_time?: string;
        sto_payments_number?:  number;
      }>;
    } = {};
    try { data = JSON.parse(rawResponse); } catch {}

    if (!res.ok || data.error_code !== 0 || !data.stos?.[0]) {
      console.warn("[TranzilaSTO.get] failed", {
        stoId, status: res.status, errorCode: data.error_code, rawBody: rawResponse.slice(0, 300),
      });
      return null;
    }

    const s = data.stos[0];
    return {
      stoId:              s.sto_id              ?? stoId,
      stoStatus:          s.sto_status          ?? "unknown",
      chargeAmount:       s.charge_amount       ?? 0,
      chargeFrequency:    s.charge_frequency    ?? "",
      chargeDom:          s.charge_dom          ?? 0,
      firstChargeDate:    s.first_charge_date    ?? null,
      lastChargeDateTime: s.last_charge_date_time ?? null,
      nextChargeDateTime: s.next_charge_date_time ?? null,
      stoPaymentsNumber:  s.sto_payments_number ?? 0,
    };
  } catch (err) {
    logger.error({ err, stoId }, "[TranzilaSTO.get] request failed");
    return null;
  }
}

// ─── STO update (POST /v1/sto/update) ───────────────────────────────────────
// Primarily used to cancel a subscription — set sto_status to "inactive".

const STO_UPDATE_URL = "https://api.tranzila.com/v1/sto/update";

export async function updateSto(stoId: number, status: "active" | "inactive"): Promise<boolean> {
  if (!TERMINAL || !PUBLIC_KEY || !SECRET_KEY) return false;

  const body = {
    terminal_name:   TERMINAL,
    sto_id:          stoId,
    sto_status:      status,
    response_language: "hebrew",
    updated_by_user: "kavati",
  };

  try {
    const res = await fetch(STO_UPDATE_URL, {
      method:  "POST",
      headers: buildAuthHeaders(),
      body:    JSON.stringify(body),
    });
    const rawResponse = await res.text();

    let data: { error_code?: number; message?: string } = {};
    try { data = JSON.parse(rawResponse); } catch {}

    const ok = res.ok && data.error_code === 0;
    console.log("[TranzilaSTO.update]", {
      stoId, status, httpStatus: res.status, ok, message: data.message,
    });
    return ok;
  } catch (err) {
    logger.error({ err, stoId }, "[TranzilaSTO.update] request failed");
    return false;
  }
}
