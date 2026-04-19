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

  // The outer branded frame (logo, footer) is applied by wrapEmailTemplate
  // inside sendEmail — just emit the inner body with Kavati-blue accents.
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; color:#1f2937;">
      <h2 style="margin: 0 0 16px; color:#3c92f0;">אימות כתובת אימייל</h2>
      <p style="margin: 0 0 16px; color: #374151;">הקוד שלך ל-Kavati:</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 20px; background: rgba(60,146,240,0.08); border:1px solid rgba(60,146,240,0.2); border-radius: 12px; margin: 16px 0; color:#1e6fcf;">
        ${code}
      </div>
      <p style="color: #6b7280; font-size: 13px;">הקוד תקף ל-15 דקות. אם לא ביקשת את הקוד, אפשר להתעלם מהמייל הזה.</p>
    </div>`;

  try {
    await sendEmail(email, "קוד האימות שלך — Kavati", html, {
      from: "Kavati <verify@kavati.net>",
    });
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
  email:      string;
  ownerName:  string;
  plan:       "free" | "pro" | "pro-plus";
  slug:       string;
  username?:  string | null;   // what the owner logs in with (if picked one)
  password:   string;           // plaintext, still in memory at registration
}): Promise<void> {
  const { email, ownerName, plan, slug, username, password } = params;
  const bookingUrl   = `https://www.kavati.net/book/${slug}`;
  const dashboardUrl = `https://www.kavati.net/dashboard`;
  // The login form accepts email / phone / username. Show the username
  // if one was chosen, otherwise fall back to the email address.
  const loginHandle  = username && username.trim() ? username.trim() : email;

  const planCopy = plan === "pro-plus"
    ? `<p style="margin: 0 0 16px; color: #444;">תודה שהצטרפת למסלול <b>עסקי</b>. קבלה על התשלום תישלח בנפרד. תוכל להוסיף עובדים ולשלוח הודעות תפוצה מהדאשבורד.</p>`
    : plan === "pro"
    ? `<p style="margin: 0 0 16px; color: #444;">תודה שהצטרפת למנוי <b>פרו</b>. קבלה על התשלום תישלח בנפרד.</p>`
    : `<p style="margin: 0 0 16px; color: #444;">החשבון שלך פעיל במסלול <b>חינמי</b>. בכל עת אפשר לשדרג למנוי פרו/עסקי מתוך הדאשבורד.</p>`;

  // The outer branded frame (header + footer) is applied by wrapEmailTemplate
  // in sendEmail. We just emit the inner body here. All accents use the
  // Kavati brand blue (#3c92f0) to match the site.
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; color:#111827;">
      <h1 style="margin: 0 0 8px; font-size: 24px; color:#111827;">ברוך/ה הבא/ה ל-Kavati, ${ownerName}! 🎉</h1>
      <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px;">העסק שלך נרשם בהצלחה — הנה כל מה שצריך לדעת כדי להתחיל.</p>
      ${planCopy}

      <!-- Credentials card -->
      <div style="margin: 24px 0; padding: 20px; background: rgba(60,146,240,0.06); border: 1px solid rgba(60,146,240,0.22); border-radius: 12px;">
        <p style="margin: 0 0 6px; font-weight: bold; color: #1e6fcf; font-size: 15px;">🔐 פרטי הכניסה שלך</p>
        <p style="margin: 0 0 12px; font-size: 12px; color: #3c92f0;">אפשר להיכנס לפי שם משתמש, אימייל או מספר טלפון — הסיסמה זהה לכולם.</p>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #6b7280; width: 120px;">שם משתמש:</td>
              <td style="padding: 6px 0; font-family: monospace; direction: ltr; text-align: right; font-weight: bold;">${loginHandle}</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">סיסמה:</td>
              <td style="padding: 6px 0; font-family: monospace; direction: ltr; text-align: right; font-weight: bold;">${password}</td></tr>
        </table>
        <p style="margin: 12px 0 0; font-size: 12px; color: #3c92f0;">⚠️ מומלץ להחליף את הסיסמה בכניסה הראשונה שלך מהדאשבורד → הגדרות → שינוי סיסמה.</p>
      </div>

      <!-- Action buttons -->
      <div style="margin: 24px 0; text-align: center;">
        <a href="${dashboardUrl}" style="display: inline-block; margin: 4px; padding: 12px 28px; background: #3c92f0; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">פתח את הדאשבורד</a>
        <a href="${bookingUrl}" style="display: inline-block; margin: 4px; padding: 12px 28px; background: white; color: #3c92f0; text-decoration: none; border: 2px solid #3c92f0; border-radius: 8px; font-weight: bold; font-size: 15px;">צפה בעמוד העסק שלך</a>
      </div>

      <!-- Share link card -->
      <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border:1px solid #e5e7eb; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-weight: bold; color: #1f2937;">📲 הקישור שלך להזמנת תור — שתף עם הלקוחות שלך:</p>
        <p style="margin: 0; font-family: monospace; font-size: 14px; word-break: break-all; direction: ltr; text-align: right; color: #3c92f0;">${bookingUrl}</p>
      </div>

      <p style="margin: 24px 0 6px; color: #4b5563; font-size: 14px;">נתקלת בבעיה? פשוט השב למייל הזה ונחזור אליך.</p>
      <p style="margin: 0; color: #6b7280; font-size: 12px;">באהבה,<br>צוות Kavati</p>
    </div>`;

  try {
    await sendEmail(email, "ברוך הבא ל-Kavati — פרטי הכניסה שלך", html, {
      from: "Kavati <welcome@kavati.net>",
    });
  } catch (e) {
    logger.error({ err: e, email }, "[emailAuth] welcome email failed");
  }
}
