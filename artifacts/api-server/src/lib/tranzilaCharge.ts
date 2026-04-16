/**
 * Tranzila token-based charge via legacy CGI (v1 flow).
 *
 * Flow:
 *   1. Customer is charged via the lilash2 iframe (tranmode=AK) — this also
 *      generates a TranzilaTK token, valid across sibling terminals (lilash2tok).
 *   2. Monthly renewal charges hit this CGI using terminal=lilash2tok + token,
 *      WITHOUT CVV and WITHOUT card-holder ID — as required by the token terminal.
 *
 * Required env vars:
 *   TRANZILA_SUPPLIER_TOK       — token terminal name (lilash2tok)
 *   TRANZILA_TERMINAL_PASSWORD  — TranzilaPW for the token terminal
 */

import { logger } from "./logger";

const SUPPLIER_TOK      = process.env.TRANZILA_SUPPLIER_TOK ?? "";
const TERMINAL_PASSWORD = process.env.TRANZILA_TERMINAL_PASSWORD ?? "";

const CGI_URL = "https://secure5.tranzila.com/cgi-bin/tranzila71u.cgi";

export interface ChargeResult {
  success:      boolean;
  responseCode: string;
  rawResponse:  string;
}

/**
 * Charge a stored card token for subscription renewal.
 * Intentionally omits myid (ID) and mycvv — the lilash2tok terminal is
 * configured to accept token charges without them.
 */
export async function chargeToken(
  token:      string,
  expiry:     string, // MMYY
  amountILS:  number,
  businessId: number,
): Promise<ChargeResult> {
  const params = new URLSearchParams({
    supplier:           SUPPLIER_TOK,
    TranzilaPW:         TERMINAL_PASSWORD,
    sum:                amountILS.toFixed(2),
    currency:           "1",
    cred_type:          "1",
    tranmode:           "A",          // authorize + capture
    TranzilaTK:         token,        // stored card token
    expdate:            expiry,
    pdesc:              `חידוש מנוי פרו קבעתי - ${businessId}`,
    notify_url_address: "https://www.kavati.net/api/tranzila/notify",
  });

  try {
    const res = await fetch(CGI_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });
    const rawResponse = await res.text();

    // CGI returns a URL-encoded string: Response=000&ConfirmationCode=XXXX&...
    const parsed       = new URLSearchParams(rawResponse);
    const responseCode = parsed.get("Response") ?? parsed.get("response") ?? "";
    const success      = responseCode === "000";

    logger.info({ businessId, responseCode, success }, "[TranzilaCharge] Token charge result");
    return { success, responseCode, rawResponse };
  } catch (err) {
    logger.error({ err, businessId }, "[TranzilaCharge] Token charge failed");
    return { success: false, responseCode: "ERR", rawResponse: String(err) };
  }
}
