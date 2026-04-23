import { Router } from "express";
import { logBusinessNotification, logClientNotification } from "./notifications";
import { db, businessesTable, servicesTable, workingHoursTable, breakTimesTable, appointmentsTable, waitlistTable, timeOffTable, reviewsTable, staffMembersTable } from "@workspace/db";
import { eq, and, or, gte, sql, count, isNull } from "drizzle-orm";
import { computeRotationWeekIndex } from "../lib/availability";
import { sendClientCancellation, sendClientReschedule, sendClientConfirmation, sendWhatsApp } from "../lib/whatsapp";
import { isBusinessPro } from "../lib/plan";
import { allocateUnsubscribeTokensBulk, signInviteBackToken } from "../lib/unsubscribeToken";
import {
  toCanonical,
  upsertSubscribed,
  markUnsubscribed,
  getContact,
  listContactsWithNames,
  getUnsubscribedPhoneSet,
  recordInviteSent,
  isCustomerOptOut,
} from "../lib/broadcastContacts";
import {
  UpdateBusinessProfileBody,
  CreateBusinessServiceBody,
  UpdateBusinessServiceBody,
  UpdateBusinessServiceParams,
  DeleteBusinessServiceParams,
  SetWorkingHoursBody,
  SetBreakTimesBody,
  CancelBusinessAppointmentParams,
  UpdateBusinessBrandingBody,
  UpdateBusinessIntegrationsBody,
  RemoveFromWaitlistParams,
} from "@workspace/api-zod";
import { requireBusinessAuth } from "../middlewares/business-auth";

const router = Router();

function parseCreateTimeOffBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const { date, startTime, endTime, fullDay, note } = raw;
  if (typeof date !== "string") return { success: false as const };
  if (startTime !== undefined && startTime !== null && typeof startTime !== "string") return { success: false as const };
  if (endTime !== undefined && endTime !== null && typeof endTime !== "string") return { success: false as const };
  if (fullDay !== undefined && typeof fullDay !== "boolean") return { success: false as const };
  // Accept null as "no note" just like undefined. The frontend sends
  // { note: note || null } for empty fields; rejecting null was why the
  // 'הוסף יום חופש' button silently did nothing.
  if (note !== undefined && note !== null && typeof note !== "string") return { success: false as const };
  return { success: true as const, data: { date, startTime, endTime, fullDay, note } };
}

// Partial update body for PATCH /business/time-off/:id — same shape as
// the create body but every field is optional.
function parseUpdateTimeOffBody(raw: any) {
  if (!raw || typeof raw !== "object") return { success: false as const };
  const { date, startTime, endTime, fullDay, note } = raw;
  if (date !== undefined && typeof date !== "string") return { success: false as const };
  if (startTime !== undefined && startTime !== null && typeof startTime !== "string") return { success: false as const };
  if (endTime !== undefined && endTime !== null && typeof endTime !== "string") return { success: false as const };
  if (fullDay !== undefined && typeof fullDay !== "boolean") return { success: false as const };
  if (note !== undefined && note !== null && typeof note !== "string") return { success: false as const };
  return { success: true as const, data: { date, startTime, endTime, fullDay, note } };
}

function mapBusiness(b: typeof businessesTable.$inferSelect) {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    ownerName: b.ownerName,
    ownerFirstName: (b as any).ownerFirstName ?? null,
    ownerLastName:  (b as any).ownerLastName  ?? null,
    ownerGender: (b as any).ownerGender ?? null,
    email: b.email,
    bufferMinutes: b.bufferMinutes,
    notificationEnabled: b.notificationEnabled,
    notificationMessage: b.notificationMessage ?? null,
    primaryColor: b.primaryColor ?? null,
    fontFamily: b.fontFamily ?? null,
    logoUrl: b.logoUrl ?? null,
    bannerUrl: b.bannerUrl ?? null,
    themeMode: b.themeMode ?? null,
    borderRadius: b.borderRadius ?? null,
    welcomeText: b.welcomeText ?? null,
    backgroundColor: b.backgroundColor ?? null,
    whatsappApiKey: b.whatsappApiKey ?? null,
    whatsappPhoneId: b.whatsappPhoneId ?? null,
    googleCalendarEnabled: b.googleCalendarEnabled,
    stripeEnabled: b.stripeEnabled,
    stripePublicKey: b.stripePublicKey ?? null,
    requirePhoneVerification: b.requirePhoneVerification,
    phone: b.phone ?? null,
    subscriptionPlan: b.subscriptionPlan,
    maxServicesAllowed: b.maxServicesAllowed,
    maxAppointmentsPerMonth: b.maxAppointmentsPerMonth,
    requireAppointmentApproval: b.requireAppointmentApproval,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
    // Booking restrictions
    minLeadHours: b.minLeadHours,
    cancellationHours: b.cancellationHours,
    maxFutureWeeks: b.maxFutureWeeks,
    futureBookingMode: b.futureBookingMode,
    maxFutureDate: b.maxFutureDate ?? null,
    maxAppointmentsPerCustomer: b.maxAppointmentsPerCustomer ?? null,
    requireActiveSubscription: b.requireActiveSubscription,
    maxAppointmentsPerDay: b.maxAppointmentsPerDay ?? null,
    // Reminders
    buttonRadius: b.buttonRadius ?? null,
    sendBookingConfirmation: b.sendBookingConfirmation ?? true,
    sendReminders: b.sendReminders,
    requireArrivalConfirmation: b.requireArrivalConfirmation,
    sendWhatsAppReminders: b.sendWhatsAppReminders,
    // Owner opt-in for automated WhatsApp cancel message on owner-cancel.
    notifyOnCancel: (b as any).notifyOnCancel ?? false,
    reminderTriggers: b.reminderTriggers ?? null,
    reminderCustomText: b.reminderCustomText ?? null,
    shabbatMode: b.shabbatMode,
    reminderSendTime: b.reminderSendTime,
    // Header display controls
    showBusinessName: b.showBusinessName,
    showLogo: b.showLogo,
    showBanner: b.showBanner,
    headerLayout: b.headerLayout,
    // Profile landing page
    websiteUrl: (b as any).websiteUrl ?? null,
    instagramUrl: (b as any).instagramUrl ?? null,
    wazeUrl: (b as any).wazeUrl ?? null,
    businessDescription: (b as any).businessDescription ?? null,
    galleryImages: (b as any).galleryImages ?? null,
    bannerPosition: (b as any).bannerPosition ?? "center",
    contactPhone: (b as any).contactPhone ?? null,
    address: (b as any).address ?? null,
    city: (b as any).city ?? null,
    businessCategories: (b as any).businessCategories ?? null,
    announcementText: (b as any).announcementText ?? null,
    announcementValidHours: (b as any).announcementValidHours ?? 24,
    announcementCreatedAt: (b as any).announcementCreatedAt ? (b as any).announcementCreatedAt.toISOString() : null,
    // Tranzila
    tranzilaEnabled: (b as any).tranzilaEnabled ?? false,
    depositAmountAgorot: (b as any).depositAmountAgorot ?? null,
    // Subscription timing
    subscriptionRenewDate: (b as any).subscriptionRenewDate ? (b as any).subscriptionRenewDate.toISOString() : null,
    subscriptionCancelledAt: (b as any).subscriptionCancelledAt ? (b as any).subscriptionCancelledAt.toISOString() : null,
    // Stored card token presence (boolean only — never leak the token itself)
    hasTranzilaToken: !!((b as any).tranzilaToken),
    // Custom domain for white-label booking page
    customDomain:         (b as any).customDomain         ?? null,
    customDomainVerified: (b as any).customDomainVerified ?? false,
    // Receipt / invoice profile — what the owner prints on receipts
    businessTaxId:     (b as any).businessTaxId     ?? null,
    businessLegalType: (b as any).businessLegalType ?? null,
    businessLegalName: (b as any).businessLegalName ?? null,
    invoiceAddress:    (b as any).invoiceAddress    ?? null,
    autoSendReceipts:  (b as any).autoSendReceipts  ?? false,
    emailVerified:     (b as any).emailVerified     ?? false,
    // Advanced design / branding fields — these MUST be returned, otherwise
    // the BrandingTab in the dashboard resets to defaults after every save
    // (the form re-hydrates from the profile response and sees undefined).
    designPreset:      (b as any).designPreset      ?? null,
    accentColor:       (b as any).accentColor       ?? null,
    gradientEnabled:   (b as any).gradientEnabled   ?? false,
    gradientFrom:      (b as any).gradientFrom      ?? null,
    gradientTo:        (b as any).gradientTo        ?? null,
    gradientAngle:     (b as any).gradientAngle     ?? 135,
    backgroundPattern: (b as any).backgroundPattern ?? null,
    heroLayout:        (b as any).heroLayout        ?? null,
    serviceCardStyle:  (b as any).serviceCardStyle  ?? null,
    animationStyle:    (b as any).animationStyle    ?? null,
    hoverEffect:       (b as any).hoverEffect       ?? null,
  };
}

router.get("/business/profile", requireBusinessAuth, async (req, res): Promise<void> => {
  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  if (!business) {
    res.status(404).json({ error: "Business not found" });
    return;
  }

  res.json(mapBusiness(business));
});

