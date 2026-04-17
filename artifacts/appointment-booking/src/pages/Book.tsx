import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetPublicBusiness,
  useGetPublicServices,
  useGetPublicAvailability,
  useCreatePublicAppointment,
  useJoinWaitlist,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DayPicker, type DayButtonProps } from "react-day-picker";

// ── Jewish holidays ───────────────────────────────────────────────────────────
const JEWISH_HOLIDAYS: Record<string, string> = {
  // 5785 (2024-2025)
  "2024-10-01": "ר.ה",
  "2024-10-02": "ר.ה", "2024-10-03": "ר.ה",
  "2024-10-06": "צ.גדליה",
  "2024-10-10": "כיפור",
  "2024-10-11": "כיפור",
  "2024-10-15": "סוכות",
  "2024-10-16": "סוכות", "2024-10-17": "סוכות",
  "2024-10-18": "חוה״מ", "2024-10-19": "חוה״מ",
  "2024-10-20": "חוה״מ", "2024-10-21": "חוה״מ",
  "2024-10-22": "הושענא",
  "2024-10-23": "שמח״ת",
  "2024-12-25": "חנוכה", "2024-12-26": "חנוכה", "2024-12-27": "חנוכה",
  "2024-12-28": "חנוכה", "2024-12-29": "חנוכה", "2024-12-30": "חנוכה",
  "2024-12-31": "חנוכה", "2025-01-01": "חנוכה", "2025-01-02": "חנוכה",
  "2025-01-10": "צ.טבת",
  "2025-02-13": "ט.שבט",
  "2025-03-13": "ת.אסתר",
  "2025-03-14": "פורים",
  "2025-03-15": "ש.פורים",
  "2025-04-11": "פסח",
  "2025-04-12": "פסח", "2025-04-13": "פסח",
  "2025-04-14": "חוה״מ", "2025-04-15": "חוה״מ",
  "2025-04-16": "חוה״מ", "2025-04-17": "חוה״מ",
  "2025-04-18": "פסח", "2025-04-19": "פסח",
  "2025-04-23": "שואה",
  "2025-04-24": "שואה",
  "2025-04-29": "זיכרון",
  "2025-04-30": "זיכרון",
  "2025-05-01": "עצמאות",
  "2025-05-15": "לג.עומר",
  "2025-05-26": "ירושלים",
  "2025-05-31": "שבועות",
  "2025-06-01": "שבועות", "2025-06-02": "שבועות",
  "2025-07-13": "צ.תמוז",
  "2025-08-02": "ט.אב",
  "2025-08-12": "ט.באב",

  // 5786 (2025-2026)
  "2025-09-21": "ר.ה",
  "2025-09-22": "ר.ה", "2025-09-23": "ר.ה",
  "2025-09-25": "צ.גדליה",
  "2025-09-30": "כיפור",
  "2025-10-01": "כיפור",
  "2025-10-05": "סוכות",
  "2025-10-06": "סוכות", "2025-10-07": "סוכות",
  "2025-10-08": "חוה״מ", "2025-10-09": "חוה״מ",
  "2025-10-10": "חוה״מ", "2025-10-11": "חוה״מ",
  "2025-10-12": "הושענא",
  "2025-10-13": "שמח״ת",
  "2025-12-14": "חנוכה", "2025-12-15": "חנוכה", "2025-12-16": "חנוכה",
  "2025-12-17": "חנוכה", "2025-12-18": "חנוכה", "2025-12-19": "חנוכה",
  "2025-12-20": "חנוכה", "2025-12-21": "חנוכה",
  "2025-12-30": "צ.טבת",
  "2026-02-01": "ט.שבט",
  "2026-03-02": "ת.אסתר",
  "2026-03-03": "פורים",
  "2026-03-04": "ש.פורים",
  "2026-03-31": "פסח",
  "2026-04-01": "פסח", "2026-04-02": "פסח",
  "2026-04-03": "חוה״מ", "2026-04-04": "חוה״מ",
  "2026-04-05": "חוה״מ", "2026-04-06": "חוה״מ",
  "2026-04-07": "פסח", "2026-04-08": "פסח",
  "2026-04-15": "שואה",
  "2026-04-16": "שואה",
  "2026-04-21": "זיכרון",
  "2026-04-22": "זיכרון",
  "2026-04-23": "עצמאות",
  "2026-05-05": "לג.עומר",
  "2026-05-15": "ירושלים",
  "2026-05-21": "שבועות",
  "2026-05-22": "שבועות", "2026-05-23": "שבועות",
  "2026-07-02": "צ.תמוז",
  "2026-07-22": "ט.אב",
  "2026-08-02": "ט.באב",

  // 5787 (2026-2027)
  "2026-09-10": "ר.ה",
  "2026-09-11": "ר.ה", "2026-09-12": "ר.ה",
  "2026-09-14": "צ.גדליה",
  "2026-09-19": "כיפור",
  "2026-09-20": "כיפור",
  "2026-09-24": "סוכות",
  "2026-09-25": "סוכות", "2026-09-26": "סוכות",
  "2026-09-27": "חוה״מ", "2026-09-28": "חוה״מ",
  "2026-09-29": "חוה״מ", "2026-09-30": "חוה״מ",
  "2026-10-01": "הושענא",
  "2026-10-02": "שמח״ת",
  "2026-12-04": "חנוכה", "2026-12-05": "חנוכה", "2026-12-06": "חנוכה",
  "2026-12-07": "חנוכה", "2026-12-08": "חנוכה", "2026-12-09": "חנוכה",
  "2026-12-10": "חנוכה", "2026-12-11": "חנוכה",
  "2026-12-20": "צ.טבת",
  "2027-01-22": "ט.שבט",
  "2027-03-21": "ת.אסתר",
  "2027-03-22": "פורים", "2027-03-23": "פורים",
  "2027-04-19": "פסח",
  "2027-04-20": "פסח", "2027-04-21": "פסח",
  "2027-04-22": "חוה״מ", "2027-04-23": "חוה״מ",
  "2027-04-24": "חוה״מ", "2027-04-25": "חוה״מ",
  "2027-04-26": "פסח", "2027-04-27": "פסח",
  "2027-05-04": "שואה",
  "2027-05-11": "זיכרון",
  "2027-05-12": "עצמאות",
  "2027-05-25": "לג.עומר",
  "2027-06-04": "ירושלים",
  "2027-06-09": "שבועות",
  "2027-06-10": "שבועות", "2027-06-11": "שבועות",
};

