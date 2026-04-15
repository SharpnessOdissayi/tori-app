/**
 * Tranzila REST API v1 client.
 * Used for creating Standing Orders (recurring subscriptions managed by Tranzila).
 *
 * Required env vars:
 *   TRANZILA_API_PUBLIC_KEY  — Application public key supplied by Tranzila
 *   TRANZILA_API_SECRET_KEY  — Secret used for HMAC signing
 *   TRANZILA_SUPPLIER_TOK    — Tokenization terminal (lilash2tok). This MUST be the
 *                              same terminal that processed the initial charge,
 *                              because only the tokenization terminal returns and
 *                              honors the card token.
 *
 * Auth (per v2 spec): "hash_hmac using 'sha256' on application key with secret + request-time + nonce".
 * Parsed as PHP's hash_hmac($algo, $data, $key): data = public key, key = secret + request-time + nonce.
 * So: X-tranzila-api-access-token = HMAC-SHA256(key = secret + requestTime + nonce, data = publicKey).
 *
 * Docs:
 *   STO create v2: https://api.tranzila.com/v2/sto/create
 *   STO for My-Billing: https://docs.tranzila.com/docs/payments-billing/wbvbx8p3i3pu4-sto-api-for-my-billing
 */

import crypto from "crypto";
import { logger } from "./logger";

const API_PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const API_SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";
const SUPPLIER_TOK   = process.env.TRANZILA_SUPPLIER_TOK ?? "";

const STO_CREATE_URL = "https://api.tranzila.com/v2/sto/create";

function buildAuthHeaders(): Record<string, string> {
  const nonce       = crypto.randomBytes(20).toString("hex"); // 40-char hex string
  const requestTime = String(Date.now());

  // Tranzila spec wording: "hash_hmac using 'sha256' on application key with
  // secret + request-time + nonce". Crucially the spec links to jokecamp.com's
  // HMAC-SHA256 reference — ALL examples there output **base64**, not hex.
  // Our previous three attempts all used hex digest and were rejected with a
  // generic gateway 401. Switching to base64, using the standard HMAC recipe:
  //   key  = API_SECRET_KEY
  //   data = API_PUBLIC_KEY + requestTime + nonce
  //   out  = base64
  const accessToken = crypto
    .createHmac("sha256", API_SECRET_KEY)
    .update(API_PUBLIC_KEY + requestTime + nonce)
    .digest("base64");

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

  // v2 spec: https://api.tranzila.com/v2/sto/create — uses `items` (array), not `item`.
  const body = {
    terminal_name:       SUPPLIER_TOK,
    sto_payments_number: 9999,            // effectively unlimited
    charge_frequency:    "monthly",
    charge_dom:          chargeDom,
    currency_code:       "ILS",
    items: [
      {
        name:           `מנוי פרו קבעתי - ${params.businessId}`,
        type:           "S",              // S = Service
        unit_price:     params.amountILS,
        units_number:   1,
        price_type:     "G",              // G = Gross (VAT included)
      },
    ],
    client: {
      name:  params.clientName,
      email: params.clientEmail,
    },
    card: {
      token:        params.token,
      expire_month: expireMonth,
      expire_year:  expireYear,
    },
    response_language: "hebrew",
    created_by_user:   "kavati-saas",
  };

  const headers = buildAuthHeaders();

  // Debug: print request meta so HMAC inputs are visible in Railway logs.
  // Truncate the token to avoid leaking the full signing material.
  console.log("[TranzilaREST] STO create request →", {
    url:             STO_CREATE_URL,
    terminal:        SUPPLIER_TOK,
    publicKeyLen:    API_PUBLIC_KEY.length,
    secretLen:       API_SECRET_KEY.length,
    nonce:           headers["X-tranzila-api-nonce"],
    requestTime:     headers["X-tranzila-api-request-time"],
    accessTokenHead: headers["X-tranzila-api-access-token"].slice(0, 16) + "…",
    body:            { ...body, card: { ...body.card, token: String(body.card.token).slice(0, 6) + "…" } },
  });

  try {
    const res = await fetch(STO_CREATE_URL, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    });

    // Read body as text first so 401/5xx responses (which may be HTML or plain text)
    // don't throw on res.json(). Then best-effort parse.
    const rawText = await res.text();
    let data: {
      error_code?: number;
      message?: string;
      sto_id?: number;
      mismatch_info?: Array<{
        keyword?: string;
        keyword_args?: unknown;
        data?: unknown;
        data_path?: string[];
        sub_errors?: unknown[];
      }>;
    } = {};
    try { data = JSON.parse(rawText); } catch { /* non-JSON — keep rawText for log */ }

    // Use console.log so the line is visible in Railway's log view
    // (pino JSON gets truncated/collapsed there).
    console.log("[TranzilaREST] STO create response ←", {
      businessId: params.businessId,
      status:     res.status,
      errorCode:  data.error_code,
      stoId:      data.sto_id,
      msg:        data.message,
      mismatches: data.mismatch_info,
      rawBody:    rawText.slice(0, 500),
    });

    if (res.ok && data.error_code === 0 && data.sto_id) {
      return { success: true, stoId: data.sto_id };
    }

    // Surface the first validation mismatch path alongside the app error code,
    // e.g. "[20301] items.0.unit_price: required — Failed to insert STO"
    const firstMismatch = data.mismatch_info?.[0];
    const mismatchStr = firstMismatch
      ? ` — ${firstMismatch.data_path?.join(".") ?? "?"}: ${firstMismatch.keyword ?? "?"}`
      : "";
    return {
      success: false,
      error:   `[${data.error_code ?? res.status}] ${data.message ?? "unknown"}${mismatchStr}`,
    };
  } catch (err) {
    logger.error({ err, businessId: params.businessId }, "[TranzilaREST] STO create failed");
    return { success: false, error: String(err) };
  }
}
