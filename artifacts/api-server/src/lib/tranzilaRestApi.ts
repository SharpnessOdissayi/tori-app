import crypto from "crypto";

const PUBLIC_KEY = process.env.TRANZILA_API_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.TRANZILA_API_SECRET_KEY ?? "";
const TERMINAL   = process.env.TRANZILA_SUPPLIER_TOK   ?? "";

export interface CreateStoResult {
  success: boolean;
  stoId?:  number;
  error?:  string;
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
  if (!PUBLIC_KEY || !SECRET_KEY || !TERMINAL) {
    return { success: false, error: "Tranzila env vars missing" };
  }

  const nonce       = crypto.randomBytes(20).toString("hex");
  const requestTime = String(Date.now());

  // Per Tranzila docs + jokecamp.com reference:
  //   hash_hmac('sha256', application_key, secret + request_time + nonce) → base64
  // PHP signature: hash_hmac($algo, $data, $key) → data=PUBLIC_KEY, key=SECRET+time+nonce
  const accessToken = crypto
    .createHmac("sha256", SECRET_KEY + requestTime + nonce)
    .update(PUBLIC_KEY)
    .digest("base64");

  // Body mirrors the docs "Basic Example With Card" shape 1:1 — every
  // optional field the example shows is filled in. Only `msv` is omitted
  // (it's an alternative to card, not used together).
  const body = {
    terminal_name:       TERMINAL,
    sto_payments_number: 12,
    charge_frequency:    "monthly",
    charge_dom:          Math.min(new Date().getDate(), 28),
    currency_code:       "ILS",
    vat_percent:         18,
    index_linked:        "N",
    index_type:          120010,
    base_month:          "2021-12",
    min_price:           "Y",
    client: {
      name:               params.clientName,
      email:              params.clientEmail,
      phone_country_code: "972",
    },
    items: [{
      code:          `PRO-${params.businessId}`,
      name:          `מנוי פרו קבעתי - ${params.businessId}`,
      type:          "I",
      unit_price:    params.amountILS,
      units_number:  1,
      unit_type:     1,
      currency_code: "ILS",
      price_type:    "G",
      index_link:    "N",
      base_price:    params.amountILS,
    }],
    card: {
      token:            params.token,
      expire_month:     params.expireMonth,
      expire_year:      params.expireYear,
      card_holder_name: params.clientName,
    },
    response_language: "hebrew",
    created_by_user:   "kavati",
  };

  const res = await fetch("https://api.tranzila.com/v2/sto/create", {
    method: "POST",
    headers: {
      "Content-Type":                "application/json",
      "Accept":                      "application/json",
      "X-tranzila-api-app-key":      PUBLIC_KEY,
      "X-tranzila-api-request-time": requestTime,
      "X-tranzila-api-nonce":        nonce,
      "X-tranzila-api-access-token": accessToken,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: {
    error_code?:    number;
    message?:       string;
    sto_id?:        number;
    mismatch_info?: Array<{
      keyword?:      string;
      keyword_args?: Record<string, unknown>;
      data?:         unknown;
      data_path?:    string[];
      sub_errors?:   unknown[];
    }>;
  } = {};
  try { data = JSON.parse(text); } catch {}

  // Full response logging — expand mismatch_info[] entries so all 6 fields
  // (keyword, keyword_args, data, data_path, sub_errors + the array itself)
  // are visible if Tranzila ever returns a 400 with validation details.
  console.log("[Tranzila STO] response", {
    status:       res.status,
    errorCode:    data.error_code,
    message:      data.message,
    stoId:        data.sto_id,
    mismatchInfo: JSON.stringify(data.mismatch_info ?? null, null, 2),
    rawBody:      text.slice(0, 800),
  });

  if (res.ok && data.error_code === 0 && data.sto_id) {
    return { success: true, stoId: data.sto_id };
  }
  return {
    success: false,
    error:   `[${data.error_code ?? res.status}] ${data.message ?? "Unknown"}`,
  };
}