router.patch("/business/profile", requireBusinessAuth, async (req, res): Promise<void> => {
  // Owner-only: staff tokens can view the profile tab but not mutate
  // business-level settings. Frontend also gates the save button.
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const parsed = UpdateBusinessProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.ownerName !== undefined) updates.ownerName = parsed.data.ownerName;
  // Accept split first/last names (outside the generated zod schema). When
  // either is provided, persist both AND recompute ownerName so the rest of
  // the app (emails, headers, receipts) keeps working without changes.
  {
    const ofn = (req.body as any)?.ownerFirstName;
    const oln = (req.body as any)?.ownerLastName;
    const hasFirst = typeof ofn === "string";
    const hasLast  = typeof oln === "string";
    if (hasFirst || hasLast) {
      const fn = String(ofn ?? "").trim();
      const ln = String(oln ?? "").trim();
      if (hasFirst) (updates as any).ownerFirstName = fn || null;
      if (hasLast)  (updates as any).ownerLastName  = ln || null;
      const joined = [fn, ln].filter(Boolean).join(" ").trim();
      if (joined) updates.ownerName = joined;
    }
  }
  if ((req.body as any).ownerGender !== undefined) (updates as any).ownerGender = (req.body as any).ownerGender || null;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ?? undefined;
  if ((req.body as any).email !== undefined && (req.body as any).email) {
    const newEmail = (req.body as any).email as string;
    const [existing] = await db.select({ id: businessesTable.id }).from(businessesTable).where(eq(businessesTable.email, newEmail));
    if (existing && existing.id !== req.business!.businessId) {
      res.status(409).json({ error: "אימייל זה כבר בשימוש" });
      return;
    }
    updates.email = newEmail;
  }
  if (parsed.data.bufferMinutes !== undefined) updates.bufferMinutes = parsed.data.bufferMinutes;
  if (parsed.data.notificationEnabled !== undefined) updates.notificationEnabled = parsed.data.notificationEnabled;
  if (parsed.data.notificationMessage !== undefined) updates.notificationMessage = parsed.data.notificationMessage ?? undefined;
  if (parsed.data.requireAppointmentApproval !== undefined) updates.requireAppointmentApproval = parsed.data.requireAppointmentApproval;
  if ((req.body as any).requirePhoneVerification !== undefined) updates.requirePhoneVerification = (req.body as any).requirePhoneVerification;
  // Booking restrictions + every other field not explicitly in
  // UpdateBusinessProfileBody. Orval's Zod output for openapi's
  // `additionalProperties: true` drops .passthrough(), so the generated
  // schema silently strips unknown fields — which means parsed.data only
  // carries the 5 fields enumerated above. Read extras straight off the
  // raw body (type-safe guards below still protect us from garbage).
  // Reported by owner: "הגבלות בניהול שירותים" wouldn't save — fixed
  // here so minLeadHours / maxAppointmentsPerCustomer / etc. all land.
  const d = req.body as any;
  if (d.minLeadHours !== undefined) updates.minLeadHours = d.minLeadHours ?? 0;
  if (d.cancellationHours !== undefined) updates.cancellationHours = d.cancellationHours ?? 0;
  if (d.maxFutureWeeks !== undefined) updates.maxFutureWeeks = d.maxFutureWeeks ?? 15;
  if (d.futureBookingMode !== undefined) updates.futureBookingMode = d.futureBookingMode ?? "weeks";
  if (d.maxFutureDate !== undefined) updates.maxFutureDate = d.maxFutureDate ?? undefined;
  if (d.maxAppointmentsPerCustomer !== undefined) updates.maxAppointmentsPerCustomer = d.maxAppointmentsPerCustomer ?? undefined;
  if (d.requireActiveSubscription !== undefined) updates.requireActiveSubscription = d.requireActiveSubscription ?? false;
  if (d.maxAppointmentsPerDay !== undefined) updates.maxAppointmentsPerDay = d.maxAppointmentsPerDay ?? undefined;
  // Reminders
  if (d.buttonRadius !== undefined) updates.buttonRadius = d.buttonRadius ?? undefined;
  if (d.sendBookingConfirmation !== undefined) updates.sendBookingConfirmation = d.sendBookingConfirmation ?? true;
  if (d.sendReminders !== undefined) updates.sendReminders = d.sendReminders ?? true;
  if (d.requireArrivalConfirmation !== undefined) updates.requireArrivalConfirmation = d.requireArrivalConfirmation ?? false;
  if (d.notifyOnCancel !== undefined) (updates as any).notifyOnCancel = !!d.notifyOnCancel;
  if (d.sendWhatsAppReminders !== undefined) updates.sendWhatsAppReminders = d.sendWhatsAppReminders ?? true;
  if (d.reminderTriggers !== undefined) updates.reminderTriggers = d.reminderTriggers ?? undefined;
  if (d.reminderCustomText !== undefined) updates.reminderCustomText = d.reminderCustomText ?? undefined;
  if (d.shabbatMode !== undefined) updates.shabbatMode = d.shabbatMode ?? "any";
  if (d.reminderSendTime !== undefined) updates.reminderSendTime = d.reminderSendTime ?? "20:00";
  // Tranzila
  if (d.tranzilaEnabled !== undefined) (updates as any).tranzilaEnabled = d.tranzilaEnabled;
  if (d.depositAmountAgorot !== undefined) (updates as any).depositAmountAgorot = d.depositAmountAgorot ?? null;
  // Slug (URL). Let the owner change it from Settings. Normalize and
  // check uniqueness against other businesses before writing.
  if (d.slug !== undefined) {
    const rawSlug = String(d.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").trim();
    if (rawSlug && rawSlug !== "admin" && rawSlug.length >= 2) {
      const [conflict] = await db
        .select({ id: businessesTable.id })
        .from(businessesTable)
        .where(eq(businessesTable.slug, rawSlug));
      if (conflict && conflict.id !== req.business!.businessId) {
        res.status(409).json({ error: "slug_taken", message: "הכתובת כבר תפוסה — בחר אחרת" });
        return;
      }
      updates.slug = rawSlug;
    }
  }
  // Receipt / invoice profile
  if (d.businessTaxId !== undefined)     (updates as any).businessTaxId     = d.businessTaxId     || null;
  if (d.businessLegalType !== undefined) (updates as any).businessLegalType = d.businessLegalType || null;
  if (d.businessLegalName !== undefined) (updates as any).businessLegalName = d.businessLegalName || null;
  if (d.invoiceAddress !== undefined)    (updates as any).invoiceAddress    = d.invoiceAddress    || null;
  if (d.autoSendReceipts !== undefined)  (updates as any).autoSendReceipts  = !!d.autoSendReceipts;

  // Public profile fields — these historically only flowed through
  // PATCH /business/branding, but the SettingsTab form saves via
  // this /profile endpoint. Without them here, Instagram / website /
  // contact phone / address / description edits silently disappeared
  // on save. Mirror the same shape the branding handler uses.
  if (d.businessDescription !== undefined) (updates as any).businessDescription = d.businessDescription ?? null;
  if (d.contactPhone        !== undefined) (updates as any).contactPhone        = d.contactPhone        ?? null;
  if (d.address             !== undefined) (updates as any).address             = d.address             ?? null;
  if (d.city                !== undefined) (updates as any).city                = d.city                ?? null;
  if (d.websiteUrl          !== undefined) (updates as any).websiteUrl          = d.websiteUrl          ?? null;
  if (d.instagramUrl        !== undefined) (updates as any).instagramUrl        = d.instagramUrl        ?? null;
  if (d.wazeUrl             !== undefined) (updates as any).wazeUrl             = d.wazeUrl             ?? null;
  if (d.businessCategories  !== undefined) (updates as any).businessCategories  = d.businessCategories  ?? null;
  if (d.galleryImages       !== undefined) (updates as any).galleryImages       = d.galleryImages       ?? null;

  // Address changed → invalidate cached lat/lng so the next geocode
  // pass runs with the new string. Done BEFORE the update so the row
  // we return to the client doesn't still carry stale coords.
  const addressChanged = d.address !== undefined || d.city !== undefined;
  if (addressChanged) {
    (updates as any).latitude = null;
    (updates as any).longitude = null;
  }

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  // Re-geocode in the background if the address just changed. Keeps
  // the PATCH response fast (sub-100ms) while Nominatim lookups can
  // take 500ms–2s; the public /book/:slug page re-fetches fresh data
  // on every client visit so the coords land before the Waze button
  // is ever tapped.
  if (addressChanged && updated) {
    const addr = (updated as any).address ?? null;
    const cty  = (updated as any).city    ?? null;
    if (addr || cty) {
      (async () => {
        const { geocodeAddress } = await import("../lib/geocode");
        const coords = await geocodeAddress(addr, cty);
        if (coords) {
          await db.update(businessesTable)
            .set({ latitude: coords.latitude, longitude: coords.longitude } as any)
            .where(eq(businessesTable.id, req.business!.businessId));
        }
      })().catch(() => {});
    }
  }

  res.json(mapBusiness(updated));
});

router.patch("/business/branding", requireBusinessAuth, async (req, res): Promise<void> => {
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const parsed = UpdateBusinessBrandingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.primaryColor !== undefined) updates.primaryColor = parsed.data.primaryColor ?? undefined;
  if (parsed.data.fontFamily !== undefined) updates.fontFamily = parsed.data.fontFamily ?? undefined;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl ?? undefined;
  if (parsed.data.bannerUrl !== undefined) updates.bannerUrl = parsed.data.bannerUrl ?? undefined;
  if (parsed.data.themeMode !== undefined) updates.themeMode = parsed.data.themeMode ?? undefined;
  if (parsed.data.borderRadius !== undefined) updates.borderRadius = parsed.data.borderRadius ?? undefined;
  if (parsed.data.buttonRadius !== undefined) updates.buttonRadius = parsed.data.buttonRadius ?? undefined;
  if (parsed.data.welcomeText !== undefined) updates.welcomeText = parsed.data.welcomeText ?? undefined;
  if (parsed.data.backgroundColor !== undefined) updates.backgroundColor = parsed.data.backgroundColor ?? undefined;
  if (parsed.data.showBusinessName !== undefined) updates.showBusinessName = parsed.data.showBusinessName;
  if (parsed.data.showLogo !== undefined) updates.showLogo = parsed.data.showLogo;
  if (parsed.data.showBanner !== undefined) updates.showBanner = parsed.data.showBanner;
  if (parsed.data.headerLayout !== undefined) updates.headerLayout = parsed.data.headerLayout;
  // Profile landing page fields — same Zod-strip caveat as in PATCH
  // /business/profile. Read from req.body directly to preserve extras.
  const bd = req.body as any;
  if (bd.websiteUrl !== undefined) (updates as any).websiteUrl = bd.websiteUrl ?? null;
  if (bd.instagramUrl !== undefined) (updates as any).instagramUrl = bd.instagramUrl ?? null;
  if (bd.wazeUrl !== undefined) (updates as any).wazeUrl = bd.wazeUrl ?? null;
  if (bd.businessDescription !== undefined) (updates as any).businessDescription = bd.businessDescription ?? null;
  if (bd.galleryImages !== undefined) (updates as any).galleryImages = bd.galleryImages ?? null;
  if (bd.bannerPosition !== undefined) (updates as any).bannerPosition = bd.bannerPosition ?? "center";
  if (bd.contactPhone !== undefined) (updates as any).contactPhone = bd.contactPhone ?? null;
  if (bd.address !== undefined) (updates as any).address = bd.address ?? null;
  if (bd.city !== undefined) (updates as any).city = bd.city ?? null;
  if (bd.businessCategories !== undefined) (updates as any).businessCategories = bd.businessCategories ?? null;
  if ((bd as any).announcementText !== undefined) {
    (updates as any).announcementText = (bd as any).announcementText || null;
    if ((bd as any).announcementText) (updates as any).announcementCreatedAt = new Date();
    else (updates as any).announcementCreatedAt = null;
  }
  if ((bd as any).announcementValidHours !== undefined) (updates as any).announcementValidHours = Number((bd as any).announcementValidHours) || 24;
  // Advanced design fields (preset + fine-grain)
  if (bd.designPreset !== undefined) (updates as any).designPreset = bd.designPreset ?? null;
  if (bd.accentColor !== undefined) (updates as any).accentColor = bd.accentColor ?? null;
  if (bd.gradientEnabled !== undefined) (updates as any).gradientEnabled = !!bd.gradientEnabled;
  if (bd.gradientFrom !== undefined) (updates as any).gradientFrom = bd.gradientFrom ?? null;
  if (bd.gradientTo !== undefined) (updates as any).gradientTo = bd.gradientTo ?? null;
  if (bd.gradientAngle !== undefined) (updates as any).gradientAngle = Number(bd.gradientAngle) || 135;
  if (bd.backgroundPattern !== undefined) (updates as any).backgroundPattern = bd.backgroundPattern ?? null;
  if (bd.heroLayout !== undefined) (updates as any).heroLayout = bd.heroLayout ?? null;
  if (bd.serviceCardStyle !== undefined) (updates as any).serviceCardStyle = bd.serviceCardStyle ?? null;
  if (bd.animationStyle !== undefined) (updates as any).animationStyle = bd.animationStyle ?? null;
  if (bd.hoverEffect !== undefined) (updates as any).hoverEffect = bd.hoverEffect ?? null;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  res.json(mapBusiness(updated));
});

// ─── Custom domain (Pro-only) ──────────────────────────────────────────────
//
// PATCH /api/business/domain — set/clear the business's custom hostname.
// Accepts { domain: string | null }. When `null`, clears the domain (also
// removes it from Railway). When a string, validates shape, stores it
// lowercased, and registers it with Railway's custom-domains API. The
// `verified` flag flips to true later once the domainPoller cron job
// confirms Railway finished DNS verification + SSL provisioning.

router.patch("/business/domain", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const [biz] = await db
    .select({
      subscriptionPlan: businessesTable.subscriptionPlan,
      currentDomain:    (businessesTable as any).customDomain,
    })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }
  if (biz.subscriptionPlan !== "pro") {
    res.status(403).json({ error: "pro_only", message: "פיצ'ר זה זמין רק במנוי פרו" });
    return;
  }

  const raw = (req.body ?? {}).domain;
  let domain: string | null;
  if (raw == null || raw === "") {
    domain = null;
  } else if (typeof raw !== "string") {
    res.status(400).json({ error: "Invalid domain" });
    return;
  } else {
    // Strip protocol + trailing slash if the owner pasted a full URL.
    const cleaned = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    // Basic hostname validation: label.label[.label...] with letters/digits/hyphens.
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleaned)) {
      res.status(400).json({ error: "invalid_domain_format", message: "דומיין לא תקין — דוגמה תקינה: book.yoursalon.co.il" });
      return;
    }
    // Block obvious self-references.
    if (cleaned === "kavati.net" || cleaned.endsWith(".kavati.net")) {
      res.status(400).json({ error: "reserved_domain", message: "לא ניתן להשתמש בדומיין של קבעתי" });
      return;
    }
    domain = cleaned;
  }

  // Uniqueness across businesses (case-insensitive).
  if (domain) {
    const [existing] = await db
      .select({ id: businessesTable.id })
      .from(businessesTable)
      .where(eq(sql`lower(${(businessesTable as any).customDomain})`, domain));
    if (existing && existing.id !== businessId) {
      res.status(409).json({ error: "domain_taken", message: "הדומיין כבר רשום לעסק אחר" });
      return;
    }
  }

  const [updated] = await db
    .update(businessesTable)
    .set({
      customDomain:         domain,
      customDomainVerified: false,   // every change resets verification
    } as any)
    .where(eq(businessesTable.id, businessId))
    .returning();

  // Railway-side update — fire-and-forget so the HTTP response doesn't wait
  // on Railway's network. If it fails the domainPoller will retry.
  const previous = (biz.currentDomain as string | null) ?? null;
  (async () => {
    const { addCustomDomain, removeCustomDomain } = await import("../lib/railwayApi");
    if (previous && previous !== domain) {
      await removeCustomDomain(previous).catch(() => {});
    }
    if (domain) {
      const result = await addCustomDomain(domain);
      if (!result.ok) {
        console.warn(`[domain] Railway add failed for "${domain}": ${result.error}`);
      } else {
        console.log(`[domain] Registered "${domain}" on Railway (id=${result.id ?? "n/a"})`);
      }
    }
  })().catch(err => console.error("[domain] Railway sync error:", err));

  res.json(mapBusiness(updated));
});

router.patch("/business/integrations", requireBusinessAuth, async (req, res): Promise<void> => {
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const parsed = UpdateBusinessIntegrationsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof businessesTable.$inferInsert> = {};
  if (parsed.data.whatsappApiKey !== undefined) updates.whatsappApiKey = parsed.data.whatsappApiKey ?? undefined;
  if (parsed.data.whatsappPhoneId !== undefined) updates.whatsappPhoneId = parsed.data.whatsappPhoneId ?? undefined;
  if (parsed.data.googleCalendarEnabled !== undefined) updates.googleCalendarEnabled = parsed.data.googleCalendarEnabled;
  if (parsed.data.stripeEnabled !== undefined) updates.stripeEnabled = parsed.data.stripeEnabled;
  if (parsed.data.stripePublicKey !== undefined) updates.stripePublicKey = parsed.data.stripePublicKey ?? undefined;

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, req.business!.businessId))
    .returning();

  res.json(mapBusiness(updated));
});

