# קבעתי (Kavati) — Hebrew SaaS Appointment Booking Platform

> A full-featured multitenant SaaS appointment booking platform built for the Israeli market. Pure Hebrew RTL interface, WhatsApp integration, Tranzila payments, and a self-service dashboard for business owners.
>
> **Live at:** [kavati.net](https://www.kavati.net)

---

## Table of Contents

1. [What Kavati Does](#what-kavati-does)
2. [Who It's For](#who-its-for)
3. [Feature Overview](#feature-overview)
4. [Architecture](#architecture)
5. [Business Owner Dashboard](#business-owner-dashboard)
6. [Public Booking Experience](#public-booking-experience)
7. [Client Portal](#client-portal)
8. [Subscription & Billing (Tranzila)](#subscription--billing-tranzila)
9. [WhatsApp Notifications (Green API)](#whatsapp-notifications-green-api)
10. [Super Admin Panel](#super-admin-panel)
11. [Tech Stack](#tech-stack)
12. [Repository Layout](#repository-layout)
13. [Environment Variables](#environment-variables)
14. [Local Development](#local-development)
15. [Deployment](#deployment)

---

## What Kavati Does

Kavati lets Israeli service businesses — salons, trainers, therapists, tutors, studios — run their entire appointment flow end-to-end from a single dashboard:

- Accept online bookings 24/7 on a branded public page
- Collect optional deposits via Tranzila at the time of booking
- Automatically send WhatsApp confirmations, reminders, and cancellation notices
- Manage working hours, breaks, services, prices, and buffers
- Track customers (CRM), revenue, waitlists, and approvals
- Customize the booking page design (colors, fonts, presets, layouts)
- Let clients self-serve via a phone-number client portal (view, cancel, reschedule, history)

All UIs are Hebrew RTL by default. The business directory at `kavati.net` lets clients discover and book with participating businesses.

## Who It's For

- **Primary:** solo practitioners and small teams in Israel who want a self-service booking tool without a per-booking fee
- **Languages:** Hebrew-only UI (all user-facing text is in Hebrew)
- **Geography:** Israel-focused (Israel timezone, Hebrew phone validation, ILS pricing, Tranzila/Green API)

## Feature Overview

### For business owners (Pro vs. Free)

| Feature | Free | Pro (₪100/mo) |
|---|---|---|
| Services | Up to 3 active | Unlimited |
| Monthly unique customers | Up to 20 | Unlimited |
| Public booking page | Yes | Yes |
| Client portal | Yes | Yes |
| Directory listing on kavati.net | Yes | Yes |
| Deposit collection (Tranzila) | Yes | Yes |
| **WhatsApp confirmations, reminders & cancellations to clients** | **No** | **Yes** |
| **WhatsApp broadcast to customers** | **No** | **Yes** |
| **Manual appointment approval mode** | **No** | **Yes** |
| **Analytics tab (נתונים)** | **No** | **Yes** |
| **Revenue tab (כסף)** | **No** | **Yes** |
| **Integrations / Messages tab (הודעות)** | **No** | **Yes** |
| Custom branding & design presets | No | Yes |
| Custom WhatsApp message templates | No | Yes |

Free-plan restrictions are enforced both in the UI (tabs hidden, toggles removed) and on the server (WhatsApp sends and approval mode are no-ops for free plans, so upgrading plan-gating cannot be bypassed by a crafted API call).

### Client-facing features

- Public booking page: service → date → time → details → (optional deposit) → confirmation
- Auto-fill phone & skip OTP for returning clients
- Waitlist signup when no slots are available
- Post-booking WhatsApp confirmation + reminder
- Self-service portal: view upcoming/past appointments, cancel, rebook

## Architecture

Monorepo (pnpm workspaces) with three artifacts and one shared DB package.

```
┌────────────────────────┐     ┌────────────────────────┐
│  appointment-booking   │────▶│      api-server        │
│   (React + Vite SPA)   │HTTP │  (Express 5 + Drizzle) │
└────────────────────────┘     └───────────┬────────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                    PostgreSQL        Tranzila          Green API
                   (Railway PG)    (Payments + STO)    (WhatsApp)
```

- **SPA** renders the dashboard, booking page, client portal, and super-admin panel — all on the same bundle
- **API server** is a single Express app with JWT auth, cron jobs (reminders + monthly charges), and webhook handlers for Tranzila & Green API
- **PostgreSQL** via Drizzle ORM; schema migrations via `drizzle-kit`
- Deployment on **Railway**, served via a production Node server (`serve.mjs`)

## Business Owner Dashboard

The main dashboard (`/dashboard`) is organized into tabs:

- **פגישות (Appointments)** — upcoming + past, confirm/cancel/approve pending, filter by date range
- **שירותים (Services)** — CRUD with price (₪), duration, buffer minutes, active toggle
- **שעות עבודה (Working Hours)** — per-day on/off + start/end time (Israel timezone)
- **הפסקות (Breaks)** — multi-break slots per day with labels (e.g. "ארוחת צהריים")
- **לקוחות (Customers / CRM)** — aggregate by phone, lifetime revenue, visit history, loyal-client badge
- **רשימת המתנה (Waitlist)** — entries with WhatsApp quick-contact link
- **הודעות (Notifications)** — configure WhatsApp templates for confirmations, reminders, cancellations; delete-all actions
- **עיצוב (Design)** — design presets, live preview, advanced color/font/layout controls (Pro only)
- **אינטגרציות (Integrations)** — Tranzila deposit config, WhatsApp setup, Google Calendar sync
- **הגדרות (Settings)** — business name, slug, contact details, password change, deposit amount, approval requirement, **subscription status**

## Public Booking Experience

Each business has a public page at `kavati.net/book/:slug`:

1. **Service picker** — grid of active services with price & duration
2. **Date picker** — RTL Hebrew calendar, only enabled days (per working hours)
3. **Time picker** — filtered by existing appointments, breaks, buffer, and past slots (Israel time)
4. **Details form** — name, phone (Israeli format), optional notes
5. **Payment step** (if deposit required) — Tranzila popup, appointment confirmed only on successful callback
6. **Confirmation screen** — appointment summary + WhatsApp confirmation sent

Additional flows:
- **Waitlist dialog** — when the selected day is fully booked, clients can join a waitlist with preferred date
- **Approval mode** — when enabled, appointments start as `pending_approval` and must be confirmed by the business before the client is notified
- **Auto-fill for returning clients** — phone number is remembered; OTP is skipped when recognized

## Client Portal

Clients access `kavati.net/portal` by entering their phone number. Features:

- List of upcoming + past appointments across ALL businesses they've booked with
- Cancel upcoming appointments (soft-delete → `status='cancelled'`)
- Quick rebook from history
- Phone is verified once, cached thereafter (never deletable via client UI)

## Subscription & Billing (Tranzila)

Kavati monetizes via a monthly subscription (₪100/month, first month ₪50 to activate). All billing runs through **Tranzila**.

### Terminal setup

Kavati uses **one Tranzila terminal** (`TRANZILA_SUPPLIER`, e.g. `lilash2`) for both appointment deposits and Pro subscriptions. Earlier versions tried to use a separate `lilash2tok` token-service path; that route returned 404 on the production Tranzila account and was reverted.

For subscriptions to tokenize the card (so monthly STO renewals can run), the terminal must be configured in Tranzila admin to support token responses. Without tokenization, the first subscription charge still succeeds and the business is upgraded to Pro — but monthly renewal falls back to the cron job (requires a saved card flow, not currently live).

### Subscription flow

1. Business owner clicks "שדרג למנוי פרו" on the dashboard
2. Backend builds a Tranzila iframe URL with `tranmode=AK` (charge + tokenize)
3. User completes payment in a popup
4. Tranzila POSTs to `/api/tranzila/notify` with `Response=000` (+ optionally `token` and `expdate`)
5. Backend updates the business to `subscriptionPlan='pro'` and saves `subscriptionRenewDate`
6. If a token was returned, backend calls the Tranzila REST API to create a monthly **Standing Order (STO)** — Tranzila then handles the monthly charges automatically
7. If STO creation fails or no token was returned, a nightly cron job attempts to renew (assuming a card was saved)

### Required Tranzila admin configuration

The business's Tranzila account must be configured per the official STO docs:
- [STO API for My-Billing](https://docs.tranzila.com/docs/payments-billing/wbvbx8p3i3pu4-sto-api-for-my-billing)
- [Create a Standing Order](https://docs.tranzila.com/docs/payments-billing/xyajxscasy205-create-a-standing-order)

In the Tranzila dashboard (`my.tranzila.com`):
- **Settings → Terminal → My-Billing → Transaction Notification Endpoint** → set to `https://www.kavati.net/api/tranzila/notify`
- **Settings → Terminal → iFrame** → confirm `newprocess=1` is supported
- **Settings → Terminal → Work method** → enable card tokenization for the terminal
- **Main phone number** → business owner's phone (for credit-card-update notifications)

### Test mode

Setting `TRANZILA_TEST_MODE=true` charges 0.10 ILS (10 agorot) instead of the real amounts, letting you verify the full end-to-end flow cheaply without touching sandbox accounts.

### Cancellation

- `POST /api/subscription/cancel` sets `subscriptionCancelledAt = now()`
- Pro access is preserved until the current renewal date
- The monthly charge cron job skips businesses with a cancellation timestamp
- No refunds; no hard delete — plan rolls back to `free` after the renewal window

## WhatsApp Notifications (Meta WhatsApp Business API)

All outgoing WhatsApp messages go through **Meta's WhatsApp Business Cloud API** (`META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID`). Templates are pre-approved by Meta — names and parameter counts must not be changed.

**Pro-only** — the entire client-messaging stack is gated to Pro-plan businesses. Free-plan clients never receive WhatsApp messages from the system. This is enforced in:

- `routes/business.ts` (approve / reschedule / cancel / broadcast)
- `routes/public.ts` (booking confirmation, client-initiated cancellation)
- `lib/reminders.ts` (the reminders cron skips non-Pro businesses)

Message types (all Pro only):

- **Booking confirmation** — sent immediately after a successful booking (or after manual approval, if approval mode is on)
- **Reminders** — cron job sends reminders at business-configured triggers (e.g. 24h, 1h, morning-of); skips cancelled / pending-payment / non-Pro appointments
- **Cancellation & reschedule notices** — sent to the client when the business cancels or moves their appointment
- **Broadcast** — Pro-only bulk message to all the business's customers, capped at 150 messages/month per business (~$10)

OTP codes (client phone verification during booking) are sent via the `verify_code_1` template and work regardless of plan.

## Super Admin Panel

Internal panel at `/super-admin` (password-protected), used for platform operations:

- Card grid of all businesses with active/suspended toggle
- Manual plan override (free / pro), max services, appointment caps
- Create / delete businesses (seed `admin` business is hidden from the public directory)
- Deep link to each business's public booking page
- View aggregate platform metrics

## Tech Stack

**Frontend**
- React 18, TypeScript 5.9, Vite
- Wouter for routing
- React Query for server state
- Tailwind CSS + shadcn/ui components
- `date-fns` with Hebrew locale, Israel timezone helpers
- Capacitor for optional iOS packaging

**Backend**
- Node.js 24, Express 5
- Drizzle ORM + `drizzle-zod`
- Zod (`zod/v4`) validation
- JWT auth (business token in `localStorage.biz_token`)
- Orval for OpenAPI → typed React Query hooks

**Data & Infra**
- PostgreSQL (Railway)
- Google Cloud Storage for images (presigned upload URLs)
- Tranzila for payments (deposits + subscriptions)
- Green API for WhatsApp
- Railway for deployment (single Dockerfile + `railpack.toml`)

**Build tooling**
- pnpm workspaces
- esbuild (CJS bundle for the server)
- `drizzle-kit push` for dev schema, migrations in `lib/`

## Repository Layout

```
schedule-manager-main/
├── artifacts/
│   ├── appointment-booking/    # React SPA (dashboard, booking, portal, admin)
│   ├── api-server/             # Express backend (routes, cron, webhooks)
│   └── mockup-sandbox/         # Design scratch area
├── lib/                        # Shared packages (db schema, api-spec)
├── scripts/                    # Operational scripts
├── migrate-*.js                # One-off migration helpers
├── CLAUDE.md                   # Agent coding guidelines
├── replit.md                   # Technical project notes
└── README.md                   # This file
```

## Environment Variables

Core server env vars (set on Railway):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs business auth tokens |
| `PORT` | HTTP port |
| `TRANZILA_SUPPLIER` | Tranzila terminal for deposits (`lilash2`) |
| `TRANZILA_SUPPLIER_TOK` | Tranzila terminal for subscriptions (`lilash2tok`) |
| `TRANZILA_NOTIFY_PASSWORD` | Shared secret for notify webhook |
| `TRANZILA_API_USER` / `TRANZILA_API_PASSWORD` | Tranzila REST API credentials (for STO) |
| `TRANZILA_TEST_MODE` | `true` → charge 0.10 ILS for end-to-end tests |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket for uploads |
| `GREEN_API_*` | WhatsApp provider credentials (per-business overrides in DB) |

## Local Development

```bash
# Install
pnpm install

# Typecheck everything
pnpm run typecheck

# Run the API server
pnpm --filter @workspace/api-server run dev

# Run the SPA
pnpm --filter @workspace/appointment-booking run dev

# Push DB schema changes (dev only)
pnpm --filter @workspace/db run push

# Regenerate typed API hooks
pnpm --filter @workspace/api-spec run codegen
```

> Per project convention, we do **not** run a local preview — all changes are verified on the live Railway deployment at kavati.net.

## Deployment

- Single Dockerfile at the repo root, orchestrated by `railpack.toml`
- Railway auto-deploys on push to `main`
- Cron jobs (reminders, monthly subscription charges) run in-process inside the API server
- Static assets for the SPA are served by `serve.mjs` alongside the API

---

## License

Proprietary. © Kavati.
