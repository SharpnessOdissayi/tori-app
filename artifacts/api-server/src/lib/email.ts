/**
 * Transactional email sending.
 *
 * Provider priority (falls through):
 *   1. Resend          — if RESEND_API_KEY is set (preferred; domain-branded)
 *   2. Nodemailer/SMTP — if SMTP_USER + SMTP_PASS are set (Gmail fallback)
 *   3. Log-only        — no provider configured, emails just print to stdout
 *
 * All receipts, welcome emails, and verification codes flow through here.
 * The "from" address defaults to a kavati.net sender when Resend is used
 * so the envelope matches the DKIM domain; with SMTP we keep the SMTP_USER
 * address to stay within Gmail's envelope rules.
 */

import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const DEFAULT_FROM   = process.env.EMAIL_FROM ?? "Kavati <kabala@kavati.net>";
const REPLY_TO       = process.env.EMAIL_REPLY_TO ?? "";

// Brand chrome prepended + appended to every outbound HTML email.
// All callers pass a plain <div> body — this wrapper adds the Kavati
// header (logo + one-liner) and the footer (signature, "do not reply"
// disclaimer, support email + phone). Keeps every email on-brand and
// avoids owners/clients replying into the void of an auto-send inbox.
const LOGO_URL     = "https://kavati.net/icon-512.png";
const SUPPORT_MAIL = "kavati.net@gmail.com";
const SUPPORT_TEL  = "050-424-1007";
const SUPPORT_TEL_INTL = "+972504241007";

function wrapEmailTemplate(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Kavati</title>
  </head>
  <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f7fa;color:#1f2937;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;">
      <div style="padding:20px 24px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">
        <img src="${LOGO_URL}" alt="Kavati" width="72" height="72" style="display:inline-block;border-radius:16px" />
        <div style="font-size:16px;font-weight:700;color:#3c92f0;margin-top:8px;letter-spacing:.01em;">
          קבעתי — מערכת זימון תורים חכמה
        </div>
      </div>
      <div style="padding:24px 16px;">
        ${innerHtml}
      </div>
      <div style="padding:18px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;line-height:1.7">
        <div style="font-weight:600;color:#374151;margin-bottom:4px;">תודה שבחרת בקבעתי ❤️</div>
        <div style="font-size:11px;">
          זוהי הודעה אוטומטית — אין להשיב למייל זה.
        </div>
        <div style="font-size:11px;margin-top:2px;">
          ליצירת קשר:
          <a href="mailto:${SUPPORT_MAIL}" style="color:#3c92f0;text-decoration:none;font-weight:600">${SUPPORT_MAIL}</a>
          &nbsp;·&nbsp;
          <a href="tel:${SUPPORT_TEL_INTL}" style="color:#3c92f0;text-decoration:none;font-weight:600">${SUPPORT_TEL}</a>
        </div>
        <div style="margin-top:10px;font-size:10px;color:#9ca3af;">© ${new Date().getFullYear()} Kavati · kavati.net</div>
      </div>
    </div>
  </body>
</html>`;
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export interface SendEmailOptions {
  /** Override the default "from" address for this specific email. */
  from?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts: SendEmailOptions = {},
): Promise<void> {
  const fromResend = opts.from ?? DEFAULT_FROM;
  const branded = wrapEmailTemplate(html);

  // 1. Resend (preferred)
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from:      fromResend,
        to:        [to],
        subject,
        html:      branded,
        ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      });
      if (error) {
        logger.error({ err: error, to, subject }, "[email] Resend returned error");
        return;
      }
      logger.info({ to, subject }, "[email] sent via Resend");
      return;
    } catch (e) {
      logger.error({ err: e, to, subject }, "[email] Resend threw");
      return;
    }
  }

  // 2. SMTP (Nodemailer) — legacy / fallback
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await smtpTransporter.sendMail({
        from:    `"קבעתי" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html:    branded,
        ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
      });
      logger.info({ to, subject }, "[email] sent via SMTP");
      return;
    } catch (e) {
      logger.error({ err: e, to, subject }, "[email] SMTP threw");
      return;
    }
  }

  // 3. No provider — log only.
  logger.warn({ to, subject }, "[email] no provider configured — not sent");
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
}
