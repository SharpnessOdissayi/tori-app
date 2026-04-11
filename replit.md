# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Multitenant SaaS appointment booking system for the Israeli market — full Hebrew RTL UI using Heebo font.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Appointment Booking (`artifacts/appointment-booking`)
- **Kind**: React + Vite web app
- **Preview path**: `/`
- Full-featured multitenant SaaS appointment booking for Israeli market

**Routes:**
- `/` — Home (redirects to dashboard)
- `/dashboard` — Business owner dashboard (login required)
- `/book/:businessSlug` — Public booking page (branded per business)
- `/super-admin` — Super admin panel (password: "superadmin123")

**Dashboard tabs (9):**
1. **פגישות** (Appointments) — upcoming + past, cancel
2. **שירותים** (Services) — CRUD with price, duration, bufferMinutes per service, active toggle
3. **שעות עבודה** (Working Hours) — per-day on/off + time range
4. **הפסקות** (Breaks) — multi-break slots per day with labels
5. **לקוחות** (Customers / CRM) — aggregate by phone, revenue, visit history, loyal badge
6. **רשימת המתנה** (Waitlist) — waitlist entries with WhatsApp link button
7. **עיצוב** (Branding) — primaryColor (presets + custom), fontFamily (5 Hebrew fonts), dark/light mode, logo/banner upload
8. **אינטגרציות** (Integrations) — WhatsApp Business API, Google Calendar, Stripe/deposit with Hebrew step-by-step guides
9. **הגדרות** (Settings) — business name, owner, buffer, notification message

**Public booking page features:**
- Business branding applied (primaryColor, fontFamily, logoUrl, bannerUrl)
- Step 1: service selection; Step 2: date picker; Step 3: time slots; Step 4: details; Step 5: confirmation
- Waitlist signup dialog when no slots available
- Notes field
- Business notification banner

**Super admin panel features:**
- Card-based business grid
- isActive toggle (enable/suspend)
- Subscription plan selector (free/basic/pro)
- Max services editor per business
- Create/delete business
- Link to booking page

## API Server (`artifacts/api-server`)
- **Port**: `$PORT` env var
- **Base path**: `/api`
- **Auth**: JWT via `Authorization: Bearer <token>` header; token stored in `localStorage["biz_token"]`

**Key routes:**
- `POST /api/auth/business/login` — business owner login
- `GET/PATCH /api/business/profile` — business profile
- `PATCH /api/business/branding` — update branding (primaryColor, fontFamily, logoUrl, bannerUrl, themeMode)
- `PATCH /api/business/integrations` — update integrations (WhatsApp, Google Calendar, Stripe)
- `GET /api/business/customers` — CRM: customers aggregated by phone with revenue/visits
- `GET /api/business/waitlist` — list waitlist entries
- `DELETE /api/business/waitlist/:id` — remove from waitlist
- `GET /api/public/:slug` — public business info (NO auth required)
- `GET /api/public/:slug/services` — public services (NO auth required)
- `GET /api/public/:slug/availability` — time slots; returns `{date, slots: string[], isFullyBooked: boolean}`
- `POST /api/public/:slug/appointments` — book appointment
- `POST /api/public/:slug/waitlist` — join waitlist
- `GET /api/super-admin/businesses` — list all businesses (requires `adminPassword` query param)
- `POST /api/super-admin/businesses` — create business
- `PATCH /api/super-admin/businesses/:id` — update isActive/subscriptionPlan/maxServicesAllowed
- `DELETE /api/super-admin/businesses/:id` — delete business
- `POST /api/storage/uploads/request-url` — get presigned upload URL (GCS object storage)
- `GET /api/storage/objects/*` — serve stored objects (authenticated)
- `GET /api/public/storage/objects/*` — serve public objects

## Database Schema

- **businesses** — id, slug, name, ownerName, email, passwordHash, bufferMinutes, notificationEnabled, notificationMessage, primaryColor, fontFamily, logoUrl, bannerUrl, themeMode, whatsappApiKey, whatsappPhoneId, googleCalendarEnabled, stripeEnabled, stripePublicKey, subscriptionPlan, maxServicesAllowed, isActive, depositAmountAgorot, createdAt
- **services** — id, businessId, name, price, durationMinutes, bufferMinutes, isActive
- **workingHours** — id, businessId, dayOfWeek, startTime, endTime, isEnabled
- **breakTimes** — id, businessId, dayOfWeek, startTime, endTime, label
- **appointments** — id, businessId, serviceId, clientName, phoneNumber, appointmentDate, appointmentTime, durationMinutes, serviceName, status, notes, createdAt
- **waitlist** — id, businessId, serviceId, serviceName, clientName, phoneNumber, preferredDate, notes, createdAt

## Demo Credentials

- **Business owner**: ruth@demo-salon.co.il / demo1234 (slug: demo-salon)
- **Super admin**: superadmin123

## Object Storage

- Google Cloud Storage (GCS) provisioned via `DEFAULT_OBJECT_STORAGE_BUCKET_ID`
- Custom `useImageUpload` hook at `artifacts/appointment-booking/src/hooks/useImageUpload.ts`
- No Uppy dependency — uses native fetch with presigned URLs