router.get("/business/services", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;

  const services = await db
    .select()
    .from(servicesTable)
    .where(eq(servicesTable.businessId, businessId))
    .orderBy(servicesTable.sortOrder, servicesTable.createdAt);

  // Staff scoping: when the JWT carries staffMemberId we filter the service
  // list to the ones THIS staff actually performs (per the staff_services
  // many-to-many). Convention: a staff with NO links is treated as "performs
  // every service" (so a brand-new staff isn't accidentally locked out
  // before the owner sets up their service catalog) — same fallback the
  // /book page uses.
  let filtered = services;
  if (staffMemberId) {
    const { staffServicesTable } = await import("@workspace/db");
    const links = await db
      .select({ serviceId: staffServicesTable.serviceId })
      .from(staffServicesTable)
      .where(eq(staffServicesTable.staffMemberId, staffMemberId));
    if (links.length > 0) {
      const allowed = new Set(links.map(l => l.serviceId));
      filtered = services.filter(s => allowed.has(s.id));
    }
  }

  res.json(filtered.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/business/services", requireBusinessAuth, async (req, res): Promise<void> => {
  // Owner-only: staff can view (scoped to their assignments) but never
  // create / edit / delete the service catalog. Owner reported being
  // able to delete owner-level services from a staff panel; this guard
  // is the fix for that.
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const parsed = CreateBusinessServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [business] = await db
    .select({ subscriptionPlan: businessesTable.subscriptionPlan, maxServicesAllowed: businessesTable.maxServicesAllowed })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  const FREE_SERVICE_LIMIT = 3;
  const serviceLimit = business?.subscriptionPlan === "free" ? FREE_SERVICE_LIMIT : (business?.maxServicesAllowed ?? 99);

  const [{ serviceCount }] = await db
    .select({ serviceCount: count() })
    .from(servicesTable)
    .where(and(eq(servicesTable.businessId, req.business!.businessId), eq(servicesTable.isActive, true)));

  if (serviceCount >= serviceLimit) {
    res.status(402).json({
      error: "service_limit_reached",
      message: `המנוי החינמי מאפשר עד ${FREE_SERVICE_LIMIT} שירותים. שדרג למנוי פרו כדי להוסיף יותר שירותים.`,
      limit: serviceLimit,
      current: serviceCount,
    });
    return;
  }

  const serviceData: any = { ...parsed.data, businessId: req.business!.businessId };
  const [service] = await db
    .insert(servicesTable)
    .values(serviceData)
    .returning();

  res.status(201).json({ ...service, createdAt: service.createdAt.toISOString() });
});

// ─── GET  /business/services/:id/staff ────────────────────────────────────
// ─── POST /business/services/:id/staff ────────────────────────────────────
// Inverse of /api/staff/:id/services — instead of 'set the services
// this staff performs', this is 'set which staff perform this service'.
// Owner-only; body is { staffIds: number[] }. Empty array = 'every
// staff can perform this service' (matches the staff-side fallback in
// GET /services).
router.get("/business/services/:id/staff", requireBusinessAuth, async (req, res): Promise<void> => {
  const serviceId = Number(req.params.id);
  if (!serviceId || isNaN(serviceId)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Verify service belongs to this business before leaking links.
  const [svc] = await db.select({ id: servicesTable.id }).from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, req.business!.businessId)));
  if (!svc) { res.status(404).json({ error: "Service not found" }); return; }
  const { staffServicesTable } = await import("@workspace/db");
  const links = await db
    .select({ staffMemberId: staffServicesTable.staffMemberId })
    .from(staffServicesTable)
    .where(eq(staffServicesTable.serviceId, serviceId));
  res.json({ staffIds: links.map(l => l.staffMemberId) });
});

router.post("/business/services/:id/staff", requireBusinessAuth, async (req, res): Promise<void> => {
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const serviceId = Number(req.params.id);
  if (!serviceId || isNaN(serviceId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as { staffIds?: unknown };
  const staffIds = Array.isArray(body?.staffIds)
    ? (body!.staffIds as unknown[]).filter((x): x is number => typeof x === "number" && x > 0)
    : null;
  if (staffIds === null) { res.status(400).json({ error: "Invalid body" }); return; }

  // Verify service belongs to this business.
  const [svc] = await db.select({ id: servicesTable.id }).from(servicesTable)
    .where(and(eq(servicesTable.id, serviceId), eq(servicesTable.businessId, req.business!.businessId)));
  if (!svc) { res.status(404).json({ error: "Service not found" }); return; }

  const { staffServicesTable, staffMembersTable } = await import("@workspace/db");
  // Only accept staff ids that actually belong to this business —
  // rejects a spoof that submits a staffId from another business.
  if (staffIds.length > 0) {
    const valid = await db
      .select({ id: staffMembersTable.id })
      .from(staffMembersTable)
      .where(and(
        eq(staffMembersTable.businessId, req.business!.businessId),
      ));
    const validSet = new Set(valid.map(r => r.id));
    for (const sid of staffIds) {
      if (!validSet.has(sid)) {
        res.status(400).json({ error: "Invalid staff id", staffMemberId: sid });
        return;
      }
    }
  }

  // Replace: wipe all existing links for this service, insert the new set.
  await db.delete(staffServicesTable).where(eq(staffServicesTable.serviceId, serviceId));
  if (staffIds.length > 0) {
    await db.insert(staffServicesTable).values(
      staffIds.map(sid => ({ serviceId, staffMemberId: sid }))
    );
  }
  res.json({ ok: true, staffIds });
});

router.patch("/business/services/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = UpdateBusinessServiceParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyParsed = UpdateBusinessServiceBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [service] = await db
    .update(servicesTable)
    .set(bodyParsed.data as any)
    .where(and(eq(servicesTable.id, paramsParsed.data.id), eq(servicesTable.businessId, req.business!.businessId)))
    .returning();

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json({ ...service, createdAt: service.createdAt.toISOString() });
});

router.delete("/business/services/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "הפעולה אינה זמינה." });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = DeleteBusinessServiceParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Hard delete is OK here — historical appointments carry both serviceId
  // AND a snapshot serviceName, and the one JOIN against servicesTable in
  // the codebase uses leftJoin so missing service rows are tolerated.
  // CLAUDE.md's soft-delete rule is scoped to appointments (status=cancelled),
  // not services.
  const deleted = await db
    .delete(servicesTable)
    .where(and(eq(servicesTable.id, paramsParsed.data.id), eq(servicesTable.businessId, req.business!.businessId)))
    .returning({ id: servicesTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  res.json({ success: true, message: "Service deleted" });
});

// GET /business/working-hours
// Staff scoping: when the JWT carries a staffMemberId, return the staff's
// per-staff rows only (falling back to business-wide rows as defaults
// when the staff has no per-day override yet). Owner callers see every
// business-wide row (staff_member_id IS NULL) — per-staff rows are
// managed by each staff from their own dashboard.
//
// All queries here target rotation_week_index IS NULL — the "standard"
// weekly rows. Rotation-week-tagged rows (for staff with a multi-week
// cycle) are managed by GET/PUT /business/working-hours-rotation and
// never surface here, so the owner/staff standard-hours editor can't
// accidentally overwrite them.
router.get("/business/working-hours", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const callerStaffId = req.business!.staffMemberId ?? null;

  if (callerStaffId) {
    // Prefer per-staff rows. If the staff has never edited hours, fall
    // back to the business-wide template so their form opens with sane
    // defaults (matches the availability code in lib/availability.ts).
    const staffRows = await db
      .select()
      .from(workingHoursTable)
      .where(and(
        eq(workingHoursTable.businessId, businessId),
        eq((workingHoursTable as any).staffMemberId, callerStaffId),
        isNull((workingHoursTable as any).rotationWeekIndex),
      ))
      .orderBy(workingHoursTable.dayOfWeek);
    if (staffRows.length > 0) {
      res.json(staffRows.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
      return;
    }
    const fallback = await db
      .select()
      .from(workingHoursTable)
      .where(and(
        eq(workingHoursTable.businessId, businessId),
        sql`${(workingHoursTable as any).staffMemberId} IS NULL`,
        isNull((workingHoursTable as any).rotationWeekIndex),
      ))
      .orderBy(workingHoursTable.dayOfWeek);
    res.json(fallback.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
    return;
  }

  // Owner view — only the business-wide rows (NULL staff_member_id).
  // Per-staff rows are not shown here so the owner's form never
  // overwrites a staff's personal hours on save.
  const hours = await db
    .select()
    .from(workingHoursTable)
    .where(and(
      eq(workingHoursTable.businessId, businessId),
      sql`${(workingHoursTable as any).staffMemberId} IS NULL`,
      isNull((workingHoursTable as any).rotationWeekIndex),
    ))
    .orderBy(workingHoursTable.dayOfWeek);

  res.json(hours.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
});

// PUT /business/working-hours
// Staff scoping mirrors GET: staff writes update ONLY their per-staff
// rows (staff_member_id = caller). Owner writes touch only business-
// wide rows (staff_member_id IS NULL). Neither side can clobber the
// other's rows — and neither touches rotation-tagged rows (rotation_
// week_index IS NOT NULL), which live under /working-hours-rotation.
router.put("/business/working-hours", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = SetWorkingHoursBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const businessId = req.business!.businessId;
  const callerStaffId = req.business!.staffMemberId ?? null;

  if (callerStaffId) {
    await db.delete(workingHoursTable).where(and(
      eq(workingHoursTable.businessId, businessId),
      eq((workingHoursTable as any).staffMemberId, callerStaffId),
      isNull((workingHoursTable as any).rotationWeekIndex),
    ));
    const inserted = await db
      .insert(workingHoursTable)
      .values(parsed.data.hours.map((h) => ({ ...h, businessId, staffMemberId: callerStaffId } as any)))
      .returning();
    res.json(inserted.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
    return;
  }

  await db.delete(workingHoursTable).where(and(
    eq(workingHoursTable.businessId, businessId),
    sql`${(workingHoursTable as any).staffMemberId} IS NULL`,
    isNull((workingHoursTable as any).rotationWeekIndex),
  ));
  const inserted = await db
    .insert(workingHoursTable)
    .values(parsed.data.hours.map((h) => ({ ...h, businessId })))
    .returning();

  res.json(inserted.map((h) => ({ id: h.id, businessId: h.businessId, dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })));
});

// ─── Rotation schedule (multi-week cycle) ───────────────────────────────
// Rotation is always per-staff. Owner-as-themselves resolves to the
// owner's own auto-seeded staff_members row (is_owner = TRUE); staff JWT
// naturally carries staffMemberId. Every business has exactly one
// is_owner row so the resolver below is deterministic.
async function resolveRotationStaffId(
  businessId: number,
  callerStaffId: number | null,
): Promise<number | null> {
  if (callerStaffId) return callerStaffId;
  const [ownerRow] = await db
    .select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(and(
      eq(staffMembersTable.businessId, businessId),
      eq(staffMembersTable.isOwner, true),
    ));
  return ownerRow?.id ?? null;
}

// GET /business/working-hours-rotation
// Returns the caller's rotation config + the hours rows grouped per
// rotation week. When rotation is disabled (any of the three anchor
// columns is NULL), `enabled = false` and hoursByWeek is empty — the
// caller's standard weekly hours still live under /working-hours.
router.get("/business/working-hours-rotation", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId    = req.business!.businessId;
  const callerStaffId = req.business!.staffMemberId ?? null;
  const targetStaffId = await resolveRotationStaffId(businessId, callerStaffId);
  if (!targetStaffId) {
    res.status(404).json({ error: "no_staff_row" });
    return;
  }

  const [staff] = await db
    .select({
      weeksCount:    (staffMembersTable as any).rotationWeeksCount,
      anchorDate:    (staffMembersTable as any).rotationAnchorDate,
      anchorWeekIdx: (staffMembersTable as any).rotationAnchorWeekIndex,
    })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.id, targetStaffId));

  const enabled = !!(staff?.weeksCount && staff?.anchorDate && staff?.anchorWeekIdx);

  // Always return the rotation-tagged rows if any exist, even when
  // rotation isn't currently enabled — otherwise the owner toggling
  // rotation back on would lose their previous per-week setup.
  const rows = await db
    .select()
    .from(workingHoursTable)
    .where(and(
      eq(workingHoursTable.businessId, businessId),
      eq((workingHoursTable as any).staffMemberId, targetStaffId),
      sql`${(workingHoursTable as any).rotationWeekIndex} IS NOT NULL`,
    ))
    .orderBy((workingHoursTable as any).rotationWeekIndex, workingHoursTable.dayOfWeek);

  const hoursByWeek: Record<number, Array<{ dayOfWeek: number; startTime: string; endTime: string; isEnabled: boolean }>> = {};
  for (const r of rows) {
    const w = (r as any).rotationWeekIndex as number;
    if (!hoursByWeek[w]) hoursByWeek[w] = [];
    hoursByWeek[w].push({
      dayOfWeek:  r.dayOfWeek,
      startTime:  r.startTime,
      endTime:    r.endTime,
      isEnabled:  r.isEnabled,
    });
  }

  res.json({
    enabled,
    weeksCount:       staff?.weeksCount ?? null,
    anchorDate:       staff?.anchorDate ?? null,
    anchorWeekIndex:  staff?.anchorWeekIdx ?? null,
    hoursByWeek,
  });
});

// PUT /business/working-hours-rotation
// Body: { weeksCount, anchorDate (YYYY-MM-DD), anchorWeekIndex, hoursByWeek: { "1": [{ dayOfWeek, startTime, endTime, isEnabled }, ...], ... } }
// · Validates the inputs, writes the rotation columns on staff_members,
//   replaces the per-week working_hours rows for this staff in a single
//   atomic delete+insert.
// · Responds with { conflicts: [...] } listing future appointments that
//   now fall on a day/time the staff won't be working. Owner acts on
//   them client-side (cancel or keep).
router.put("/business/working-hours-rotation", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId    = req.business!.businessId;
  const callerStaffId = req.business!.staffMemberId ?? null;
  const targetStaffId = await resolveRotationStaffId(businessId, callerStaffId);
  if (!targetStaffId) {
    res.status(404).json({ error: "no_staff_row" });
    return;
  }

  const body = req.body ?? {};
  const weeksCount      = Number(body.weeksCount);
  const anchorDate      = typeof body.anchorDate === "string" ? body.anchorDate : "";
  const anchorWeekIndex = Number(body.anchorWeekIndex);
  const hoursByWeek     = body.hoursByWeek && typeof body.hoursByWeek === "object" ? body.hoursByWeek : null;

  if (!Number.isInteger(weeksCount) || weeksCount < 2 || weeksCount > 3) {
    res.status(400).json({ error: "weeksCount must be 2 or 3" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    res.status(400).json({ error: "anchorDate must be YYYY-MM-DD" });
    return;
  }
  // anchorWeekIndex is no longer surfaced in the UI — anchorDate now
  // always represents the Sunday of "week 1" in the cycle. Accept 1 only.
  if (!Number.isInteger(anchorWeekIndex) || anchorWeekIndex !== 1) {
    res.status(400).json({ error: "anchorWeekIndex must be 1" });
    return;
  }
  if (!hoursByWeek) {
    res.status(400).json({ error: "hoursByWeek required" });
    return;
  }

  // Flatten the per-week payload into working_hours rows tagged with
  // the rotation_week_index. Defensive: ignore weeks outside 1..N and
  // days outside 0..6, clamp strings to "HH:MM" so a malformed client
  // can't poison the table.
  const TIME_RE = /^\d{2}:\d{2}$/;
  const rowsToInsert: any[] = [];
  for (let w = 1; w <= weeksCount; w++) {
    const weekHours = hoursByWeek[String(w)] ?? hoursByWeek[w];
    if (!Array.isArray(weekHours)) continue;
    for (const h of weekHours) {
      const dow = Number(h?.dayOfWeek);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
      const start   = typeof h?.startTime === "string" && TIME_RE.test(h.startTime) ? h.startTime : "09:00";
      const end     = typeof h?.endTime   === "string" && TIME_RE.test(h.endTime)   ? h.endTime   : "18:00";
      const enabled = !!h?.isEnabled;
      rowsToInsert.push({
        businessId,
        staffMemberId:     targetStaffId,
        rotationWeekIndex: w,
        dayOfWeek:         dow,
        startTime:         start,
        endTime:           end,
        isEnabled:         enabled,
      });
    }
  }

  // Write the anchor on staff_members first — the availability engine
  // reads these three columns to know whether rotation is active.
  await db
    .update(staffMembersTable)
    .set({
      rotationWeeksCount:      weeksCount,
      rotationAnchorDate:      anchorDate,
      rotationAnchorWeekIndex: anchorWeekIndex,
    } as any)
    .where(eq(staffMembersTable.id, targetStaffId));

  // Replace the whole rotation hours block for this staff. NULL-indexed
  // (standard) rows are left alone so toggling rotation OFF later
  // still exposes the staff's standard weekly hours.
  await db.delete(workingHoursTable).where(and(
    eq(workingHoursTable.businessId, businessId),
    eq((workingHoursTable as any).staffMemberId, targetStaffId),
    sql`${(workingHoursTable as any).rotationWeekIndex} IS NOT NULL`,
  ));
  if (rowsToInsert.length > 0) {
    await db.insert(workingHoursTable).values(rowsToInsert as any);
  }

  // Conflict detection — any future appointment for this staff whose
  // (date, time) falls outside the new rotation hours. We keep the SQL
  // simple: fetch every future non-cancelled appointment for the staff
  // and recompute in JS using the same rotation math the availability
  // engine uses. This is bounded by the staff's future-appointment
  // count so it stays cheap even for busy owners.
  const today = new Date().toISOString().slice(0, 10);
  const futureAppts = await db
    .select({
      id:               appointmentsTable.id,
      clientName:       appointmentsTable.clientName,
      phoneNumber:      appointmentsTable.phoneNumber,
      appointmentDate:  appointmentsTable.appointmentDate,
      appointmentTime:  appointmentsTable.appointmentTime,
      durationMinutes:  appointmentsTable.durationMinutes,
      serviceName:      appointmentsTable.serviceName,
      status:           appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, businessId),
      eq((appointmentsTable as any).staffMemberId, targetStaffId),
      gte(appointmentsTable.appointmentDate, today),
    ));

  const active = futureAppts.filter(a => a.status !== "cancelled" && a.status !== "no_show" && a.status !== "pending_payment");
  const timeToMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const dayOfWeek = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  };

  // Build a quick lookup: week → dayOfWeek → {start, end, enabled}.
  const lookup: Record<number, Record<number, { start: number; end: number; enabled: boolean }>> = {};
  for (const r of rowsToInsert) {
    if (!lookup[r.rotationWeekIndex]) lookup[r.rotationWeekIndex] = {};
    lookup[r.rotationWeekIndex][r.dayOfWeek] = {
      start:   timeToMinutes(r.startTime),
      end:     timeToMinutes(r.endTime),
      enabled: r.isEnabled,
    };
  }

  const conflicts: Array<{
    id: number; clientName: string; phoneNumber: string;
    appointmentDate: string; appointmentTime: string; serviceName: string;
    rotationWeekIndex: number; reason: "day_off" | "out_of_hours";
  }> = [];
  for (const a of active) {
    const w = computeRotationWeekIndex(a.appointmentDate, anchorDate, anchorWeekIndex, weeksCount);
    const dow = dayOfWeek(a.appointmentDate);
    const cell = lookup[w]?.[dow];
    if (!cell || !cell.enabled) {
      conflicts.push({
        id: a.id, clientName: a.clientName, phoneNumber: a.phoneNumber,
        appointmentDate: a.appointmentDate, appointmentTime: a.appointmentTime,
        serviceName: a.serviceName, rotationWeekIndex: w, reason: "day_off",
      });
      continue;
    }
    const apptStart = timeToMinutes(a.appointmentTime);
    const apptEnd   = apptStart + a.durationMinutes;
    if (apptStart < cell.start || apptEnd > cell.end) {
      conflicts.push({
        id: a.id, clientName: a.clientName, phoneNumber: a.phoneNumber,
        appointmentDate: a.appointmentDate, appointmentTime: a.appointmentTime,
        serviceName: a.serviceName, rotationWeekIndex: w, reason: "out_of_hours",
      });
    }
  }

  res.json({ success: true, conflicts });
});

