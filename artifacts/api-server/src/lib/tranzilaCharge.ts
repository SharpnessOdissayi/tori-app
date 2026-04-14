/**
 * Tranzila token-based charge via legacy CGI API.
 * Used for monthly subscription renewals.
 *
 * Required env vars:
 *   TRANZILA_SUPPLIER_TOK  — the "tok" terminal name (token-service terminal)
 *   TRANZILA_TERMINAL_PASSWORD — terminal API password (TranzilaPW)
 */

import { logger } from "./logger";

const SUPPLIER_TOK = process.env.TRANZILA_SUPPLIER_TOK ?? process.env.TRANZILA_SUPPLIER ?? "";
const TERMINAL_PASSWORD = process.env.TRANZILA_TERMINAL_PASSWORD ?? process.env.TRANZILA_NOTIFY_PASSWORD ?? "";

const CGI_URL = "https://secure5.tranzila.com/cgi-bin/tranzila71u.cgi";

export interface ChargeResult {
  success: boolean;
  responseCode: string;
  rawResponse: string;
}

/**
 * Charge a stored card token for subscription renewal.
 * @param token   - Card token from initial payment notify
 * @param expiry  - Card expiry in MMYY format (e.g. "0127")
 * @param amountILS - Amount in ILS (e.g. 100)
 * @param businessId - For logging / pdesc
 */
export async function chargeToken(
  token: string,
  expiry: string,
  amountILS: number,
  businessId: number
): Promise<ChargeResult> {
  const params = new URLSearchParams({
    supplier: SUPPLIER_TOK,
    TranzilaPW: TERMINAL_PASSWORD,
    sum: amountILS.toFixed(2),
    currency: "1",
    cred_type: "1",
    token,
    expdate: expiry,
    pdesc: `חידוש מנוי פרו קבעתי - ${businessId}`,
    myid: String(businessId),
    notify_url_address: "https://kavati.net/api/tranzila/notify",
  });

  try {
    const res = await fetch(CGI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const rawResponse = await res.text();
    // Response looks like: Response=000&ConfirmationCode=XXXX&...
    const parsed = new URLSearchParams(rawResponse);
    const responseCode = parsed.get("Response") ?? parsed.get("response") ?? "";
    const success = responseCode === "000";

    logger.info({ businessId, responseCode, success }, "[TranzilaCharge] Token charge result");
    return { success, responseCode, rawResponse };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}
