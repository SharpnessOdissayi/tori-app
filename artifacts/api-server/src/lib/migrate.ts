import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Runs safe "ADD COLUMN IF NOT EXISTS" migrations.
 * Called once on server startup — idempotent, safe to run every deploy.
 */
export async function runMigrations() {
  try {
    // Create new tables if they don't exist
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS time_off (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        full_day BOOLEAN NOT NULL DEFAULT TRUE,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));

    // Kavati's own receipts to business owners (קבלות עוסק פטור).
    // Sequential per-issuer numbering is required by Israeli tax law.
    // The "issuer" here is always Kavati — we use a single numbering space.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS kavati_receipts (
        id                 SERIAL PRIMARY KEY,
        receipt_number     INTEGER NOT NULL UNIQUE,
        business_id        INTEGER,
        business_name      TEXT,
        business_email     TEXT,
        business_tax_id    TEXT,
        amount_agorot      INTEGER NOT NULL,
        currency           TEXT NOT NULL DEFAULT 'ILS',
        payment_method     TEXT,
        payment_reference  TEXT,
        purpose            TEXT NOT NULL,
        description        TEXT,
        issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));

    // Email verification codes — persistent so a server restart doesn't
    // strand a user mid-signup. 6-digit code, 15-minute TTL.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        email       TEXT PRIMARY KEY,
        code        TEXT NOT NULL,
        purpose     TEXT NOT NULL DEFAULT 'signup',
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));

    // Receipts issued BY a business owner TO their clients. Each business
    // keeps its own sequential numbering (per-business issuer). Business
    // owners manage these via the dashboard. Kavati is NOT the issuer —
    // Kavati is the platform. Legal responsibility sits with the business.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS business_receipts (
        id                 SERIAL PRIMARY KEY,
        business_id        INTEGER NOT NULL,
        receipt_number     INTEGER NOT NULL,
        client_name        TEXT,
        client_phone       TEXT,
        client_email       TEXT,
        amount_agorot      INTEGER NOT NULL,
        currency           TEXT NOT NULL DEFAULT 'ILS',
        payment_method     TEXT,
        description        TEXT,
        appointment_id     INTEGER,
        issued_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (business_id, receipt_number)
      )
    `));

    // Business tax/invoice profile — what the business owner prints on
    // their receipts. Separate from the public booking-page profile.
    const receiptFields: string[] = [
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_tax_id TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_legal_type TEXT",   // 'exempt' | 'authorized' | 'company'
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_legal_name TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS invoice_address TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS auto_send_receipts BOOLEAN NOT NULL DEFAULT FALSE",
      // Email verification status for the business-owner account.
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE",
    ];
    for (const stmt of receiptFields) {
      await db.execute(sql.raw(stmt));
    }

    const alterations: string[] = [
      // Booking restrictions
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS min_lead_hours INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS cancellation_hours INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_future_weeks INTEGER NOT NULL DEFAULT 15`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS future_booking_mode TEXT NOT NULL DEFAULT 'weeks'`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_future_date TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_appointments_per_customer INTEGER`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_active_subscription BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER`,
      // Branding
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS button_radius TEXT`,
      // Reminders
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS send_reminders BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_arrival_confirmation BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS send_whatsapp_reminders BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_triggers TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_custom_text TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shabbat_mode TEXT NOT NULL DEFAULT 'any'`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reminder_send_time TEXT NOT NULL DEFAULT '20:00'`,
      // Header display controls
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS show_business_name BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS show_logo BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS show_banner BOOLEAN NOT NULL DEFAULT TRUE`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS header_layout TEXT NOT NULL DEFAULT 'stacked'`,
      // Profile landing page
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website_url TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instagram_url TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS waze_url TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_description TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gallery_images TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS banner_position TEXT NOT NULL DEFAULT 'center'`,
      `ALTER TABLE services ADD COLUMN IF NOT EXISTS description TEXT`,
      // Contact & address for profile page
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS contact_phone TEXT`,
      `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address TEXT`,
      // Morning reminder
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_morning_sent BOOLEAN NOT NULL DEFAULT FALSE`,
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tranzila_enabled BOOLEAN NOT NULL DEFAULT FALSE",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deposit_amount_agorot INTEGER",
      "ALTER TABLE client_businesses ADD COLUMN IF NOT EXISTS facebook_id TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_categories TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS username TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS send_booking_confirmation BOOLEAN NOT NULL DEFAULT TRUE",
      "ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS receive_notifications BOOLEAN NOT NULL DEFAULT TRUE",
      "ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS gender TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS announcement_text TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS announcement_valid_hours INTEGER NOT NULL DEFAULT 24",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS announcement_created_at TIMESTAMPTZ",
      // Subscription billing
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tranzila_token TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tranzila_token_expiry TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_renew_date TIMESTAMPTZ",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_cancelled_at TIMESTAMPTZ",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tranzila_sto_id INTEGER",
      // Advanced design
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS design_preset TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accent_color TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gradient_enabled BOOLEAN NOT NULL DEFAULT FALSE",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gradient_from TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gradient_to TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gradient_angle INTEGER NOT NULL DEFAULT 135",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS background_pattern TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hero_layout TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS service_card_style TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS animation_style TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hover_effect TEXT",
      // Custom domain (Pro-only). Business owners point a subdomain they own
      // (book.theirsalon.co.il) via CNAME → kavati.net. Super admin flips
      // verified=true once the domain is added to Railway's custom-domains list.
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS custom_domain TEXT",
      "ALTER TABLE businesses ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE",
      // Unique index so no two businesses can register the same hostname.
      // Uses lowercase so domain matching is case-insensitive.
    ];

    // Cancellation tracking
    await db.execute(sql.raw(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by TEXT`));
    await db.execute(sql.raw(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason TEXT`));

    // Notifications table
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        appointment_id INTEGER,
        message TEXT NOT NULL,
        actor_type TEXT NOT NULL DEFAULT 'client',
        actor_name TEXT,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS client_notifications (
        id SERIAL PRIMARY KEY,
        phone_number TEXT NOT NULL,
        type TEXT NOT NULL,
        appointment_id INTEGER,
        business_name TEXT,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));

    for (const stmt of alterations) {
      await db.execute(sql.raw(stmt));
    }

    // Unique index on custom_domain so we can look up businesses by hostname
    // in the routing middleware. Case-insensitive comparison via LOWER().
    await db.execute(sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS businesses_custom_domain_unique
       ON businesses (LOWER(custom_domain))
       WHERE custom_domain IS NOT NULL`
    ));

    // ─── Unified users table ────────────────────────────────────────────
    // Phase 1/4 of auth rework — the authoritative source for login across
    // clients, business owners, and super admins. Created here (not via
    // drizzle push-force) because push-force is risky for new unique
    // constraints on populated tables.
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         TEXT UNIQUE,
        phone         TEXT UNIQUE,
        password_hash TEXT,
        full_name     TEXT NOT NULL DEFAULT '',
        role          TEXT NOT NULL DEFAULT 'client',
        business_id   INTEGER,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS users_role_idx ON users (role)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS users_business_id_idx ON users (business_id)`));

    // ─── One-shot seed: import existing businesses + clients ────────────
    // Idempotent via ON CONFLICT DO NOTHING. Safe to run every boot.
    await seedUsersFromExistingData();

    logger.info("DB migrations applied successfully");
  } catch (err) {
    // Log the full error so we can actually see what failed.
    const e = err as { message?: string; code?: string; detail?: string; stack?: string };
    console.error("[Migrate] DB migration failed", {
      message: e?.message,
      code:    e?.code,
      detail:  e?.detail,
      stack:   e?.stack?.split("\n").slice(0, 5).join("\n"),
    });
    logger.error({ err }, "DB migration failed");
  }
}

/**
 * For every existing business, create a users row (role=business_owner)
 * linked by businessId. For every distinct phone in client_sessions /
 * client_businesses, create a users row (role=client). Both are keyed by
 * email/phone uniqueness so repeated boots are safe.
 *
 * Also promotes the initial super admin based on SUPER_ADMIN_EMAIL env var
 * (falls back to noop if not set — the first super admin can be assigned
 * manually with a SQL update if needed).
 */
async function seedUsersFromExistingData() {
  // 1. Business owners — one users row per existing business. Email +
  //    passwordHash come from the business row itself; businessId links
  //    back to it. The app is only for business owners and super admins
  //    (customers of the shops do NOT log in — they book via the public
  //    /book/<slug> page), so we don't seed any client users.
  await db.execute(sql.raw(`
    INSERT INTO users (email, password_hash, full_name, role, business_id)
    SELECT b.email, b.password_hash, b.owner_name, 'business_owner', b.id
    FROM businesses b
    WHERE b.email IS NOT NULL
    ON CONFLICT (email) DO NOTHING
  `));

  // 2. Promote the initial super admin if SUPER_ADMIN_EMAIL is configured
  //    and that user already exists in the table.
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (superAdminEmail) {
    await db.execute(sql.raw(`
      UPDATE users
      SET role = 'super_admin'
      WHERE email = '${superAdminEmail.replace(/'/g, "''")}'
        AND role != 'super_admin'
    `));
  }
}