// DELETE /business/working-hours-rotation
// Turns off rotation by clearing the three anchor columns on staff_members.
// Leaves the rotation-tagged working_hours rows in place so re-enabling
// later restores the previous setup without re-entering every hour. The
// availability engine treats NULL anchors as "rotation disabled" and
// falls back to the standard NULL-rotation rows, so this is the right
// kill switch.
router.delete("/business/working-hours-rotation", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId    = req.business!.businessId;
  const callerStaffId = req.business!.staffMemberId ?? null;
  const targetStaffId = await resolveRotationStaffId(businessId, callerStaffId);
  if (!targetStaffId) {
    res.status(404).json({ error: "no_staff_row" });
    return;
  }

  await db
    .update(staffMembersTable)
    .set({
      rotationWeeksCount:      null,
      rotationAnchorDate:      null,
      rotationAnchorWeekIndex: null,
    } as any)
    .where(eq(staffMembersTable.id, targetStaffId));

  res.json({ success: true });
});

router.get("/business/break-times", requireBusinessAuth, async (req, res): Promise<void> => {
  const breaks = await db
    .select()
    .from(breakTimesTable)
    .where(eq(breakTimesTable.businessId, req.business!.businessId))
    .orderBy(breakTimesTable.dayOfWeek);

  res.json(breaks.map((b) => ({ id: b.id, businessId: b.businessId, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, label: b.label ?? null })));
});

router.put("/business/break-times", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = SetBreakTimesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const businessId = req.business!.businessId;
  await db.delete(breakTimesTable).where(eq(breakTimesTable.businessId, businessId));

  if (parsed.data.breaks.length === 0) {
    res.json([]);
    return;
  }

  const inserted = await db
    .insert(breakTimesTable)
    .values(parsed.data.breaks.map((b) => ({ ...b, businessId, label: b.label ?? undefined })))
    .returning();

  res.json(inserted.map((b) => ({ id: b.id, businessId: b.businessId, dayOfWeek: b.dayOfWeek, startTime: b.startTime, endTime: b.endTime, label: b.label ?? null })));
});

router.get("/business/appointments", requireBusinessAuth, async (req, res): Promise<void> => {
  // Staff scoping: when the JWT carries staffMemberId, the caller is a
  // non-owner staff member. Return ONLY appointments booked against them
  // (appointments.staffMemberId === their id). Owner logins see every
  // row as before. Pre-existing appointments with a null staffMemberId
  // belong to the owner by convention and stay hidden from staff.
  const staffMemberId = req.business!.staffMemberId ?? null;
  const whereClause = staffMemberId
    ? and(
        eq(appointmentsTable.businessId, req.business!.businessId),
        eq((appointmentsTable as any).staffMemberId, staffMemberId),
      )
    : eq(appointmentsTable.businessId, req.business!.businessId);

  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(whereClause)
    .orderBy(appointmentsTable.appointmentDate, appointmentsTable.appointmentTime);

  res.json(appointments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// Owner-created manual appointment — bypass the customer-facing OTP
// verification + availability checks. Owner clicked a time slot or the
// "new appointment" button in the calendar, picked a client + service,
// and hit save. Goes in as status='confirmed' directly because the
// owner is the source of truth.
router.post("/business/appointments", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const { serviceId, clientName, phoneNumber, appointmentDate, appointmentTime, notes, sendNotification } = (req.body ?? {}) as any;

  const svcIdNum = Number(serviceId);
  if (!svcIdNum || !clientName?.trim() || !appointmentDate || !appointmentTime) {
    res.status(400).json({ error: "missing_fields", message: "שירות, שם לקוח, תאריך ושעה הם שדות חובה" });
    return;
  }

  const [service] = await db
    .select()
    .from(servicesTable)
    .where(and(eq(servicesTable.id, svcIdNum), eq(servicesTable.businessId, businessId)));
  if (!service) { res.status(404).json({ error: "service_not_found" }); return; }

  // Staff-scoping: when the caller's JWT carries a staffMemberId (i.e. a
  // non-owner staff member pencilling in a tour for a client), stamp that
  // id onto the new row. Without it the appointment lands with
  // staff_member_id = NULL, which means:
  //   · the staff's own GET /business/appointments filter excludes it
  //     (WHERE staff_member_id = <caller>), AND
  //   · the frontend aptList filter excludes it too.
  // Owner callers leave it NULL (business-wide row, visible to everyone).
  const callerStaffId = req.business!.staffMemberId ?? null;
  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      businessId,
      serviceId: svcIdNum,
      serviceName: service.name,
      clientName: String(clientName).trim(),
      phoneNumber: String(phoneNumber ?? "").trim(),
      appointmentDate: String(appointmentDate),
      appointmentTime: String(appointmentTime),
      durationMinutes: service.durationMinutes,
      status: "confirmed",
      notes: notes ? String(notes).slice(0, 1000) : undefined,
      staffMemberId: callerStaffId,
    } as any)
    .returning();

  logBusinessNotification({
    businessId,
    type: "new_booking",
    appointmentId: appointment.id,
    message: `תור חדש שקבעת: ${clientName} — ${service.name} ב-${appointmentDate} בשעה ${appointmentTime}`,
    actorType: "business",
    actorName: req.business!.businessName,
    staffMemberId: (appointment as any).staffMemberId ?? null,
  });

  // Notify the client via WhatsApp (non-blocking) — Pro-only, only when
  // a phone number was entered, AND only when the owner explicitly
  // opted in via the "שלח/י ללקוח הודעת WhatsApp" checkbox in the new-
  // appointment dialog. Default is off so casual walk-in pencil-ins
  // don't ping the client.
  if (sendNotification === true && appointment.phoneNumber && await isBusinessPro(businessId)) {
    const [business] = await db
      .select({ name: businessesTable.name, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.id, businessId));
    if (business) {
      const [, month, day] = appointment.appointmentDate.split("-");
      const formattedDate = `${day}/${month}`;
      sendClientConfirmation(
        appointment.phoneNumber,
        appointment.clientName,
        business.name,
        appointment.serviceName,
        formattedDate,
        appointment.appointmentTime,
        business.slug,
        businessId,
        appointment.id,
      ).catch(() => {});
    }
  }

  res.status(201).json({ ...appointment, createdAt: appointment.createdAt.toISOString() });
});

