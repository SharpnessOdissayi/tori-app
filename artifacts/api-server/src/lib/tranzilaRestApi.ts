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

  const body = {
    terminal_name:       TERMINAL,
    sto_payments_number: 9999,
    charge_frequency:    "monthly",
    charge_dom:          Math.min(new Date().getDate(), 28),
    currency_code:       "ILS",
    items: [{
      name:         `מנוי פרו קבעתי - ${params.businessId}`,
      unit_price:   params.amountILS,
      units_number: 1,
      price_type:   "G",
    }],
    client: {
      name:  params.clientName,
      email: params.clientEmail,
    },
    card: {
      token:        params.token,
      expire_month: params.expireMonth,
      expire_year:  params.expireYear,
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
  let data: { error_code?: number; message?: string; sto_id?: number } = {};
  try { data = JSON.parse(text); } catch {}

  console.log("[Tranzila STO]", { status: res.status, body: text.slice(0, 300) });

  if (res.ok && data.error_code === 0 && data.sto_id) {
    return { success: true, stoId: data.sto_id };
  }
  return {
    success: false,
    error:   `[${data.error_code ?? res.status}] ${data.message ?? "Unknown"}`,
  };
}