function toKey(d: Date) {
  // Use LOCAL date (not UTC) so holidays align with what the user sees in the calendar.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Factory — captures primaryColor so selected cells use the business brand color.
function makeHolidayDayButton(primaryColor: string) {
  return function HolidayDayButton({ day, modifiers, children, ...buttonProps }: DayButtonProps) {
    const holiday = JEWISH_HOLIDAYS[toKey(day.date)];
    const isSelected = modifiers.selected;
    const isToday = modifiers.today;
    const isDisabled = modifiers.disabled;
    return (
      <div className="relative inline-flex flex-col items-center w-9" title={holiday ?? undefined}>
        <button
          {...buttonProps}
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm transition hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent"
          style={{
            ...(buttonProps.style ?? {}),
            ...(isSelected ? { backgroundColor: primaryColor, color: "white", fontWeight: 700 } : {}),
            ...(isToday && !isSelected ? { fontWeight: 700, color: primaryColor } : {}),
          }}
          disabled={isDisabled}
        >
          {children}
        </button>
        {holiday && (
          <span className="absolute left-1/2 -translate-x-1/2 top-[36px] w-[68px] text-center text-[9px] text-amber-700 font-semibold leading-[10px] pointer-events-none break-words">
            {holiday}
          </span>
        )}
      </div>
    );
  };
}
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Check, ChevronRight, ChevronLeft, Clock, CalendarIcon, User, Phone, CheckCircle2, ListOrdered, Globe, MapPin, Instagram, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "react-day-picker/dist/style.css";
import { useToast } from "@/hooks/use-toast";

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// ─── Accessibility Widget (IS 5568 / WCAG 2.1 AA) ─────────────────────────────
// AccessibilityWidget has moved to components/AccessibilityFab.tsx and is
// now mounted globally in App.tsx so every route gets it without each page
// having to include it. Keeping this comment as a signpost for grep-ers.

/**
 * AnnouncementDialog — popup that opens when the owner has an active
 * announcement. Shows the message plus a "קראתי — אל תציג שוב" checkbox.
 *  - "סגור" (X) with checkbox OFF → reopens on next visit until it expires.
 *  - Checkbox ON + any close action → permanently dismissed (localStorage
 *    key tied to the announcement's createdAt so a NEW announcement from
 *    the same business reopens for everyone).
 */
function AnnouncementDialog({
  open,
  onOpenChange,
  text,
  createdAt,
  slug,
  primaryColor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  text: string;
  createdAt: string | null | undefined;
  slug: string;
  primaryColor: string;
}) {
  const [dontShow, setDontShow] = useState(false);
  const close = () => {
    if (dontShow && createdAt) {
      localStorage.setItem(`ann_dismissed_${slug}_${createdAt}`, "1");
    }
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md text-center" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">📢 הודעה מבית העסק</DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
          {text}
        </DialogDescription>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-2 py-2 rounded-lg hover:bg-muted transition-colors">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={e => setDontShow(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <span>קראתי — אל תציג שוב</span>
        </label>
        <Button onClick={close} style={{ backgroundColor: primaryColor }}>
          סגור
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Hebrew duration formatter with dual form for hours (שעתיים). Shared
// shape with the Dashboard helper of the same name. RTL-safe — used
// inside dir="rtl" scopes throughout the profile page.
//   60   → "שעה"
//   90   → "שעה ו-30 דקות"
//   120  → "שעתיים"
//   150  → "שעתיים ו-30 דקות"
//   180  → "3 שעות"
//   330  → "5 שעות ו-30 דקות"
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourPart = h === 0 ? "" : h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  const minPart = m === 0 ? "" : m === 1 ? "דקה" : `${m} דקות`;
  if (!hourPart) return minPart || "0 דקות";
  if (!minPart) return hourPart;
  return `${hourPart} ו-${minPart}`;
}

// Gallery lightbox with keyboard (← → Esc) and swipe paging. Extracted
// so the arrow-button / touch-handler wiring doesn't clutter the main
// Book component. RTL: the right-pointing ChevronRight is wired to
// "previous" (reading direction), left-pointing to "next".
function GalleryLightbox({
  url, index, total, onClose, onPrev, onNext,
}: {
  url: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  // Auto-focus so arrow keys work without the user tapping first.
  useEffect(() => { rootRef.current?.focus(); }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 40) return;
    // In RTL, swipe-right reveals the previous image; swipe-left the next.
    if (dx > 0) onPrev();
    else onNext();
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`תמונה ${index + 1} מתוך ${total}`}
      tabIndex={-1}
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 focus:outline-none"
      onClick={onClose}
      onKeyDown={e => {
        if (e.key === "Escape") onClose();
        else if (e.key === "ArrowRight") onPrev();
        else if (e.key === "ArrowLeft") onNext();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={url}
        alt={`gallery-${index}`}
        className="max-w-full max-h-full rounded-xl object-contain shadow-2xl select-none"
        draggable={false}
        onClick={e => e.stopPropagation()}
      />
      {/* Close — top-start (RTL = left). */}
      <button
        aria-label="סגור תמונה"
        className="absolute top-4 left-4 text-white bg-black/50 hover:bg-black/70 rounded-full w-10 h-10 flex items-center justify-center text-xl"
        onClick={e => { e.stopPropagation(); onClose(); }}
      >×</button>
      {/* Counter — top-end (RTL = right). */}
      {total > 1 && (
        <div className="absolute top-4 right-4 text-white bg-black/50 rounded-full px-3 py-1 text-xs font-semibold" dir="ltr">
          {index + 1} / {total}
        </div>
      )}
      {/* Prev / next — only when >1 image. Buttons are large and far
          from the edges so they're easy to hit on mobile. */}
      {total > 1 && (
        <>
          <button
            aria-label="תמונה קודמת"
            className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full w-11 h-11 flex items-center justify-center"
            onClick={e => { e.stopPropagation(); onPrev(); }}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <button
            aria-label="תמונה הבאה"
            className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-white bg-black/50 hover:bg-black/70 rounded-full w-11 h-11 flex items-center justify-center"
            onClick={e => { e.stopPropagation(); onNext(); }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );
}


export default function Book({ slugOverride }: { slugOverride?: string } = {}) {
  const params = useParams<{ businessSlug: string }>();
  // Custom-domain flow: HomeOrBook resolves the hostname to a slug and
  // passes it here as `slugOverride` — there's no slug in the URL.
  const businessSlug = slugOverride ?? params.businessSlug;
  const [, navigate] = useLocation();
  // Owner preview hint — when a biz_token is present we assume the
  // viewer came from the dashboard's "צפייה בעמוד העסק" link and show
  // a floating chip to hop back without losing the tab.
  const isOwnerPreview = typeof window !== "undefined" && !!(
    localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")
  );
  // Defensive: if VITE_API_BASE_URL is set to an empty string in Railway
  // (which ?? does NOT handle), we'd lose the /api prefix and all fetches fail.
  const API_BASE = (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim()) || "/api";
  // step 0 = profile page, 1-5 = booking wizard
  const [step, setStep] = useState(0);
  const [showNotification, setShowNotification] = useState(true);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [paymentIframeUrl, setPaymentIframeUrl] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showExistingBooking, setShowExistingBooking] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "hours" | "gallery" | "reviews">("services");
  // Reviews — list + composer + gating flows.
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  // Owner-side moderation — null when no delete is pending, otherwise
  // the review about to be wiped. The dialog confirms before firing
  // the DELETE so an errant tap doesn't nuke a review.
  const [reviewToDelete, setReviewToDelete] = useState<any | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [phonePopupInput, setPhonePopupInput] = useState("");
  const [existingBooking, setExistingBooking] = useState<any>(null);
  const [portalBookingExists, setPortalBookingExists] = useState(false);
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  const [rescheduleStep, setRescheduleStep] = useState<"idle" | "picking">("idle");
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(undefined);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientData, setClientData] = useState({ name: "", phone: "", notes: "" });
  const [waitlistData, setWaitlistData] = useState({ name: "", phone: "", notes: "" });

  // Phone OTP verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  /** JWT from server after OTP — required for booking when API runs on multiple Railway instances */
  const [phoneVerificationToken, setPhoneVerificationToken] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  // Portal auth
  const [clientToken, setClientToken] = useState<string | null>(
    () => localStorage.getItem("kavati_client_token") ?? sessionStorage.getItem("kavati_client_token")
  );
  // Login gate: show full-screen login if no token (user can skip)
  const [showLoginGate, setShowLoginGate] = useState(
    () => !localStorage.getItem("kavati_client_token") && !sessionStorage.getItem("kavati_client_token")
  );
  const [rememberMe, setRememberMe] = useState(true);
  const [showPortalLogin, setShowPortalLogin] = useState(false);
  const [portalLoginStep, setPortalLoginStep] = useState<"phone" | "otp">("phone");
  const [portalPhone, setPortalPhone] = useState("");
  const [portalOtpCode, setPortalOtpCode] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [gateGoogleLoading, setGateGoogleLoading] = useState(false);
  const [gateFbLoading, setGateFbLoading] = useState(false);

  // Next available slots
  const [nextSlots, setNextSlots] = useState<Array<{ date: string; time: string }>>([]);
  const [nextSlotsLoading, setNextSlotsLoading] = useState(false);
  const [useCalendar, setUseCalendar] = useState(false);

  const { toast } = useToast();
  const { data: business, isLoading: businessLoading, error: businessError } = useGetPublicBusiness(businessSlug || "");
  const { data: services, isLoading: servicesLoading } = useGetPublicServices(businessSlug || "");

  // Show announcement popup if active and not dismissed
  useEffect(() => {
    if (!business) return;
    const text = (business as any).announcementText;
    const createdAt = (business as any).announcementCreatedAt;
    const validHours = (business as any).announcementValidHours ?? 24;
    if (!text || !createdAt) return;
    const expiresAt = new Date(createdAt).getTime() + validHours * 60 * 60 * 1000;
    if (Date.now() > expiresAt) return;
    const dismissKey = `ann_dismissed_${businessSlug}_${createdAt}`;
    if (localStorage.getItem(dismissKey)) return;
    setShowAnnouncement(true);
  }, [business, businessSlug]);

  // Auto-add business to client portal when visiting the profile page
  useEffect(() => {
    if (!clientToken || !businessSlug || !business) return;
    fetch(`${API_BASE}/client/businesses/${businessSlug}`, {
      method: "POST", headers: { "x-client-token": clientToken },
    }).catch(() => {});
  }, [clientToken, businessSlug, business?.id]);

  // Dismiss notification permanently if already seen for this exact message
  useEffect(() => {
    if (!business?.notificationMessage || !businessSlug) return;
    const seen = localStorage.getItem(`notif_seen_${businessSlug}`);
    if (seen === business.notificationMessage) setShowNotification(false);
  }, [business?.notificationMessage, businessSlug]);

  // Listen for payment postMessages from Tranzila iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "kavati_payment_success") {
        setPaymentIframeUrl(null);
        setStep(5);
      } else if (e.data?.type === "kavati_payment_fail") {
        setPaymentIframeUrl(null);
        toast({ title: "התשלום נכשל", description: "ניתן לנסות שוב", variant: "destructive" });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: availability, isLoading: availabilityLoading } = useGetPublicAvailability(
    businessSlug || "",
    { date: dateStr, serviceId: selectedServiceId! },
    { query: { enabled: !!dateStr && !!selectedServiceId } }
  );

  // Availability for reschedule flow. The serviceId drives the slot
  // duration and buffer — without it the backend can't return real
  // availability. The client portal hand-off writes `serviceId` into the
  // booking payload; for legacy entries we fall back to 0 (which produces
  // an empty slot list but at least doesn't crash).
  const rescheduleServiceId = Number(existingBooking?.serviceId ?? 0);
  const rescheduleDateStr = rescheduleDate?.toISOString().split("T")[0] ?? "";
  // Tell the availability endpoint to ignore the appointment being
  // rescheduled so its current slot (and any adjacent ones shadowed by
  // it) show as free. Without this the reschedule picker claims the
  // client's own slot is taken.
  const rescheduleExcludeId = Number(existingBooking?.id ?? 0) || undefined;
  const { data: rescheduleAvailability } = useGetPublicAvailability(
    businessSlug || "",
    { date: rescheduleDateStr, serviceId: rescheduleServiceId, ...(rescheduleExcludeId ? { excludeAppointmentId: rescheduleExcludeId } : {}) } as any,
    { query: { enabled: !!rescheduleDateStr && rescheduleStep === "picking" && rescheduleServiceId > 0 } }
  );

  // "תורים קרובים" for the reschedule dialog — same /next-slots endpoint
  // the first-booking flow uses. Owner request: when a client opens
  // 'עדכון תור', show these suggestions first; only fall back to the
  // calendar if none of them fit.
  const [rescheduleNextSlots, setRescheduleNextSlots] = useState<Array<{ date: string; time: string }>>([]);
  const [rescheduleNextSlotsLoading, setRescheduleNextSlotsLoading] = useState(false);
  const [rescheduleUseCalendar, setRescheduleUseCalendar] = useState(false);
  useEffect(() => {
    if (!businessSlug || rescheduleStep !== "picking" || !rescheduleServiceId) {
      setRescheduleNextSlots([]);
      return;
    }
    setRescheduleNextSlotsLoading(true);
    fetch(`${API_BASE}/public/${businessSlug}/next-slots?serviceId=${rescheduleServiceId}&count=8`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setRescheduleNextSlots(Array.isArray(data) ? data : []))
      .catch(() => setRescheduleNextSlots([]))
      .finally(() => setRescheduleNextSlotsLoading(false));
  }, [businessSlug, rescheduleStep, rescheduleServiceId, API_BASE]);

  const createMutation = useCreatePublicAppointment();
  const waitlistMutation = useJoinWaitlist();

  const primaryColor = business?.primaryColor ?? "#2563eb";
  const DayButtonComp = useMemo(() => makeHolidayDayButton(primaryColor), [primaryColor]);
  // Default font is Rubik; the business can override it via the font
  // picker in the dashboard Branding tab. Hebrew fallback chain
  // ('Rubik', 'Heebo', sans-serif) is applied downstream so fonts
  // without Hebrew glyphs (e.g. M PLUS Rounded 1c) still render
  // Hebrew characters cleanly.
  const fontFamily = business?.fontFamily ?? "Rubik";
  const backgroundColor = (business as any)?.backgroundColor ?? null;
  const borderRadius = (business as any)?.borderRadius ?? "medium";
  const buttonRadius = (business as any)?.buttonRadius ?? "medium";
  const buttonRadiusPx = buttonRadius === "sharp" ? "4px" : buttonRadius === "rounded" ? "9999px" : "12px";
  // Dark mode is managed exclusively by <ThemeToggleFab /> (mounted
  // globally in App.tsx). Previously this component kept its own
  // `themeMode` state under a per-slug localStorage key, but the FAB
  // uses a different key — the two would fight over the `.dark` class
  // on documentElement and the profile ended up locked to either the
  // FAB's setting or an all-white/all-black cached state. Removed.
  const requireApproval = (business as any)?.requireAppointmentApproval ?? false;
  const showBusinessName = (business as any)?.showBusinessName ?? true;
  const showLogo = (business as any)?.showLogo ?? true;
  const showBanner = (business as any)?.showBanner ?? true;
  const logoUrl = business?.logoUrl ?? null;
  const bannerUrl = business?.bannerUrl ?? null;
  const phone = (business as any)?.phone ?? null;
  // Use contactPhone for display if set, otherwise fall back to login phone
  const contactPhone = (business as any)?.contactPhone ?? phone;
  const address = (business as any)?.address ?? null;
  const city = (business as any)?.city ?? null;
  // Combined address + city for the profile row — joins only if both
  // are present, with a comma. Keeps the same graceful fallback if
  // either value is missing.
  const addressFull = address && city ? `${address}, ${city}` : (address || city || null);
  const websiteUrl = (business as any)?.websiteUrl ?? null;
  // Owners who enter "example.com" (without https://) in Settings end
  // up with a RELATIVE href, which the browser resolves against the
  // current origin (→ https://kavati.net/example.com). Normalise on
  // render so external links always go to the intended domain.
  const normalizeExternalUrl = (u: string | null | undefined): string => {
    if (!u) return "";
    const t = String(u).trim();
    if (!t) return "";
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };
  const instagramUrl = (business as any)?.instagramUrl ?? null;
  // Waze search quality drops hard when given only a street — two "הרצל 5" in
  // different cities collapse to whichever Waze guessed first. Owner reported
  // Waze opening the wrong address; fix is to include city first, then street
  // + number (the order that resolves best in Hebrew address searches).
  const wazeQuery = [city, address].filter(Boolean).join(" ").trim();
  const wazeUrl = (business as any)?.wazeUrl ?? (wazeQuery ? `https://waze.com/ul?q=${encodeURIComponent(wazeQuery)}&navigate=yes` : null);
  const businessDescription = (business as any)?.businessDescription ?? null;
  const requirePhoneVerification = (business as any)?.requirePhoneVerification ?? false;
  const bannerPosition = (business as any)?.bannerPosition ?? "center";
  const businessNameDir = /[\u0590-\u05FF]/.test(business?.name ?? "") ? "rtl" : "ltr";
  const galleryImagesRaw = (business as any)?.galleryImages ?? null;
  let galleryImages: string[] = [];
  try { if (galleryImagesRaw) galleryImages = JSON.parse(galleryImagesRaw); } catch {}

  // Advanced design fields
  const accentColor = (business as any)?.accentColor ?? primaryColor;
  const gradientEnabled = (business as any)?.gradientEnabled ?? false;
  const gradientFrom = (business as any)?.gradientFrom ?? null;
  const gradientTo = (business as any)?.gradientTo ?? null;
  const gradientAngle = (business as any)?.gradientAngle ?? 135;
  const backgroundPattern = (business as any)?.backgroundPattern ?? "none";
  const heroLayout = (business as any)?.heroLayout ?? (business as any)?.headerLayout ?? "stacked";
  const serviceCardStyle = (business as any)?.serviceCardStyle ?? "card";
  const animationStyle = (business as any)?.animationStyle ?? "none";
  const hoverEffect = (business as any)?.hoverEffect ?? "none";

  // Page background is locked to cream (light) and near-black (dark).
  // Owner decision: the old per-business gradient + bgColor controls
  // fought the dark-mode FAB and the preview stopped matching the
  // actual profile page. Simpler is better — the brand shows through
  // the primary-colour accents + hero banner, not the body canvas.
  // `.dark` class on <html> (set by ThemeToggleFab) swaps the cream
  // for #141414 via the CSS rule in index.css.
  const pageBackground = "#ffffff"; // light / default; dark mode via CSS

  // Optional decorative SVG patterns as CSS background-image
  const patternSvg = backgroundPattern === "dots"
    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='2' cy='2' r='1' fill='rgba(0,0,0,0.06)'/></svg>")`
    : backgroundPattern === "grid"
    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><path d='M24 0H0V24' fill='none' stroke='rgba(0,0,0,0.05)' stroke-width='1'/></svg>")`
    : backgroundPattern === "waves"
    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='20'><path d='M0 10 Q 20 0 40 10 T 80 10' fill='none' stroke='rgba(0,0,0,0.06)' stroke-width='1.5'/></svg>")`
    : backgroundPattern === "circles"
    ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><circle cx='30' cy='30' r='20' fill='none' stroke='rgba(0,0,0,0.04)' stroke-width='1'/></svg>")`
    : undefined;

  const cardRadius = borderRadius === "sharp" ? "8px" : borderRadius === "rounded" ? "24px" : "16px";

  // Fetch next available slots when service is selected
  useEffect(() => {
    if (!selectedServiceId || !businessSlug) { setNextSlots([]); return; }
    setNextSlotsLoading(true);
    setUseCalendar(false);
    fetch(`${API_BASE}/public/${businessSlug}/next-slots?serviceId=${selectedServiceId}&count=8`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setNextSlots(Array.isArray(data) ? data : []))
      .catch(() => setNextSlots([]))
      .finally(() => setNextSlotsLoading(false));
  }, [selectedServiceId, businessSlug, API_BASE]);

  // Auto-fill client details from portal session
  useEffect(() => {
    if (!clientToken) return;
    fetch(`${API_BASE}/client/me`, { headers: { "x-client-token": clientToken } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setClientData(prev => ({
          ...prev,
          name: prev.name || data.clientName || "",
          phone: prev.phone || data.phone || "",
        }));
        // Phone already verified via portal login (OTP) — skip re-verification
        if (data.phone) setPhoneVerified(true);
      }).catch(() => {});
  }, [clientToken, API_BASE]);

  // Reviews — fetch when the tab is opened; exposes the average
  // rating + the wall. Public endpoint, no auth needed.
  useEffect(() => {
    if (activeTab !== "reviews" || !businessSlug) return;
    setReviewsLoading(true);
    fetch(`${API_BASE}/public/${businessSlug}/reviews`, { headers: clientToken ? { "x-client-token": clientToken } : {} })
      .then(r => r.ok ? r.json() : [])
      .then(d => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [activeTab, businessSlug, API_BASE]);

  // True when the currently-logged-in client already has a review on
  // file for this business — computed from the mine=true flag the
  // reviews endpoint sets for the caller. Used to switch the CTA from
  // "השאר ביקורת" → "שינוי הביקורת" so the client realises a second
  // submission overwrites rather than adds.
  const myReview = reviews.find(r => (r as any).mine);

  // Leave-review click handler — gates through login → phone → composer.
  // Each step hands off to an existing flow: the shared login gate
  // (Google / Facebook / OTP), the PATCH /client/me phone-attach, and
  // finally the composer dialog defined below.
  const onLeaveReview = () => {
    if (!clientToken) { setShowLoginGate(true); return; }
    if (!clientData.phone) { setPhonePopupInput(""); setPhonePopupOpen(true); return; }
    // If the client already has a review, pre-fill the composer with
    // the existing rating + text so "שינוי" feels like editing rather
    // than starting from scratch.
    if (myReview) {
      setReviewRating(myReview.rating ?? 5);
      setReviewText(myReview.text ?? "");
    } else {
      setReviewRating(5);
      setReviewText("");
    }
    setReviewComposerOpen(true);
  };

  const submitPhonePopup = async () => {
    const phone = phonePopupInput.trim();
    if (!/^[\d\-+() ]{7,}$/.test(phone)) { toast({ title: "מספר לא תקין", variant: "destructive" }); return; }
    try {
      const res = await fetch(`${API_BASE}/client/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-client-token": clientToken! },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error();
      setClientData(p => ({ ...p, phone }));
      setPhonePopupOpen(false);
      setReviewRating(5);
      setReviewText("");
      setReviewComposerOpen(true);
    } catch { toast({ title: "שגיאה בשמירת הטלפון", variant: "destructive" }); }
  };

  const submitReview = async () => {
    setReviewSubmitting(true);
    try {
      // Pull avatar/name from the logged-in client's Google payload
      // if we have it in localStorage, else fall back to clientData.
      const avatarUrl = (clientData as any).avatarUrl || null;
      const res = await fetch(`${API_BASE}/public/${businessSlug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-token": clientToken! },
        body: JSON.stringify({
          rating: reviewRating,
          text: reviewText.trim() || null,
          clientName: clientData.name || null,
          avatarUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה");
      }
      toast({ title: "הביקורת נשלחה — תודה!" });
      setReviewComposerOpen(false);
      // Re-fetch so the new review appears right away.
      setReviewsLoading(true);
      fetch(`${API_BASE}/public/${businessSlug}/reviews`, { headers: clientToken ? { "x-client-token": clientToken } : {} })
        .then(r => r.ok ? r.json() : [])
        .then(d => setReviews(Array.isArray(d) ? d : []))
        .finally(() => setReviewsLoading(false));
    } catch (e: any) {
      toast({ title: "שליחה נכשלה", description: e?.message ?? "נסה שוב", variant: "destructive" });
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Owner-only: delete a review from the public wall. Requires a valid
  // biz_token; the server double-checks the review belongs to this
  // owner's business, so a different owner's token can't wipe a
  // competitor's wall.
  const deleteReview = async (id: number) => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    if (!token) { toast({ title: "יש להתחבר כבעל עסק", variant: "destructive" }); return; }
    setDeletingReviewId(id);
    try {
      const res = await fetch(`${API_BASE}/business/reviews/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setReviews(prev => prev.filter(r => r.id !== id));
      setReviewToDelete(null);
      toast({ title: "הביקורת נמחקה" });
    } catch {
      toast({ title: "שגיאה במחיקת הביקורת", variant: "destructive" });
    } finally {
      setDeletingReviewId(null);
    }
  };

  // Load working hours
  useEffect(() => {
    if (!businessSlug) return;
    fetch(`${API_BASE}/public/${businessSlug}/hours`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setWorkingHours(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [businessSlug, API_BASE]);

  // Load existing booking from localStorage
  useEffect(() => {
    if (!businessSlug) return;
    const saved = localStorage.getItem(`kavati_booking_${businessSlug}`);
    if (saved) {
      try { setExistingBooking(JSON.parse(saved)); } catch {}
    }
  }, [businessSlug]);

  // ── Portal-initiated reschedule deep-link ──
  // The client portal's "עדכון תור" button navigates here with ?reschedule=1
  // after it has written the appointment details into
  // localStorage[`kavati_booking_${slug}`]. Open the existing-booking dialog
  // directly in "picking" mode so the owner can pick a new slot without an
  // extra click, then strip the query so a refresh doesn't re-trigger.
  useEffect(() => {
    if (!existingBooking?.id) return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("reschedule") !== "1") return;
    setShowExistingBooking(true);
    setRescheduleStep("picking");
    qs.delete("reschedule");
    const newUrl = window.location.pathname + (qs.toString() ? `?${qs}` : "");
    window.history.replaceState({}, "", newUrl);
  }, [existingBooking?.id]);

  // When logged in, check if client has an upcoming appointment for this business in the portal
  useEffect(() => {
    if (!clientToken || !businessSlug) { setPortalBookingExists(false); return; }
    fetch(`${API_BASE}/client/appointments`, { headers: { "x-client-token": clientToken } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const has = Array.isArray(data) && data.some(
          a => a.businessSlug === businessSlug &&
               a.status !== "cancelled" &&
               new Date(`${a.appointmentDate}T${a.appointmentTime}:00`) > new Date()
        );
        setPortalBookingExists(has);
      })
      .catch(() => setPortalBookingExists(false));
  }, [clientToken, businessSlug, API_BASE]);

  useEffect(() => {
    if (!business) return;
    const root = document.documentElement;

    if (business.primaryColor) {
      const hex = business.primaryColor.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      root.style.setProperty("--primary-r", String(r));
      root.style.setProperty("--primary-g", String(g));
      root.style.setProperty("--primary-b", String(b));
    }

    if (fontFamily && fontFamily !== "inherit") {
      const id = `gfont-${fontFamily.replace(/\s+/g, "-")}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }

    // Force-inherit the business font on form elements inside the
    // public profile scope. Browsers default <input>/<button>/<select>/
    // <textarea> to their own system fonts regardless of the parent
    // font-family, which made the chosen brand font only half-apply.
    // Rule is scoped to .kavati-biz-scope so the dashboard/admin UI
    // (locked to Rubik) isn't affected.
    const scopedStyleId = "kavati-biz-font-cascade";
    if (!document.getElementById(scopedStyleId)) {
      const style = document.createElement("style");
      style.id = scopedStyleId;
      style.textContent = `.kavati-biz-scope, .kavati-biz-scope * { font-family: inherit; }`;
      document.head.appendChild(style);
    }

    // OpenGraph / link-preview meta tags — populated from the business
    // profile so sharing the URL shows the business's name + logo
    // instead of the generic "קבעתי" wordmark. Updates client-side, so
    // browser tabs + any scraper that runs JS will see them. Static
    // scrapers (WhatsApp, FB) still see the default tags baked into
    // index.html — dynamic meta for those requires server-side HTML
    // rendering, which isn't set up yet.
    const setMeta = (key: "property" | "name", value: string, content: string) => {
      let tag = document.head.querySelector(`meta[${key}="${value}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(key, value);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    const bizName = (business as any).name as string;
    const bizDesc = (business as any).businessDescription || `קבעי תור אצל ${bizName}`;
    const bizImg  = (business as any).bannerUrl
                  || (business as any).logoUrl
                  || "/opengraph.jpg";
    // This block is inside a useEffect so we're always in the browser —
    // `window` is defined. The old `|| "http://localhost"` fallback
    // could leak into shared meta tags if the guard ever misfired, so
    // point the fallback at the real production origin instead.
    const origin = window.location.origin || "https://kavati.net";
    const bizUrl = window.location.href;
    document.title = `${bizName} — קבעתי`;
    setMeta("property", "og:title", bizName);
    setMeta("property", "og:description", String(bizDesc));
    setMeta("property", "og:image", new URL(bizImg, origin).href);
    setMeta("property", "og:url", bizUrl);
    setMeta("property", "og:type", "website");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", bizName);
    setMeta("name", "twitter:description", String(bizDesc));
    setMeta("name", "twitter:image", new URL(bizImg, origin).href);
  }, [business, fontFamily]);

  // Google sign-in for login gate
  useEffect(() => {
    if (!showLoginGate) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const apiBase = (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim()) || "/api";
    const init = () => {
      (window as any).google?.accounts?.id?.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          setGateGoogleLoading(true);
          try {
            const res = await fetch(`${apiBase}/client/google-auth`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            localStorage.setItem("kavati_client_token", data.token);
            setClientToken(data.token);
            if (businessSlug) fetch(`${apiBase}/client/businesses/${businessSlug}`, { method: "POST", headers: { "x-client-token": data.token } }).catch(() => {});
            setShowLoginGate(false);
            toast({ title: `ברוכ/ה הבא/ה${data.clientName ? `, ${data.clientName}` : ""}!` });
          } catch { toast({ title: "שגיאת Google", variant: "destructive" }); }
          finally { setGateGoogleLoading(false); }
        },
      });
    };
    if ((window as any).google?.accounts?.id) { init(); }
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [showLoginGate]);

  // Facebook login for gate
  useEffect(() => {
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId || (window as any).FB) return;
    (window as any).fbAsyncInit = () => {
      (window as any).FB.init({ appId, cookie: true, xfbml: false, version: "v19.0" });
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/he_IL/sdk.js";
    document.head.appendChild(s);
  }, []);

  if (businessLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#ffffff" }}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: primaryColor + " transparent transparent transparent" }} />
        <p className="text-muted-foreground">טוען...</p>
      </div>
    </div>
  );
  if (businessError || !business) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8" style={{ background: "#ffffff" }}>
      <div>
        <div className="text-4xl mb-4">😔</div>
        <h1 className="text-2xl font-bold text-destructive mb-2">העסק לא נמצא</h1>
        <p className="text-muted-foreground">הכתובת שהזנת אינה תקינה</p>
      </div>
    </div>
  );

  const handlePortalSendOtp = async () => {
    if (!portalPhone.trim()) return;
    setPortalLoading(true);
    try {
      const res = await fetch(`${API_BASE}/client/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: portalPhone.trim() }),
      });
      if (!res.ok) throw new Error();
      setPortalLoginStep("otp");
      toast({ title: "קוד נשלח לווצאפ שלך" });
    } catch { toast({ title: "שגיאה בשליחת קוד", variant: "destructive" }); }
    finally { setPortalLoading(false); }
  };

  const handlePortalVerifyOtp = async (gateRememberMe?: boolean) => {
    if (!portalOtpCode.trim()) return;
    setPortalLoading(true);
    const shouldRemember = gateRememberMe ?? rememberMe;
    try {
      const res = await fetch(`${API_BASE}/client/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: portalPhone.trim(), code: portalOtpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (shouldRemember) {
        localStorage.setItem("kavati_client_token", data.token);
      } else {
        sessionStorage.setItem("kavati_client_token", data.token);
      }
      setClientToken(data.token);
      if (businessSlug) {
        fetch(`${API_BASE}/client/businesses/${businessSlug}`, {
          method: "POST", headers: { "x-client-token": data.token },
        }).catch(() => {});
      }
      setShowPortalLogin(false);
      setShowLoginGate(false);
      toast({ title: `ברוכ/ה הבא/ה${data.clientName ? `, ${data.clientName}` : ""}!` });
    } catch (e: any) { toast({ title: e?.message ?? "קוד שגוי", variant: "destructive" }); }
    finally { setPortalLoading(false); }
  };

  const handleGateFacebookLogin = () => {
    const FB = (window as any).FB;
    if (!FB) return;
    setGateFbLoading(true);
    FB.login((response: any) => {
      if (!response.authResponse) { setGateFbLoading(false); return; }
      const { accessToken, userID } = response.authResponse;
      fetch(`${API_BASE}/client/facebook-auth`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, userId: userID }),
      }).then(r => r.json()).then(data => {
        if (!data.token) throw new Error();
        localStorage.setItem("kavati_client_token", data.token);
        setClientToken(data.token);
        if (businessSlug) fetch(`${API_BASE}/client/businesses/${businessSlug}`, { method: "POST", headers: { "x-client-token": data.token } }).catch(() => {});
        setShowLoginGate(false);
        toast({ title: `ברוכ/ה הבא/ה${data.clientName ? `, ${data.clientName}` : ""}!` });
      }).catch(() => toast({ title: "שגיאת Facebook", variant: "destructive" }))
        .finally(() => setGateFbLoading(false));
    }, { scope: "public_profile,email" });
  };

  // ─── Login gate (full-screen, shown before booking page if no token) ────────
  if (showLoginGate && !businessLoading && business) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-blue-50 px-4 py-8"
        style={{ fontFamily: `'${business.fontFamily ?? "Heebo"}', sans-serif` }}>
        <div className="w-full max-w-sm">
          {/* Logo / business name */}
          <div className="text-center mb-8">
            {business.logoUrl && (
              <img src={business.logoUrl} alt={business.name} className="w-20 h-20 rounded-full object-cover mx-auto mb-3 border-4 border-white shadow-lg" />
            )}
            <p className="text-sm text-muted-foreground mb-1">ברוכ/ה הבא/ה ל:</p>
            <h1 className="text-2xl font-extrabold" style={{ color: primaryColor }}>{business.name}</h1>
          </div>

          <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold">כניסה לפורטל לקוחות</h2>
              <p className="text-sm text-muted-foreground mt-0.5">נהל/י את התורים שלך בקלות</p>
            </div>

            {portalLoginStep === "phone" ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm mb-1.5 block">מספר טלפון</Label>
                  <Input
                    type="tel" dir="ltr" placeholder=""
                    value={portalPhone}
                    onChange={e => setPortalPhone(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handlePortalSendOtp()}
                    className="h-11"
                  />
                </div>
                <Button className="w-full h-11" style={{ backgroundColor: primaryColor }}
                  onClick={handlePortalSendOtp} disabled={portalLoading || !portalPhone.trim()}>
                  {portalLoading ? "שולח..." : "שלח קוד לווצאפ"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-sm mb-1.5 block">קוד אימות</Label>
                  <Input
                    dir="ltr" placeholder="123456" maxLength={6}
                    value={portalOtpCode}
                    onChange={e => setPortalOtpCode(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handlePortalVerifyOtp(rememberMe)}
                    className="h-11 text-center tracking-[0.4em] font-bold text-xl"
                  />
                  <p className="text-xs text-muted-foreground mt-1">שלחנו קוד לווצאפ שלך</p>
                </div>
                {/* Remember me */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm">זכור/י אותי (נשאר מחובר/ת)</span>
                </label>
                <Button className="w-full h-11" style={{ backgroundColor: primaryColor }}
                  onClick={() => handlePortalVerifyOtp(rememberMe)}
                  disabled={portalLoading || portalOtpCode.length < 6}>
                  {portalLoading ? "מאמת..." : "כניסה"}
                </Button>
                <button className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                  onClick={() => { setPortalLoginStep("phone"); setPortalOtpCode(""); }}>
                  ← שינוי מספר
                </button>
              </div>
            )}

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">או התחבר/י עם</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2">
              {/* Google */}
              {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <button
                  onClick={() => (window as any).google?.accounts?.id?.prompt()}
                  disabled={gateGoogleLoading}
                  className="w-full h-11 rounded-lg border flex items-center justify-center gap-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#dadce0", color: "#3c4043" }}
                >
                  {gateGoogleLoading ? "מתחבר..." : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                        <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                        <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
                        <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
                      </svg>
                      המשך עם <span dir="ltr">Google</span>
                    </>
                  )}
                </button>
              )}

              {/* Facebook login hidden — pending Meta App Review */}

              <button
                className="w-full h-11 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                onClick={() => setShowLoginGate(false)}
              >
                המשך ללא התחברות
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s === 2 ? 0 : s - 1);
  const servicesList = Array.isArray(services) ? services : [];
  const selectedService = servicesList.find(s => s.id === selectedServiceId);

  const handleSendOtp = async () => {
    if (!clientData.phone) return;
    setOtpLoading(true);
    setPhoneVerificationToken(null);
    try {
      const res = await fetch(`${API_BASE}/public/${businessSlug}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clientData.phone }),
      });
      if (!res.ok) throw new Error();
      setOtpSent(true);
      toast({ title: "קוד נשלח לנייד שלך בWhatsApp" });
    } catch {
      toast({ title: "שגיאה בשליחת הקוד", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/${businessSlug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clientData.phone, code: otpCode }),
      });
      const verifyData = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "קוד שגוי, נסה שוב", variant: "destructive" });
        return;
      }
      if (typeof verifyData.phoneVerificationToken === "string") {
        setPhoneVerificationToken(verifyData.phoneVerificationToken);
      }
      setPhoneVerified(true);
      toast({ title: "הטלפון אומת בהצלחה" });
    } catch {
      toast({ title: "שגיאה באימות", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || !dateStr || !selectedTime) return;
    // Guard: prevent duplicate submits (double-click before button disables)
    if (createMutation.isPending) return;

    // Client-side guard: reject past date+time
    const apptDateTime = new Date(`${dateStr}T${selectedTime}:00`);
    if (apptDateTime < new Date()) {
      toast({ title: "לא ניתן לקבוע תור בעבר", description: "אנא בחר תאריך ושעה עתידיים", variant: "destructive" });
      return;
    }

    createMutation.mutate(
      {
        businessSlug: businessSlug || "",
        data: {
          serviceId: selectedServiceId,
          clientName: clientData.name,
          phoneNumber: clientData.phone,
          appointmentDate: dateStr,
          appointmentTime: selectedTime,
          notes: clientData.notes || undefined,
          ...(phoneVerificationToken ? { phoneVerificationToken } : {}),
        },
      },
      {
        onSuccess: (data: any) => {
          // Save booking to localStorage (include id + phone for reschedule/cancel)
          const bookingData = {
            id: data?.id,
            date: dateStr,
            time: selectedTime,
            service: selectedService?.name,
            name: clientData.name,
            phone: clientData.phone,
          };
          localStorage.setItem(`kavati_booking_${businessSlug}`, JSON.stringify(bookingData));
          // If payment required, redirect to Tranzila
          // Auto-add business to portal if logged in
          if (clientToken && businessSlug) {
            fetch(`${API_BASE}/client/businesses/${businessSlug}`, {
              method: "POST", headers: { "x-client-token": clientToken },
            }).catch(() => {});
          }
          if (data?.requiresPayment && data?.id) {
            // Open the Tranzila iframe in a modal instead of navigating away.
            // PaymentSuccess.tsx detects it runs in an iframe and posts a
            // kavati_payment_success message back to this window, which we
            // listen for in the useEffect above (closes modal + advances step).
            fetch(`${API_BASE}/tranzila/payment-url/${data.id}`)
              .then(r => r.json())
              .then(({ url }) => { if (url) setPaymentIframeUrl(url); else setStep(5); })
              .catch(() => setStep(5));
          } else {
            setStep(5);
          }
        },
        onError: (err: any) => {
          const msg = err?.data?.message ?? err?.data?.error ?? "לא ניתן לקבוע את התור, נסה שוב";
          toast({ title: "שגיאה בקביעת תור", description: msg, variant: "destructive" });
        },
      }
    );
  };

  // Format quick slot date for display: "ד׳ 18/04 14:30"
  const formatQuickSlot = (slot: { date: string; time: string }) => {
    const [y, m, d] = slot.date.split("-").map(Number);
    const day = new Date(y, m - 1, d).getDay();
    const dayLetters = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
    return `${dayLetters[day]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} | ${slot.time}`;
  };

  const handleQuickSlot = (slot: { date: string; time: string }) => {
    const [y, m, d] = slot.date.split("-").map(Number);
    setSelectedDate(new Date(y, m - 1, d));
    setSelectedTime(slot.time);
    setStep(4);
  };

  const handleCancelAppointment = async () => {
    if (!existingBooking?.id || !existingBooking?.phone) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/${businessSlug}/appointments/${existingBooking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: existingBooking.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "שגיאה", description: data.message ?? "לא ניתן לבטל", variant: "destructive" });
      } else {
        localStorage.removeItem(`kavati_booking_${businessSlug}`);
        setExistingBooking(null);
        setShowExistingBooking(false);
        toast({ title: "התור בוטל בהצלחה" });
      }
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!existingBooking?.id || !existingBooking?.phone || !rescheduleDate || !rescheduleTime) return;
    const newDate = rescheduleDate.toISOString().split("T")[0];
    setRescheduleLoading(true);
    try {
      const res = await fetch(`${API_BASE}/public/${businessSlug}/appointments/${existingBooking.id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: existingBooking.phone, newDate, newTime: rescheduleTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "שגיאה", description: data.message ?? "לא ניתן לדחות", variant: "destructive" });
      } else {
        const [, month, day] = newDate.split("-");
        const updated = { ...existingBooking, date: `${day}/${month}`, time: rescheduleTime };
        localStorage.setItem(`kavati_booking_${businessSlug}`, JSON.stringify(updated));
        setExistingBooking(updated);
        setRescheduleStep("idle");
        setRescheduleDate(undefined);
        setRescheduleTime(null);
        toast({ title: "✅ התור נדחה בהצלחה!", description: `${day}/${month} בשעה ${rescheduleTime}` });
      }
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    waitlistMutation.mutate(
      { businessSlug: businessSlug || "", data: { serviceId: selectedServiceId ?? undefined, clientName: waitlistData.name, phoneNumber: waitlistData.phone, preferredDate: dateStr || undefined, notes: waitlistData.notes || undefined } },
      {
        onSuccess: () => { toast({ title: "✅ נרשמת לרשימת ההמתנה", description: "נודיע לך כשיתפנה מקום" }); setShowWaitlist(false); },
        onError: () => toast({ title: "שגיאה", variant: "destructive" }),
      }
    );
  };

  const slots: string[] = availability?.slots ?? [];
  const isFullyBooked = availability?.isFullyBooked ?? false;

  // ─── STEP 0: Profile landing page ──────────────────────────────────────────
  if (step === 0) {
    const tabs = [
      { id: "services" as const, label: "שירותים" },
      { id: "hours" as const, label: "שעות עבודה" },
      { id: "gallery" as const, label: "גלריה" },
      { id: "reviews" as const, label: "ביקורות" },
    ];

    return (
      <div
        dir="rtl"
        style={{
          fontFamily: `'${fontFamily}', 'Rubik', 'Heebo', sans-serif`,
        }}
        className="kavati-biz-scope min-h-screen overflow-x-hidden bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
      >
        {/* Owner quick-return chip — fixed top-start (RTL = right).
            Only visible when a biz_token cookie is present, i.e. the
            viewer has an active owner session. Lets them preview their
            own /book/:slug page and jump back to the dashboard without
            hunting for the tab. */}
        {isOwnerPreview && (
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="fixed top-3 right-3 z-40 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold text-white shadow-lg hover:brightness-110 active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}
            aria-label="חזור לפאנל ניהול"
            title="חזור לפאנל ניהול"
          >
            <ChevronRight className="w-4 h-4" />
            <span>חזור לפאנל ניהול</span>
          </button>
        )}

        {/* Notification popup — dismissable permanently via localStorage */}
        {business.notificationEnabled && business.notificationMessage && (
          <Dialog open={showNotification} onOpenChange={setShowNotification}>
            <DialogContent className="sm:max-w-md text-center" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
              </DialogHeader>
              <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
                {business.notificationMessage}
              </DialogDescription>
              <Button
                onClick={() => {
                  localStorage.setItem(`notif_seen_${businessSlug}`, business.notificationMessage!);
                  setShowNotification(false);
                }}
                style={{ backgroundColor: primaryColor }}
              >
                הבנתי, לא להציג שוב ✓
              </Button>
            </DialogContent>
          </Dialog>
        )}

        {/* Announcement popup — dismiss-forever checkbox means the client
             won't see this particular message again (tied to the message's
             createdAt timestamp; a NEW announcement resets the flag). */}
        <AnnouncementDialog
          open={showAnnouncement}
          onOpenChange={setShowAnnouncement}
          text={(business as any).announcementText}
          createdAt={(business as any).announcementCreatedAt}
          slug={businessSlug}
          primaryColor={primaryColor}
        />

        {/* Existing booking dialog */}
        <Dialog open={showExistingBooking} onOpenChange={setShowExistingBooking}>
          <DialogContent className="sm:max-w-sm text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle>התור שלך</DialogTitle>
            </DialogHeader>
            {existingBooking && (
              <div className="space-y-4 py-2" dir="rtl">
                {/* Appointment details */}
                <div className="p-4 rounded-xl bg-muted/30 space-y-2">
                  {existingBooking.service && <div className="font-bold text-base">{existingBooking.service}</div>}
                  {existingBooking.date && <div className="text-sm text-muted-foreground flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> {existingBooking.date}</div>}
                  {existingBooking.time && <div className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /><span dir="ltr">{existingBooking.time}</span></div>}
                  {existingBooking.name && <div className="text-sm text-muted-foreground flex items-center gap-2"><User className="w-4 h-4" />{existingBooking.name}</div>}
                </div>

                {rescheduleStep === "idle" ? (
                  <div className="flex gap-2">
                    {/* Reschedule */}
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setRescheduleStep("picking")}
                      disabled={!existingBooking.id}
                    >
                      <CalendarIcon className="w-4 h-4 ml-1" /> דחה תור
                    </Button>
                    {/* Cancel */}
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleCancelAppointment}
                      disabled={cancelLoading || !existingBooking.id}
                    >
                      {cancelLoading ? "מבטל..." : "בטל תור"}
                    </Button>
                  </div>
                ) : (
                  /* Reschedule picker — next-slots first, calendar on demand */
                  <div className="space-y-3">
                    {!rescheduleUseCalendar ? (
                      <>
                        <div className="text-sm font-medium">בחר מועד חדש מהמוצעים:</div>
                        {rescheduleNextSlotsLoading ? (
                          <div className="text-center text-sm text-muted-foreground py-4">טוען זמנים פנויים...</div>
                        ) : rescheduleNextSlots.length === 0 ? (
                          <div className="text-center text-sm text-muted-foreground py-3">אין זמנים פנויים בקרוב — עבור ללוח השנה לבחור תאריך ספציפי.</div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {rescheduleNextSlots.map((s, i) => {
                              const iso = s.date;
                              const picked = rescheduleDate?.toISOString().split("T")[0] === iso && rescheduleTime === s.time;
                              const [, mm, dd] = iso.split("-");
                              return (
                                <button
                                  key={i}
                                  onClick={() => {
                                    const [y, mo, da] = iso.split("-").map(Number);
                                    setRescheduleDate(new Date(y, mo - 1, da));
                                    setRescheduleTime(s.time);
                                  }}
                                  className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all flex flex-col items-center gap-0.5 ${picked ? "text-white border-transparent" : "border-border hover:border-primary/50"}`}
                                  style={picked ? { backgroundColor: primaryColor } : {}}
                                >
                                  <span className="font-semibold">{dd}/{mm}</span>
                                  <span dir="ltr">{s.time}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setRescheduleUseCalendar(true)}
                          className="w-full text-center text-xs text-primary font-semibold underline pt-1"
                        >
                          העדפת תאריך ספציפי? עבור ללוח שנה
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">בחר תאריך ושעה חדשים:</div>
                          <button
                            type="button"
                            onClick={() => { setRescheduleUseCalendar(false); setRescheduleDate(undefined); setRescheduleTime(null); }}
                            className="text-xs text-primary font-semibold underline"
                          >
                            חזרה למוצעים
                          </button>
                        </div>
                        <DayPicker
                          mode="single"
                          selected={rescheduleDate}
                          onSelect={d => { setRescheduleDate(d); setRescheduleTime(null); }}
                          locale={he}
                          disabled={[{ before: new Date() }]}
                          className="rounded-xl border p-2 mx-auto"
                        />
                        {rescheduleDate && (() => {
                          const available: string[] = rescheduleAvailability?.slots ?? [];
                          return available.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                              {available.map((t: string) => (
                                <button
                                  key={t}
                                  onClick={() => setRescheduleTime(t)}
                                  className={`py-2 rounded-xl border text-sm font-medium transition-all ${rescheduleTime === t ? "text-white border-transparent" : "border-border hover:border-primary/50"}`}
                                  style={rescheduleTime === t ? { backgroundColor: primaryColor } : {}}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          ) : <div className="text-center text-sm text-muted-foreground py-2">אין זמנים פנויים ביום זה</div>;
                        })()}
                      </>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setRescheduleStep("idle"); setRescheduleDate(undefined); setRescheduleTime(null); setRescheduleUseCalendar(false); }}
                      >
                        חזור
                      </Button>
                      <Button
                        className="flex-1"
                        style={{ backgroundColor: primaryColor }}
                        disabled={!rescheduleDate || !rescheduleTime || rescheduleLoading}
                        onClick={handleReschedule}
                      >
                        {rescheduleLoading ? "שומר..." : "אשר דחייה"}
                      </Button>
                    </div>
                  </div>
                )}

                {!existingBooking.id && (
                  <p className="text-xs text-muted-foreground text-center">ביטול ודחייה זמינים רק לתורים שנקבעו מהמכשיר הזה</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Hero banner — image shows at its own aspect ratio (w-full + h-auto)
            so no content gets cropped on mobile. Placeholder falls back to
            the old 224px strip since there's no intrinsic height to pull
            from when no banner has been uploaded. */}
        <div className="relative">
          {showBanner && bannerUrl ? (
            <img
              src={bannerUrl}
              alt={business.name}
              className="w-full h-auto"
              style={{ objectPosition: bannerPosition }}
            />
          ) : (
            <div
              className="w-full"
              style={{ height: "224px", background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)` }}
            />
          )}
          {/* The banner-level dark/light toggle was removed per owner
              feedback — there's already a floating toggle FAB in the
              bottom-right corner of the profile page, and two toggles
              in the same viewport was visual noise. */}
          {/* Logo overlapping bottom edge of banner */}
          {showLogo && logoUrl && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
              <img
                src={logoUrl}
                alt={business.name}
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className={`pb-28 px-4 max-w-2xl mx-auto ${showLogo && logoUrl ? "pt-14" : "pt-6"}`}>
          {/* Business name */}
          {showBusinessName && (
            <>
              <p className="text-center text-sm font-semibold mb-0.5" style={{ color: primaryColor }}>
                {(() => { const h = new Date().getHours(); return h < 12 ? "בוקר טוב! ☀️" : h < 17 ? "צהריים טובים! 🌤️" : h < 21 ? "ערב טוב! 🌆" : "לילה טוב! 🌙"; })()}
              </p>
              <p className="text-center text-xs text-muted-foreground mb-0.5">ברוכ/ה הבא/ה ל:</p>
              <h1 className="text-2xl font-bold text-center mb-1" dir="rtl" style={{ unicodeBidi: "isolate" }}>{business.name}</h1>
            </>
          )}
          {/* Description */}
          {businessDescription && (
            <p className="text-center text-muted-foreground text-sm mb-4 max-w-sm mx-auto">{businessDescription}</p>
          )}

          {/* Address + city — rendered on two lines under the name
              so both are clearly visible. Each line is conditional, so
              a business that only has a street or only has a city
              sees exactly the fields they filled in. */}
          {(address || city) && (
            <div className="flex justify-center items-start gap-1.5 mb-3 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex flex-col items-center leading-tight">
                {address && <span>{address}</span>}
                {city && <span>{city}</span>}
              </div>
            </div>
          )}

          {/* Social links row — icons use the business primaryColor so they
              remain visible regardless of the preset's background. */}
          {(contactPhone || websiteUrl || instagramUrl || wazeUrl) && (
            <div className="flex justify-center gap-3 mb-6 flex-wrap">
              {contactPhone && (
                <a href={`tel:${contactPhone}`} aria-label="התקשר">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center bg-transparent transition-all hover:opacity-80"
                    style={{ borderColor: primaryColor, color: primaryColor }}
                    title="התקשר"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                </a>
              )}
              {contactPhone && (
                <a
                  href={`https://wa.me/972${contactPhone.replace(/^0/, "").replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                >
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center border-green-500 hover:border-green-600 transition-all overflow-hidden bg-white"
                    title="WhatsApp"
                  >
                    {/* Real WhatsApp SVG logo */}
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.38A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#25D366"/>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="white"/>
                    </svg>
                  </button>
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="אינסטגרם">
                  <button
                    className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center bg-white border-2 border-transparent transition-all hover:opacity-90 active:scale-95"
                    title="אינסטגרם"
                  >
                    {/* Instagram official gradient logo. Path from Simple
                        Icons; gradient fill matches the real app icon. */}
                    <svg viewBox="0 0 24 24" className="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
                          <stop offset="0%" stopColor="#fdf497"/>
                          <stop offset="5%" stopColor="#fdf497"/>
                          <stop offset="45%" stopColor="#fd5949"/>
                          <stop offset="60%" stopColor="#d6249f"/>
                          <stop offset="90%" stopColor="#285AEB"/>
                        </radialGradient>
                      </defs>
                      <path fill="url(#ig-grad)" d="M12 0C8.74 0 8.33.02 7.05.08 5.78.13 4.9.34 4.14.64c-.79.31-1.46.72-2.13 1.38C1.35 2.69.94 3.36.64 4.14.33 4.91.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.02 3.67.08 4.95c.06 1.28.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.77.3 1.64.5 2.91.56C8.33 23.98 8.74 24 12 24s3.67-.02 4.95-.08c1.28-.06 2.15-.26 2.91-.56.79-.31 1.46-.72 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.77.5-1.64.56-2.91.06-1.28.08-1.69.08-4.95s-.02-3.67-.08-4.95c-.06-1.28-.26-2.15-.56-2.91-.31-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.94 19.87.64 19.1.34 18.22.13 16.95.08 15.67.02 15.26 0 12 0zm0 2.16c3.2 0 3.58.02 4.85.07 1.17.06 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.06 1.17-.26 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.07.36-2.24.41-1.27.06-1.65.07-4.86.07-3.21 0-3.59-.01-4.86-.07-1.17-.06-1.82-.26-2.24-.42-.57-.22-.96-.48-1.38-.9-.42-.42-.69-.82-.9-1.38-.17-.42-.36-1.07-.42-2.24C2.17 15.58 2.16 15.21 2.16 12c0-3.2.01-3.59.06-4.86.06-1.17.26-1.81.42-2.23.21-.57.48-.96.9-1.38.42-.42.81-.69 1.38-.9.42-.17 1.05-.36 2.22-.42C8.42 2.17 8.79 2.16 12 2.16zm0 3.68c-3.4 0-6.16 2.76-6.16 6.16s2.76 6.16 6.16 6.16 6.16-2.76 6.16-6.16S15.4 5.84 12 5.84zm0 10.16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.85-10.4c0 .8-.65 1.44-1.44 1.44-.8 0-1.44-.65-1.44-1.44 0-.79.65-1.44 1.44-1.44.79 0 1.44.65 1.44 1.44z"/>
                    </svg>
                  </button>
                </a>
              )}
              {websiteUrl && (
                <a href={normalizeExternalUrl(websiteUrl)} target="_blank" rel="noopener noreferrer" aria-label="אתר">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center bg-transparent transition-all hover:opacity-80"
                    style={{ borderColor: primaryColor, color: primaryColor }}
                    title="אתר"
                  >
                    <Globe className="w-5 h-5" />
                  </button>
                </a>
              )}
              {wazeUrl && (
                <a href={wazeUrl} target="_blank" rel="noopener noreferrer" aria-label="ניווט בוויז">
                  <button
                    className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center transition-all hover:opacity-90 active:scale-95 shadow-sm"
                    title="Waze"
                  >
                    {/* Owner-supplied Waze app icon (public/waze-icon.jpg).
                        Replaces the inline SVG approximation — same visual
                        result as the real app. */}
                    <img src="/waze-icon.jpg" alt="Waze" className="w-full h-full object-cover" />
                  </button>
                </a>
              )}
            </div>
          )}

          {/* Back to portal button (only when logged in) */}
          {clientToken && (
            <div className="mb-3 flex justify-center">
              <button
                onClick={() => navigate("/client")}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                חזרה לפורטל הלקוח
              </button>
            </div>
          )}

          {/* Login prompt for guests */}
          {!clientToken && (
            <div className="mb-3 flex justify-center">
              <button
                onClick={() => setShowLoginGate(true)}
                className="text-xs font-medium underline underline-offset-2"
                style={{ color: primaryColor }}
              >
                התחבר/י לפורטל הלקוחות
              </button>
            </div>
          )}

          {/* Existing appointment banner – only for logged-in clients with a confirmed upcoming appointment */}
          {clientToken && portalBookingExists && (
            <div
              className="mb-4 p-3 rounded-xl border text-sm text-center"
              style={{ backgroundColor: primaryColor + "0d", borderColor: primaryColor + "33" }}
            >
              יש לכם תור!{" "}
              <button
                onClick={() => navigate("/client?tab=appointments")}
                className="font-bold underline"
                style={{ color: primaryColor }}
              >
                לחצו לצפייה
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-current font-semibold"
                    : "border-transparent text-muted-foreground"
                }`}
                style={activeTab === tab.id ? { color: primaryColor, borderColor: primaryColor } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Services tab */}
          {activeTab === "services" && (
            <div className={`${serviceCardStyle === "grid" ? "grid grid-cols-2 gap-3" : "space-y-3"} ${animationStyle === "subtle" ? "animate-in fade-in duration-500" : animationStyle === "bouncy" ? "animate-in zoom-in-95 duration-500" : ""}`}>
              {servicesLoading && <div className="text-center py-8 text-muted-foreground col-span-2">טוען שירותים...</div>}
              {servicesList.filter(s => s.isActive).map(service => {
                const hoverClass = hoverEffect === "lift"
                  ? "transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg"
                  : hoverEffect === "glow"
                  ? "transition-shadow duration-300 hover:shadow-2xl"
                  : "";
                const hoverStyle = undefined;
                const priceNum = `₪${(service.price / 100).toFixed(0)}`;
                const priceStr = (service as any).priceStartsFrom ? `החל מ-${priceNum}` : priceNum;
                // Description is no longer rendered inline per service;
                // shown in step 2 (date-picker) after the customer
                // selects the service. Variable left out on purpose.

                if (serviceCardStyle === "minimal") {
                  return (
                    <div key={service.id} className={`flex items-center justify-between py-3 border-b last:border-0 ${hoverClass}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{service.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /><bdi>{formatDuration(service.durationMinutes)}</bdi></span>
                          <span style={{ color: primaryColor }}>{priceStr}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                        className="px-4 py-1.5 rounded-full text-sm font-medium text-white shadow-sm shrink-0"
                        style={{ backgroundColor: primaryColor }}
                      >
                        קבע
                      </button>
                    </div>
                  );
                }

                if (serviceCardStyle === "bubble") {
                  return (
                    <button
                      key={service.id}
                      onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                      className={`w-full text-right rounded-full p-4 flex items-center gap-4 shadow-md ${hoverClass}`}
                      style={{ background: `linear-gradient(135deg, ${primaryColor}15, ${accentColor}15)`, border: `2px solid ${primaryColor}40` }}
                    >
                      {service.imageUrl && (
                        <img src={service.imageUrl} alt="" className="w-14 h-14 object-cover rounded-full shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{service.name}</div>
                        {/* Description intentionally NOT shown in the
                            card list — owner preference to keep it
                            clean; customer sees it in step 2 after
                            tapping the service. */}
                      </div>
                      <div className="text-left shrink-0">
                        <div className="font-bold text-lg" style={{ color: primaryColor }}>{priceStr}</div>
                        <div className="text-xs text-muted-foreground"><bdi>{formatDuration(service.durationMinutes)}</bdi></div>
                      </div>
                    </button>
                  );
                }

                if (serviceCardStyle === "grid") {
                  return (
                    <button
                      key={service.id}
                      onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                      className={`text-right border rounded-2xl overflow-hidden shadow-sm ${hoverClass}`}
                    >
                      {service.imageUrl ? (
                        <img src={service.imageUrl} alt={service.name} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24" style={{ background: `linear-gradient(135deg, ${primaryColor}30, ${accentColor}30)` }} />
                      )}
                      <div className="p-3">
                        {/* Owner preference: show the full service name,
                            wrap instead of truncating so long names like
                            "מילוי הלחמת ריסים" aren't cut off. */}
                        <div className="font-bold text-sm leading-tight break-words">{service.name}</div>
                        <div className="flex justify-between items-center mt-2 text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /><bdi>{formatDuration(service.durationMinutes)}</bdi></span>
                          <span className="font-bold" style={{ color: primaryColor }}>{priceStr}</span>
                        </div>
                      </div>
                    </button>
                  );
                }

                if (serviceCardStyle === "split") {
                  return (
                    <button
                      key={service.id}
                      onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                      className={`w-full text-right border rounded-2xl overflow-hidden shadow-sm flex ${hoverClass}`}
                    >
                      {service.imageUrl ? (
                        <img src={service.imageUrl} alt={service.name} className="w-28 shrink-0 object-cover" />
                      ) : (
                        <div className="w-28 shrink-0" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }} />
                      )}
                      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm leading-tight break-words">{service.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" /><bdi>{formatDuration(service.durationMinutes)}</bdi>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold" style={{ color: primaryColor }}>{priceStr}</span>
                          <span
                            className="px-3 py-1 text-[11px] font-medium text-white shadow-sm rounded-full"
                            style={{ backgroundColor: primaryColor }}
                          >
                            קבע
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                }

                if (serviceCardStyle === "banner") {
                  return (
                    <button
                      key={service.id}
                      onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                      className={`w-full relative overflow-hidden shadow-md rounded-2xl h-28 flex items-end p-4 text-start text-white ${hoverClass}`}
                      style={
                        service.imageUrl
                          ? { backgroundImage: `url(${service.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
                          : { background: `linear-gradient(120deg, ${primaryColor} 0%, ${accentColor} 100%)` }
                      }
                    >
                      {/* Dark overlay for contrast over user-uploaded images */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />
                      <div className="relative z-10">
                        <div className="font-extrabold text-base leading-tight break-words drop-shadow">{service.name}</div>
                        <div className="flex items-center gap-2 mt-1 text-xs opacity-95">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /><bdi>{formatDuration(service.durationMinutes)}</bdi></span>
                          <span>·</span>
                          <span className="font-bold">{priceStr}</span>
                        </div>
                      </div>
                    </button>
                  );
                }

                // default: "card"
                return (
                  <div key={service.id} className={`border rounded-2xl overflow-hidden shadow-sm ${hoverClass}`} style={hoverStyle}>
                    {service.imageUrl && (
                      <img src={service.imageUrl} alt={service.name} className="w-full h-32 object-cover" />
                    )}
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="font-bold text-base">{service.name}</div>
                        <div className="font-bold" style={{ color: primaryColor }}>{priceStr}</div>
                      </div>
                      {/* Description moved to step 2 (booking wizard)
                          per owner — keeps the service grid clean. */}
                      <div className="flex justify-between items-center mt-3">
                        <span className="text-xs text-muted-foreground flex items-center gap-1" dir="rtl">
                          <Clock className="w-3.5 h-3.5" /> <bdi>{formatDuration(service.durationMinutes)}</bdi>
                        </span>
                        <button
                          onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                          className="px-4 py-1.5 rounded-full text-sm font-medium text-white shadow-sm"
                          style={{ backgroundColor: primaryColor }}
                        >
                          קבע תור
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!servicesLoading && !servicesList.filter(s => s.isActive).length && (
                <div className="text-center py-8 text-muted-foreground col-span-2">אין שירותים זמינים כרגע</div>
              )}
            </div>
          )}

          {/* Hours tab */}
          {activeTab === "hours" && (
            <div className="space-y-0">
              {DAYS_HE.map((day, i) => {
                const h = workingHours.find(h => h.dayOfWeek === i);
                return (
                  <div key={i} className="flex justify-between items-center py-3 border-b last:border-0">
                    <span className="font-medium">{day}</span>
                    {h?.isEnabled ? (
                      <span className="text-sm text-muted-foreground" dir="ltr">{h.startTime} — {h.endTime}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">סגור</span>
                    )}
                  </div>
                );
              })}
              {workingHours.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">שעות העבודה לא הוגדרו עדיין</div>
              )}
            </div>
          )}

          {/* Reviews tab — public wall. Compose button gates through
              login → phone-attach → composer via onLeaveReview below. */}
          {activeTab === "reviews" && (
            <div className="space-y-4">
              {(() => {
                const avg = reviews.length === 0 ? 0 : reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length;
                const full = Math.round(avg);
                return (
                  <div className="flex items-center justify-between gap-3 p-4 rounded-2xl border" style={{ borderColor: primaryColor + "30", backgroundColor: primaryColor + "08" }}>
                    <div>
                      <div className="text-xs text-muted-foreground">ממוצע ביקורות</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold" style={{ color: primaryColor }}>{avg.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">({reviews.length} ביקורות)</span>
                      </div>
                      <div className="mt-1 text-lg" aria-label={`${full} כוכבים מתוך 5`}>
                        {"★".repeat(full)}<span className="text-muted-foreground/40">{"★".repeat(5 - full)}</span>
                      </div>
                    </div>
                    <button
                      onClick={onLeaveReview}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm whitespace-nowrap"
                      style={{ background: primaryColor }}
                    >
                      {myReview ? "שינוי הביקורת" : "השאר ביקורת"}
                    </button>
                  </div>
                );
              })()}

              {reviewsLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">טוען...</div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">עדיין אין ביקורות — תהיה הראשון!</div>
              ) : (
                <ul className="space-y-3">
                  {reviews.map(r => (
                    <li key={r.id} className="p-4 rounded-2xl border bg-card">
                      <div className="flex items-center gap-3">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt={r.clientName} className="w-10 h-10 rounded-full object-cover border" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ backgroundColor: primaryColor }}>
                            {(r.clientName || "?").slice(0, 1)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">{r.clientName}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {new Date(r.createdAt).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" })}
                          </div>
                        </div>
                        <div className="text-sm shrink-0" style={{ color: primaryColor }} aria-label={`${r.rating} כוכבים`}>
                          {"★".repeat(r.rating)}<span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
                        </div>
                        {/* Owner-only delete — mirrors the floating
                            back-to-dashboard chip's gate (biz_token in
                            storage). Server re-checks ownership so a
                            stale/foreign token can't actually delete. */}
                        {isOwnerPreview && (
                          <button
                            type="button"
                            onClick={() => setReviewToDelete(r)}
                            disabled={deletingReviewId === r.id}
                            aria-label="מחק ביקורת"
                            title="מחק ביקורת"
                            className="shrink-0 w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {r.text && <p className="mt-2 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{r.text}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Gallery tab */}
          {activeTab === "gallery" && (
            galleryImages.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-1">
                  {galleryImages.map((url, i) => (
                    <img key={i} src={url} alt={`gallery-${i}`}
                      className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity active:scale-95"
                      onClick={() => setLightboxIndex(i)}
                    />
                  ))}
                </div>
                {/* Lightbox — Escape/←/→ keys, prev/next buttons, and
                    horizontal swipe on touch devices. Index-based so we
                    can page through the gallery without closing. */}
                {lightboxIndex !== null && galleryImages[lightboxIndex] && (() => {
                  const total = galleryImages.length;
                  const go = (delta: number) => setLightboxIndex(i => {
                    if (i === null) return i;
                    return (i + delta + total) % total;
                  });
                  return (
                    <GalleryLightbox
                      url={galleryImages[lightboxIndex]}
                      index={lightboxIndex}
                      total={total}
                      onClose={() => setLightboxIndex(null)}
                      onPrev={() => go(-1)}
                      onNext={() => go(1)}
                    />
                  );
                })()}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">אין תמונות בגלריה עדיין</div>
            )
          )}

          {/* Footer — inside pb-28 content area so floating button never covers it */}
          <footer className="pt-8 pb-4 text-xs text-muted-foreground border-t mt-8 text-center space-y-2">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <a href="/privacy" className="hover:text-foreground transition-colors">מדיניות פרטיות</a>
              <a href="/terms" className="hover:text-foreground transition-colors">תנאי שימוש</a>
              <a href="/contact" className="hover:text-foreground transition-colors">יצירת קשר</a>
            </div>
            <a href="/" className="inline-flex items-center justify-center gap-2 font-bold text-foreground hover:text-primary transition-colors">
              <span>מופעל על ידי קבעתי</span>
              <img src="/icon.svg" alt="קבעתי" className="w-16 h-16 object-contain shrink-0" />
            </a>
          </footer>
        </div>

      {/* Floating book button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-black/90 backdrop-blur border-t z-40">
        <button
          onClick={() => setStep(2)}
          className="w-full h-12 rounded-2xl text-white font-bold text-base shadow-lg"
          style={{ backgroundColor: primaryColor }}
        >
          לקביעת תור ←
        </button>
      </div>

      {/* Accessibility floating button (IS 5568 / WCAG 2.1) */}
      {/* AccessibilityFab + ThemeToggleFab are mounted globally in App.tsx */}

      {/* Phone-attach popup — first-time Google logins don't have a
          phone on file. Reviews require one; no OTP (per owner) — we
          trust the input and save it to the client session. */}
      <Dialog open={phonePopupOpen} onOpenChange={setPhonePopupOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>לצירוף מספר טלפון</DialogTitle>
            <DialogDescription>
              כדי להשאיר ביקורת צריך מספר טלפון לזיהוי. לא נשתמש בו לצורך הודעות.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <input
              type="tel"
              dir="ltr"
              value={phonePopupInput}
              onChange={e => setPhonePopupInput(e.target.value)}
              placeholder=""
              className="w-full rounded-xl border border-input px-4 py-3 text-sm focus:outline-none focus:ring-2 text-center"
              style={{ boxShadow: `0 0 0 0 ${primaryColor}` }}
            />
            <div className="flex gap-2">
              <button onClick={() => setPhonePopupOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted/60">ביטול</button>
              <button onClick={submitPhonePopup}
                className="flex-1 py-2.5 rounded-xl font-bold text-white"
                style={{ backgroundColor: primaryColor }}>שמור והמשך</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Owner-only delete-review confirm. Only rendered in the
          owner-preview path (isOwnerPreview gate above guards the
          trash icon that opens this). */}
      <Dialog open={!!reviewToDelete} onOpenChange={v => { if (!v) setReviewToDelete(null); }}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>למחוק את הביקורת?</DialogTitle>
            <DialogDescription>
              הביקורת של <b>{reviewToDelete?.clientName}</b> תוסר לצמיתות מעמוד העסק. אי אפשר לשחזר.
            </DialogDescription>
          </DialogHeader>
          {reviewToDelete && (
            <div className="mt-1 p-3 rounded-xl bg-muted/50 border text-sm">
              <div className="text-amber-500 mb-1" aria-label={`${reviewToDelete.rating} כוכבים`}>
                {"★".repeat(reviewToDelete.rating)}<span className="text-muted-foreground/40">{"★".repeat(5 - reviewToDelete.rating)}</span>
              </div>
              {reviewToDelete.text && (
                <div className="whitespace-pre-wrap break-words text-foreground/80">{reviewToDelete.text}</div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setReviewToDelete(null)}
              className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted/60"
              disabled={deletingReviewId !== null}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => reviewToDelete && deleteReview(reviewToDelete.id)}
              disabled={deletingReviewId !== null}
              className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
            >
              {deletingReviewId !== null ? "מוחק..." : "מחק"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review composer — 5 tap-to-rate stars + optional text. */}
      <Dialog open={reviewComposerOpen} onOpenChange={setReviewComposerOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>איך הייתה החוויה?</DialogTitle>
            <DialogDescription>הדירוג יוצג בעמוד הציבורי של העסק</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-center gap-1 text-3xl" dir="ltr">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReviewRating(n)}
                  className="transition-transform active:scale-95"
                  aria-label={`${n} כוכבים`}
                  style={{ color: n <= reviewRating ? primaryColor : "#d4d4d8" }}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewText}
              onChange={e => setReviewText(e.target.value.slice(0, 2000))}
              placeholder="כמה מילים על החוויה... (לא חובה)"
              rows={4}
              className="w-full rounded-xl border border-input px-3 py-2 text-sm focus:outline-none resize-none"
            />
            <div className="text-xs text-muted-foreground text-left">{reviewText.length} / 2000</div>
            <div className="flex gap-2">
              <button onClick={() => setReviewComposerOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border font-medium hover:bg-muted/60" disabled={reviewSubmitting}>ביטול</button>
              <button onClick={submitReview} disabled={reviewSubmitting}
                className="flex-1 py-2.5 rounded-xl font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}>
                {reviewSubmitting ? "שולח..." : "שלח ביקורת"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    );
  }

  // ─── STEPS 1-5: Booking wizard ──────────────────────────────────────────────
  return (
    <div className="kavati-biz-scope min-h-[100dvh] flex flex-col relative bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100" dir="rtl" style={{ fontFamily: `'${fontFamily}', 'Rubik', 'Heebo', sans-serif` }}>
      <div className="absolute top-0 w-full h-52 -z-10 rounded-b-[40px]" style={{ backgroundColor: primaryColor + "18" }} />

      {business.notificationEnabled && business.notificationMessage && (
        <Dialog open={showNotification} onOpenChange={setShowNotification}>
          <DialogContent className="sm:max-w-md text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
              {business.notificationMessage}
            </DialogDescription>
            <Button
              onClick={() => {
                localStorage.setItem(`notif_seen_${businessSlug}`, business.notificationMessage!);
                setShowNotification(false);
              }}
              style={{ backgroundColor: primaryColor }}
            >
              הבנתי, לא להציג שוב ✓
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment iframe modal */}
      <Dialog open={!!paymentIframeUrl} onOpenChange={(open) => { if (!open) setPaymentIframeUrl(null); }}>
        <DialogContent className="max-w-2xl w-[95vw] p-0 overflow-hidden" dir="rtl" aria-describedby={undefined}>
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>תשלום מקדמה</DialogTitle>
          </DialogHeader>
          {paymentIframeUrl && (
            <iframe
              src={paymentIframeUrl}
              className="w-full border-0"
              style={{ height: "75vh", minHeight: "600px" }}
              title="תשלום מקדמה"
              allow="payment"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showWaitlist} onOpenChange={setShowWaitlist}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5" style={{ color: primaryColor }} />
              הצטרף לרשימת ההמתנה
            </DialogTitle>
            <DialogDescription>
              נודיע לך כשיתפנה מקום{dateStr ? ` ב-${dateStr}` : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWaitlist} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>שם מלא *</Label>
              <Input required value={waitlistData.name} onChange={e => setWaitlistData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>מספר טלפון *</Label>
              <Input required type="tel" value={waitlistData.phone} onChange={e => setWaitlistData(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>הערה (אופציונלי)</Label>
              <Input value={waitlistData.notes} onChange={e => setWaitlistData(p => ({ ...p, notes: e.target.value }))} placeholder="שעות מועדפות, הערות..." />
            </div>
            <Button type="submit" className="w-full" disabled={waitlistMutation.isPending} style={{ backgroundColor: primaryColor }}>
              {waitlistMutation.isPending ? "נרשם..." : "הצטרף לרשימת ההמתנה"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Portal login dialog */}
      <Dialog open={showPortalLogin} onOpenChange={open => { if (!open) setShowPortalLogin(false); }}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>כניסה לפורטל הלקוחות</DialogTitle>
            <DialogDescription>נהל/י את כל התורים שלך במקום אחד</DialogDescription>
          </DialogHeader>
          {portalLoginStep === "phone" ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>מספר טלפון</Label>
                <Input
                  type="tel"
                  dir="ltr"
                  placeholder=""
                  value={portalPhone}
                  onChange={e => setPortalPhone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handlePortalSendOtp()}
                />
              </div>
              <Button className="w-full" style={{ backgroundColor: primaryColor }} onClick={handlePortalSendOtp} disabled={portalLoading || !portalPhone.trim()}>
                {portalLoading ? "שולח..." : "שלח קוד לווצאפ"}
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowPortalLogin(false)}>
                המשך ללא כניסה
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>קוד אימות</Label>
                <Input
                  dir="ltr"
                  placeholder="123456"
                  maxLength={6}
                  value={portalOtpCode}
                  onChange={e => setPortalOtpCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handlePortalVerifyOtp()}
                  className="text-center tracking-widest font-bold text-lg"
                />
              </div>
              <Button className="w-full" style={{ backgroundColor: primaryColor }} onClick={handlePortalVerifyOtp} disabled={portalLoading || portalOtpCode.length < 6}>
                {portalLoading ? "מאמת..." : "אמת קוד"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => { setPortalLoginStep("phone"); setPortalOtpCode(""); }}>
                חזור לשינוי מספר
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <header className="mb-8 text-center">
          {showLogo && logoUrl && (
            <img src={logoUrl} alt={business.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md border" />
          )}
          {showBanner && bannerUrl && (!showLogo || !logoUrl) && (
            <img src={bannerUrl} alt={business.name} className="w-full h-auto rounded-2xl mb-4 shadow-md" style={{ objectPosition: bannerPosition }} />
          )}
          {showBusinessName && (
            <>
              <p className="text-center text-sm font-semibold mb-0.5" style={{ color: primaryColor }}>
                {(() => { const h = new Date().getHours(); return h < 12 ? "בוקר טוב! ☀️" : h < 17 ? "צהריים טובים! 🌤️" : h < 21 ? "ערב טוב! 🌆" : "לילה טוב! 🌙"; })()}
              </p>
              <p className="text-center text-xs text-muted-foreground mb-1">ברוכ/ה הבא/ה ל:</p>
              <h1 className="text-3xl font-extrabold mb-2" dir="rtl" style={{ color: primaryColor, unicodeBidi: "isolate" }}>{business.name}</h1>
            </>
          )}
          <p className="text-muted-foreground">קביעת תור אונליין</p>
        </header>

        <Card className="shadow-lg overflow-hidden" style={{ borderRadius: cardRadius }}>
          <div className="px-6 py-4 flex gap-2 border-b" style={{ backgroundColor: primaryColor + "10" }}>
            {[2, 3, 4].map((stepNum, idx) => {
              const displayNum = idx + 1;
              return (
                <div key={stepNum} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step < stepNum ? "bg-muted text-muted-foreground" : ""}`}
                    style={
                      step === stepNum ? { backgroundColor: primaryColor, color: "white" } :
                      step > stepNum ? { backgroundColor: primaryColor + "30", color: primaryColor } :
                      {}
                    }>
                    {step > stepNum ? <Check className="w-4 h-4" /> : displayNum}
                  </div>
                  {idx < 2 && <div className={`w-4 h-0.5 ${step <= stepNum ? "bg-border" : ""}`} style={step > stepNum ? { backgroundColor: primaryColor + "60" } : {}} />}
                </div>
              );
            })}
          </div>

          <CardContent className="p-6 min-h-[380px]">
            <AnimatePresence mode="wait" initial={false}>

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  {/* Service description shown above the date-picker so
                      the customer has context on what they're booking —
                      owner feedback. Only renders when the selected
                      service actually has a description. */}
                  {selectedService && (
                    <div className="rounded-xl border bg-muted/40 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-base" style={{ color: primaryColor }}>{selectedService.name}</div>
                        <div className="text-sm font-bold shrink-0" style={{ color: primaryColor }}>
                          {(selectedService as any).priceStartsFrom ? "החל מ-" : ""}₪{(selectedService.price / 100).toFixed(0)}
                        </div>
                      </div>
                      {(selectedService as any).description && (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {(selectedService as any).description}
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground">משך השירות: <bdi>{formatDuration(selectedService.durationMinutes)}</bdi></div>
                    </div>
                  )}
                  <h2 className="text-xl font-bold">בחר תאריך ושעה</h2>

                  {!useCalendar && (
                    <>
                      {nextSlotsLoading ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">מחפש זמנים פנויים...</div>
                      ) : nextSlots.length > 0 ? (
                        <>
                          <p className="text-sm text-muted-foreground">הזמנים הפנויים הקרובים:</p>
                          <div className="grid grid-cols-2 gap-2">
                            {nextSlots.map((slot, i) => {
                              const holiday = JEWISH_HOLIDAYS[slot.date];
                              return (
                                <button
                                  key={i}
                                  onClick={() => handleQuickSlot(slot)}
                                  className="py-3 px-4 rounded-xl border-2 text-sm font-medium text-right transition-all hover:border-primary/50 hover:bg-muted/40 flex flex-col items-start gap-0.5"
                                  style={{ borderColor: "transparent", backgroundColor: primaryColor + "0d" }}
                                  dir="ltr"
                                >
                                  <span>{formatQuickSlot(slot)}</span>
                                  {holiday && (
                                    <span className="text-[10px] text-amber-600 font-medium" dir="rtl">{holiday}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground text-sm">אין זמנים פנויים בקרוב</div>
                      )}
                      <button
                        onClick={() => setUseCalendar(true)}
                        className="w-full py-2 text-sm border rounded-xl hover:bg-muted/30 transition-all"
                        style={{ color: primaryColor, borderColor: primaryColor + "40" }}
                      >
                        לכל התאריכים ←
                      </button>
                    </>
                  )}

                  {useCalendar && (
                    <>
                      <button
                        onClick={() => { setUseCalendar(false); setSelectedDate(undefined); setSelectedTime(null); }}
                        className="w-full py-2 text-sm border rounded-xl hover:bg-muted/30 transition-all"
                        style={{ color: primaryColor, borderColor: primaryColor + "40" }}
                      >
                        ← חזור לתורים קרובים
                      </button>
                      <div className="flex justify-center bg-muted/20 p-4 rounded-xl" dir="rtl">
                        <DayPicker mode="single" selected={selectedDate}
                          onSelect={(date) => { if (date) { setSelectedDate(date); setSelectedTime(null); } }}
                          locale={he} weekStartsOn={0} disabled={{ before: new Date() }}
                          dir="rtl"
                          components={{ DayButton: DayButtonComp }}
                          classNames={{ week: "[&>td]:pb-6" }}
                        />
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר שעה</h2>
                  <p className="text-muted-foreground">{selectedDate ? format(selectedDate, "EEEE, d בMMMM", { locale: he }) : ""}</p>
                  {availabilityLoading ? (
                    <div className="text-center py-12 text-muted-foreground">טוען שעות פנויות...</div>
                  ) : slots.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {slots.map((time, i) => (
                        <button key={i} onClick={() => { setSelectedTime(time); }}
                          className={`p-3 rounded-xl border-2 text-center font-medium transition-all ${selectedTime === time ? "" : "bg-muted/40 text-foreground hover:bg-muted"}`}
                          style={selectedTime === time ? {
                            borderColor: primaryColor,
                            backgroundColor: primaryColor + "20",
                            color: primaryColor,
                          } : { borderColor: "transparent" }}
                          dir="ltr">
                          {time}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/20 rounded-xl space-y-4">
                      <p className="text-lg font-medium">אין תורים פנויים ביום זה</p>
                      <p className="text-muted-foreground text-sm">רוצה שנודיע לך כשיתפנה מקום?</p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          // Auto-populate the waitlist form from the
                          // logged-in client's profile so they don't
                          // retype the name/phone they already gave us.
                          setWaitlistData(w => ({
                            name: w.name || clientData.name || "",
                            phone: w.phone || clientData.phone || "",
                            notes: w.notes,
                          }));
                          setShowWaitlist(true);
                        }}
                        className="gap-2"
                      >
                        <ListOrdered className="w-4 h-4" /> הצטרף לרשימת ההמתנה
                      </Button>
                      <Button variant="link" onClick={handleBack}>חזור לבחירת תאריך</Button>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">פרטים אישיים</h2>
                  <div className="p-4 rounded-xl border mb-2 space-y-2" style={{ borderColor: primaryColor + "30", backgroundColor: primaryColor + "08" }}>
                    <div className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4" style={{ color: primaryColor }} /> {selectedService?.name}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <CalendarIcon className="w-4 h-4" />
                      {selectedDate ? format(selectedDate, "d בMMMM yyyy", { locale: he }) : ""} • <span dir="ltr">{selectedTime}</span>
                    </div>
                  </div>
                  <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>שם מלא *</Label>
                      <Input required value={clientData.name} onChange={e => setClientData(p => ({ ...p, name: e.target.value }))} className="h-12 text-base" />
                    </div>
                    <div className="space-y-2">
                      <Label>מספר טלפון *</Label>
                      <div className="flex gap-2">
                        <Input
                          required
                          type="tel"
                          inputMode="tel"
                          pattern="^(\+?972|0)?-?5\d-?\d{3}-?\d{4}$"
                          placeholder="05X-XXX-XXXX"
                          title="מספר טלפון ישראלי (למשל 052-1234567)"
                          value={clientData.phone}
                          onChange={e => { setClientData(p => ({ ...p, phone: e.target.value })); setOtpSent(false); setPhoneVerified(false); setOtpCode(""); setPhoneVerificationToken(null); }}
                          className="h-12 text-base flex-1"
                          dir="ltr"
                          disabled={phoneVerified}
                        />
                        {requirePhoneVerification && !phoneVerified && (
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpLoading || !clientData.phone}
                            className="h-12 px-4 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {otpLoading && !otpSent ? "שולח..." : otpSent ? "שלח שוב" : "שלח קוד"}
                          </button>
                        )}
                        {requirePhoneVerification && phoneVerified && (
                          <div className="h-12 px-4 flex items-center gap-1 text-green-600 font-medium text-sm">
                            ✓ מאומת
                          </div>
                        )}
                      </div>
                    </div>

                    {requirePhoneVerification && otpSent && !phoneVerified && (
                      <div className="space-y-2">
                        <Label>קוד אימות *</Label>
                        <div className="flex gap-2">
                          <Input
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value)}
                            className="h-12 text-base text-center tracking-widest font-bold flex-1"
                            dir="ltr"
                            placeholder="123456"
                            maxLength={6}
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={otpLoading || otpCode.length < 6}
                            className="h-12 px-4 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {otpLoading ? "מאמת..." : "אמת"}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">שלחנו קוד בן 6 ספרות למספר שהזנת</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>הערה (אופציונלי)</Label>
                      <Input value={clientData.notes} onChange={e => setClientData(p => ({ ...p, notes: e.target.value }))} placeholder="בקשות מיוחדות..." />
                    </div>
                  </form>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="s5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-6">
                  <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: primaryColor + "20" }}>
                    <CheckCircle2 className="w-12 h-12" style={{ color: primaryColor }} />
                  </div>
                  {requireApproval ? (
                    <>
                      <h2 className="text-3xl font-extrabold">הבקשה נשלחה!</h2>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: "#fef9c3", color: "#92400e" }}>
                        ⏳ ממתין לאישור בעל העסק
                      </div>
                      <p className="text-muted-foreground max-w-sm mx-auto">
                        בקשת התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> התקבלה.
                      </p>
                      <div className="max-w-sm mx-auto p-4 rounded-2xl border text-sm leading-relaxed" style={{ backgroundColor: "rgba(139, 92, 246, 0.08)", borderColor: "rgba(139, 92, 246, 0.2)" }}>
                        <p className="font-semibold mb-1">⚠️ חשוב לדעת</p>
                        <p className="text-muted-foreground">
                          בעל העסק מאשר תורים <strong className="text-foreground">באופן ידני</strong>. יש להמתין עד לקבלת הודעת אישור התור ב<strong className="text-foreground">וואטסאפ</strong> — רק לאחר מכן התור מאושר סופית.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="text-3xl font-extrabold">התור נקבע!</h2>
                      <p className="text-muted-foreground max-w-xs mx-auto">
                        התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> נקבע בהצלחה!
                      </p>
                    </>
                  )}
                  <div className="bg-muted/20 border p-6 rounded-2xl max-w-sm mx-auto text-right space-y-3">
                    <div className="flex items-center gap-3">
                      <CalendarIcon className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium">{selectedDate ? format(selectedDate, "EEEE, d בMMMM yyyy", { locale: he }) : ""}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium" dir="ltr">{selectedTime}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium">{clientData.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium" dir="ltr">{clientData.phone}</span>
                    </div>
                  </div>
                  {!requireApproval && selectedDate && selectedTime && selectedService && (
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const [h, m] = selectedTime.split(":").map(Number);
                          const start = new Date(selectedDate);
                          start.setHours(h, m, 0, 0);
                          const end = new Date(start.getTime() + selectedService.durationMinutes * 60000);
                          const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                          const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`תור — ${selectedService.name} אצל ${business.name}`)}&dates=${fmt(start)}/${fmt(end)}`;
                          window.open(url, "_blank");
                        }}
                      >
                        <CalendarIcon className="w-4 h-4" /> הוסף ל-<span dir="ltr">Google Calendar</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const [h, m] = selectedTime.split(":").map(Number);
                          const start = new Date(selectedDate);
                          start.setHours(h, m, 0, 0);
                          const end = new Date(start.getTime() + selectedService.durationMinutes * 60000);
                          const fmt = (d: Date) => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
                          const ics = [
                            "BEGIN:VCALENDAR", "VERSION:2.0",
                            "BEGIN:VEVENT",
                            `DTSTART:${fmt(start)}`,
                            `DTEND:${fmt(end)}`,
                            `SUMMARY:תור — ${selectedService.name} אצל ${business.name}`,
                            "END:VEVENT", "END:VCALENDAR",
                          ].join("\r\n");
                          const blob = new Blob([ics], { type: "text/calendar" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = "appointment.ics";
                          a.click();
                        }}
                      >
                        <CalendarIcon className="w-4 h-4" /> הוסף ל-Apple / Outlook
                      </Button>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => { setStep(0); }}>חזור לעמוד הפרופיל</Button>
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>

          {step < 5 && (
            <CardFooter className="border-t p-6 flex justify-between bg-muted/10">
              {step > 2 ? (
                <Button variant="outline" onClick={handleBack} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> חזור
                </Button>
              ) : step === 2 ? (
                <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> חזרה
                </Button>
              ) : <div />}
              {step === 4 ? (
                <Button form="booking-form" type="submit" size="lg" disabled={createMutation.isPending} style={{ backgroundColor: primaryColor }}>
                  {createMutation.isPending ? "קובע תור..." : "קבע תור"}
                </Button>
              ) : step === 3 && selectedTime ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : step === 2 && useCalendar && selectedDate ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : <div />}
            </CardFooter>
          )}
        </Card>
      </div>

      <footer className="py-4 text-xs text-muted-foreground border-t text-center space-y-2">
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <a href="/privacy" className="hover:text-foreground transition-colors">מדיניות פרטיות</a>
          <a href="/terms" className="hover:text-foreground transition-colors">תנאי שימוש</a>
          <a href="/contact" className="hover:text-foreground transition-colors">יצירת קשר</a>
        </div>
        <a href="/" className="inline-flex items-center justify-center gap-2 font-bold text-foreground hover:text-primary transition-colors">
          <span>מופעל על ידי קבעתי</span>
          <img src="/icon.svg" alt="קבעתי" className="w-16 h-16 object-contain shrink-0" />
        </a>
      </footer>

      {/* Accessibility floating button (IS 5568 / WCAG 2.1) */}
      {/* AccessibilityFab + ThemeToggleFab are mounted globally in App.tsx */}
    </div>
  );
}
