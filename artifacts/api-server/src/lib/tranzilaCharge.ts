/**
 * Monthly subscription charge via Tranzila's legacy CGI.
 *
 * Flow:
 *   1. Customer pays first month via lilash2 iframe (tranmode=AK) → token stored.
 *   2. Monthly renewals: POST secure5.tranzila.com/cgi-bin/tranzila71u.cgi
 *      with supplier=lilash2tok + TranzilaTK + expdate.
 *      No CVV, no ID — lilash2tok is configured to accept tokenized
 *      recurring charges without them.
 *
 * Env vars:
 *   TRANZILA_SUPPLIER_TOK       — token terminal (lilash2tok)
 *   TRANZILA_TERMINAL_PASSWORD  — TranzilaPW for lilash2tok
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

export async function chargeToken(
  token:      string,
  expiry:     string, // MMYY
  amountILS:  number,
  businessId: number,
): Promise<ChargeResult> {
  const params = new URLSearchParams({
    supplier:   SUPPLIER_TOK,
    TranzilaPW: TERMINAL_PASSWORD,
    sum:        amountILS.toFixed(2),
    currency:   "1",
    cred_type:  "1",
    tranmode:   "A",
    TranzilaTK: token,
    expdate:    expiry,
    pdesc:      `חידוש מנוי פרו קבעתי - ${businessId}`,
  });

  try {
    const res = await fetch(CGI_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    params.toString(),
    });
    const rawResponse = await res.text();

    // Response is URL-encoded: Response=000&ConfirmationCode=XXXX&...
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