router.patch("/business/appointments/:id/approve", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: "confirmed" })
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  // Send confirmation to client now that business owner approved
  const [business] = await db
    .select({ name: businessesTable.name, slug: businessesTable.slug })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));

  let whatsappStatus: "sent" | "skipped_free_plan" | "skipped_no_business" = "skipped_no_business";
  if (business) {
    const [, month, day] = updated.appointmentDate.split("-");
    const formattedDate = `${day}/${month}`;
    const paid = await isBusinessPro(req.business!.businessId);
    if (paid) {
      whatsappStatus = "sent";
      sendClientConfirmation(updated.phoneNumber, updated.clientName, business.name, updated.serviceName, formattedDate, updated.appointmentTime, business.slug, req.business!.businessId, updated.id)
        .then(() => console.log(`[approve] WhatsApp confirmation sent for appt ${id} → ${updated.phoneNumber}`))
        .catch(err => console.error(`[approve] WhatsApp confirmation FAILED for appt ${id} → ${updated.phoneNumber}:`, err?.message ?? err));
    } else {
      whatsappStatus = "skipped_free_plan";
      console.warn(`[approve] Skipping WhatsApp for appt ${id} — business ${req.business!.businessId} not on a paid plan`);
    }
  }

  res.json({ success: true, message: "Appointment approved", whatsappStatus });
});

router.patch("/business/appointments/:id/reschedule", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { newDate, newTime, sendNotification } = req.body ?? {};
  if (!newDate || !newTime) {
    res.status(400).json({ error: "newDate and newTime are required" });
    return;
  }

  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
    })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ appointmentDate: newDate, appointmentTime: newTime, reminder24hSent: false, reminder1hSent: false, reminderMorningSent: false })
    .where(eq(appointmentsTable.id, appt.id))
    .returning();

  // Notify client via WhatsApp (non-blocking) — Pro-only, and opt-in:
  // the drag-confirm dialog + edit form now expose a "שלח/י התראה" toggle
  // that defaults to off, so owners don't blast a reschedule template
  // every time they tidy the calendar.
  const [, month, day] = newDate.split("-");
  const formattedDate = `${day}/${month}`;
  if (sendNotification === true && await isBusinessPro(req.business!.businessId)) {
    // Meta-approved template "appointment_rescheduled" expects 4 params:
    // {{1}} client, {{2}} new date/time label, {{3}} service, {{4}} confirmation#.
    const newDateTimeLabel = `${formattedDate} בשעה ${newTime}`;
    sendClientReschedule(
      appt.phoneNumber,
      appt.clientName,
      newDateTimeLabel,
      (appt as any).serviceName ?? "",
      String(appt.id),
      req.business!.businessId,
      appt.id,
    ).catch(() => {});
  }

  // Log notification for business + client — scoped to the appointment's
  // assigned staff so the reschedule lands in their own feed too.
  logBusinessNotification({
    businessId: req.business!.businessId,
    type: "reschedule",
    appointmentId: appt.id,
    message: `שינית תור של ${appt.clientName} ל-${formattedDate} בשעה ${newTime}`,
    actorType: "business",
    actorName: req.business!.businessName,
    staffMemberId: (appt as any).staffMemberId ?? null,
  });
  logClientNotification({
    phoneNumber: appt.phoneNumber,
    type: "reschedule",
    appointmentId: appt.id,
    businessName: req.business!.businessName,
    message: `התור שלך שונה ל-${formattedDate} בשעה ${newTime}`,
  });

  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// PATCH /business/appointments/:id — owner-side edit of non-time fields
// (currently just the notes column). Date/time still live on the
// dedicated /reschedule endpoint because they trigger WhatsApp
// reminders + reminder-flag resets and we don't want those firing on
// a notes-only edit.
router.patch("/business/appointments/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = (req.body ?? {}) as { notes?: string | null; serviceId?: number };
  const updates: any = {};
  if (body.notes !== undefined) {
    updates.notes = body.notes === null ? null : String(body.notes).slice(0, 1000);
  }
  // Allow the owner to swap the service on an existing appointment from
  // the edit dialog. Pulls the service row so we also refresh the
  // denormalised serviceName + durationMinutes that downstream views read.
  if (body.serviceId !== undefined) {
    const svcId = Number(body.serviceId);
    if (!svcId || isNaN(svcId)) {
      res.status(400).json({ error: "invalid_service" }); return;
    }
    const [svc] = await db
      .select()
      .from(servicesTable)
      .where(and(eq(servicesTable.id, svcId), eq(servicesTable.businessId, req.business!.businessId)));
    if (!svc) { res.status(404).json({ error: "service_not_found" }); return; }
    updates.serviceId       = svc.id;
    updates.serviceName     = svc.name;
    updates.durationMinutes = svc.durationMinutes;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No editable fields" }); return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/business/appointments/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = CancelBusinessAppointmentParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Fetch appointment data before cancelling (needed for notification)
  const [appt] = await db
    .select({
      id: appointmentsTable.id,
      phoneNumber: appointmentsTable.phoneNumber,
      clientName: appointmentsTable.clientName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, paramsParsed.data.id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const cancelReason = (req.body?.cancelReason as string | undefined) || null;
  // "ברז" (no-show) is tracked separately from a regular cancellation —
  // it's a customer reliability signal, not an owner-initiated cancel.
  // Stats + customer history can then count no-shows vs true cancellations
  // without re-parsing cancelReason strings every time.
  const cancelledStatus = cancelReason === "ברז" ? "no_show" : "cancelled";

  await db
    .update(appointmentsTable)
    .set({ status: cancelledStatus, ...(({ cancelledBy: "business", cancelReason }) as any) })
    .where(eq(appointmentsTable.id, appt.id));

  // Notify client via WhatsApp (non-blocking) — paid plan only.
  // Decision tree:
  //   1. Per-cancellation `notify` flag in the body (set by the cancel
  //      dialog's "שלח הודעת ביטול ללקוח" switch) wins outright when
  //      provided — owner is making an explicit per-row choice.
  //   2. A "pending" appointment being cancelled is really a REJECTION,
  //      and the client always needs to know so they can re-book — bypass
  //      the global notifyOnCancel there.
  //   3. Otherwise fall back to the business-wide notifyOnCancel preference.
  const [, month, day] = appt.appointmentDate.split("-");
  const formattedDate = `${day}/${month}`;
  const explicitNotify = typeof req.body?.notify === "boolean" ? req.body.notify : null;
  const [bizCancelPref] = await db
    .select({ notifyOnCancel: (businessesTable as any).notifyOnCancel })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));
  const isRejection = appt.status === "pending";
  const shouldNotify =
    explicitNotify !== null
      ? explicitNotify
      : isRejection || !!bizCancelPref?.notifyOnCancel;
  const paid = await isBusinessPro(req.business!.businessId);
  if (shouldNotify && paid) {
    sendClientCancellation(appt.phoneNumber, appt.clientName, req.business!.businessName, formattedDate, appt.appointmentTime, req.business!.businessId, appt.id)
      .then(() => console.log(`[cancel${isRejection ? "/reject" : ""}] WhatsApp sent for appt ${appt.id} → ${appt.phoneNumber}`))
      .catch(err => console.error(`[cancel${isRejection ? "/reject" : ""}] WhatsApp FAILED for appt ${appt.id} → ${appt.phoneNumber}:`, err?.message ?? err));
  } else if (!paid) {
    console.warn(`[cancel] Skipping WhatsApp for appt ${appt.id} — business ${req.business!.businessId} not on a paid plan`);
  } else {
    console.log(`[cancel] Skipping WhatsApp for appt ${appt.id} — notifyOnCancel is off (confirmed appointment)`);
  }

  // Log notification for client
  logClientNotification({
    phoneNumber: appt.phoneNumber,
    type: "cancellation",
    appointmentId: appt.id,
    businessName: req.business!.businessName,
    message: `התור שלך ב-${formattedDate} בשעה ${appt.appointmentTime} בוטל על ידי העסק`,
  });

  res.json({ success: true, message: "Appointment cancelled" });
});

// Hard-delete a cancelled appointment (permanent)
router.delete("/business/appointments/:id/permanent", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [appt] = await db
    .select({ id: appointmentsTable.id, status: appointmentsTable.status })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.id, id), eq(appointmentsTable.businessId, req.business!.businessId)));

  if (!appt) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appt.status !== "cancelled") { res.status(400).json({ error: "ניתן למחוק רק תורים מבוטלים" }); return; }

  await db.delete(appointmentsTable).where(eq(appointmentsTable.id, id));
  res.json({ success: true });
});

// Appointments by phone (for analytics drilldown)
router.get("/business/appointments/by-phone", requireBusinessAuth, async (req, res): Promise<void> => {
  const phone = typeof req.query.phone === "string" ? req.query.phone : null;
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }

  const appts = await db
    .select({
      id: appointmentsTable.id,
      serviceName: appointmentsTable.serviceName,
      appointmentDate: appointmentsTable.appointmentDate,
      appointmentTime: appointmentsTable.appointmentTime,
      status: appointmentsTable.status,
      cancelledBy: sql<string>`appointments.cancelled_by`,
      cancelReason: sql<string>`appointments.cancel_reason`,
    })
    .from(appointmentsTable)
    .where(and(
      eq(appointmentsTable.businessId, req.business!.businessId),
      eq(appointmentsTable.phoneNumber, phone),
      eq(appointmentsTable.status, "cancelled")
    ))
    .orderBy(appointmentsTable.appointmentDate);

  res.json(appts);
});

router.get("/business/stats", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const todayStr = new Date().toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  const all = await db
    .select({ appointmentDate: appointmentsTable.appointmentDate, status: appointmentsTable.status })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, businessId));

  const active = all.filter(a => a.status !== "cancelled" && a.status !== "pending_payment");
  const totalAppointments = active.length;
  const todayCount = active.filter((a) => a.appointmentDate === todayStr).length;
  const thisWeekCount = active.filter((a) => a.appointmentDate >= todayStr && a.appointmentDate < nextWeekStr).length;
  const upcomingCount = active.filter((a) => a.appointmentDate >= todayStr).length;

  res.json({ totalAppointments, todayCount, thisWeekCount, upcomingCount });
});

