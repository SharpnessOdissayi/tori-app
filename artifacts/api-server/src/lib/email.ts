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

  // 1. Resend (preferred)
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from:      fromResend,
        to:        [to],
        subject,
        html,
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
        html,
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
