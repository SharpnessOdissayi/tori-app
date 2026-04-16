/**
 * Tranzila Standing Order (STO) creation — v1 API.
 *
 * Docs: https://docs.tranzila.com/docs/payments-billing/3wsj0fk3dkhqa-create-a-standing-order
 *
 * Called once after the initial iframe charge (tranmode=AK) to register a
 * monthly STO on Tranzila's side. If creation succeeds → Tranzila itself
 * charges every month. If it fails → subscriptionCron falls back to
 * manual monthly charges via /v1/transaction/credit_card/create.
 *
 * Auth: HMAC-SHA256 (key=secret+time+nonce, data=publicKey, base64 digest).
 */

import crypto from "crypto";
import { logger } from "./logger";

const TERMINAL   = process.env.TRANZILA_SUPPLIER       ?? "";
const PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";

const STO_URL = "https://api.tranzila.com/v1/sto/create";

export interface CreateStoResult {
  success: boolean;
  stoId?:  number;
  error?:  string;
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

export async function createStandingOrder(params: {
  token:       string;
  expireMonth: number;
  expireYear:  number;
  clientName:  string;
  clientEmail: string;
  businessId:  number;
  amountILS:   number;
}): Promise<CreateStoResult> {
  if (!TERMINAL || !PUBLIC_KEY || !SECRET_KEY) {
    return { success: false, error: "Tranzila REST env vars missing" };
  }

  // v1 STO schema uses a single `item` object (not `items` array).
  const body = {
    terminal_name:       TERMINAL,
    sto_payments_number: 9999,
    charge_frequency:    "monthly",
    charge_dom:          Math.min(new Date().getDate(), 28),
    client: {
      name:  params.clientName,
      email: params.clientEmail,
    },
    item: {
      name:           `מנוי פרו קבעתי - ${params.businessId}`,
      unit_price:     params.amountILS,
      units_number:   1,
      price_currency: "ILS",
      price_type:     "G",
    },
    card: {
      token:        params.token,
      expire_month: params.expireMonth,
      expire_year:  params.expireYear,
    },
    response_language: "hebrew",
    created_by_user:   "kavati",
  };

  try {
    const res  = await fetch(STO_URL, {
      method:  "POST",
      headers: buildAuthHeaders(),
      body:    JSON.stringify(body),
    });
    const text = await res.text();
    let data: { error_code?: number; message?: string; sto_id?: number } = {};
    try { data = JSON.parse(text); } catch {}

    console.log("[Tranzila STOv1] response", {
      status:    res.status,
      errorCode: data.error_code,
      message:   data.message,
      stoId:     data.sto_id,
      rawBody:   text.slice(0, 500),
    });

    if (res.ok && data.error_code === 0 && data.sto_id) {
      return { success: true, stoId: data.sto_id };
    }
    return {
      success: false,
      error:   `[${data.error_code ?? res.status}] ${data.message ?? "Unknown"}`,
    };
  } catch (err) {
    logger.error({ err, businessId: params.businessId }, "[Tranzila STOv1] request failed");
    return { success: false, error: String(err) };
  }
}