router.get("/business/customers", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const appointments = await db
    .select({
      clientName: appointmentsTable.clientName,
      phoneNumber: appointmentsTable.phoneNumber,
      appointmentDate: appointmentsTable.appointmentDate,
      status: appointmentsTable.status,
      cancelledBy: sql<string | null>`appointments.cancelled_by`,
      serviceId: appointmentsTable.serviceId,
      serviceName: servicesTable.name,
      price: sql<number>`COALESCE(${servicesTable.price}, 0)`.as("price"),
    })
    .from(appointmentsTable)
    .leftJoin(servicesTable, eq(appointmentsTable.serviceId, servicesTable.id))
    .where(eq(appointmentsTable.businessId, businessId))
    .orderBy(appointmentsTable.appointmentDate);

  // Pull the client's self-reported gender + email from client_sessions
  // — only clients who logged in via the portal have a row there, so
  // we fall back to null for walk-ins booked directly by the owner.
  // Keyed by phone to match the appointments join key.
  const sessions = await db.execute<{ phone_number: string; gender: string | null; email: string | null }>(sql`
    SELECT DISTINCT ON (phone_number) phone_number, gender, email
    FROM client_sessions
    WHERE phone_number IS NOT NULL
    ORDER BY phone_number, created_at DESC
  `);
  const genderByPhone = new Map<string, string>();
  const emailByPhone = new Map<string, string>();
  for (const row of sessions.rows) {
    if (row.gender) genderByPhone.set(row.phone_number, row.gender);
    if (row.email) emailByPhone.set(row.phone_number, row.email);
  }

  const customerMap = new Map<string, {
    clientName: string;
    phoneNumber: string;
    totalVisits: number;              // attended — completed/done OR past-dated confirmed

    totalRevenue: number;              // revenue from attended visits only
    noShowCount: number;               // status='no_show' (cancelReason='ברז')
    cancelledCount: number;            // status='cancelled' (any side)
    cancelledByClientCount: number;    // subset: cancelled_by='client'
    cancelledByBusinessCount: number;  // subset: cancelled_by='business'
    lastVisitDate: string;
    firstVisitDate: string;
    // The service on the customer's most recent attended appointment —
    // used by the IssueReceiptDialog on the Customers tab to auto-fill
    // amount + description when the owner issues a receipt from the row.
    lastServiceId: number | null;
    lastServiceName: string | null;
    lastServicePriceAgorot: number;
  }>();

  for (const a of appointments) {
    const key = a.phoneNumber;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        clientName: a.clientName,
        phoneNumber: a.phoneNumber,
        totalVisits: 0,
        totalRevenue: 0,
        noShowCount: 0,
        cancelledCount: 0,
        cancelledByClientCount: 0,
        cancelledByBusinessCount: 0,
        firstVisitDate: "",
        lastVisitDate: "",
        lastServiceId: null,
        lastServiceName: null,
        lastServicePriceAgorot: 0,
      });
    }
    const record = customerMap.get(key)!;

    // Abandoned-deposit attempts (pending_payment) used to be skipped
    // outright; owner asked to keep them in the customer base as leads
    // — they entered a phone, that's worth tracking. Don't count them as
    // visits / cancellations / no-shows; they sit in the map with zeros
    // until they convert into a real booking.
    if (a.status === "pending_payment") {
      // still here = customer was added above; skip per-status counters.
    } else if (a.status === "cancelled") {
      record.cancelledCount += 1;
      if (a.cancelledBy === "client") record.cancelledByClientCount += 1;
      else if (a.cancelledBy === "business") record.cancelledByBusinessCount += 1;
    } else if (a.status === "no_show") {
      record.noShowCount += 1;
    } else {
      // An appointment only counts as "הגיע/ה" (attended) when either:
      //   · status is explicitly completed/done, OR
      //   · status is confirmed AND the appointment date is in the past.
      // Earlier logic counted EVERY non-cancelled/non-no_show row —
      // including future confirmed bookings and unapproved pending
      // requests — which made the customer card display "X הגיע/ה" for
      // clients who hadn't arrived yet. Reported by owner (lilash).
      const todayIso = new Date().toISOString().slice(0, 10);
      const isCompleted = a.status === "completed" || a.status === "done";
      const isPastConfirmed = a.status === "confirmed" && a.appointmentDate < todayIso;
      if (!isCompleted && !isPastConfirmed) {
        // Skip — "pending", future-dated "confirmed", or anything else
        // hasn't happened yet. Don't touch totalVisits / revenue /
        // first-visit / last-visit. The appointment still exists in the
        // calendar; this counter just doesn't prematurely promote it.
        continue;
      }
      record.totalVisits += 1;
      record.totalRevenue += Number(a.price) || 0;
      if (!record.firstVisitDate || a.appointmentDate < record.firstVisitDate) record.firstVisitDate = a.appointmentDate;
      if (!record.lastVisitDate  || a.appointmentDate > record.lastVisitDate) {
        record.lastVisitDate           = a.appointmentDate;
        record.lastServiceId           = a.serviceId ?? null;
        record.lastServiceName         = a.serviceName ?? null;
        record.lastServicePriceAgorot  = Number(a.price) || 0;
      }
    }
  }

  const enriched = Array.from(customerMap.values())
    .map(c => ({
      ...c,
      gender: genderByPhone.get(c.phoneNumber) ?? null,
      email: emailByPhone.get(c.phoneNumber) ?? null,
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits);
  res.json(enriched);
});

// POST /business/broadcast — send SMS broadcast to subscribers.
// Quota enforcement is now unified with /api/sms/send-bulk via
// reserveQuota/refundQuota (see lib/smsQuota.ts). The per-plan caps
// are stored in businesses.sms_monthly_quota and set at grant-pro
// time (super-admin.ts): pro=100, pro-plus=300. Legacy accounts may
// carry different values; the UI reads the actual DB value from
// /api/sms/balance so owners see the right number.

router.post("/business/broadcast", requireBusinessAuth, async (req, res): Promise<void> => {
  // Owner-only: staff tokens must not be able to fire broadcasts. Staff
  // can already see the customer list; letting them also consume the
  // business's WhatsApp quota on arbitrary phoneNumbers was a wide-open
  // internal-threat escalation.
  if (req.business!.staffMemberId) {
    res.status(403).json({ error: "owner_only", message: "רק בעלי העסק יכולים לשלוח הודעות לכל הלקוחות" });
    return;
  }
  const businessId = req.business!.businessId;
  const { message, phoneNumbers, scope: scopeRaw } = req.body ?? {};
  // Recipient scope. When explicit `phoneNumbers` are given they win.
  // Otherwise `scope` picks between the owner's preset audiences:
  //   · "all"         — every customer who ever booked (legacy behaviour)
  //   · "dormant_30"  — customers with NO booking in the last 30 days
  //                     (the new default per owner, since marketing to
  //                     regulars right after they already booked is
  //                     annoying + wasteful).
  const scope: "all" | "dormant_30" = scopeRaw === "all" ? "all" : "dormant_30";
  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "הודעה נדרשת" }); return;
  }

  // Pro-only feature
  if (!(await isBusinessPro(businessId))) {
    res.status(402).json({ error: "pro_required", message: "שליחת הודעות WhatsApp זמינה רק במנוי פרו" });
    return;
  }

  // Quota enforcement — UNIFIED with /api/sms/send-bulk. Previously this
  // route kept a separate counter (broadcastSentThisMonth) which was
  // never reflected in the 'יתרת SMS' card the owner sees, so broadcasts
  // appeared free while bulk sends deducted normally. Now both paths
  // reserve from the SAME DB columns (sms_used_this_period +
  // sms_extra_balance) atomically via reserveQuota.
  //
  // CRITICAL invariants this flow enforces:
  //   1. Can't overshoot the quota — reserveQuota fails early if
  //      count > totalAvailable, so we refuse the WHOLE send rather
  //      than silently truncating.
  //   2. Race-safe — reserveQuota's UPDATE guards on the current
  //      counter values; two concurrent broadcasts can't both succeed
  //      if only one slot is left.
  //   3. Refund on Inforu failures — if only M of N actually went out,
  //      we refund (N - M) credits to the correct bucket (monthly or
  //      extra) so a failed send doesn't permanently consume quota.

  // Recipient list: caller can pass an explicit `phoneNumbers` array (the
  // owner edited the list — removed customers, added custom phones, etc.).
  // Falls back to "every customer with a non-cancelled appointment" so the
  // legacy "send to everyone" behaviour still works without UI changes.
  let phones: string[];
  if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
    phones = [...new Set(
      phoneNumbers
        .filter((p): p is string => typeof p === "string")
        .map(p => p.trim())
        .filter(Boolean)
    )];
  } else if (scope === "dormant_30") {
    // "dormant_30" = everyone who's EVER booked here but whose MOST RECENT
    // booking is ≥ 30 days ago. The idea is a reactivation blast — people
    // actively booking don't need a nag.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const rows = await db.execute(sql`
      SELECT phone_number
      FROM (
        SELECT phone_number, MAX(appointment_date) AS last_date
        FROM appointments
        WHERE business_id = ${businessId}
          AND status NOT IN ('cancelled', 'pending_payment')
        GROUP BY phone_number
      ) t
      WHERE last_date < ${cutoffIso}
    `);
    const list = ((rows as any).rows ?? []).map((r: any) => r.phone_number).filter(Boolean);
    phones = [...new Set(list)];
  } else {
    // "all" scope — legacy behaviour: every customer with any non-cancelled
    // appointment. Used as the explicit opt-out from dormant_30.
    const rows = await db
      .select({ phoneNumber: appointmentsTable.phoneNumber })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.businessId, businessId),
        sql`${appointmentsTable.status} != 'cancelled'`,
        sql`${appointmentsTable.status} != 'pending_payment'`
      ));
    phones = [...new Set(rows.map(r => r.phoneNumber).filter(Boolean))];
  }

  // Block recipients who are marked unsubscribed in broadcast_contacts.
  // Everyone else is allowed — even if they have no row at all, which
  // under תיקון 40 means they're a prior customer (relationship basis
  // for transactional marketing).
  if (phones.length > 0) {
    const unsubSet = await getUnsubscribedPhoneSet(businessId);
    const normalizedInputs = phones.map(toCanonical);
    phones = phones.filter((_, i) => !unsubSet.has(normalizedInputs[i]));
  }

  // Reserve the entire batch before touching Inforu. If the reservation
  // fails (not enough credits), refuse the whole send — don't silently
  // truncate — so the owner knows they exceeded the quota and the
  // client-side hard-cap already-shown warning was right. The old code
  // here used `phones.slice(0, remaining)` which lied to the owner
  // ('200 recipients → you see 100 sent' with no explanation).
  const { reserveQuota: _reserveQuota, refundQuota: _refundQuota } = await import("../lib/smsQuota");
  if (phones.length === 0) {
    res.json({ success: true, sent: 0, failed: 0, total: 0, failures: [] });
    return;
  }
  const reservation = await _reserveQuota(businessId, phones.length);
  if (!reservation.ok) {
    res.status(402).json({
      error: "insufficient_sms_credits",
      required: phones.length,
      available: reservation.available,
      message: `יש לך רק ${reservation.available} קרדיטים זמינים — ${phones.length} נמענים נבחרו. ההודעות לא נשלחו. רכוש חבילה נוספת או הסר נמענים.`,
    });
    return;
  }
  const batch = phones;

  let successCount = 0;
  let failCount = 0;

  // Broadcast channel moved from WhatsApp → SMS (Inforu) per owner. SMS
  // is cheaper per message and avoids Meta template approval for free-form
  // marketing text (Meta forbids non-templated marketing on WA Business
  // API). Inforu send supports multi-recipient in one request so we can
  // flip the per-phone loop to a single batched call — fewer API round
  // trips + we only pay one network cost per batch. Falls back to
  // WhatsApp if Inforu credentials aren't set yet.
  //
  // Message compose (required by Israeli spam law תיקון 40):
  //   "<business name>:
  //    <owner-authored message>
  //
  //    להסרה, הגב 'הסר'"
  //
  // The "להסרה, הגב 'הסר'" line + our inforu-reply webhook + our own
  // broadcast_unsubscribes blacklist together implement the legally
  // required immediate-unsubscribe flow.
  const [biz2] = await db
    .select({ name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, req.business!.businessId));
  const ownerMessage  = message.trim();
  const businessLabel = (biz2?.name ?? "").trim();
  // Short tokenised opt-out URL — /api/u/<6-char-token>. Routed under
  // /api/ because Railway's edge only forwards /api/* to this service.
  // KAVATI_HOST overridable per deploy; default www.kavati.net.
  const host = (process.env.KAVATI_HOST ?? "www.kavati.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
  // Pre-allocate one token per recipient so the URL stays short (no
  // signed payload, just a random 6-char DB key). Done in a single bulk
  // INSERT so a 200-recipient broadcast adds one DB round-trip, not 200.
  const tokens = batch.length > 0
    ? await allocateUnsubscribeTokensBulk(req.business!.businessId, batch)
    : [];
  const composeMessage = (recipientPhone: string, token: string) =>
    [
      businessLabel ? `${businessLabel}:` : null,
      ownerMessage,
      "",
      `להסרה https://${host}/api/u/${token}`,
    ].filter(Boolean).join("\n");

  // Collect per-phone failure reasons so the owner sees WHY a send
  // didn't arrive. Previously we swallowed them and showed "0 sent" with
  // no context — owner was left to guess whether it was the sender name,
  // a blocked number, or an invalid phone.
  const failureReasons: Array<{ phone: string; reason: string }> = [];
  const { sendSms: inforuSendSms, isInforuConfigured, resolveSenderName } = await import("../lib/inforu");
  if (isInforuConfigured() && batch.length > 0) {
    const senderName = resolveSenderName(biz2 ?? undefined);
    // Register the delivery-report webhook for every broadcast send so
    // Inforu pings us back once the carrier actually accepts (or drops)
    // the message. Without this, a "StatusId=1" from the SendSMS call
    // just means Inforu queued it; we have no visibility into whether
    // the phone got the SMS. The webhook logs per-phone outcomes into
    // sms_messages + surfaces them in the owner's "היסטוריית תפוצה"
    // view (once we build it).
    const deliveryReportUrl = `${(process.env.PUBLIC_API_BASE_URL ?? "https://www.kavati.net/api").replace(/\/$/, "")}/sms/inforu-webhook/delivery`;
    // Per-recipient send in parallel; each SMS carries its own opt-out
    // URL. Inforu handles concurrent calls fine for our volume.
    const results = await Promise.allSettled(
      batch.map((phone, i) =>
        inforuSendSms({
          recipients: [phone],
          message: composeMessage(phone, tokens[i]),
          senderName,
          customerMessageId: `broadcast-${req.business!.businessId}-${Date.now()}-${phone.slice(-4)}`,
          deliveryReportUrl,
        }),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const phone = batch[i];
      if (r.status !== "fulfilled") {
        failCount++;
        failureReasons.push({ phone, reason: "network_error" });
        continue;
      }
      const v = r.value;
      if (v.ok && v.recipients.some(rec => rec.status === "queued")) {
        successCount++;
      } else {
        failCount++;
        const first = v.recipients.find(rec => rec.status === "failed");
        failureReasons.push({
          phone,
          reason: first?.error ?? v.statusText ?? "unknown",
        });
      }
    }
  } else {
    // Fallback path: no Inforu creds → WhatsApp per-phone loop (also gets
    // a tokenised Kavati opt-out URL).
    for (let i = 0; i < batch.length; i++) {
      const phone = batch[i];
      try {
        await sendWhatsApp(phone, composeMessage(phone, tokens[i]), req.business!.businessId);
        successCount++;
      } catch (e: any) {
        failCount++;
        failureReasons.push({
          phone,
          reason: e?.message ?? "whatsapp_send_failed",
        });
      }
    }
  }

  // Refund credits for any SMS that DIDN'T actually go out (Inforu
  // rejected per-phone, or our fallback WhatsApp call threw). We
  // reserved `batch.length` upfront; now refund the delta so the
  // business isn't charged for messages the carrier didn't accept.
  //
  // Refund order: walk the original reservation IN REVERSE so we
  // refund the 'extra' bucket first (it was drained LAST by the
  // monthly-first reservation order). Math: reservation[] has at
  // most two entries — { fromSource: 'monthly', n1 } and then
  // { fromSource: 'extra', n2 }. Refunding in reverse returns credits
  // to the same buckets they came from.
  if (failCount > 0) {
    try {
      const partials: { fromSource: "monthly" | "extra"; reservedCount: number }[] = [];
      let remainingToRefund = failCount;
      for (let i = reservation.reservations.length - 1; i >= 0 && remainingToRefund > 0; i--) {
        const r = reservation.reservations[i];
        const refundFromThis = Math.min(r.reservedCount, remainingToRefund);
        if (refundFromThis > 0) {
          partials.push({ fromSource: r.fromSource, reservedCount: refundFromThis });
          remainingToRefund -= refundFromThis;
        }
      }
      await _refundQuota(businessId, partials);
    } catch (refundErr) {
      // Non-blocking: the owner's quota may be slightly overstated for
      // a short window, but the original send already happened and
      // reporting it is more important than a clean books.
      console.error("[broadcast] refund failed, continuing:", refundErr);
    }
  }

  // Bookkeeping — keep broadcastSentThisMonth updated for any code
  // (historic dashboards, internal reports) that still reads it. NOT
  // used for quota enforcement anymore; that's reserveQuota's job.
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
    await db
      .update(businessesTable)
      .set({
        broadcastSentThisMonth: sql`
          CASE WHEN ${businessesTable.broadcastMonthKey} = ${currentMonth}
               THEN COALESCE(${businessesTable.broadcastSentThisMonth}, 0) + ${successCount}
               ELSE ${successCount}
          END
        `,
        broadcastMonthKey: currentMonth,
      })
      .where(eq(businessesTable.id, businessId));
  } catch {
    // Stats bookkeeping — not worth failing the send for.
  }

  // Fetch the fresh post-send quota snapshot so the UI can update the
  // balance card without a second round-trip to /sms/balance.
  let postSnapshot: { totalAvailable: number; monthlyRemaining: number } | null = null;
  try {
    const { getQuotaSnapshot } = await import("../lib/smsQuota");
    const snap = await getQuotaSnapshot(businessId);
    postSnapshot = {
      totalAvailable:   snap.totalAvailable,
      monthlyRemaining: snap.monthlyRemaining,
    };
  } catch { /* non-critical */ }

  res.json({
    success: true,
    sent: successCount,
    failed: failCount,
    total: batch.length,
    remainingThisMonth: postSnapshot?.monthlyRemaining ?? null,
    totalAvailable:     postSnapshot?.totalAvailable   ?? null,
    // Only include failure details when there actually were failures —
    // keeps the happy-path payload small and lets the UI branch on the
    // presence of this field to show an error toast with the reason.
    ...(failureReasons.length > 0 ? { failures: failureReasons } : {}),
  });
});

