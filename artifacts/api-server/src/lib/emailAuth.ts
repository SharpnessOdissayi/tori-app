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
  purpose: "signup" | "email_change" | "email_login" = "signup",
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
  purpose: "signup" | "email_change" | "email_login" = "signup",
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
  // Credentials echoed in the welcome email — the owner asked for this
  // back so users have their username + password on record in their
  // inbox. The email is sent via Resend over TLS and only the recipient
  // sees it, so this is no worse than the password-reset flow we
  // already run. The values shown are what the user typed at signup.
  username?:  string | null;
  password?:  string;
}): Promise<void> {
  const { email, ownerName, plan, slug, username, password } = params;
  const bookingUrl   = `https://www.kavati.net/book/${slug}`;
  const dashboardUrl = `https://www.kavati.net/dashboard`;

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

      <!-- Credentials block — show the username + password the user
           just picked so they have a record in their inbox. Safe
           enough: the email channel itself is the same path we use
           for password-reset codes. -->
      ${(username || password) ? `
      <div style="margin: 20px 0; padding: 16px; background: #eff6ff; border:1px solid #bfdbfe; border-radius: 8px;">
        <p style="margin: 0 0 10px; font-weight: bold; color: #1e3a8a; font-size: 14px;">🔑 פרטי הכניסה שלך</p>
        ${username ? `<p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;"><strong>שם משתמש:</strong> <span dir="ltr" style="font-family: 'Courier New', monospace;">${username}</span></p>` : ``}
        <p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;"><strong>אימייל לכניסה:</strong> <span dir="ltr" style="font-family: 'Courier New', monospace;">${email}</span></p>
        ${password ? `<p style="margin: 0 0 6px; font-size: 13px; color: #1f2937;"><strong>סיסמה:</strong> <span dir="ltr" style="font-family: 'Courier New', monospace; background:#fff; padding:2px 6px; border-radius:4px; border:1px solid #e5e7eb;">${password}</span></p>` : ``}
        <p style="margin: 8px 0 0; color: #6b7280; font-size: 11px;">שמור/י את המייל הזה במקום בטוח. תמיד אפשר לאפס סיסמה דרך מסך הכניסה.</p>
      </div>` : ``}

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
    await sendEmail(email, "ברוך הבא ל-Kavati", html, {
      from: "Kavati <welcome@kavati.net>",
    });
  } catch (e) {
    logger.error({ err: e, email }, "[emailAuth] welcome email failed");
  }
}
