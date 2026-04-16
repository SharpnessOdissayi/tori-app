/**
 * Email verification (6-digit code) and welcome emails.
 *
 * Codes live in the email_verification_codes DB table so a server restart
 * doesn't strand a mid-signup user.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendEmail } from "./email";
import { logger } from "./logger";

const CODE_TTL_MS = 15 * 60 * 1000;   // 15 minutes

function sixDigits(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Send / verify ────────────────────────────────────────────────────────

export async function sendEmailVerificationCode(
  email: string,
  purpose: "signup" | "email_change" = "signup",
): Promise<void> {
  const code = sixDigits();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Upsert — replaces any previous code for the same email.
  await db.execute(sql`
    INSERT INTO email_verification_codes (email, code, purpose, expires_at)
    VALUES (${email.toLowerCase().trim()}, ${code}, ${purpose}, ${expiresAt})
    ON CONFLICT (email) DO UPDATE
      SET code = EXCLUDED.code,
          purpose = EXCLUDED.purpose,
          expires_at = EXCLUDED.expires_at,
          created_at = NOW()
  `);

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px;">אימות כתובת אימייל</h2>
      <p style="margin: 0 0 16px; color: #444;">הקוד שלך ל-Kavati:</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: #f1f5f9; border-radius: 12px; margin: 16px 0;">
        ${code}
      </div>
      <p style="color: #888; font-size: 13px;">הקוד תקף ל-15 דקות. אם לא ביקשת את הקוד, אפשר להתעלם מהמייל הזה.</p>
    </div>`;

  try {
    await sendEmail(email, "קוד האימות שלך — Kavati", html);
  } catch (e) {
    logger.error({ err: e, email }, "[emailAuth] send code failed");
  }
}

export async function verifyEmailCode(
  email: string,
  code: string,
  purpose: "signup" | "email_change" = "signup",
): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT code, purpose, expires_at
    FROM email_verification_codes
    WHERE email = ${email.toLowerCase().trim()}
  `);
  const row = rows.rows[0] as any | undefined;
  if (!row) return false;
  if (row.purpose !== purpose) return false;
  if (new Date(row.expires_at) < new Date()) return false;
  if (String(row.code) !== String(code).trim()) return false;

  // Single-use: consume the code on success.
  await db.execute(sql`DELETE FROM email_verification_codes WHERE email = ${email.toLowerCase().trim()}`);
  return true;
}

// ─── Welcome email ────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  email:     string;
  ownerName: string;
  plan:      "free" | "pro";
  slug:      string;
}): Promise<void> {
  const { email, ownerName, plan, slug } = params;
  const bookingUrl = `https://www.kavati.net/book/${slug}`;
  const dashboardUrl = `https://www.kavati.net/dashboard`;

  const planCopy = plan === "pro"
    ? `<p style="margin: 0 0 16px; color: #444;">תודה שהצטרפת למנוי <b>פרו</b>! קבלה על התשלום תישלח בנפרד.</p>`
    : `<p style="margin: 0 0 16px; color: #444;">החשבון שלך פעיל במסלול <b>חינמי</b>. בכל עת אפשר לשדרג למנוי פרו מתוך הדאשבורד.</p>`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <h1 style="margin: 0 0 8px; font-size: 22px;">ברוך/ה הבא/ה ל-Kavati, ${ownerName}!</h1>
      <p style="margin: 0 0 16px; color: #555;">העסק שלך נרשם בהצלחה. אנחנו שמחים שאתה איתנו.</p>
      ${planCopy}
      <div style="margin: 20px 0; padding: 16px; background: #f5f5f5; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-weight: bold;">הקישור שלך להזמנת תור (שתף עם הלקוחות שלך):</p>
        <p style="margin: 0; font-family: monospace; font-size: 14px; word-break: break-all;" dir="ltr">${bookingUrl}</p>
      </div>
      <a href="${dashboardUrl}" style="display: inline-block; padding: 12px 24px; background: #7c3aed; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">פתח את הדאשבורד</a>
      <p style="margin: 24px 0 0; color: #888; font-size: 12px;">עם אהבה, צוות Kavati</p>
    </div>`;

  try {
    await sendEmail(email, "ברוך הבא ל-Kavati", html);
  } catch (e) {
    logger.error({ err: e, email }, "[emailAuth] welcome email failed");
  }
}