router.get("/business/broadcast/quota", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  // Source of truth for broadcast quota is now the SMS quota system —
  // monthly_quota - monthly_used + extra_balance. Previously this
  // endpoint read broadcastSentThisMonth, which lived in a separate
  // column that wasn't updated by /api/sms/send-bulk and looked stale
  // as soon as the owner sent anything via the SMS tab. Keeping this
  // endpoint around for backwards-compat with the CustomersTab legacy
  // modal, but the shape now matches what the frontend expects (sent,
  // limit, remaining) computed from the unified counters.
  try {
    const { getQuotaSnapshot } = await import("../lib/smsQuota");
    const snap = await getQuotaSnapshot(businessId);
    res.json({
      sent:      snap.monthlyUsed,
      limit:     snap.monthlyQuota,
      remaining: snap.totalAvailable, // includes extra_balance purchased
    });
  } catch {
    res.status(500).json({ error: "quota_read_failed" });
  }
});

router.get("/business/waitlist", requireBusinessAuth, async (req, res): Promise<void> => {
  // Staff scoping: when the caller is a staff member (JWT carries
  // staffMemberId), return ONLY waitlist entries that target a service
  // this staff actually performs — anything tied to a service they
  // don't offer (or any service the owner exclusively owns) is hidden.
  // Business-wide entries with a null serviceId stay on the owner's
  // view only; staff shouldn't see them because they have no way to
  // fulfil a "any service" request for the owner.
  const staffMemberId = req.business!.staffMemberId ?? null;

  let allowedServiceIds: number[] | null = null;
  if (staffMemberId) {
    const { staffServicesTable } = await import("@workspace/db");
    const rows = await db
      .select({ serviceId: staffServicesTable.serviceId })
      .from(staffServicesTable)
      .where(eq(staffServicesTable.staffMemberId, staffMemberId));
    allowedServiceIds = rows.map(r => r.serviceId);
  }

  const entries = await db
    .select()
    .from(waitlistTable)
    .where(eq(waitlistTable.businessId, req.business!.businessId))
    .orderBy(waitlistTable.createdAt);

  const visible = allowedServiceIds
    ? entries.filter(e => e.serviceId != null && allowedServiceIds!.includes(e.serviceId))
    : entries;

  res.json(visible.map((e) => ({
    id: e.id,
    businessId: e.businessId,
    serviceId: e.serviceId ?? null,
    serviceName: e.serviceName ?? null,
    clientName: e.clientName,
    phoneNumber: e.phoneNumber,
    preferredDate: e.preferredDate ?? null,
    notes: e.notes ?? null,
    createdAt: e.createdAt.toISOString(),
  })));
});

router.delete("/business/waitlist/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = RemoveFromWaitlistParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Staff can only delete entries tied to services they perform; otherwise
  // a staff could still wipe the owner's waitlist by guessing ids.
  const staffMemberId = req.business!.staffMemberId ?? null;
  if (staffMemberId) {
    const { staffServicesTable } = await import("@workspace/db");
    const [entry] = await db
      .select({ serviceId: waitlistTable.serviceId })
      .from(waitlistTable)
      .where(and(
        eq(waitlistTable.id, paramsParsed.data.id),
        eq(waitlistTable.businessId, req.business!.businessId),
      ));
    if (!entry) { res.status(404).json({ error: "Waitlist entry not found" }); return; }
    if (entry.serviceId == null) {
      res.status(403).json({ error: "לא ניתן להסיר רישום של שירותים שאינם בתחומך" });
      return;
    }
    const [owns] = await db
      .select({ id: staffServicesTable.id })
      .from(staffServicesTable)
      .where(and(
        eq(staffServicesTable.staffMemberId, staffMemberId),
        eq(staffServicesTable.serviceId, entry.serviceId),
      ));
    if (!owns) {
      res.status(403).json({ error: "לא ניתן להסיר רישום של שירותים שאינם בתחומך" });
      return;
    }
  }

  const deleted = await db
    .delete(waitlistTable)
    .where(and(eq(waitlistTable.id, paramsParsed.data.id), eq(waitlistTable.businessId, req.business!.businessId)))
    .returning({ id: waitlistTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Waitlist entry not found" });
    return;
  }

  res.json({ success: true, message: "Removed from waitlist" });
});

// GET /business/time-off
// Staff scoping: a staff caller (JWT carries staffMemberId) sees ONLY
// constraints that apply to them — i.e. their own per-staff rows AND the
// business-wide rows (staff_member_id IS NULL). Other staff's per-staff
// rows stay hidden so a stylist's day-off doesn't clutter a barber's
// calendar. Owner sees everything as before.
router.get("/business/time-off", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;
  const whereClause = staffMemberId
    ? and(
        eq(timeOffTable.businessId, businessId),
        or(
          sql`${(timeOffTable as any).staffMemberId} IS NULL`,
          eq((timeOffTable as any).staffMemberId, staffMemberId),
        ),
      )
    : eq(timeOffTable.businessId, businessId);
  const items = await db.select().from(timeOffTable)
    .where(whereClause)
    .orderBy(timeOffTable.date);
  res.json(items.map(t => ({
    id: t.id,
    date: t.date,
    startTime: t.startTime ?? null,
    endTime: t.endTime ?? null,
    fullDay: t.fullDay,
    note: t.note ?? null,
    staffMemberId: (t as any).staffMemberId ?? null,
  })));
});

// POST /business/time-off
// staff token (non-owner) → staff_member_id = caller (their personal day off)
// owner token             → staff_member_id = NULL (business-wide closure)
// staff token WHERE staff.isOwner = TRUE → treat as owner → NULL
//
// The third branch fixes the owner-who-logged-in-as-staff footgun: owner
// rows in staff_members (isOwner=true) exist so the multi-staff UI can
// render the owner's calendar tab. But if the owner happens to log in via
// that row (say their business-table email was changed and the staff row
// matched first), every time-off they create ends up tagged to their
// personal id instead of being business-wide, so the public booking page
// no longer blocks for it and "אילוצים נעלמו".
router.post("/business/time-off", requireBusinessAuth, async (req, res): Promise<void> => {
  const parsed = parseCreateTimeOffBody(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }
  const callerStaffId = req.business!.staffMemberId ?? null;

  // If the caller is actually the business owner masquerading as a staff
  // row (isOwner=true), flip the assignment to NULL so the entry behaves
  // like an owner-created business-wide closure.
  let staffMemberIdForInsert: number | null = callerStaffId;
  if (callerStaffId) {
    const { staffMembersTable } = await import("@workspace/db");
    const [row] = await db
      .select({ isOwner: staffMembersTable.isOwner })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, callerStaffId));
    if (row?.isOwner) staffMemberIdForInsert = null;
  }

  const [item] = await db.insert(timeOffTable).values({
    businessId: req.business!.businessId,
    staffMemberId: staffMemberIdForInsert,
    date: parsed.data.date,
    startTime: parsed.data.startTime ?? undefined,
    endTime: parsed.data.endTime ?? undefined,
    fullDay: parsed.data.fullDay ?? true,
    note: parsed.data.note ?? undefined,
  } as any).returning();
  res.json({
    id: item.id,
    date: item.date,
    startTime: item.startTime ?? null,
    endTime: item.endTime ?? null,
    fullDay: item.fullDay,
    note: item.note ?? null,
    staffMemberId: (item as any).staffMemberId ?? null,
  });
});

// PATCH /business/time-off/:id — edit a scheduled day off / partial off.
// Staff can only edit their OWN per-staff rows (staff_member_id = caller).
// They cannot edit business-wide rows (NULL staff_member_id) or other
// staff's rows; the where-clause silently rejects (404) if they try.
router.patch("/business/time-off/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = parseUpdateTimeOffBody(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid data" }); return; }

  const updates: any = {};
  if (parsed.data.date     !== undefined) updates.date      = parsed.data.date;
  if (parsed.data.fullDay  !== undefined) updates.fullDay   = parsed.data.fullDay;
  if (parsed.data.startTime !== undefined) updates.startTime = parsed.data.startTime;
  if (parsed.data.endTime  !== undefined) updates.endTime   = parsed.data.endTime;
  if (parsed.data.note     !== undefined) updates.note      = parsed.data.note;

  const businessId = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;
  const whereClause = staffMemberId
    ? and(
        eq(timeOffTable.id, id),
        eq(timeOffTable.businessId, businessId),
        eq((timeOffTable as any).staffMemberId, staffMemberId),
      )
    : and(eq(timeOffTable.id, id), eq(timeOffTable.businessId, businessId));

  const [updated] = await db.update(timeOffTable)
    .set(updates)
    .where(whereClause)
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: updated.id,
    date: updated.date,
    startTime: updated.startTime ?? null,
    endTime: updated.endTime ?? null,
    fullDay: updated.fullDay,
    note: updated.note ?? null,
    staffMemberId: (updated as any).staffMemberId ?? null,
  });
});

