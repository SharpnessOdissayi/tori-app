import { useState, useEffect } from "react";
import { FaWheelchair } from "react-icons/fa";
import { useParams } from "wouter";
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
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Check, ChevronRight, Clock, CalendarIcon, User, Phone, CheckCircle2, ListOrdered, Globe, MapPin, Instagram } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "react-day-picker/dist/style.css";
import { useToast } from "@/hooks/use-toast";

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// ─── Accessibility Widget (IS 5568 / WCAG 2.1 AA) ─────────────────────────────
function AccessibilityWidget({ primaryColor }: { primaryColor: string }) {
  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState(0); // -2 to +4 steps
  const [highContrast, setHighContrast] = useState(false);
  const [largeLinks, setLargeLinks] = useState(false);
  const [letterSpacing, setLetterSpacing] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const base = 16 + fontSize * 2;
    root.style.setProperty("font-size", `${base}px`);
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) {
      root.classList.add("a11y-high-contrast");
    } else {
      root.classList.remove("a11y-high-contrast");
    }
  }, [highContrast]);

  useEffect(() => {
    const root = document.documentElement;
    if (largeLinks) {
      root.classList.add("a11y-large-links");
    } else {
      root.classList.remove("a11y-large-links");
    }
  }, [largeLinks]);

  useEffect(() => {
    const root = document.documentElement;
    if (letterSpacing) {
      root.classList.add("a11y-letter-spacing");
    } else {
      root.classList.remove("a11y-letter-spacing");
    }
  }, [letterSpacing]);

  const handleReset = () => {
    setFontSize(0);
    setHighContrast(false);
    setLargeLinks(false);
    setLetterSpacing(false);
    document.documentElement.style.removeProperty("font-size");
    document.documentElement.classList.remove("a11y-high-contrast", "a11y-large-links", "a11y-letter-spacing");
  };

  return (
    <>
      {/* Global a11y CSS */}
      <style>{`
        .a11y-high-contrast { filter: contrast(1.6) !important; }
        .a11y-large-links a, .a11y-large-links button { min-height: 44px !important; min-width: 44px !important; }
        .a11y-letter-spacing * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      `}</style>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="הגדרות נגישות"
          dir="rtl"
          className="fixed bottom-24 right-4 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl p-4 w-64"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">הגדרות נגישות</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="סגור"
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >✕</button>
          </div>

          {/* Font size */}
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">גודל טקסט</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize(f => Math.max(f - 1, -2))}
                aria-label="הקטן טקסט"
                className="w-9 h-9 rounded-lg border text-lg font-bold flex items-center justify-center hover:bg-muted"
              >A−</button>
              <div className="flex-1 text-center text-xs text-muted-foreground">{fontSize === 0 ? "ברירת מחדל" : fontSize > 0 ? `+${fontSize * 2}px` : `${fontSize * 2}px`}</div>
              <button
                onClick={() => setFontSize(f => Math.min(f + 1, 4))}
                aria-label="הגדל טקסט"
                className="w-9 h-9 rounded-lg border text-lg font-bold flex items-center justify-center hover:bg-muted"
              >A+</button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 mb-3">
            {[
              { label: "ניגודיות גבוהה", state: highContrast, set: setHighContrast },
              { label: "כפתורים וקישורים גדולים", state: largeLinks, set: setLargeLinks },
              { label: "ריווח אותיות מוגדל", state: letterSpacing, set: setLetterSpacing },
            ].map(({ label, state, set }) => (
              <button
                key={label}
                onClick={() => set(s => !s)}
                role="switch"
                aria-checked={state}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-all ${state ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "border-border hover:bg-muted"}`}
              >
                <span>{label}</span>
                <span className={`w-8 h-4 rounded-full transition-colors relative ${state ? "bg-green-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${state ? "right-0.5" : "left-0.5"}`} />
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="w-full py-2 text-xs text-muted-foreground border rounded-xl hover:bg-muted transition-all"
          >
            איפוס הגדרות נגישות
          </button>

          <p className="text-[10px] text-muted-foreground text-center mt-2">
            תואם תקן IS 5568 / WCAG 2.1 AA
          </p>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="פתח תפריט נגישות"
        aria-expanded={open}
        title="נגישות"
        className="fixed right-4 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ backgroundColor: "#1560BD", bottom: "5rem" }}
      >
        <FaWheelchair size={22} color="white" aria-hidden="true" />
      </button>
    </>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 1 && m === 0) return "שעה";
  if (h === 1 && m > 0) return `שעה ו-${m} דקות`;
  if (m === 0) return `${h} שעות`;
  return `${h} שעות ו-${m} דקות`;
}

function renderBizName(name: string): React.ReactNode {
  if (!/[a-zA-Z]/.test(name) || !/[\u0590-\u05FF]/.test(name)) return name;
  const m = name.match(/^(.+?)\s*([-–—|\/])\s*(.+)$/);
  if (!m) return name;
  const [, p1, rawSep, p2] = m;
  const heb = /[\u0590-\u05FF]/.test(p1) ? p1 : p2;
  const eng = /[a-zA-Z]/.test(p1) ? p1 : p2;
  return (
    <span dir="ltr" style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span dir="rtl">{heb}</span>
      <span>{` ${rawSep} `}</span>
      <span dir="ltr">{eng}</span>
    </span>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "בוקר טוב! ☀️" : h < 17 ? "צהריים טובים! 🌤️" : h < 21 ? "ערב טוב! 🌆" : "לילה טוב! 🌙";
}

export default function Book() {
  const { businessSlug } = useParams<{ businessSlug: string }>();
  // step 0 = profile page, 1-5 = booking wizard
  const [step, setStep] = useState(0);
  const [showNotification, setShowNotification] = useState(true);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showExistingBooking, setShowExistingBooking] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "hours" | "gallery">("services");
  const [existingBooking, setExistingBooking] = useState<any>(null);
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
  const [otpLoading, setOtpLoading] = useState(false);

  const { toast } = useToast();
  const { data: business, isLoading: businessLoading, error: businessError } = useGetPublicBusiness(businessSlug || "");
  const { data: services, isLoading: servicesLoading } = useGetPublicServices(businessSlug || "");

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: availability, isLoading: availabilityLoading } = useGetPublicAvailability(
    businessSlug || "",
    { date: dateStr, serviceId: selectedServiceId! },
    { query: { enabled: !!dateStr && !!selectedServiceId } }
  );

  // Availability for reschedule flow
  const rescheduleDateStr = rescheduleDate?.toISOString().split("T")[0] ?? "";
  const { data: rescheduleAvailability } = useGetPublicAvailability(
    businessSlug || "",
    { date: rescheduleDateStr, serviceId: 0 },
    { query: { enabled: !!rescheduleDateStr && rescheduleStep === "picking" } }
  );

  const createMutation = useCreatePublicAppointment();
  const waitlistMutation = useJoinWaitlist();

  const primaryColor = business?.primaryColor ?? "#2563eb";
  const fontFamily = business?.fontFamily ?? "Heebo";
  const backgroundColor = (business as any)?.backgroundColor ?? null;
  const borderRadius = (business as any)?.borderRadius ?? "medium";
  const themeMode = business?.themeMode ?? "light";
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
  const websiteUrl = (business as any)?.websiteUrl ?? null;
  const instagramUrl = (business as any)?.instagramUrl ?? null;
  const wazeUrl = (business as any)?.wazeUrl ?? null;
  const businessDescription = (business as any)?.businessDescription ?? null;
  const requirePhoneVerification = (business as any)?.requirePhoneVerification ?? false;
  const bannerPosition = (business as any)?.bannerPosition ?? "center";
  const galleryImagesRaw = (business as any)?.galleryImages ?? null;
  let galleryImages: string[] = [];
  try { if (galleryImagesRaw) galleryImages = JSON.parse(galleryImagesRaw); } catch {}

  const cardRadius = borderRadius === "sharp" ? "8px" : borderRadius === "rounded" ? "24px" : "16px";

  // Load working hours
  useEffect(() => {
    if (!businessSlug) return;
    fetch(`/api/public/${businessSlug}/hours`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setWorkingHours(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [businessSlug]);

  // Load existing booking from localStorage
  useEffect(() => {
    if (!businessSlug) return;
    const saved = localStorage.getItem(`kavati_booking_${businessSlug}`);
    if (saved) {
      try { setExistingBooking(JSON.parse(saved)); } catch {}
    }
  }, [businessSlug]);

  useEffect(() => {
    if (!business) return;
    const root = document.documentElement;

    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

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

    return () => { root.classList.remove("dark"); };
  }, [business, fontFamily, themeMode]);

  if (businessLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: primaryColor + " transparent transparent transparent" }} />
        <p className="text-muted-foreground">טוען...</p>
      </div>
    </div>
  );
  if (businessError || !business) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8">
      <div>
        <div className="text-4xl mb-4">😔</div>
        <h1 className="text-2xl font-bold text-destructive mb-2">העסק לא נמצא</h1>
        <p className="text-muted-foreground">הכתובת שהזנת אינה תקינה</p>
      </div>
    </div>
  );

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);
  const servicesList = Array.isArray(services) ? services : [];
  const selectedService = servicesList.find(s => s.id === selectedServiceId);

  const handleSendOtp = async () => {
    if (!clientData.phone) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`/api/public/${businessSlug}/otp/send`, {
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
      const res = await fetch(`/api/public/${businessSlug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clientData.phone, code: otpCode }),
      });
      if (!res.ok) {
        toast({ title: "קוד שגוי, נסה שוב", variant: "destructive" });
        return;
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
    createMutation.mutate(
      { businessSlug: businessSlug || "", data: { serviceId: selectedServiceId, clientName: clientData.name, phoneNumber: clientData.phone, appointmentDate: dateStr, appointmentTime: selectedTime, notes: clientData.notes } },
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
          if (data?.requiresPayment && data?.id) {
            fetch(`${API_BASE}/tranzila/payment-url/${data.id}`)
              .then(r => r.json())
              .then(({ url }) => { if (url) window.location.href = url; })
              .catch(() => setStep(5));
          } else {
            setStep(5);
          }
        },
        onError: () => toast({ title: "שגיאה", description: "לא ניתן לקבוע את התור, נסה שוב", variant: "destructive" }),
      }
    );
  };

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

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
    ];

    return (
      <div dir="rtl" style={{ fontFamily: `'${fontFamily}', sans-serif`, backgroundColor }} className="min-h-screen overflow-x-hidden">

        {/* Notification Dialog */}
        <Dialog open={business.notificationEnabled && showNotification} onOpenChange={setShowNotification}>
          <DialogContent className="sm:max-w-md text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
              {business.notificationMessage}
            </DialogDescription>
            <Button onClick={() => setShowNotification(false)} style={{ backgroundColor: primaryColor }}>הבנתי, תודה</Button>
          </DialogContent>
        </Dialog>

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
                  /* Reschedule picker */
                  <div className="space-y-3">
                    <div className="text-sm font-medium">בחר תאריך ושעה חדשים:</div>
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
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => { setRescheduleStep("idle"); setRescheduleDate(undefined); setRescheduleTime(null); }}
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

        {/* Hero banner */}
        <div className="relative">
          {showBanner && bannerUrl ? (
            <img
              src={bannerUrl}
              alt={business.name}
              className="w-full object-cover"
              style={{ height: "224px", objectPosition: bannerPosition }}
            />
          ) : (
            <div
              className="w-full"
              style={{ height: "224px", background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)` }}
            />
          )}
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
              <p className="text-center text-sm font-semibold mb-0.5">{timeGreeting()}</p>
              <p className="text-center text-xs text-muted-foreground mb-0.5">ל:</p>
              <h1 className="text-2xl font-bold text-center mb-1" dir="ltr">{renderBizName(business.name)}</h1>
            </>
          )}
          {/* Description */}
          {businessDescription && (
            <p className="text-center text-muted-foreground text-sm mb-4 max-w-sm mx-auto">{businessDescription}</p>
          )}

          {/* Address row */}
          {address && (
            <div className="flex justify-center items-center gap-1.5 mb-3 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>{address}</span>
            </div>
          )}

          {/* Social links row */}
          {(contactPhone || websiteUrl || instagramUrl || wazeUrl) && (
            <div className="flex justify-center gap-3 mb-6 flex-wrap">
              {contactPhone && (
                <a href={`tel:${contactPhone}`} aria-label="התקשר">
                  <button
                    className="w-11 h-11 rounded-full border-2 border-white flex items-center justify-center text-white bg-transparent transition-all hover:bg-white/10"
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
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center border-green-200 hover:border-green-400 transition-all overflow-hidden"
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
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="אינסטגרם"
                  >
                    <Instagram className="w-5 h-5" />
                  </button>
                </a>
              )}
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" aria-label="אתר">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="אתר"
                  >
                    <Globe className="w-5 h-5" />
                  </button>
                </a>
              )}
              {wazeUrl && (
                <a href={wazeUrl} target="_blank" rel="noopener noreferrer" aria-label="ניווט בוויז">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="Waze"
                  >
                    <MapPin className="w-5 h-5" />
                  </button>
                </a>
              )}
            </div>
          )}

          {/* Existing appointment banner */}
          {existingBooking && (
            <div
              className="mb-4 p-3 rounded-xl border text-sm text-center"
              style={{ backgroundColor: primaryColor + "0d", borderColor: primaryColor + "33" }}
            >
              יש לכם תור!{" "}
              <button
                onClick={() => setShowExistingBooking(true)}
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
            <div className="space-y-3">
              {servicesLoading && <div className="text-center py-8 text-muted-foreground">טוען שירותים...</div>}
              {servicesList.filter(s => s.isActive).map(service => (
                <div key={service.id} className="border rounded-2xl overflow-hidden shadow-sm">
                  {service.imageUrl && (
                    <img src={service.imageUrl} alt={service.name} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-base">{service.name}</div>
                      <div className="font-bold" style={{ color: primaryColor }}>₪{(service.price / 100).toFixed(0)}</div>
                    </div>
                    {(service as any).description && (
                      <p className="text-sm text-muted-foreground mt-1">{(service as any).description}</p>
                    )}
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {formatDuration(service.durationMinutes)}
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
              ))}
              {!servicesLoading && !servicesList.filter(s => s.isActive).length && (
                <div className="text-center py-8 text-muted-foreground">אין שירותים זמינים כרגע</div>
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

          {/* Gallery tab */}
          {activeTab === "gallery" && (
            galleryImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {galleryImages.map((url, i) => (
                  <img key={i} src={url} alt={`gallery-${i}`} className="w-full aspect-square object-cover rounded-lg" />
                ))}
              </div>
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
            <div>
              מופעל על ידי{" "}
              <a href="/" className="font-bold text-foreground hover:text-primary transition-colors">קבעתי</a>
            </div>
          </footer>
        </div>

      {/* Floating book button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-black/90 backdrop-blur border-t z-40">
        <button
          onClick={() => setStep(1)}
          className="w-full h-12 rounded-2xl text-white font-bold text-base shadow-lg"
          style={{ backgroundColor: primaryColor }}
        >
          לקביעת תור ←
        </button>
      </div>

      {/* Accessibility floating button (IS 5568 / WCAG 2.1) */}
      <AccessibilityWidget primaryColor={primaryColor} />
    </div>
    );
  }

  // ─── STEPS 1-5: Booking wizard ──────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col relative" dir="rtl" style={{ fontFamily: `'${fontFamily}', sans-serif`, backgroundColor }}>
      <div className="absolute top-0 w-full h-52 -z-10 rounded-b-[40px]" style={{ backgroundColor: primaryColor + "18" }} />

      <Dialog open={business.notificationEnabled && showNotification} onOpenChange={setShowNotification}>
        <DialogContent className="sm:max-w-md text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
            {business.notificationMessage}
          </DialogDescription>
          <Button onClick={() => setShowNotification(false)} style={{ backgroundColor: primaryColor }}>הבנתי, תודה</Button>
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

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <header className="mb-8 text-center">
          {showLogo && logoUrl && (
            <img src={logoUrl} alt={business.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md border" />
          )}
          {showBanner && bannerUrl && (!showLogo || !logoUrl) && (
            <img src={bannerUrl} alt={business.name} className="w-full h-32 rounded-2xl object-cover mb-4 shadow-md" style={{ objectPosition: bannerPosition }} />
          )}
          {showBusinessName && (
            <>
              <p className="text-center text-sm font-semibold mb-0.5">{timeGreeting()}</p>
              <p className="text-center text-xs text-muted-foreground mb-0.5">ל:</p>
              <h1 className="text-3xl font-extrabold mb-2" dir="ltr" style={{ color: primaryColor }}>{renderBizName(business.name)}</h1>
            </>
          )}
          <p className="text-muted-foreground">קביעת תור אונליין</p>
        </header>

        <Card className="shadow-lg overflow-hidden" style={{ borderRadius: cardRadius }}>
          <div className="px-6 py-4 flex gap-2 border-b" style={{ backgroundColor: primaryColor + "10" }}>
            {[1, 2, 3, 4].map(num => (
              <div key={num} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step < num ? "bg-muted text-muted-foreground" : ""}`}
                  style={
                    step === num ? { backgroundColor: primaryColor, color: "white" } :
                    step > num ? { backgroundColor: primaryColor + "30", color: primaryColor } :
                    {}
                  }>
                  {step > num ? <Check className="w-4 h-4" /> : num}
                </div>
                {num < 4 && <div className={`w-4 h-0.5 ${step <= num ? "bg-border" : ""}`} style={step > num ? { backgroundColor: primaryColor + "60" } : {}} />}
              </div>
            ))}
          </div>

          <CardContent className="p-6 min-h-[380px]">
            <AnimatePresence mode="wait" initial={false}>

              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר שירות</h2>
                  {servicesLoading ? <div className="text-center py-8 text-muted-foreground">טוען שירותים...</div> : (
                    <div className="grid gap-3">
                      {servicesList.filter(s => s.isActive).map(service => (
                        <div key={service.id}
                          onClick={() => { setSelectedServiceId(service.id); }}
                          className={`border-2 rounded-xl cursor-pointer transition-all overflow-hidden ${selectedServiceId === service.id ? "border-primary" : "border-transparent bg-muted/40 hover:bg-muted"}`}
                          style={{ borderColor: selectedServiceId === service.id ? primaryColor : undefined, backgroundColor: selectedServiceId === service.id ? primaryColor + "0d" : undefined }}>
                          {service.imageUrl && (
                            <div className="h-28 overflow-hidden">
                              <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex justify-between items-center">
                              <div className="font-semibold text-lg">{service.name}</div>
                              <div className="font-bold text-lg" style={{ color: primaryColor }}>₪{(service.price / 100).toFixed(0)}</div>
                            </div>
                            {(service as any).description && (
                              <p className="text-sm text-muted-foreground mt-1">{(service as any).description}</p>
                            )}
                            <div className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                              <Clock className="w-4 h-4" />{formatDuration(service.durationMinutes)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {!servicesList.filter(s => s.isActive).length && (
                        <div className="text-center py-8 text-muted-foreground">אין שירותים זמינים כרגע</div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר תאריך</h2>
                  <div className="flex justify-center bg-muted/20 p-4 rounded-xl border" dir="ltr">
                    <DayPicker mode="single" selected={selectedDate}
                      onSelect={(date) => { if (date) { setSelectedDate(date); setSelectedTime(null); } }}
                      locale={he} weekStartsOn={0} disabled={{ before: new Date() }}
                      modifiersClassNames={{ selected: "font-bold rounded-full", today: "font-bold" }}
                      modifiersStyles={{ selected: { backgroundColor: primaryColor, color: "white" } }}
                    />
                  </div>
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
                      <Button variant="outline" onClick={() => setShowWaitlist(true)} className="gap-2">
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
                          value={clientData.phone}
                          onChange={e => { setClientData(p => ({ ...p, phone: e.target.value })); setOtpSent(false); setPhoneVerified(false); setOtpCode(""); }}
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
                      <p className="text-muted-foreground max-w-xs mx-auto">
                        בקשת התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> התקבלה ותאושר בקרוב.
                      </p>
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
                        <CalendarIcon className="w-4 h-4" /> הוסף ל-Google Calendar
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
              {step > 1 ? (
                <Button variant="outline" onClick={handleBack} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> חזור
                </Button>
              ) : step === 1 ? (
                <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> פרופיל
                </Button>
              ) : <div />}
              {step === 4 ? (
                <Button form="booking-form" type="submit" size="lg" disabled={createMutation.isPending} style={{ backgroundColor: primaryColor }}>
                  {createMutation.isPending ? "קובע תור..." : "אשר תור"}
                </Button>
              ) : step === 3 && selectedTime ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : step === 2 && selectedDate ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : step === 1 && selectedServiceId ? (
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
        <div>
          מופעל על ידי{" "}
          <a href="/" className="font-bold text-foreground hover:text-primary transition-colors">קבעתי</a>
        </div>
      </footer>

      {/* Accessibility floating button (IS 5568 / WCAG 2.1) */}
      <AccessibilityWidget primaryColor={primaryColor} />
    </div>
  );
}