// DELETE /business/time-off/:id
// Same scoping as PATCH — staff can only delete their own rows.
router.delete("/business/time-off/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "id לא תקין" }); return; }
  const businessId = req.business!.businessId;
  const staffMemberId = req.business!.staffMemberId ?? null;
  const whereClause = staffMemberId
    ? and(
        eq(timeOffTable.id, id),
        eq(timeOffTable.businessId, businessId),
        eq((timeOffTable as any).staffMemberId, staffMemberId),
      )
    : and(eq(timeOffTable.id, id), eq(timeOffTable.businessId, businessId));
  await db.delete(timeOffTable).where(whereClause);
  res.json({ ok: true });
});

// DELETE /business/reviews/:id — owner removes an unwanted or abusive
// review from their wall. Row is hard-deleted; the client can still
// post a new review later (upsert on business_id + client_email).
router.delete("/business/reviews/:id", requireBusinessAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "id לא תקין" }); return; }
  const deleted = await db
    .delete(reviewsTable)
    .where(and(eq(reviewsTable.id, id), eq(reviewsTable.businessId, req.business!.businessId)))
    .returning({ id: reviewsTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
});

// GET /business/analytics
router.get("/business/analytics", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const today = new Date().toISOString().split("T")[0];

  const allAppts = await db.select().from(appointmentsTable)
    .where(eq(appointmentsTable.businessId, businessId));

  const future = allAppts.filter(a => a.appointmentDate >= today && a.status !== "cancelled").length;
  const past = allAppts.filter(a => a.appointmentDate < today && a.status !== "cancelled").length;
  const cancelled = allAppts.filter(a => a.status === "cancelled").length;
  const total = allAppts.filter(a => a.status !== "cancelled").length;

  // Monthly averages for trend
  const byMonth: Record<string, number> = {};
  allAppts.filter(a => a.status !== "cancelled").forEach(a => {
    const m = a.appointmentDate.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
  });
  const months = Object.values(byMonth);
  const avg = months.length ? Math.round(months.reduce((a, b) => a + b, 0) / months.length) : 0;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
  const currentCount = byMonth[currentMonth] || 0;
  const prevCount = byMonth[prevMonth] || 0;
  const trending = currentCount > prevCount;

  // Cancellation rankings — include BOTH statuses so the no-show ranking
  // isn't empty after we started storing "ברז" under status='no_show'.
  // The cancelReason check below still routes each row to the correct
  // bucket (no-show vs regular cancellation).
  const cancelledAppts = allAppts.filter(a => a.status === "cancelled" || a.status === "no_show");
  const cancelByClient: Record<string, { name: string; phone: string; count: number }> = {};
  const noShowByClient: Record<string, { name: string; phone: string; count: number }> = {};

  cancelledAppts.forEach((a: any) => {
    const key = a.phoneNumber;
    const name = a.clientName;
    const phone = a.phoneNumber;
    if (a.cancelReason === "ברז" || a.cancelReason === "no_show") {
      if (!noShowByClient[key]) noShowByClient[key] = { name, phone, count: 0 };
      noShowByClient[key].count++;
    } else {
      if (!cancelByClient[key]) cancelByClient[key] = { name, phone, count: 0 };
      cancelByClient[key].count++;
    }
  });

  const topCancellers = Object.values(cancelByClient).sort((a, b) => b.count - a.count).slice(0, 10);
  const topNoShows = Object.values(noShowByClient).sort((a, b) => b.count - a.count).slice(0, 10);

  // Top attendees — ranking of customers by how many appointments they
  // actually showed up for. Powers the "תורים שהושלמו" expand-on-click
  // panel in AnalyticsTab and the blue-checkmark "favorite customer"
  // markers on the Customers list.
  const attendedByClient: Record<string, { name: string; phone: string; count: number }> = {};
  allAppts.forEach((a: any) => {
    if (a.status === "cancelled" || a.status === "no_show" || a.status === "pending_payment") return;
    const key = a.phoneNumber;
    if (!attendedByClient[key]) attendedByClient[key] = { name: a.clientName, phone: a.phoneNumber, count: 0 };
    attendedByClient[key].count++;
  });
  const topAttendees = Object.values(attendedByClient).sort((a, b) => b.count - a.count).slice(0, 10);

  res.json({ total, future, past, cancelled, avg, currentMonth: currentCount, prevMonth: prevCount, trending, topCancellers, topNoShows, topAttendees });
});

// GET /business/revenue
router.get("/business/revenue", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;

  const allAppts = await db.select({
    date: appointmentsTable.appointmentDate,
    status: appointmentsTable.status,
    serviceId: appointmentsTable.serviceId,
  }).from(appointmentsTable).where(eq(appointmentsTable.businessId, businessId));

  const services = await db.select().from(servicesTable)
    .where(eq(servicesTable.businessId, businessId));
  const priceMap: Record<number, number> = {};
  services.forEach(s => { priceMap[s.id] = s.price; });

  const now = new Date();
  const thisMonthStr = now.toISOString().slice(0, 7);
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = nextMonthDate.toISOString().slice(0, 7);

  let thisMonth = 0, nextMonth = 0, allTime = 0;

  allAppts.filter(a => a.status !== "cancelled").forEach(a => {
    const price = priceMap[a.serviceId] ?? 0;
    const month = a.date?.slice(0, 7);
    if (month === thisMonthStr) thisMonth += price;
    if (month === nextMonthStr) nextMonth += price;
    allTime += price;
  });

  // forecast next month based on avg of last 3 months
  const last3: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.toISOString().slice(0, 7);
    const total = allAppts.filter(a => a.status !== "cancelled" && a.date?.startsWith(m))
      .reduce((sum, a) => sum + (priceMap[a.serviceId] ?? 0), 0);
    last3.push(total);
  }
  const forecast = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : 0;

  res.json({
    thisMonth: Math.round(thisMonth / 100),
    nextMonthBooked: Math.round(nextMonth / 100),
    forecast: Math.round(forecast / 100),
    allTime: Math.round(allTime / 100),
  });
});

// ─── Broadcast subscriber management ─────────────────────────────────────
//
// Per-business subscriber list: the owner sees who's on the list, can add
// custom phones that never booked (walk-ins, contacts they typed in), and
// can remove anyone (soft — flipped to status='unsubscribed' rather than
// row-deleted so Inforu-side blacklisting stays in sync).
//
// All four endpoints are owner-scoped by businessId. Staff callers see
// their business's subscribers but can't add/remove — the dashboard UI
// hides the buttons for non-owner sessions.

router.get("/business/broadcast-subscribers", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  // Single table, clean read. The response shape keeps `status` /
  // `source` for UI back-compat — UI still branches on these.
  const rawList = await listContactsWithNames(businessId);
  const list = rawList.map(r => ({
    phoneNumber: r.phoneNumber,
    clientName:  r.clientName,
    status:      r.subscribed ? "active" : "unsubscribed",
    source:      r.subscribed ? (r.optInSource ?? "") : (r.optOutSource ?? ""),
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  }));
  const activeCount       = list.filter(r => r.status === "active").length;
  const unsubscribedCount = list.filter(r => r.status === "unsubscribed").length;
  res.json({
    subscribers: list,
    total: list.length,
    active: activeCount,
    unsubscribedPhones: list.filter(r => r.status === "unsubscribed").map(r => r.phoneNumber),
    unsubscribedCount,
  });
});

router.post("/business/broadcast-subscribers", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const { phoneNumber } = req.body ?? {};
  if (!phoneNumber || typeof phoneNumber !== "string") {
    res.status(400).json({ error: "מספר טלפון נדרש" });
    return;
  }
  if (!/^\+?\d[\d\- ]{7,}$/.test(phoneNumber.trim())) {
    res.status(400).json({ error: "מספר טלפון לא תקין" });
    return;
  }
  const canonical = toCanonical(phoneNumber);
  // תיקון 40 guard: if the CURRENT state is opted-out and the opt-out
  // source is customer-initiated, the owner cannot override it. Only
  // owner-initiated removals can be reversed here.
  const contact = await getContact({ businessId, phone: canonical });
  if (contact && !contact.subscribed && isCustomerOptOut(contact.optOutSource)) {
    res.status(403).json({
      error: "customer_opted_out",
      message: "הלקוח ביקש להסיר את עצמו מרשימת התפוצה. לפי תיקון 40 בעל העסק לא יכול להוסיפו חזרה ללא הסכמה חדשה של הלקוח.",
    });
    return;
  }
  await upsertSubscribed({ businessId, phone: canonical, source: "manual_add" });
  res.json({ success: true, phoneNumber: canonical, status: "active" });
});

router.delete("/business/broadcast-subscribers/:phone", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const raw = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;
  const phone = decodeURIComponent(String(raw ?? "")).trim();
  if (!phone) { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }
  await markUnsubscribed({ businessId, phone, source: "manual_remove" });
  res.json({ success: true });
});

router.post("/business/broadcast-subscribers/:phone/resubscribe", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const raw = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;
  const phone = decodeURIComponent(String(raw ?? "")).trim();
  if (!phone) { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }
  const canonical = toCanonical(phone);
  // תיקון 40 guard — same rule as manual-add: owner can only reverse
  // their OWN prior removal.
  const contact = await getContact({ businessId, phone: canonical });
  if (contact && !contact.subscribed && isCustomerOptOut(contact.optOutSource)) {
    res.status(403).json({
      error: "customer_opted_out",
      message: "הלקוח ביקש להסיר את עצמו מרשימת התפוצה. לפי תיקון 40 בעל העסק לא יכול להחזירו ללא הסכמה חדשה של הלקוח.",
    });
    return;
  }
  await upsertSubscribed({ businessId, phone: canonical, source: "manual_resubscribe" });
  res.json({ success: true, status: "active" });
});

// ─── Broadcast re-opt-in invite (owner-triggered, SMS) ──────────────────
// Owner clicks "שלח הזמנה" on a row in "לא מנויים". We send ONE SMS to
// that phone with a tokenised link — customer taps it, lands on a
// confirmation page, taps "אשר" and re-subscribes. ONE SMS total,
// no second OTP. The link token proves phone ownership (only the
// device that received the SMS has the token), which is enough for
// consent under תיקון 40.
//
// 7-day cooldown on the contact row (last_invite_sent_at) prevents
// spamming — owner can't invite the same phone more than once per week.
const INVITE_BACK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

router.post("/business/broadcast-subscribers/:phone/invite-back", requireBusinessAuth, async (req, res): Promise<void> => {
  const businessId = req.business!.businessId;
  const raw = Array.isArray(req.params.phone) ? req.params.phone[0] : req.params.phone;
  const phone = decodeURIComponent(String(raw ?? "")).trim();
  if (!phone) { res.status(400).json({ error: "מספר טלפון נדרש" }); return; }
  const canonical = toCanonical(phone);

  const contact = await getContact({ businessId, phone: canonical });
  if (!contact || contact.subscribed) {
    res.status(404).json({ error: "not_unsubscribed", message: "הלקוח לא ברשימת המוסרים." });
    return;
  }

  // Cooldown — durable this time (stored on the contact row).
  if (contact.lastInviteSentAt) {
    const sinceMs = Date.now() - new Date(contact.lastInviteSentAt).getTime();
    if (sinceMs < INVITE_BACK_COOLDOWN_MS) {
      const waitDays = Math.ceil((INVITE_BACK_COOLDOWN_MS - sinceMs) / (24 * 60 * 60 * 1000));
      res.status(429).json({
        error: "invite_back_rate_limited",
        message: `הזמנה כבר נשלחה. אפשר לשלוח שוב בעוד ${waitDays} ימים.`,
      });
      return;
    }
  }

  const [biz] = await db
    .select({ slug: businessesTable.slug, name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId));
  if (!biz) { res.status(404).json({ error: "עסק לא נמצא" }); return; }

  // Tokenised URL — customer clicks ONCE and re-subscribes. Receipt of
  // the invite SMS is the phone-ownership proof; no additional OTP.
  const host = (process.env.KAVATI_HOST ?? "www.kavati.net").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const inviteToken = signInviteBackToken(businessId, canonical);
  const inviteUrl = `https://${host}/api/r/${encodeURIComponent(biz.slug)}?i=${inviteToken}`;
  const businessLabel = (biz.name ?? "").trim();
  const inviteMessage = [
    businessLabel ? `${businessLabel}:` : null,
    `נשמח לחזור להיות בקשר.`,
    `לאישור חזרה לרשימת התפוצה: ${inviteUrl}`,
  ].filter(Boolean).join("\n");

  const { sendSms, isInforuConfigured, resolveSenderName } = await import("../lib/inforu");
  if (!isInforuConfigured()) {
    res.status(503).json({ error: "sms_not_configured", message: "שירות ה-SMS לא מוגדר." });
    return;
  }
  const senderName = resolveSenderName(biz);
  const result = await sendSms({
    recipients: [canonical],
    message: inviteMessage,
    senderName,
    customerMessageId: `invite-back-${businessId}-${Date.now()}`,
  });
  if (!result.ok) {
    res.status(502).json({
      error: "sms_gateway_failed",
      reason: result.statusText ?? result.recipients[0]?.error ?? "unknown",
    });
    return;
  }

  await recordInviteSent({ businessId, phone: canonical });
  res.json({ success: true, sentTo: canonical });
});

export default router;
