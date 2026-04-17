import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DESIGN_PRESETS } from "@/lib/designPresets";
import {
  useBusinessLogin,
  useListBusinessAppointments,
  useGetBusinessStats,
  useCancelBusinessAppointment,
  useListBusinessServices,
  useCreateBusinessService,
  useUpdateBusinessService,
  useDeleteBusinessService,
  useGetWorkingHours,
  useSetWorkingHours,
  useGetBreakTimes,
  useSetBreakTimes,
  useGetBusinessProfile,
  useUpdateBusinessProfile,
  useUpdateBusinessBranding,
  useUpdateBusinessIntegrations,
  useListBusinessCustomers,
  useListBusinessWaitlist,
  useRemoveFromWaitlist,
  getListBusinessAppointmentsQueryKey,
  getListBusinessServicesQueryKey,
  getGetWorkingHoursQueryKey,
  getGetBreakTimesQueryKey,
  getGetBusinessProfileQueryKey,
  getGetBusinessStatsQueryKey,
  getListBusinessCustomersQueryKey,
  getListBusinessWaitlistQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import {
  Calendar, Clock, Settings, Briefcase, LogOut, Plus, Trash2, Edit,
  Users, ListOrdered, Palette, Puzzle, Phone, TrendingUp, CheckCircle,
  ExternalLink, Info, Upload, Image as ImageIcon, Crown, Zap, X, Copy, Check, Link,
  ChevronLeft, ChevronRight, Eye, EyeOff, Ban, DollarSign,
  MessageSquare, Send, Search, ChevronDown, Instagram, Bell, FileText,
  XCircle, CheckCircle2, RotateCw, Hourglass, Download
} from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, parseISO, addDays, startOfWeek } from "date-fns";
import { he } from "date-fns/locale";
import { HebrewCalendar, flags as hebFlags } from "@hebcal/core";
import Navbar from "@/components/Navbar";
import { g as g_ } from "@/lib/hebrewGender";
import { BusinessCalendar, openRescheduleWhatsApp, type CalAppt, type TimeOffItem } from "@/components/BusinessCalendar";
import { MobileBottomNav, type BottomTab } from "@/components/MobileBottomNav";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ServiceSortableList } from "@/components/ServiceSortableList";
import { NewAppointmentDialog, DatePickerField, TimePickerField } from "@/components/NewAppointmentDialog";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const BUSINESS_CATEGORIES = [
  "ספרות גברים","מספרת נשים","מספרה כללית","החלקות שיער","צביעת שיער","עיצוב שיער ופאות",
  "מלחימת ריסים","מלחימת גבות","עיצוב גבות","טיפולי פנים","מניקור ופדיקור","ציפורניים ג'ל / אקריליק",
  "מסאז'","הסרת שיער בלייזר","שעוות / הסרת שיער","ספא וטיפולי גוף","איפור ועיצוב","סולריום",
  "קעקוע","פירסינג","תכשיטי שיניים",
  "רפואה כללית","רפואת שיניים","פסיכולוגיה / טיפול רגשי","פיזיותרפיה","רפואה טבעית / אלטרנטיבית",
  "תזונה ודיאטה","אופטומטריה","נטורופתיה","רפלקסולוגיה",
  "אימון אישי","יוגה / פילאטיס","אומנויות לחימה","שחייה","ריקוד",
  "שיעורים פרטיים","ייעוץ עסקי","ייעוץ משכנתאות","ייעוץ משפטי","אימון אישי (קואצ'ינג)",
  "תיקון מחשבים ונייד","תיקון רכב","שיפוצים ובנייה","חשמלאי","שרברב",
  "צילום","עיצוב גרפי","שיעורי נגינה",
  "וטרינר","קייטרינג ואירועים","אחר","העסק שלי לא נמצא ברשימה",
];

// Curated short list (owner pick). Default is Rubik. Every font here
// supports Hebrew natively. Hebrew fallback chain in Book.tsx stays
// in place as a safety net.
const HEBREW_FONTS = [
  { value: "Rubik", label: "Rubik" },
  { value: "Assistant", label: "Assistant" },
  { value: "Secular One", label: "Secular One" },
  { value: "Varela Round", label: "Varela Round" },
  { value: "Playpen Sans Hebrew", label: "Playpen Sans Hebrew" },
];

const PRESET_COLORS = [
  "#2563eb", "#3c92f0", "#db2777", "#dc2626",
  "#ea580c", "#16a34a", "#0891b2", "#0f172a",
];

const FREE_SERVICE_LIMIT = 3;
const FREE_MONTHLY_CUSTOMER_LIMIT = 20;

// Hebrew duration formatter with dual form for hours.
//   60   → "שעה"
//   90   → "שעה ו-30 דקות"
//   120  → "שעתיים"
//   150  → "שעתיים ו-30 דקות"
//   180  → "3 שעות"
//   330  → "5 שעות ו-30 דקות"
// Floating save button that hovers above the mobile bottom nav + any
// inline save/cancel buttons. Shown only when a tab has unsaved edits
// (parent decides). 70% width, centered, brand-blue gradient so it
// catches the eye without fighting the rest of the page chrome.
function FloatingSaveBar({
  visible, onClick, saving, label = "שמירה",
}: {
  visible: boolean;
  onClick: () => void;
  saving?: boolean;
  label?: string;
}) {
  if (!visible) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none px-4"
      // 5rem (80px) sits just above the mobile bottom-nav (64px) with a
      // small gap; env(safe-area-inset-bottom) respects the iPhone home
      // indicator. On desktop there's no nav, so 5rem is still a
      // comfortable distance from the bottom.
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={saving}
        className="pointer-events-auto w-[70%] max-w-md h-12 rounded-2xl font-bold text-white shadow-2xl transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60 animate-in slide-in-from-bottom-4 fade-in duration-300"
        style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}
      >
        {saving ? "שומר..." : label}
      </button>
    </div>
  );
}

// Intended for RTL rendering contexts (the whole dashboard is dir="rtl").
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourPart = h === 0 ? "" : h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  const minPart = m === 0 ? "" : m === 1 ? "דקה" : `${m} דקות`;
  if (!hourPart) return minPart || "0 דקות";
  if (!minPart) return hourPart;
  return `${hourPart} ו-${minPart}`;
}


function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  // Share link points at the /api/s/<slug> page so WhatsApp / Facebook
  // scrapers see business-specific og: tags (name + logo + description)
  // instead of Kavati's default. A human clicking the link gets bounced
  // to the SPA /book/<slug> route via meta-refresh.
  const fullUrl = `${window.location.origin}/api/s/${slug}`;
  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 bg-muted rounded-xl border">
        <Link className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-mono break-all text-foreground select-all" dir="ltr">{fullUrl}</span>
        <Button
          type="button"
          variant={copied ? "default" : "outline"}
          size="sm"
          className={`gap-1.5 shrink-0 transition-all ${copied ? "bg-green-600 hover:bg-green-700 border-green-600 text-white" : ""}`}
          onClick={handleCopy}
        >
          {copied ? <><Check className="w-3.5 h-3.5" /> הועתק!</> : <><Copy className="w-3.5 h-3.5" /> העתק</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">שתף את הלינק הזה עם הלקוחות שלך כדי שיוכלו לקבוע תור</p>
    </div>
  );
}

const API_BASE_SUB = import.meta.env.VITE_API_BASE_URL ?? "/api";

function SubscriptionBanner() {
  const { data: profile } = useGetBusinessProfile();
  const { data: services } = useListBusinessServices();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "kavati_payment_success" && e.data?.paymentType === "subscription") {
        setShowUpgrade(false);
        setIframeUrl(null);
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
        toast({ title: "המנוי הופעל בהצלחה! 🎉", description: "ברוך הבא לקבעתי פרו." });
      }
      if (e.data?.type === "kavati_payment_fail" && e.data?.paymentType === "subscription") {
        toast({ title: "התשלום נכשל", description: "בדוק את פרטי הכרטיס ונסה שוב.", variant: "destructive" });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [queryClient]);

  if (!profile) return null;

  const isPro = profile.subscriptionPlan !== "free";
  const servicesList = Array.isArray(services) ? services : [];
  const serviceCount = servicesList.filter(s => s.isActive).length;
  const nearLimit = serviceCount >= FREE_SERVICE_LIMIT - 1;

  const openPayment = async () => {
    setIframeLoading(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_SUB}/tranzila/subscription-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה");
      setIframeUrl(data.url);
      setShowUpgrade(true);
    } catch (err: any) {
      toast({ title: "שגיאה בטעינת עמוד התשלום", description: err.message, variant: "destructive" });
    } finally {
      setIframeLoading(false);
    }
  };

  // Pro users: the renewal info lives in the navbar Crown popover now
  // (see SubscriptionCrown), so no dashboard banner is rendered. Keeps
  // the screen clean — Pro is the default state, no need for a strip
  // that owners already internalised.
  if (isPro) return null;

  return (
    <>
      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-xl border mb-4 ${nearLimit ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
        <div className="flex items-center gap-2 flex-1">
          <Zap className={`w-5 h-5 shrink-0 ${nearLimit ? "text-amber-500" : "text-blue-500"}`} />
          <div>
            <div className={`font-semibold text-sm ${nearLimit ? "text-amber-800" : "text-blue-800"}`}>
              מנוי חינמי פעיל
            </div>
            <div className={`text-xs mt-0.5 ${nearLimit ? "text-amber-600" : "text-blue-600"}`}>
              {serviceCount}/{FREE_SERVICE_LIMIT} שירותים • עד {FREE_MONTHLY_CUSTOMER_LIMIT} לקוחות בחודש
              {nearLimit && " — קרוב למגבלה!"}
            </div>
          </div>
        </div>
        <Button size="sm" onClick={openPayment} disabled={iframeLoading}
          className="bg-gradient-to-l from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white gap-1.5 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          {iframeLoading ? "טוען..." : "שדרג לפרו — 🎉 חודש ראשון ₪50"}
        </Button>
      </div>

      {/* Payment iframe dialog */}
      <Dialog open={showUpgrade} onOpenChange={v => { setShowUpgrade(v); if (!v) setIframeUrl(null); }}>
        <DialogContent dir="rtl" className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Crown className="w-5 h-5 text-blue-500" /> שדרג למנוי פרו
            </DialogTitle>
            <DialogDescription className="flex flex-col gap-1">
              <span>
                <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-xs font-bold mr-2">🎉 מבצע פתיחה -50%</span>
              </span>
              <span>
                חודש ראשון: <span className="font-semibold text-blue-600 line-through opacity-60 mr-1">₪100</span><span className="font-bold text-blue-600">₪50</span>
                &nbsp;·&nbsp;אחר כך <span className="font-semibold">₪100/חודש</span>
                &nbsp;·&nbsp;ביטול בכל עת
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 bg-blue-50/50 border-b">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                "שירותים ללא הגבלה",
                "לקוחות ללא הגבלה",
                "עיצוב מותאם אישית",
                "אינטגרציות WhatsApp",
              ].map(f => (
                <div key={f} className="flex items-center gap-1.5 text-blue-700">
                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> {f}
                </div>
              ))}
            </div>
          </div>

          {iframeUrl && (
            <div className="p-3">
              <iframe
                src={iframeUrl}
                allow="payment"
                style={{ width: "100%", height: 400, border: "none", borderRadius: 8 }}
                title="תשלום מאובטח — Tranzila"
              />
            </div>
          )}

          <div className="px-5 pb-4 text-center text-xs text-muted-foreground">
            התשלום מאובטח ומוצפן — מופעל על ידי Tranzila
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Onboarding Tour — floating bubble, no overlay
// ─────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    emoji: "👋",
    title: "ברוכים הבאים לקבעתי!",
    tab: null,
    sections: [
      { icon: "📅", name: "תורים", desc: "כל התורים שלך במקום אחד" },
      { icon: "✂️", name: "שירותים", desc: "הגדר מה אתה מציע ובאיזה מחיר" },
      { icon: "🕐", name: "שעות עבודה", desc: "קבע מתי אתה זמין" },
      { icon: "📊", name: "נתונים", desc: "סטטיסטיקות, ברזים וביטולים" },
      { icon: "🔗", name: "הגדרות", desc: "עמוד ההזמנה שלך + פרטי העסק" },
    ],
  },
  {
    emoji: "📅",
    title: "תורים",
    tab: "appointments",
    desc: "כאן מופיעים כל התורים הקרובים. תוכל לאשר, לבטל ולראות היסטוריה מלאה. בעת ביטול — בחר סיבה (ברז / ביטול לקוח / אחר) ומי ביטל יוצג בהיסטוריה.",
  },
  {
    emoji: "🔔",
    title: "פעמון התראות",
    tab: "appointments",
    desc: "בפינה הימנית העליונה יש פעמון התראות שמציג בזמן אמת: תורים חדשים, ביטולים ועדכונים — ממך ומהלקוחות שלך.",
  },
  {
    emoji: "📊",
    title: "נתונים וניתוח",
    tab: "analytics",
    desc: "כאן תמצא סטטיסטיקות מלאות: כמה תורים עברו, ביטולים, מגמות חודשיות, דירוג הברזים ומי ביטל הכי הרבה — לחץ על שורה לפרטים.",
  },
  {
    emoji: "🔗",
    title: "הגדרות",
    tab: "settings",
    desc: "הלינק האישי שלך לשיתוף עם לקוחות, תמונת פרופיל, צבעים, מגבלות הזמנה, תזכורות ועוד. כאן גם תנהל את המנוי שלך.",
  },
];

function OnboardingTour({ onComplete, onTabChange }: { onComplete: () => void; onTabChange: (tab: string) => void }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) { onComplete(); return; }
    const next = step + 1;
    setStep(next);
    const nextTab = TOUR_STEPS[next].tab;
    if (nextTab) onTabChange(nextTab);
  };

  const handleBack = () => {
    if (step === 0) return;
    const prev = step - 1;
    setStep(prev);
    const prevTab = TOUR_STEPS[prev].tab;
    if (prevTab) onTabChange(prevTab);
  };

  return (
    <div className="fixed bottom-5 left-5 z-50 w-72 animate-in slide-in-from-bottom-3 duration-300" dir="rtl">
      {/* Bubble */}
      <div className="bg-white rounded-2xl shadow-2xl border border-border/60 overflow-hidden">
        {/* Top gradient strip */}
        <div className="h-1 bg-gradient-to-l from-blue-500 to-primary" />

        <div className="p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{current.emoji}</span>
              <span className="font-bold text-sm">{current.title}</span>
            </div>
            <button onClick={onComplete} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step 0 — welcome overview */}
          {step === 0 && "sections" in current && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">פה תוכל לנהל את העסק שלך. הנה מה שיש:</p>
              <div className="space-y-1.5">
                {current.sections.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5">
                    <span className="text-base">{s.icon}</span>
                    <div>
                      <span className="text-xs font-semibold">{s.name}</span>
                      <span className="text-xs text-muted-foreground"> — {s.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Steps 1–4 — section explanation */}
          {step > 0 && "desc" in current && (
            <p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p>
          )}

          {/* Progress dots */}
          <div className="flex gap-1 justify-center pt-1">
            {TOUR_STEPS.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-200 ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/25"}`} />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={handleBack} className="gap-1 text-xs h-8">
                <ChevronRight className="w-3.5 h-3.5" /> אחורה
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="flex-1 gap-1 text-xs h-8">
              {isLast ? "התחל! 🚀" : <>הבא <ChevronLeft className="w-3.5 h-3.5" /></>}
            </Button>
          </div>

          <button onClick={onComplete} className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            דלג על ההדרכה
          </button>
        </div>
      </div>

      {/* Bubble tail */}
      <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white border-b border-l border-border/60 rotate-45 shadow-sm" />
    </div>
  );
}

export default function Dashboard() {
  const [token, setToken] = useState(
    () => localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")
  );
  // Active tab persists across reloads — without this, pressing F5
  // while editing Settings (or any other tab) bounced the owner back
  // to the default "appointments" tab.
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("kavati_dash_active_tab") || "appointments"; }
    catch { return "appointments"; }
  });
  useEffect(() => {
    try { localStorage.setItem("kavati_dash_active_tab", activeTab); } catch {}
  }, [activeTab]);
  // Mobile bottom-nav state. "home" → subscription/revenue overview,
  // "calendar" + "approvals" → appointments tab (different scroll/focus),
  // "customers" → customers, "menu" → open the full-tab drawer.
  const [bottomTab, setBottomTab] = useState<BottomTab>("calendar");
  const [menuOpen, setMenuOpen] = useState(false);
  const handleBottomTab = (t: BottomTab) => {
    setBottomTab(t);
    if (t === "menu") { setMenuOpen(true); return; }
    if (t === "home") { setActiveTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (t === "calendar") setActiveTab("appointments");
    // Dedicated approvals tab — shows only pending appointments with
    // inline approve / reject buttons. Distinct from the calendar so
    // the owner can triage new bookings without scrolling past the
    // week grid.
    if (t === "approvals") setActiveTab("approvals");
    if (t === "customers") setActiveTab("customers");
  };
  const { data: headerProfile } = useGetBusinessProfile();
  // Lightweight root-level fetch so the bottom-nav badge reflects the
  // actual pending count. Uses the same cache key as AppointmentsTab so
  // we don't duplicate the request.
  const { data: rootAppts } = useListBusinessAppointments({
    query: { enabled: !!token },
  });
  const pendingCount = Array.isArray(rootAppts)
    ? rootAppts.filter(a => a.status === "pending").length
    : 0;
  const [showTour, setShowTour] = useState(() => !localStorage.getItem("kavati_tour_seen"));

  const handleLogout = () => {
    localStorage.removeItem("biz_token");
    sessionStorage.removeItem("biz_token");
    setToken(null);
  };

  // Dashboard UI is locked to Rubik — owner feedback: the business-owner
  // interface should look consistent regardless of the font they chose
  // for their customer-facing profile. Load the stylesheet once on mount
  // so the text renders in the intended face even before any profile
  // data arrives.
  useEffect(() => {
    const id = "gfont-dash-rubik";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const completeTour = () => {
    localStorage.setItem("kavati_tour_seen", "true");
    setShowTour(false);
  };

  const handleLogin = (t: string) => {
    setToken(t);
  };

  if (!token) return <Login onLogin={handleLogin} />;

  const dashFont = (headerProfile as any)?.fontFamily;
  const isProPlan = headerProfile?.subscriptionPlan === "pro";

  return (
    // Dashboard font is fixed to Rubik regardless of the business's
    // saved brand font — the owner UI is meant to feel consistent for
    // staff across every business on the platform.
    <div className="portal-dark-scope min-h-screen bg-muted/30" dir="rtl"
      style={{ fontFamily: "'Rubik', sans-serif" }}
    >
      {showTour && (
        <OnboardingTour
          onComplete={completeTour}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      )}

      <Navbar
        startContent={
          headerProfile?.slug && (
            <a
              href={`/book/${headerProfile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold text-white shadow-sm whitespace-nowrap transition-all hover:brightness-105 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}
              title="צפייה בעמוד העסק"
            >
              צפייה בעמוד העסק ↗
            </a>
          )
        }
        leftContent={
          <div className="flex items-center gap-2">
            <SubscriptionCrown />
            <NotificationBell
              token={token!}
              onNotificationClick={(n) => {
                // Route by notification type to the view that makes the
                // owner's next action obvious. appointment_id on the row
                // lets us open the exact card when we land there.
                const apptId = n.appointment_id ?? n.appointmentId;
                const appts = Array.isArray(rootAppts) ? rootAppts : [];
                const appt = apptId ? appts.find((a: any) => a.id === apptId) : null;

                if (n.type === "cancellation") {
                  // Owner wants to see the client in the customers list —
                  // they usually want to flag / call / reschedule.
                  setActiveTab("customers");
                  setBottomTab("customers");
                  return;
                }
                if (n.type === "new_booking") {
                  // Pending-approval bookings go to the approvals queue;
                  // auto-confirmed ones land on the calendar focused on
                  // the day of the booking.
                  if (appt && (appt as any).status === "pending") {
                    setActiveTab("approvals");
                    setBottomTab("approvals");
                  } else {
                    setActiveTab("appointments");
                    setBottomTab("calendar");
                  }
                  return;
                }
                if (n.type === "reschedule") {
                  setActiveTab("appointments");
                  setBottomTab("calendar");
                  return;
                }
                if (n.type === "waitlist_join") {
                  setActiveTab("waitlist");
                  setBottomTab("menu");
                }
              }}
            />
            {headerProfile?.name && (
              <span className="hidden sm:block text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ color: "#3c92f0", border: "1px solid #3c92f040" }}>
                {headerProfile.name}
              </span>
            )}
            {/* Desktop-only logout — mobile uses the welcome-strip logout
                button below to avoid stacking two identical CTAs side by side. */}
            <button
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{ color: "#c0c0c0" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#3c92f0")}
              onMouseLeave={e => (e.currentTarget.style.color = "#c0c0c0")}
            >
              <LogOut className="w-4 h-4" />
              התנתק
            </button>
          </div>
        }
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Mobile-only welcome header */}
        <div className="sm:hidden flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-lg" style={{ color: "#3c92f0" }}>
              {(() => { const h = new Date().getHours(); return h < 12 ? "בוקר טוב! ☀️" : h < 17 ? "צהריים טובים! 🌤️" : h < 21 ? "ערב טוב! 🌆" : "לילה טוב! 🌙"; })()}
            </p>
            <p className="font-semibold text-sm" style={{ color: "#3c92f0" }}>
              שלום {(headerProfile as any)?.ownerName?.split(" ")[0] ?? ""}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
          >
            <LogOut className="w-4 h-4" />
            יציאה
          </button>
        </div>

        <SubscriptionBanner />
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="space-y-6">

          {/* Desktop: horizontal scrollable tabs */}
          <div className="hidden sm:block overflow-x-auto pb-1">
            <TabsList className="bg-card border w-max h-auto p-1 gap-1 flex">
              <TabsTrigger value="appointments" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Calendar className="w-4 h-4" /> פגישות
              </TabsTrigger>
              <TabsTrigger value="services" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Briefcase className="w-4 h-4" /> שירותים
              </TabsTrigger>
              <TabsTrigger value="hours" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Clock className="w-4 h-4" /> שעות עבודה
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Users className="w-4 h-4" /> לקוחות
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <ListOrdered className="w-4 h-4" /> רשימת המתנה
              </TabsTrigger>
              <TabsTrigger value="receipts" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <FileText className="w-4 h-4" /> קבלות
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Palette className="w-4 h-4" /> עיצוב
              </TabsTrigger>
              <TabsTrigger value="integrations" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Phone className="w-4 h-4" /> הודעות {!isProPlan && <ProShine />}
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Settings className="w-4 h-4" /> הגדרות
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Mobile top tabs removed — navigation on mobile is the bottom
              nav + "תפריט" sheet rendered below the main content. */}

          {/* Every TabsContent explicitly carries dir="rtl" — Radix Tabs
              manages its own dir internally and doesn't cascade it to
              children automatically, so without this the inner cards
              (headers, labels, flex rows) render left-aligned. */}
          <TabsContent value="home" dir="rtl"><HomeTab onJump={(t) => { setActiveTab(t); setBottomTab(t === "customers" ? "customers" : t === "approvals" ? "approvals" : "calendar"); }} /></TabsContent>
          <TabsContent value="appointments" dir="rtl"><AppointmentsTab /></TabsContent>
          <TabsContent value="approvals" dir="rtl"><PendingApprovalsTab /></TabsContent>
          <TabsContent value="services" dir="rtl"><ServicesTab /></TabsContent>
          <TabsContent value="hours" dir="rtl">
            <div className="space-y-10">
              <WorkingHoursTab />
              <div className="pt-6 border-t">
                <DayOffTab />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="customers" dir="rtl">
            <div className="space-y-10">
              <CustomersTab />
              <div className="pt-6 border-t">
                {isProPlan ? <RevenueTab /> : <ProUpgradePrompt title="נתוני כסף — מנוי PRO בלבד" desc="שדרג למנוי PRO כדי לעקוב אחרי הכנסות, תשלומי מקדמה ודוחות כספיים" />}
              </div>
              <div className="pt-6 border-t">
                {isProPlan ? <AnalyticsTab /> : <ProUpgradePrompt title="ניתוח נתונים — מנוי PRO בלבד" desc="שדרג למנוי PRO כדי לראות סטטיסטיקות, גרפים ומגמות על העסק שלך" />}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="waitlist" dir="rtl"><WaitlistTab /></TabsContent>
          <TabsContent value="receipts" dir="rtl"><ReceiptsTab /></TabsContent>
          <TabsContent value="branding" dir="rtl"><BrandingTab /></TabsContent>
          <TabsContent value="integrations" dir="rtl">{isProPlan ? <IntegrationsTab /> : <ProUpgradePrompt title="הודעות — מנוי PRO בלבד" desc="שדרג למנוי PRO כדי לנהל תבניות WhatsApp אישיות, הודעות ברודקאסט ותזכורות מתוזמנות" />}</TabsContent>
          <TabsContent value="settings" dir="rtl"><SettingsTab /></TabsContent>
        </Tabs>

        {/* Suggestion banner */}
        <div className="mt-6 p-4 rounded-2xl bg-muted/40 border text-center text-sm text-muted-foreground">
          💡 יש לך הצעה לשיפור או מצאת באג בלוח הניהול?{" "}
          <a href="/contact" className="font-semibold text-primary underline">אשמח שתשאיר לי הודעה על כך</a>
        </div>

        {/* Bottom safe-area padding so the fixed mobile nav doesn't cover
            the last card on the page. Desktop (md+) ignores this. */}
        <div className="md:hidden h-20" aria-hidden />
      </main>

      {/* Mobile bottom nav — fixed, always-visible on phones. */}
      <MobileBottomNav
        active={bottomTab}
        onChange={handleBottomTab}
        pendingCount={pendingCount}
      />

      {/* Menu sheet — the rest of the legacy tabs accessible from "תפריט" */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl" dir="rtl">
          <SheetHeader>
            <SheetTitle>תפריט</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-3 mt-4 pb-4">
            {[
              { value: "appointments", icon: <Calendar className="w-6 h-6" />, label: "פגישות" },
              { value: "services",     icon: <Briefcase className="w-6 h-6" />, label: "שירותים" },
              { value: "hours",        icon: <Clock className="w-6 h-6" />,     label: "שעות עבודה" },
              { value: "customers",    icon: <Users className="w-6 h-6" />,     label: "לקוחות" },
              { value: "waitlist",     icon: <ListOrdered className="w-6 h-6" />, label: "המתנה" },
              { value: "receipts",     icon: <FileText className="w-6 h-6" />,  label: "קבלות" },
              { value: "branding",     icon: <Palette className="w-6 h-6" />,   label: "עיצוב" },
              { value: "integrations", icon: <Phone className="w-6 h-6" />,     label: "הודעות" },
              { value: "settings",     icon: <Settings className="w-6 h-6" />,  label: "הגדרות" },
            ].map(({ value, icon, label }) => (
              <button
                key={value}
                onClick={() => {
                  setActiveTab(value);
                  setMenuOpen(false);
                  setBottomTab(value === "customers" ? "customers" : value === "appointments" ? "calendar" : "menu");
                }}
                className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition-colors text-sm font-medium ${
                  activeTab === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
                }`}
              >
                {icon}
                <span className="text-xs leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* Full-width row under the grid — PWA install shortcut. Lives
              here (not in the grid) so it doesn't visually compete with
              the main categories and so it reads as a call-to-action. */}
          <a
            href="/install-app"
            className="mt-2 flex items-center gap-3 p-4 rounded-2xl border border-primary/30 bg-gradient-to-l from-primary/10 to-primary/5 text-right hover:from-primary/15 hover:to-primary/10 transition-colors"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}>
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-primary">התקן את קבעתי כאפליקציה</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">אייקון על המסך הבית · מסך מלא · התראות בזמן אמת</div>
            </div>
            <ChevronLeft className="w-4 h-4 text-primary/60 shrink-0" />
          </a>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Pro crown + renewal popover (lives in the dashboard navbar) ────────────
// Replaces the old "מנוי פרו פעיל / ללא הגבלת זמן" banner at the top of
// the page. For Pro owners we render a small crown next to the bell;
// tapping it flips open a compact pop-out that shows the renewal (or
// expiry) line. No row for free users.
function SubscriptionCrown() {
  const { data: profile } = useGetBusinessProfile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!profile) return null;
  const isPro = profile.subscriptionPlan !== "free";
  if (!isPro) return null;

  const renewDate: Date | null = (profile as any)?.subscriptionRenewDate
    ? new Date((profile as any).subscriptionRenewDate)
    : null;
  const cancelledAt: Date | null = (profile as any)?.subscriptionCancelledAt
    ? new Date((profile as any).subscriptionCancelledAt)
    : null;

  let timerText = "ללא הגבלת זמן";
  let timerColor = "text-blue-600";
  if (renewDate) {
    const daysLeft = Math.ceil((renewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (cancelledAt) {
      timerText = daysLeft > 0 ? `פוקע בעוד ${daysLeft} ימים` : "פג תוקף";
      timerColor = daysLeft <= 7 ? "text-red-600" : "text-amber-600";
    } else {
      timerText = daysLeft > 0 ? `מתחדש בעוד ${daysLeft} ימים` : "מתחדש היום";
      timerColor = daysLeft <= 3 ? "text-amber-600" : "text-blue-600";
    }
  }

  const renewDateFormatted = renewDate
    ? renewDate.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="relative" ref={ref} dir="rtl">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-black/5"
        aria-label="מנוי פרו"
        title="מנוי פרו"
      >
        <Crown className="w-4 h-4 text-blue-500" />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/20 z-[999]" />
          <div
            className="fixed top-14 inset-x-3 sm:inset-x-auto sm:end-4 sm:w-72 z-[1000] bg-white rounded-2xl shadow-2xl border border-blue-200 overflow-hidden"
            dir="rtl"
          >
            <div className="bg-gradient-to-l from-blue-50 to-blue-50/60 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
              <Crown className="w-5 h-5 text-blue-500" />
              <div className="flex-1">
                <div className="font-bold text-sm text-blue-700">מנוי פרו פעיל</div>
                <div className={`text-xs font-medium ${timerColor}`}>{timerText}</div>
              </div>
            </div>
            {renewDateFormatted && (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{cancelledAt ? "פג תוקף" : "חידוש הבא"}</span>
                  <span className="font-medium text-foreground">{renewDateFormatted}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Calendar icon showing today's date ──────────────────────────────────────
function TodayCalendarIcon() {
  const today = new Date();
  const day = today.getDate();
  const weekday = today.toLocaleDateString("he-IL", { weekday: "short" });
  const month = today.toLocaleDateString("he-IL", { month: "short" });
  return (
    <div className="inline-flex flex-col items-center justify-center w-16 h-16 rounded-2xl overflow-hidden shadow-lg mx-auto mb-2 border border-border select-none" style={{ background: "#fff" }}>
      <div className="w-full text-white text-[10px] font-bold text-center py-0.5" style={{ background: "#e11d48" }}>{weekday}</div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none text-gray-800">{day}</span>
        <span className="text-[9px] text-gray-400 mt-0.5">{month}</span>
      </div>
    </div>
  );
}

// ─── Business notifications bell ──────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function NotificationBell({ token, onNotificationClick }: { token: string; onNotificationClick?: (n: any) => void }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchNotifs = async () => {
    try {
      const r = await fetch(`${API_BASE}/notifications/business`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d = await r.json();
      setNotifications(d.notifications ?? []);
      setUnread(d.unreadCount ?? 0);
    } catch {}
  };

  useEffect(() => { fetchNotifs(); const t = setInterval(fetchNotifs, 30000); return () => clearInterval(t); }, [token]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/business/read-all`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      setUnread(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {
      toast({ title: "שגיאה בסימון כנקרא", variant: "destructive" });
    }
  };

  const deleteAll = async () => {
    if (!confirm("למחוק את כל ההתראות? לא ניתן לשחזר.")) return;
    try {
      const res = await fetch(`${API_BASE}/notifications/business/all`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      setNotifications([]);
      setUnread(0);
    } catch {
      toast({ title: "שגיאה במחיקת ההתראות", variant: "destructive" });
    }
  };

  // Per-type theming — icon, accent bar, tint, and text colour all
  // drawn from the same palette so the owner can scan at a glance.
  // Owner feedback: red for cancellations, green for new bookings,
  // orange for reschedules, blue for waitlist joins.
  const typeStyle = (type: string) => {
    switch (type) {
      case "cancellation":
        return {
          Icon: XCircle,
          bar: "bg-red-500", tint: "bg-red-50",
          iconCls: "text-red-600", textCls: "text-red-700",
          label: "בוטל", labelCls: "bg-red-100 text-red-700 border-red-200",
        };
      case "new_booking":
        return {
          Icon: CheckCircle2,
          bar: "bg-emerald-500", tint: "bg-emerald-50",
          iconCls: "text-emerald-600", textCls: "text-emerald-700",
          label: "תור חדש", labelCls: "bg-emerald-100 text-emerald-700 border-emerald-200",
        };
      case "reschedule":
        return {
          Icon: RotateCw,
          bar: "bg-amber-500", tint: "bg-amber-50",
          iconCls: "text-amber-600", textCls: "text-amber-700",
          label: "נדחה", labelCls: "bg-amber-100 text-amber-700 border-amber-200",
        };
      case "waitlist_join":
        return {
          Icon: Hourglass,
          bar: "bg-sky-500", tint: "bg-sky-50",
          iconCls: "text-sky-600", textCls: "text-sky-700",
          label: "המתנה", labelCls: "bg-sky-100 text-sky-700 border-sky-200",
        };
      default:
        return {
          Icon: Bell,
          bar: "bg-slate-400", tint: "bg-white",
          iconCls: "text-slate-500", textCls: "text-gray-800",
          label: "", labelCls: "",
        };
    }
  };

  return (
    <div className="relative" ref={ref} dir="rtl">
      <button
        onClick={() => { setOpen(v => !v); if (!open) { fetchNotifs(); } }}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
        style={{ color: "#c0c0c0" }}
        onMouseEnter={e => (e.currentTarget.style.color = "#3c92f0")}
        onMouseLeave={e => (e.currentTarget.style.color = "#c0c0c0")}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop — tap to close */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/30 z-[999]"
          />
          {/* Panel — fixed position, below navbar, responsive width */}
          <div
            className="fixed top-14 inset-x-2 sm:inset-x-auto sm:end-4 sm:w-96 max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 z-[1000] overflow-hidden flex flex-col"
            dir="rtl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
              <span className="font-bold text-sm text-gray-900">התראות</span>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">סמן הכל</button>
                )}
                {notifications.length > 0 && (
                  <button onClick={deleteAll} className="text-xs text-red-600 hover:underline">מחק הכל</button>
                )}
                <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-full text-xl leading-none">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y bg-white">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">אין התראות חדשות</div>
              ) : notifications.map((n: any) => {
                const st = typeStyle(n.type);
                const { Icon } = st;
                const clickable = !!onNotificationClick;
                return (
                  <button
                    key={n.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => {
                      if (!onNotificationClick) return;
                      setOpen(false);
                      // Auto mark-as-read on tap — optimistic local
                      // update first (UI feels instant) then fire
                      // POST /notifications/business/:id/read in the
                      // background. Server errors are swallowed; if
                      // it fails the counter self-corrects on next poll.
                      if (!n.is_read) {
                        setUnread(u => Math.max(0, u - 1));
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                        fetch(`${API_BASE}/notifications/business/${n.id}/read`, {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}` },
                        }).catch(() => {});
                      }
                      // Fire after the panel closes so the navigation
                      // transition isn't visually competing with the
                      // dropdown close animation.
                      setTimeout(() => onNotificationClick(n), 60);
                    }}
                    className={`relative pr-5 pl-4 py-3 flex gap-3 items-start w-full text-right ${!n.is_read ? st.tint : "bg-white"} ${clickable ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"}`}
                  >
                    {/* Left accent strip — carries the type colour so
                        the owner can scan red = cancel at a glance. */}
                    <span className={`absolute right-0 top-0 bottom-0 w-1 ${st.bar}`} aria-hidden />
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${st.iconCls}`} />
                    <div className="flex-1 min-w-0">
                      {st.label && (
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${st.labelCls} mb-1`}>
                          {st.label}
                        </span>
                      )}
                      <p className={`text-sm font-medium leading-snug break-words ${st.textCls}`}>{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(n.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  // Pre-fill the identifier from the last "remember me"-checked login to
  // this same screen. Stored under a BUSINESS-SPECIFIC key so client
  // portal and super-admin credentials never bleed over.
  const [identifier, setIdentifier] = useState(() => {
    try { return localStorage.getItem("kavati_biz_last_identifier") ?? ""; }
    catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { toast } = useToast();
  const loginMutation = useBusinessLogin();
  const [, navigate] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    // Super admin shortcut: username "admin" → redirect to super admin panel
    if (identifier.trim().toLowerCase() === "admin") {
      navigate("/super-admin");
      return;
    }
    if (!password) {
      toast({ title: "יש להזין סיסמה", variant: "destructive" });
      return;
    }
    loginMutation.mutate({ data: { email: identifier, password } }, {
      onSuccess: (data) => {
        if (rememberMe) {
          localStorage.setItem("biz_token", data.token);
          localStorage.setItem("kavati_biz_last_identifier", identifier.trim());
          sessionStorage.removeItem("biz_token");
        } else {
          sessionStorage.setItem("biz_token", data.token);
          localStorage.removeItem("biz_token");
          localStorage.removeItem("kavati_biz_last_identifier");
        }
        onLogin(data.token);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? "אימייל/טלפון או סיסמה שגויים";
        toast({ title: "כניסה נכשלה", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" dir="rtl">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center space-y-2 pb-6">
            <div className="flex justify-center">
              <img src="/logo.svg" alt="קבעתי" className="h-20 object-contain" />
            </div>
            <TodayCalendarIcon />
            <CardTitle className="text-2xl">כניסה לקבעתי</CardTitle>
            <CardDescription>הזן אימייל, מספר טלפון או שם משתמש</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label>אימייל / טלפון / שם משתמש</Label>
                <Input
                  required
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  dir="ltr"
                  name="kavati-biz-identifier"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label>סיסמה</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    dir="ltr"
                    name="kavati-biz-password"
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {!showForgotPassword ? (
                <button type="button" className="text-xs text-primary underline mt-1" onClick={() => setShowForgotPassword(true)}>
                  שכחתי סיסמא
                </button>
              ) : (
                <ForgotPasswordFlow onBack={() => setShowForgotPassword(false)} />
              )}
              {!showForgotPassword && (
                <>
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="remember-me"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer select-none">
                      זכור אותי במכשיר זה
                    </label>
                  </div>
                  <Button type="submit" className="w-full h-11" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? "מתחבר..." : "כניסה"}
                  </Button>
                </>
              )}
            </form>
            <div className="mt-5 text-center">
              <span className="text-sm text-muted-foreground">עדיין אין לך חשבון? </span>
              <button
                onClick={() => navigate("/register")}
                className="text-sm text-primary font-medium hover:underline"
              >
                הירשם עכשיו
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Weekly calendar ─────────────────────────────────────────────────────────
//
// Seven-day grid for the appointments tab. Groups appointments by date, paints
// each day as a tile, and overlays Israeli holidays (Jewish religious holidays
// + secular Israeli observances) from @hebcal/core. The goal is a clean,
// non-crowded overview of "what does the week actually look like" — not a
// drag-and-drop scheduler.

type WeeklyAppt = {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes?: number;
  clientName: string;
  serviceName: string;
  status: string;
};

function useIsraeliHolidaysForWeek(weekStart: Date): Map<string, string[]> {
  // Recompute when the week changes. Returns a map keyed by yyyy-MM-dd →
  // array of Hebrew holiday titles. We pass il:true for Israeli observances
  // and disable parsha / omer / candle-lighting so the map only contains
  // actual holidays, not weekly informational events.
  const key = format(weekStart, "yyyy-MM-dd");
  const [cache] = useState(() => new Map<string, Map<string, string[]>>());
  if (!cache.has(key)) {
    const weekEnd = addDays(weekStart, 6);
    const events = HebrewCalendar.calendar({
      start:  weekStart,
      end:    weekEnd,
      il:     true,
      locale: "he",
      sedrot:         false,
      omer:           false,
      candlelighting: false,
    } as any);
    const m = new Map<string, string[]>();
    for (const ev of events) {
      // Filter Rosh Chodesh + "Shabbat Mevarchim" via hebcal flags —
      // string-prefix check alone missed some rendered variants.
      const f = (ev as any).getFlags ? (ev as any).getFlags() : 0;
      if (f & (hebFlags as any).ROSH_CHODESH) continue;
      if (f & (hebFlags as any).SHABBAT_MEVARCHIM) continue;
      const name = ev.render("he");
      if (name.startsWith("ראש חודש")) continue;
      const d = ev.getDate().greg();
      const k = format(d, "yyyy-MM-dd");
      const existing = m.get(k) ?? [];
      existing.push(name);
      m.set(k, existing);
    }
    cache.set(key, m);
  }
  return cache.get(key)!;
}

// Add `minutes` to a "HH:mm" string and return the resulting "HH:mm".
// Wraps past midnight trivially (mod 24) — appointments don't run overnight
// so the edge case only matters cosmetically for near-midnight bookings.
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + (minutes || 0);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function WeeklyCalendar({ appointments }: { appointments: WeeklyAppt[] }) {
  // Default to the current calendar week (Sunday → Saturday per Israeli locale).
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const holidays = useIsraeliHolidaysForWeek(weekStart);

  // Group appointments by date once, so each tile lookup is O(1).
  const byDate = new Map<string, WeeklyAppt[]>();
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    const arr = byDate.get(a.appointmentDate) ?? [];
    arr.push(a);
    byDate.set(a.appointmentDate, arr);
  }
  for (const arr of byDate.values()) arr.sort((x, y) => x.appointmentTime.localeCompare(y.appointmentTime));

  const weekLabel = `${format(weekStart, "d בMMMM", { locale: he })} — ${format(addDays(weekStart, 6), "d בMMMM yyyy", { locale: he })}`;
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">📆 לוח שבועי</CardTitle>
          <CardDescription>{weekLabel}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeekStart(w => addDays(w, 7))}>
            <ChevronRight className="w-4 h-4" /> שבוע הבא
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>
            השבוע
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeekStart(w => addDays(w, -7))}>
            שבוע קודם <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Explicit dir="rtl" so CSS Grid reverses column order — Sunday on
            the right, Saturday on the left per Hebrew reading direction.
            The outer Dashboard wrapper is already rtl, but some Card
            children lose the direction inheritance, so we pin it here. */}
        <div dir="rtl" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map(d => {
            const key    = format(d, "yyyy-MM-dd");
            const list   = byDate.get(key) ?? [];
            const dayHolidays = holidays.get(key) ?? [];
            const isToday = key === today;
            const dayName = format(d, "EEEE", { locale: he });
            const dateLabel = format(d, "d בMMMM", { locale: he });

            return (
              <div
                key={key}
                className={`rounded-2xl border-2 p-3 flex flex-col gap-2 min-h-[140px] transition-colors ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"}`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{dayName}</span>
                  <span className="text-xs text-muted-foreground">{dateLabel}</span>
                </div>
                {dayHolidays.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dayHolidays.map((h, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        ✡ {h}
                      </span>
                    ))}
                  </div>
                )}
                {list.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">— אין תורים —</div>
                ) : (
                  <div className="space-y-1.5 flex-1">
                    {list.map(a => (
                      <div
                        key={a.id}
                        className={`rounded-lg px-2 py-1.5 text-xs border ${a.status === "pending" ? "bg-yellow-50 border-yellow-200" : a.status === "pending_payment" ? "bg-blue-50 border-blue-200" : "bg-muted/40 border-border"}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-semibold" dir="ltr">
                            {a.appointmentTime}{a.durationMinutes ? ` ~ ${addMinutesToTime(a.appointmentTime, a.durationMinutes)}` : ""}
                          </span>
                          <span className="truncate font-medium" dir="auto">{a.clientName}</span>
                        </div>
                        <div className="text-muted-foreground truncate" dir="auto">{a.serviceName}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentsTab({ mobileFocus }: { mobileFocus?: "calendar" | "approvals" } = {}) {
  const { data: stats } = useGetBusinessStats();
  const { data: appointments } = useListBusinessAppointments();
  const { data: profile } = useGetBusinessProfile();
  const { data: customers } = useListBusinessCustomers();
  // Services list → serviceId → color map for the calendar. Memoed so
  // calendar re-renders don't recompute this on every appointment tick.
  const { data: servicesForColors } = useListBusinessServices();
  // Time-off ("יום חופש" / constraint) blocks — shared with the
  // DayOffTab below via the same queryKey so adding a block there
  // lights up the calendar immediately. No generated hook exists for
  // this endpoint, so we call fetch directly.
  const { data: timeOff } = useQuery<TimeOffItem[]>({
    queryKey: ["time-off"],
    queryFn: async () => {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const r = await fetch("/api/business/time-off", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });
  const serviceColors = (() => {
    const m: Record<number, string | null> = {};
    for (const s of (Array.isArray(servicesForColors) ? servicesForColors : [])) {
      m[(s as any).id] = (s as any).color ?? null;
    }
    return m;
  })();
  const cancelMutation = useCancelBusinessAppointment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [cancelModal, setCancelModal] = useState<{ id: number } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Appointment-click edit dialog (opened by tapping a card inside the
  // new calendar view). Holds the selected appointment so we can show
  // details + the customer's reliability breakdown.
  const [editAppt, setEditAppt] = useState<CalAppt | null>(null);
  // When the owner taps "ערוך" on the details dialog we flip into an
  // inline edit form — date + time + notes via the same custom pickers
  // the new-entry dialog uses. Kept separate from `editAppt` so tapping
  // a card always opens the details view first.
  const [editApptMode, setEditApptMode] = useState(false);
  const [editApptForm, setEditApptForm] = useState({ date: "", time: "", notes: "" });
  const [editApptSaving, setEditApptSaving] = useState(false);
  // Clicking a time-off block on the calendar opens an edit/delete
  // dialog with the current values — owner can shift the date/time,
  // tweak the note, or delete the constraint outright.
  const [editTimeOff, setEditTimeOff] = useState<TimeOffItem | null>(null);
  // Manual "new appointment" dialog state — opened either from the "+"
  // button in the calendar header (empty defaults) or by clicking an
  // empty slot in the day/week grid (prefilled date + time).
  const [newApptDialog, setNewApptDialog] = useState<{ open: boolean; date?: string; time?: string; tab?: "appointment" | "timeoff" }>({ open: false });

  // Reschedule via drag: PATCH server, invalidate cache, optionally open
  // the owner's personal WhatsApp with a pre-filled message (per owner
  // preference: DON'T use the platform's automated template here).
  const handleReschedule = async (appt: CalAppt, newDate: string, newTime: string, sendNotif: boolean) => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    try {
      const res = await fetch(`/api/business/appointments/${appt.id}/reschedule`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDate, newTime }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "התור עודכן" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
      if (sendNotif) {
        openRescheduleWhatsApp(appt.phoneNumber, appt.clientName, (profile as any)?.name || "", newDate, newTime);
      }
    } catch {
      toast({ title: "שגיאה", description: "לא ניתן לעדכן את התור", variant: "destructive" });
    }
  };

  const requireApproval = (profile as any)?.requireAppointmentApproval ?? false;

  const handleApprove = async (id: number) => {
    setApprovingId(id);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`/api/business/appointments/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast({ title: "✅ התור אושר" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
    } catch {
      toast({ title: "שגיאה", description: "לא ניתן לאשר", variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const handleCancel = (id: number) => {
    setCancelReason("");
    setCancelModal({ id });
  };

  const confirmCancel = () => {
    if (!cancelModal) return;
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    fetch(`/api/business/appointments/${cancelModal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cancelReason }),
    }).then(r => {
      if (!r.ok) throw new Error();
      toast({ title: "הפגישה בוטלה" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBusinessStatsQueryKey() });
      setCancelModal(null);
    }).catch(() => toast({ title: "שגיאה", description: "לא ניתן לבטל", variant: "destructive" }));
  };

  const hardDeleteAppointment = async (id: number) => {
    setDeletingId(id);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`/api/business/appointments/${id}/permanent`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast({ title: "הפגישה נמחקה לצמיתות" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const now = new Date().toISOString().split("T")[0];
  const aptList = Array.isArray(appointments) ? appointments : [];
  const pending = aptList.filter(a => a.status === "pending");
  const pendingPayment = aptList.filter(a => a.status === "pending_payment");
  const upcoming = aptList.filter(a => a.appointmentDate >= now && a.status !== "pending" && a.status !== "cancelled" && a.status !== "pending_payment");
  const past = aptList.filter(a => a.appointmentDate < now && a.status !== "cancelled" && a.status !== "pending_payment");
  const cancelled = aptList.filter(a => a.status === "cancelled");

  const CANCEL_REASONS = ["ברז", "לקוח התחרט", "אחר"];

  return (
    <div className="space-y-6">
      {/* "פתח עמוד עסק" used to live here — moved to the global
          Navbar so it's reachable from every dashboard tab. */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { title: "סה״כ פגישות", value: stats?.totalAppointments ?? 0 },
          { title: "היום", value: stats?.todayCount ?? 0 },
          { title: "השבוע", value: stats?.thisWeekCount ?? 0 },
          { title: "פגישות עתידיות", value: stats?.upcomingCount ?? 0 },
        ].map(s => (
          <Card key={s.title} className="bg-primary/5 border-primary/10">
            <CardContent className="p-5">
              <div className="text-muted-foreground text-sm mb-1">{s.title}</div>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <span>⏳</span> ממתינים לאישור ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pending.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-yellow-200 rounded-xl bg-white gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{apt.clientName}
                      <span className="text-muted-foreground text-sm font-normal mr-2" dir="ltr">{apt.phoneNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {formatDuration(apt.durationMinutes)}</div>
                    <div className="text-yellow-700 font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
                    {apt.notes && (
                      // Client note shown before the approve/reject
                      // buttons so the owner has the full context of
                      // what the client wrote when deciding what to do.
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="whitespace-pre-wrap break-words">{apt.notes}</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(apt.id)} disabled={approvingId === apt.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white border border-green-700 transition-all disabled:opacity-60"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> {approvingId === apt.id ? "מאשר..." : "אשר"}
                    </button>
                    <button
                      onClick={() => handleCancel(apt.id)} disabled={cancelMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" /> דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingPayment.length > 0 && (
        <Card className="border-blue-300 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <span>💳</span> ממתינים לתשלום ({pendingPayment.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingPayment.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-blue-200 rounded-xl bg-white gap-3">
                  <div className="flex-1">
                    <div className="font-semibold">{apt.clientName}
                      <span className="text-muted-foreground text-sm font-normal mr-2" dir="ltr">{apt.phoneNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {formatDuration(apt.durationMinutes)}</div>
                    <div className="text-blue-700 font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancel(apt.id)} disabled={cancelMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all disabled:opacity-60"
                  >
                    <X className="w-3.5 h-3.5" /> בטל
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>פגישות קרובות</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length ? (
            <div className="space-y-3">
              {upcoming.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl bg-card gap-3 hover:border-primary/40 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      {apt.clientName}
                      <span className="text-muted-foreground text-sm font-normal" dir="ltr">{apt.phoneNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {formatDuration(apt.durationMinutes)}</div>
                    <div className="text-primary font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
                    {apt.notes && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="whitespace-pre-wrap break-words">{apt.notes}</div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleCancel(apt.id)} disabled={cancelMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all disabled:opacity-60"
                  >
                    <X className="w-3.5 h-3.5" /> ביטול
                  </button>
                </div>
              ))}
            </div>
          ) : <EmptyState text="אין פגישות קרובות" />}
        </CardContent>
      </Card>

      {/* Weekly calendar — 7-day overview with Israeli holidays */}
      {/* New business calendar — month / week / day with drag-to-reschedule.
          Click an appointment → opens a details dialog with the customer's
          reliability breakdown. Drag → opens the reschedule confirm dialog. */}
      <BusinessCalendar
        appointments={aptList as unknown as CalAppt[]}
        timeOff={timeOff ?? []}
        onApptClick={setEditAppt}
        onTimeOffClick={setEditTimeOff}
        onTimeOffReschedule={async (t, newDate, newStartTime, newEndTime) => {
          const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
          try {
            const body: any = { date: newDate };
            if (t.fullDay) {
              body.fullDay = true;
            } else {
              body.fullDay = false;
              if (newStartTime) body.startTime = newStartTime;
              if (newEndTime)   body.endTime   = newEndTime;
            }
            const r = await fetch(`/api/business/time-off/${t.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error();
            toast({ title: "האילוץ הועבר" });
            queryClient.invalidateQueries({ queryKey: ["time-off"] });
          } catch {
            toast({ title: "שגיאה בהעברת האילוץ", variant: "destructive" });
          }
        }}
        onRescheduleServer={handleReschedule}
        serviceColors={serviceColors}
        onNewAppointment={opts => setNewApptDialog({ open: true, date: opts?.date, time: opts?.time, tab: "appointment" })}
        onNewTimeOff={opts => setNewApptDialog({ open: true, date: opts?.date, time: opts?.time, tab: "timeoff" })}
      />

      <TimeOffEditDialog
        item={editTimeOff}
        onClose={() => setEditTimeOff(null)}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ["time-off"] });
        }}
      />

      <NewAppointmentDialog
        open={newApptDialog.open}
        onOpenChange={v => setNewApptDialog(s => ({ ...s, open: v }))}
        services={(Array.isArray(servicesForColors) ? servicesForColors : []).map((s: any) => ({
          id: s.id, name: s.name, durationMinutes: s.durationMinutes,
        }))}
        customers={(Array.isArray(customers) ? customers : []).map((c: any) => ({
          clientName: c.clientName, phoneNumber: c.phoneNumber,
        }))}
        initialDate={newApptDialog.date}
        initialTime={newApptDialog.time}
        initialTab={newApptDialog.tab}
        onCreated={(tab) => {
          queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBusinessStatsQueryKey() });
          // Time-off entries are surfaced in the calendar through the
          // same time-off query the Working Hours tab reads from.
          if (tab === "timeoff") {
            queryClient.invalidateQueries({ queryKey: ["time-off"] });
          }
        }}
      />

      {/* Keep the legacy weekly mini-grid below for quick overview.
          Using the existing summary-style tile grid — removed for now
          since the new calendar supersedes it. */}

      {/* Appointment edit / details dialog (opened by tapping a card).
          Has two modes: read-only details (default) and an inline edit
          form toggled by the "ערוך" button. Edit mode reschedules via
          the existing /reschedule endpoint and patches notes via the
          new PATCH /business/appointments/:id. */}
      <Dialog
        open={!!editAppt}
        onOpenChange={v => { if (!v) { setEditAppt(null); setEditApptMode(false); } }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editApptMode ? "עריכת תור" : "פרטי התור"}</DialogTitle>
          </DialogHeader>
          {editAppt && (() => {
            const custs = Array.isArray(customers) ? customers : [];
            const cust = custs.find(c => c.phoneNumber === editAppt.phoneNumber) as any;
            const totalVisits = cust?.totalVisits ?? 0;
            const noShowCount = cust?.noShowCount ?? 0;
            const cancelledCount = cust?.cancelledCount ?? 0;
            const [y, m, d] = editAppt.appointmentDate.split("-");

            if (editApptMode) {
              const originalDate = editAppt.appointmentDate;
              const originalTime = editAppt.appointmentTime;
              const originalNotes = editAppt.notes ?? "";
              const handleSaveEdit = async () => {
                const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
                setEditApptSaving(true);
                try {
                  // 1) Reschedule if date/time changed.
                  if (editApptForm.date !== originalDate || editApptForm.time !== originalTime) {
                    const rs = await fetch(`/api/business/appointments/${editAppt.id}/reschedule`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ newDate: editApptForm.date, newTime: editApptForm.time }),
                    });
                    if (!rs.ok) throw new Error();
                  }
                  // 2) Patch notes if changed.
                  if ((editApptForm.notes ?? "") !== originalNotes) {
                    const pr = await fetch(`/api/business/appointments/${editAppt.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ notes: editApptForm.notes || null }),
                    });
                    if (!pr.ok) throw new Error();
                  }
                  toast({ title: "התור עודכן" });
                  queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetBusinessStatsQueryKey() });
                  setEditAppt(null);
                  setEditApptMode(false);
                } catch {
                  toast({ title: "שגיאה בעדכון התור", variant: "destructive" });
                } finally {
                  setEditApptSaving(false);
                }
              };
              return (
                <div className="space-y-4 text-sm">
                  <div className="space-y-1">
                    <div className="font-bold text-lg">{editAppt.clientName}</div>
                    <div className="text-muted-foreground" dir="ltr">{editAppt.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground">{editAppt.serviceName} · {formatDuration(editAppt.durationMinutes)}</div>
                  </div>
                  <div className="space-y-1">
                    <Label>תאריך</Label>
                    <DatePickerField value={editApptForm.date} onChange={v => setEditApptForm(p => ({ ...p, date: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>שעה</Label>
                    <TimePickerField value={editApptForm.time} onChange={v => setEditApptForm(p => ({ ...p, time: v }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>הערה</Label>
                    <textarea
                      value={editApptForm.notes}
                      onChange={e => setEditApptForm(p => ({ ...p, notes: e.target.value }))}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      placeholder="הערה פנימית על התור…"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setEditApptMode(false)}
                      disabled={editApptSaving}
                    >
                      ביטול עריכה
                    </Button>
                    <Button className="flex-1" onClick={handleSaveEdit} disabled={editApptSaving}>
                      {editApptSaving ? "שומר..." : "שמור שינויים"}
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-4 text-sm">
                <div className="space-y-1">
                  <div className="font-bold text-lg">{editAppt.clientName}</div>
                  <div className="text-muted-foreground" dir="ltr">{editAppt.phoneNumber}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-muted/40">
                    <div className="text-xs text-muted-foreground">שירות</div>
                    <div className="font-semibold">{editAppt.serviceName}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40">
                    <div className="text-xs text-muted-foreground">משך</div>
                    <div className="font-semibold">{formatDuration(editAppt.durationMinutes)}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40">
                    <div className="text-xs text-muted-foreground">תאריך</div>
                    <div className="font-semibold" dir="ltr">{d}/{m}/{y}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40">
                    <div className="text-xs text-muted-foreground">שעה</div>
                    <div className="font-semibold" dir="ltr">{editAppt.appointmentTime}</div>
                  </div>
                </div>
                {editAppt.notes && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <div className="text-xs font-semibold mb-1">הערה</div>
                    <div>{editAppt.notes}</div>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">היסטוריית לקוח</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                      ✓ {totalVisits} הגיע/ה
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
                      🚫 {noShowCount} ברזים
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-100">
                      ↩️ {cancelledCount} ביטולים
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditAppt(null)}>סגור</Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setEditApptForm({ date: editAppt.appointmentDate, time: editAppt.appointmentTime, notes: editAppt.notes ?? "" });
                      setEditApptMode(true);
                    }}
                  >
                    <Edit className="w-4 h-4" /> ערוך
                  </Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => { setEditAppt(null); handleCancel(editAppt.id); }}
                  >
                    בטל תור
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {past.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-muted-foreground">פגישות שעברו</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {past.slice(-10).reverse().map(apt => (
                <div key={apt.id} className="flex justify-between items-center p-3 border rounded-lg opacity-60 text-sm">
                  <span>{apt.clientName} • {apt.serviceName}</span>
                  <span className="text-muted-foreground">{apt.appointmentDate} {apt.appointmentTime}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* "פגישות שבוטלו" block was removed per owner feedback — the
          same data surfaces in the Customers view (per-client counters
          + drill-down) and cluttering the main appointments tab with
          it was redundant. */}

      {/* Cancel reason modal */}
      <Dialog open={!!cancelModal} onOpenChange={open => { if (!open) setCancelModal(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>סיבת ביטול</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {CANCEL_REASONS.map(r => (
              <button
                key={r}
                onClick={() => setCancelReason(r)}
                className={`w-full text-right px-4 py-3 rounded-xl border-2 font-medium transition-all text-sm ${cancelReason === r ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40"}`}
              >
                {r === "ברז" ? "🚫 דפק ברז — לא הגיע" : r === "לקוח התחרט" ? "↩️ לקוח התחרט" : "💬 אחר"}
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelModal(null)}>ביטול</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={confirmCancel} disabled={!cancelReason}>
                אשר ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Home tab — the first thing the owner sees on login ────────────────────
// Consolidates: share link banner, day-at-a-glance stats, pending-approvals
// shortcut, next few upcoming appointments, quick actions, and the Kavati
// team news feed. Goal: every common task < 1 tap from the home.
// מה חדש בקבעתי — עדכונים בעברית בלבד. כל פיצ'ר חדש מתווסף כאן
// כשהוא עולה לפרודקשן, כך שבעלי העסקים רואים את ההתקדמות מיד
// כשהם פותחים את המערכת. הסדר: החדש ביותר למעלה.
const KAVATI_UPDATES: Array<{ date: string; title: string; body: string; tag?: string }> = [
  {
    date: "17/04/2026",
    title: "עמוד בית חדש לניהול העסק",
    body: "מרכז מהיר עם הלינק לשיתוף, סיכום היום, התורים הקרובים, קיצורים לאישורים ולהגדרות, ועדכונים מצוות קבעתי.",
    tag: "חדש",
  },
  {
    date: "17/04/2026",
    title: "התאמה אוטומטית של תמונה בשיתוף",
    body: "כל לוגו שהעלאתם — בכל גודל ומכל ספק אחסון — מותאם אוטומטית לגודל המתאים כך שמופיע נקי בתצוגה המקדימה של וואטסאפ.",
    tag: "חדש",
  },
  {
    date: "17/04/2026",
    title: "דומיין מותאם → שיתוף נכון",
    body: "אם יש לכם דומיין משלכם (למשל book.yourshop.co.il), השיתוף שלו כבר מציג את הלוגו ופרטי העסק — לא עמוד כללי.",
  },
  {
    date: "16/04/2026",
    title: "סדר שירותים בגרירה",
    body: "פשוט גוררים כל שירות למעלה או למטה כדי לקבוע את הסדר שבו הוא יופיע בעמוד העסק ללקוחות.",
  },
  {
    date: "16/04/2026",
    title: "מחיר 'החל מ-'",
    body: "בעריכת שירות אפשר לסמן שהמחיר הוא 'החל מ-' — טוב לשירותים שמחירם משתנה לפי הלקוח.",
  },
  {
    date: "15/04/2026",
    title: "צבע לכל שירות ביומן",
    body: "אפשר להגדיר צבע אישי לכל שירות, וכל כרטיס תור ביומן יצבע בצבע של השירות — מזהים סוג תור במבט אחד.",
  },
  {
    date: "15/04/2026",
    title: "יומן עם שלוש תצוגות",
    body: "לוח שנה חדש עם מעבר חלק בין יום, שבוע וחודש. גרירה להזזת תור, חיפוש לקוח לפי שם, וכפתור 'חזור להיום' בכל מסך.",
  },
  {
    date: "14/04/2026",
    title: "ביקורות מלקוחות",
    body: "הלקוחות מחוברים ומשאירים ביקורת עם דירוג של חמישה כוכבים בפרופיל העסק. התראה אוטומטית כשמתקבלת ביקורת חדשה.",
  },
  {
    date: "14/04/2026",
    title: "פורטל לקוח חדש",
    body: "הלקוחות רואים את התורים הקרובים, ההיסטוריה, והעסקים שהזמינו מהם — הכל במקום אחד עם חיבור מהיר.",
  },
];

function HomeTab({ onJump }: { onJump: (tab: string) => void }) {
  const { data: profile } = useGetBusinessProfile();
  const { data: appointments } = useListBusinessAppointments();
  const { data: stats } = useGetBusinessStats();

  const aptList = Array.isArray(appointments) ? appointments : [];
  const now = new Date().toISOString().split("T")[0];
  const pending = aptList.filter(a => a.status === "pending");
  const upcoming = aptList
    .filter(a => a.appointmentDate >= now && a.status !== "pending" && a.status !== "cancelled" && a.status !== "pending_payment")
    .sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime))
    .slice(0, 5);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
  })();

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <div className="text-sm text-muted-foreground">{greeting}</div>
        <h2 className="text-2xl font-bold">{(profile as any)?.ownerName?.split(" ")[0] ?? profile?.name ?? ""}</h2>
      </div>

      {/* Share-link banner — primary CTA for new owners */}
      {profile?.slug && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-primary">
              <span>🔗</span> הלינק שלך לקביעת תורים
            </CardTitle>
            <CardDescription>
              שלח/י את הלינק הזה ללקוחות. בשיתוף ב־ווצאפ תופיע תמונה ופרטי העסק.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyLinkButton slug={profile.slug} />
          </CardContent>
        </Card>
      )}

      {/* Stats mini grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "היום", value: stats?.todayCount ?? 0, tone: "bg-blue-50 text-blue-700 border-blue-200" },
          { label: "השבוע", value: stats?.thisWeekCount ?? 0, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
          { label: "עתידיים", value: stats?.upcomingCount ?? 0, tone: "bg-sky-50 text-sky-700 border-sky-200" },
          { label: "ממתינים לאישור", value: pending.length, tone: "bg-amber-50 text-amber-700 border-amber-200" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border px-3 py-3 ${s.tone}`}>
            <div className="text-2xl font-extrabold">{s.value}</div>
            <div className="text-xs font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pending approvals shortcut */}
      {pending.length > 0 && (
        <button
          type="button"
          onClick={() => onJump("approvals")}
          className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors text-right"
        >
          <div>
            <div className="font-bold text-amber-900">יש לך {pending.length} תור/ים שמחכים לאישור</div>
            <div className="text-xs text-amber-700 mt-0.5">לחצי כדי לראות ולאשר</div>
          </div>
          <ChevronLeft className="w-5 h-5 text-amber-700 shrink-0" />
        </button>
      )}

      {/* Next upcoming appointments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">פגישות הקרובות</CardTitle>
          <button onClick={() => onJump("appointments")} className="text-xs font-semibold text-primary hover:underline">
            לכל הפגישות ←
          </button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <EmptyState text="אין פגישות קרובות" />
          ) : (
            <div className="space-y-2">
              {upcoming.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border hover:border-primary/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{a.clientName}</span>
                      {a.notes && (
                        <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="יש הערה" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{a.serviceName}</div>
                  </div>
                  <div className="text-sm text-primary font-mono shrink-0" dir="ltr">
                    {a.appointmentDate.slice(5)} · {a.appointmentTime}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div>
        <h3 className="font-semibold text-sm text-muted-foreground mb-2">פעולות מהירות</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { tab: "services",  label: "שירותים",    icon: <Briefcase className="w-5 h-5" /> },
            { tab: "hours",     label: "שעות עבודה", icon: <Clock className="w-5 h-5" /> },
            { tab: "customers", label: "לקוחות",     icon: <Users className="w-5 h-5" /> },
            { tab: "branding",  label: "עיצוב",      icon: <Palette className="w-5 h-5" /> },
          ].map(qa => (
            <button
              key={qa.tab}
              type="button"
              onClick={() => onJump(qa.tab)}
              className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-sm font-medium"
            >
              <span className="text-primary">{qa.icon}</span>
              <span>{qa.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kavati team updates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>📣</span> מה חדש מצוות קבעתי
          </CardTitle>
          <CardDescription className="text-xs">עדכונים אחרונים ותכונות חדשות</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {KAVATI_UPDATES.map((u, i) => (
              <li key={i} className="border-r-2 border-primary/40 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{u.title}</span>
                  {u.tag && <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">{u.tag}</span>}
                  <span className="text-[11px] text-muted-foreground ms-auto" dir="ltr">{u.date}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">{u.body}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// Dedicated "אישור תורים" view — shows ONLY appointments with
// status='pending', each with inline approve + reject buttons. Owner
// reaches it by tapping the bottom-nav badge; the full appointments
// tab still lists them too, but this view avoids any scrolling and
// puts triage in one tight card.
function PendingApprovalsTab() {
  const { data: appointments } = useListBusinessAppointments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const pending = (Array.isArray(appointments) ? appointments : []).filter(a => a.status === "pending");

  const token = () => localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");

  const approve = async (id: number) => {
    setApprovingId(id);
    try {
      const r = await fetch(`/api/business/appointments/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok) throw new Error();
      toast({ title: "✅ התור אושר" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
    } catch {
      toast({ title: "שגיאה", description: "לא ניתן לאשר", variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const reject = async (id: number) => {
    setRejectingId(id);
    try {
      const r = await fetch(`/api/business/appointments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cancelReason: "לקוח התחרט" }),
      });
      if (!r.ok) throw new Error();
      toast({ title: "התור נדחה" });
      queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
    } catch {
      toast({ title: "שגיאה", description: "לא ניתן לדחות", variant: "destructive" });
    } finally {
      setRejectingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle className="w-5 h-5 text-primary" /> אישור תורים
            {pending.length > 0 && (
              <span className="ms-auto text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {pending.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            תורים שנקבעו ע"י לקוחות וממתינים לאישור שלך.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState text="אין תורים ממתינים לאישור 🎉" />
          ) : (
            <div className="space-y-3">
              {pending.map(apt => {
                const dateStr = format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he });
                return (
                  <div key={apt.id} className="p-4 rounded-2xl border border-yellow-200 bg-yellow-50/40 space-y-3">
                    <div>
                      <div className="font-bold">{apt.clientName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{apt.phoneNumber}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {apt.serviceName} • {formatDuration(apt.durationMinutes)}
                      </div>
                      <div className="text-sm text-yellow-800 font-semibold mt-1">
                        {dateStr} • {apt.appointmentTime}
                      </div>
                      {apt.notes && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div className="whitespace-pre-wrap break-words">{apt.notes}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approve(apt.id)}
                        disabled={approvingId === apt.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-60"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {approvingId === apt.id ? "מאשר..." : "אשר"}
                      </button>
                      <button
                        onClick={() => reject(apt.id)}
                        disabled={rejectingId === apt.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition disabled:opacity-60"
                      >
                        <X className="w-4 h-4" />
                        {rejectingId === apt.id ? "דוחה..." : "דחה"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ServicesTab() {
  const { data: services } = useListBusinessServices();
  const { data: profile } = useGetBusinessProfile();
  const createMutation = useCreateBusinessService();
  const updateMutation = useUpdateBusinessService();
  const deleteMutation = useDeleteBusinessService();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const imageUpload = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", price: "", priceStartsFrom: false, durationHours: "0", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "", description: "", color: "" });

  const activeServices = Array.isArray(services) ? services.filter(s => s.isActive) : [];
  const isPro = profile?.subscriptionPlan !== "free";
  const atLimit = !isPro && activeServices.length >= FREE_SERVICE_LIMIT;

  const reset = () => {
    setForm({ name: "", price: "", priceStartsFrom: false, durationHours: "0", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "", description: "", color: "" });
    setIsAdding(false);
    setEditingId(null);
    imageUpload.reset?.();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const imageUrl = imageUpload.url || form.imageUrl || null;
    const data = {
      name: form.name,
      price: Math.round(parseFloat(form.price) * 100),
      priceStartsFrom: form.priceStartsFrom,
      // Combine hours + minutes into total minutes stored on the row.
      // Guard against bad input: empty strings → 0; negative → 0.
      durationMinutes: Math.max(0, (parseInt(form.durationHours) || 0) * 60 + (parseInt(form.durationMinutes) || 0)),
      bufferMinutes: parseInt(form.bufferMinutes),
      imageUrl,
      description: form.description || null,
      color: form.color || null,
    } as any;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { ...data, isActive: form.isActive } as any }, {
        onSuccess: async () => {
          toast({ title: "עודכן" });
          await queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey(), refetchType: "active" });
          reset();
        },
        onError: (err: any) => {
          toast({
            title: "שגיאה בעדכון שירות",
            description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
            variant: "destructive",
          });
        },
      });
    } else {
      createMutation.mutate({ data }, {
        onSuccess: () => { toast({ title: "נוסף" }); queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey() }); reset(); },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? "שגיאה בהוספת שירות";
          toast({ title: "לא ניתן להוסיף שירות", description: msg, variant: "destructive" });
        },
      });
    }
  };

  return (
    <>
    {/* Share-link callout — same as the home tab. Placed at the top
        of Services so owners discover it while managing their offering. */}
    {profile?.slug && (
      <Card className="border-primary/40 bg-primary/5 mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-primary">
            <span>🔗</span> הלינק שלך לקביעת תורים
          </CardTitle>
          <CardDescription>
            שלח/י את הלינק הזה ללקוחות. בשיתוף ב־WhatsApp תופיע תמונה ופרטי העסק.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyLinkButton slug={profile.slug} />
        </CardContent>
      </Card>
    )}
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle>ניהול שירותים</CardTitle>
          <CardDescription>
            הוסף ועדכן שירותים עם מחיר, משך זמן, תמונה וזמן מאגר
            {!isPro && <span className="mr-2 text-amber-600 font-medium">({activeServices.length}/{FREE_SERVICE_LIMIT} שירותים במנוי חינמי)</span>}
          </CardDescription>
        </div>
        {!isAdding && !editingId && (
          <Button
            onClick={() => {
              if (atLimit) { toast({ title: "הגעת למגבלת השירותים", description: `המנוי החינמי מאפשר עד ${FREE_SERVICE_LIMIT} שירותים פעילים. שדרג לפרו.`, variant: "destructive" }); return; }
              setIsAdding(true);
            }}
            size="sm" className="gap-1.5"
            variant={atLimit ? "outline" : "default"}
          >
            <Plus className="w-4 h-4" /> הוסף שירות
            {atLimit && <Crown className="w-3.5 h-3.5 text-blue-500 mr-1" />}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {atLimit && !isAdding && !editingId && (
          <div className="flex items-center gap-3 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-sm">
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-amber-700">הגעת למגבלת {FREE_SERVICE_LIMIT} שירותים במנוי החינמי. <span className="font-semibold">שדרג לפרו</span> לשירותים ללא הגבלה.</span>
          </div>
        )}
        {(isAdding || editingId) && (
          <form onSubmit={handleSave} className="bg-muted/50 p-5 rounded-xl mb-6 space-y-4 border">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>שם השירות *</Label>
                <Input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="לדוגמה: תספורת + פן" />
              </div>
              <div className="space-y-2">
                <Label>מחיר (₪) *</Label>
                <Input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0" />
                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.priceStartsFrom}
                    onChange={e => setForm(p => ({ ...p, priceStartsFrom: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-xs text-muted-foreground">המחיר הוא "החל מ-" (לא קבוע)</span>
                </label>
              </div>
              <div className="space-y-2">
                <Label>משך השירות *</Label>
                <div className="flex gap-2" dir="rtl">
                  <div className="flex-1">
                    <Input type="number" min="0" max="23" step="1"
                      value={form.durationHours}
                      onChange={e => setForm(p => ({ ...p, durationHours: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground mt-1 text-center">שעות</p>
                  </div>
                  <div className="flex-1">
                    <Input type="number" min="0" max="59" step="5"
                      value={form.durationMinutes}
                      onChange={e => setForm(p => ({ ...p, durationMinutes: e.target.value }))} />
                    <p className="text-[11px] text-muted-foreground mt-1 text-center">דקות</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>זמן הפסקה לאחר השירות (דקות)</Label>
                <Input type="number" min="0" step="5" value={form.bufferMinutes} onChange={e => setForm(p => ({ ...p, bufferMinutes: e.target.value }))} />
                <p className="text-xs text-muted-foreground">זמן קצוב לניקיון/מנוחה לאחר השירות</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>תיאור השירות (אופציונלי)</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="כתבו תיאור קצר של השירות..."
                />
                <p className="text-xs text-muted-foreground">יוצג בעמוד הפרופיל של העסק</p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> תמונת שירות</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) { imageUpload.upload(e.target.files[0]); e.target.value = ""; } }}
                />
                {(imageUpload.url || form.imageUrl) ? (
                  <div className="relative w-40 h-28 rounded-lg overflow-hidden border">
                    <img src={imageUpload.url || form.imageUrl} alt="שירות" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => { imageUpload.reset(); setForm(p => ({ ...p, imageUrl: "" })); }}
                      className="absolute top-1 left-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-black/80">×</button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-10 px-4"
                    disabled={imageUpload.isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    {imageUpload.isUploading ? "מעלה תמונה..." : "בחר תמונה"}
                  </Button>
                )}
                {imageUpload.error && <p className="text-xs text-destructive">{imageUpload.error}</p>}
                <p className="text-xs text-muted-foreground">תמונה תוצג בעמוד ההזמנות ובלוח הבקרה</p>
              </div>

              {/* Service color — painted onto appointment cards in the
                  calendar so the owner can tell services apart at a
                  glance. Palette is curated for light-on-dark contrast;
                  "ללא צבע" falls back to the dashboard's default. */}
              <div className="space-y-2 sm:col-span-2">
                <Label className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-3.5 rounded-full border" style={{ background: form.color || "transparent" }} />
                  צבע שירות ביומן
                </Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "#3c92f0", "#1e6fcf", "#95dbf4", "#06b6d4",
                    "#a855f7", "#ec4899", "#f43f5e", "#ef4444",
                    "#f59e0b", "#eab308", "#84cc16", "#22c55e",
                    "#10b981", "#14b8a6", "#64748b", "#1f2937",
                  ].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, color: c }))}
                      aria-label={`בחר צבע ${c}`}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110 shadow-md" : "border-transparent hover:scale-105"}`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, color: "" }))}
                    className={`h-8 px-3 rounded-full border text-xs font-medium transition-all ${!form.color ? "border-foreground bg-foreground/5" : "border-border text-muted-foreground hover:border-foreground/40"}`}
                  >
                    ללא צבע
                  </button>
                </div>
              </div>
              {editingId && (
                <div className="space-y-2 flex flex-col justify-end">
                  <Label>סטטוס</Label>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
                    <span className="text-sm">{form.isActive ? "פעיל" : "לא פעיל"}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={reset}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border bg-muted/40 hover:bg-muted text-muted-foreground transition-all">
                ביטול
              </button>
              <Button type="submit" className="rounded-xl px-5" disabled={createMutation.isPending || updateMutation.isPending || imageUpload.isUploading}>שמור</Button>
            </div>
          </form>
        )}
        {services && services.length > 1 && (
          <p className="text-xs text-muted-foreground mb-2">
            💡 ניתן להזיז שירותים בגרירה (ידית ⋮⋮) כדי לקבוע את הסדר בעמוד העסק
          </p>
        )}
        <ServiceSortableList
          services={Array.isArray(services) ? services : []}
          emptyFallback={!services?.length && !isAdding ? <EmptyState text="אין שירותים מוגדרים עדיין" className="col-span-full" /> : null}
          onEdit={s => {
            setEditingId(s.id);
            setForm({
              name: s.name,
              price: (s.price / 100).toString(),
              priceStartsFrom: (s as any).priceStartsFrom ?? false,
              // Split stored total minutes back into hours + minutes
              // for the two-field form.
              durationHours: Math.floor((s.durationMinutes ?? 0) / 60).toString(),
              durationMinutes: ((s.durationMinutes ?? 0) % 60).toString(),
              bufferMinutes: (s.bufferMinutes ?? 0).toString(),
              isActive: s.isActive,
              imageUrl: s.imageUrl ?? "",
              description: (s as any).description ?? "",
              color: (s as any).color ?? "",
            });
            setIsAdding(false);
          }}
          onDelete={s => { if (confirm("למחוק שירות?")) deleteMutation.mutate({ id: s.id }, {
            onSuccess: () => { toast({ title: "שירות נמחק" }); queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey() }); },
            onError: (err: any) => toast({ title: "שגיאה במחיקה", description: err?.response?.data?.message ?? err?.message ?? "נסה שוב", variant: "destructive" }),
          }); }}
          onReorder={async (newList) => {
            try {
              // Rewrite sortOrder across the whole list (newList[i].sortOrder = i).
              // Simpler than swapping neighbours because a drag can jump many
              // positions. Fires every PATCH in parallel and invalidates the
              // cache once.
              await Promise.all(newList.map((s, i) =>
                updateMutation.mutateAsync({ id: s.id, data: { sortOrder: i } as any })
              ));
              await queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey(), refetchType: "active" });
            } catch {
              toast({ title: "שגיאה בעדכון סדר השירותים", variant: "destructive" });
            }
          }}
        />
      </CardContent>
      </Card>

      {/* Booking restrictions — moved here from Settings per owner's
          request (it belongs with services, not under general settings). */}
      <BookingRestrictionsCard />
    </>
  );
}

function BookingRestrictionsCard() {
  const { data: profile } = useGetBusinessProfile();
  const updateMutation = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    minLeadHours:                "0",
    cancellationHours:           "0",
    maxFutureWeeks:              "15",
    futureBookingMode:           "weeks" as "weeks" | "date",
    maxFutureDate:               "",
    maxAppointmentsPerCustomer:  "",
    requireActiveSubscription:   false,
    maxAppointmentsPerDay:       "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        minLeadHours:                ((profile as any).minLeadHours ?? 0).toString(),
        cancellationHours:           ((profile as any).cancellationHours ?? 0).toString(),
        maxFutureWeeks:              ((profile as any).maxFutureWeeks ?? 15).toString(),
        futureBookingMode:           ((profile as any).futureBookingMode ?? "weeks") as "weeks" | "date",
        maxFutureDate:               (profile as any).maxFutureDate ?? "",
        maxAppointmentsPerCustomer:  ((profile as any).maxAppointmentsPerCustomer ?? "").toString(),
        requireActiveSubscription:   (profile as any).requireActiveSubscription ?? false,
        maxAppointmentsPerDay:       ((profile as any).maxAppointmentsPerDay ?? "").toString(),
      });
    }
  }, [profile]);

  const save = () => {
    updateMutation.mutate({
      data: {
        minLeadHours:               parseInt(form.minLeadHours) || 0,
        cancellationHours:          parseInt(form.cancellationHours) || 0,
        maxFutureWeeks:             parseInt(form.maxFutureWeeks) || 15,
        futureBookingMode:          form.futureBookingMode,
        maxFutureDate:              form.maxFutureDate || null,
        maxAppointmentsPerCustomer: form.maxAppointmentsPerCustomer ? parseInt(form.maxAppointmentsPerCustomer) : null,
        requireActiveSubscription:  form.requireActiveSubscription,
        maxAppointmentsPerDay:      form.maxAppointmentsPerDay ? parseInt(form.maxAppointmentsPerDay) : null,
      } as any,
    }, {
      onSuccess: async (updated) => {
        toast({ title: "הגבלות נשמרו" });
        await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey(), refetchType: "active" });
        // Echo server response into local state so UI reflects exactly what was saved
        if (updated) {
          const u = updated as any;
          setForm({
            minLeadHours:                (u.minLeadHours ?? 0).toString(),
            cancellationHours:           (u.cancellationHours ?? 0).toString(),
            maxFutureWeeks:              (u.maxFutureWeeks ?? 15).toString(),
            futureBookingMode:           (u.futureBookingMode ?? "weeks") as "weeks" | "date",
            maxFutureDate:               u.maxFutureDate ?? "",
            maxAppointmentsPerCustomer:  (u.maxAppointmentsPerCustomer ?? "").toString(),
            requireActiveSubscription:   u.requireActiveSubscription ?? false,
            maxAppointmentsPerDay:       (u.maxAppointmentsPerDay ?? "").toString(),
          });
        }
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירה",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">🚫</span> הגבלות בקביעת תורים
        </CardTitle>
        <CardDescription>קבע מגבלות זמן וכמות עבור לקוחות</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Lead time */}
        <div className="p-4 border rounded-xl bg-muted/20 space-y-3">
          <div className="font-medium text-sm">זמן לפני קביעה</div>
          <p className="text-xs text-muted-foreground">לקוחות צריכים לקבוע תור מינימום <strong>{form.minLeadHours} שעות</strong> מראש</p>
          <div className="flex items-center gap-3">
            <Input type="number" min="0" max="168" step="1" value={form.minLeadHours}
              onChange={e => setForm(p => ({ ...p, minLeadHours: e.target.value }))}
              className="w-28 text-center" />
            <span className="text-sm text-muted-foreground">שעות</span>
          </div>
        </div>

        {/* Cancellation */}
        <div className="p-4 border rounded-xl bg-muted/20 space-y-3">
          <div className="font-medium text-sm">זמן ביטול</div>
          <p className="text-xs text-muted-foreground">לקוחות יכולים לבטל תור עד <strong>{form.cancellationHours} שעות</strong> לפני התור</p>
          <div className="flex items-center gap-3">
            <Input type="number" min="0" max="168" step="1" value={form.cancellationHours}
              onChange={e => setForm(p => ({ ...p, cancellationHours: e.target.value }))}
              className="w-28 text-center" />
            <span className="text-sm text-muted-foreground">שעות</span>
          </div>
        </div>

        {/* Future booking */}
        <div className="p-4 border rounded-xl bg-muted/20 space-y-3">
          <div className="font-medium text-sm">קביעה עתידית</div>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => setForm(p => ({ ...p, futureBookingMode: "weeks" }))}
              className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${form.futureBookingMode === "weeks" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
              שבועות קדימה
            </button>
            <button type="button"
              onClick={() => setForm(p => ({ ...p, futureBookingMode: "date" }))}
              className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${form.futureBookingMode === "date" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
              עד תאריך (כולל)
            </button>
          </div>
          {form.futureBookingMode === "weeks" ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">לקוחות יכולים לקבוע תורים עד <strong>{form.maxFutureWeeks} שבועות</strong> מהיום</p>
              <div className="flex items-center gap-3">
                <Input type="number" min="1" max="52" value={form.maxFutureWeeks}
                  onChange={e => setForm(p => ({ ...p, maxFutureWeeks: e.target.value }))}
                  className="w-28 text-center" />
                <span className="text-sm text-muted-foreground">שבועות</span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">לקוחות יכולים לקבוע תורים עד התאריך הנבחר</p>
              <Input type="date" value={form.maxFutureDate}
                onChange={e => setForm(p => ({ ...p, maxFutureDate: e.target.value }))}
                className="w-48" dir="ltr" />
            </div>
          )}
        </div>

        {/* Per customer limit */}
        <div className="p-4 border rounded-xl bg-muted/20 space-y-3">
          <div className="font-medium text-sm">הגבלת תור ללקוחות</div>
          <p className="text-xs text-muted-foreground">מספר מקסימלי של תורים פעילים לכל לקוח (ריק = ללא הגבלה)</p>
          <div className="flex items-center gap-3">
            <Input type="number" min="1" max="99" placeholder="ללא הגבלה" value={form.maxAppointmentsPerCustomer}
              onChange={e => setForm(p => ({ ...p, maxAppointmentsPerCustomer: e.target.value }))}
              className="w-28 text-center" />
            <span className="text-sm text-muted-foreground">תורים ללקוח</span>
          </div>
        </div>

        {/* Require active subscription */}
        <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/20">
          <div>
            <div className="font-medium text-sm">חובת מנוי או כרטיסיה פעילה</div>
            <div className="text-xs text-muted-foreground mt-0.5">יחייב את הלקוח להחזיק במנוי או כרטיסיה פעילה כדי לקבוע תור, אחרת יוצג לו מסך ליצירת קשר עימכם</div>
          </div>
          <Switch checked={form.requireActiveSubscription} onCheckedChange={v => setForm(p => ({ ...p, requireActiveSubscription: v }))} />
        </div>

        {/* Max per day */}
        <div className="p-4 border rounded-xl bg-muted/20 space-y-3">
          <div className="font-medium text-sm">מקסימום תורים ליום</div>
          <p className="text-xs text-muted-foreground">הגבלת כמות תורים שניתן לקבוע ליום ל-<strong>{form.maxAppointmentsPerDay || "ללא הגבלה"}</strong></p>
          <div className="flex items-center gap-3">
            <Input type="number" min="1" max="999" value={form.maxAppointmentsPerDay}
              onChange={e => setForm(p => ({ ...p, maxAppointmentsPerDay: e.target.value }))}
              className="w-28 text-center" />
            <span className="text-sm text-muted-foreground">תורים ליום</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={save} disabled={updateMutation.isPending} size="lg">
            {updateMutation.isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkingHoursTab() {
  const { data: hours } = useGetWorkingHours();
  const { data: profile } = useGetBusinessProfile();
  const updateMutation = useSetWorkingHours();
  const updateProfileMutation = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [localHours, setLocalHours] = useState<any[]>([]);
  const [bufferMinutes, setBufferMinutes] = useState("0");

  // Compare the in-memory form against whatever's currently cached by
  // react-query — that's always the "saved" baseline because we
  // invalidate + refetch after each successful save.
  const isDirty = useMemo(() => {
    if (!hours || !profile) return false;
    const baseline = DAYS.map((_, i) => {
      const ex = hours.find(h => h.dayOfWeek === i);
      return ex
        ? { dayOfWeek: ex.dayOfWeek, startTime: ex.startTime, endTime: ex.endTime, isEnabled: ex.isEnabled }
        : { dayOfWeek: i, startTime: "09:00", endTime: "18:00", isEnabled: false };
    });
    const current = localHours.map((h: any) => ({
      dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled,
    }));
    const hoursChanged = JSON.stringify(baseline) !== JSON.stringify(current);
    const bufferChanged = ((profile as any).bufferMinutes ?? 0) !== (parseInt(bufferMinutes) || 0);
    return hoursChanged || bufferChanged;
  }, [hours, profile, localHours, bufferMinutes]);
  const isSaving = updateMutation.isPending || updateProfileMutation.isPending;

  useEffect(() => {
    if (hours) {
      setLocalHours(DAYS.map((_, i) => {
        const ex = hours.find(h => h.dayOfWeek === i);
        return ex ? { ...ex } : { dayOfWeek: i, startTime: "09:00", endTime: "18:00", isEnabled: false };
      }));
    }
  }, [hours]);

  useEffect(() => {
    if (profile) setBufferMinutes((profile.bufferMinutes ?? 0).toString());
  }, [profile]);

  const handleSave = () => {
    updateMutation.mutate({ data: { hours: localHours.map(h => ({ dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })) } }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetWorkingHoursQueryKey(), refetchType: "active" });
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירת שעות עבודה",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
    updateProfileMutation.mutate({ data: { bufferMinutes: parseInt(bufferMinutes) || 0 } as any }, {
      onSuccess: async (updated) => {
        toast({ title: "הגדרות שעות עבודה נשמרו" });
        await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey(), refetchType: "active" });
        if (updated) {
          setBufferMinutes(((updated as any).bufferMinutes ?? 0).toString());
        }
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירת הפסקה",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
  };

  if (!hours) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>שעות עבודה</CardTitle>
        <CardDescription>סמן את הימים והשעות בהם העסק פעיל</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {localHours.map((h, i) => (
          // RTL row: day name reads first (right), times cluster right after
          // it so the owner sees "ראשון 09:00-18:00" as one unit; Switch
          // pushed to the far left (end) with ms-auto.
          <div key={i} dir="rtl" className="flex flex-wrap items-center gap-3 p-4 border rounded-xl bg-card">
            <span className="font-medium w-14 shrink-0">{DAYS[h.dayOfWeek]}</span>
            {h.isEnabled ? (
              <div className="flex items-center gap-2">
                <Input type="time" value={h.startTime} onChange={e => { const n = [...localHours]; n[i].startTime = e.target.value; setLocalHours(n); }} className="w-[7.5rem] sm:w-32" dir="ltr" />
                <span className="text-muted-foreground">—</span>
                <Input type="time" value={h.endTime} onChange={e => { const n = [...localHours]; n[i].endTime = e.target.value; setLocalHours(n); }} className="w-[7.5rem] sm:w-32" dir="ltr" />
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">סגור</span>
            )}
            <Switch className="ms-auto" checked={h.isEnabled} onCheckedChange={v => {
              const n = [...localHours]; n[i].isEnabled = v; setLocalHours(n);
            }} />
          </div>
        ))}
        <div className="pt-4 border-t space-y-2">
          <Label>זמן הפסקה בין פגישות (דקות)</Label>
          <div className="flex items-center gap-3">
            <Input type="number" min="0" step="5" value={bufferMinutes} onChange={e => setBufferMinutes(e.target.value)} className="w-28 text-center" />
            <span className="text-sm text-muted-foreground">דקות בין תורים</span>
          </div>
          <p className="text-xs text-muted-foreground">זמן קצוב לניקיון/מנוחה בין תור לתור</p>
        </div>
      </CardContent>
    </Card>

    {/* Save / cancel at the bottom of the tab — adjacent, not split. */}
    <div className="flex items-center justify-end gap-2 pt-6 mt-4 border-t">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => {
          if (hours) {
            setLocalHours(DAYS.map((_, i) => {
              const ex = hours.find(h => h.dayOfWeek === i);
              return ex ? { ...ex } : { dayOfWeek: i, startTime: "09:00", endTime: "18:00", isEnabled: false };
            }));
          }
          if (profile) {
            setBufferMinutes((profile.bufferMinutes ?? 0).toString());
          }
          toast({ title: "השינויים בוטלו" });
        }}
      >
        בטל עריכה
      </Button>
      <Button
        type="button"
        size="lg"
        onClick={handleSave}
        disabled={updateMutation.isPending || updateProfileMutation.isPending}
      >
        {updateMutation.isPending || updateProfileMutation.isPending ? "שומר..." : "שמור הכל"}
      </Button>
    </div>
    <FloatingSaveBar visible={isDirty} onClick={handleSave} saving={isSaving} />
    </>
  );
}

function ForgotPasswordFlow({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSendOtp = async () => {
    if (!phone) return;
    setLoading(true);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (r.ok) { setOtpSent(true); toast({ title: "קוד נשלח לוואטסאפ שלך" }); }
      else { const e = await r.json().catch(() => ({})); toast({ title: e.error || "שגיאה", variant: "destructive" }); }
    } catch {
      toast({ title: "שגיאת רשת, נסה שוב", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!otp || !newPassword) return;
    setLoading(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otp, newPassword }),
      });
      if (r.ok) { setDone(true); toast({ title: "הסיסמא שונתה בהצלחה" }); }
      else { const e = await r.json().catch(() => ({})); toast({ title: e.error || "קוד שגוי", variant: "destructive" }); }
    } catch {
      toast({ title: "שגיאת רשת, נסה שוב", variant: "destructive" });
    } finally { setLoading(false); }
  };

  if (done) return (
    <div className="text-center space-y-3 py-4">
      <div className="text-4xl">✅</div>
      <p className="font-semibold">הסיסמא שונתה!</p>
      <Button size="sm" onClick={onBack}>חזור להתחברות</Button>
    </div>
  );

  return (
    <div className="space-y-3 pt-2">
      <p className="text-sm font-medium">איפוס סיסמא</p>
      {!otpSent ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">מספר טלפון הרשום בחשבון</Label>
            <Input dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="" />
          </div>
          <Button size="sm" className="w-full" onClick={handleSendOtp} disabled={loading || !phone}>
            {loading ? "שולח..." : "שלח קוד לוואטסאפ"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label className="text-xs">קוד שהתקבל בוואטסאפ</Label>
            <Input dir="ltr" value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" maxLength={6} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">סיסמא חדשה</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="סיסמא חדשה" />
          </div>
          <Button size="sm" className="w-full" onClick={handleReset} disabled={loading || !otp || !newPassword}>
            {loading ? "מאמת..." : "שנה סיסמא"}
          </Button>
        </>
      )}
      <button type="button" className="text-xs text-muted-foreground underline" onClick={onBack}>חזור</button>
    </div>
  );
}

// Edit/delete dialog opened when the owner clicks a time-off block in
// the calendar. Mirrors the fields of the ConstraintsTab form but
// targets a single existing row (PATCH / DELETE by id).
function TimeOffEditDialog({
  item, onClose, onChanged,
}: {
  item: TimeOffItem | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [type, setType] = useState<"full" | "partial">("full");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form whenever a different block is opened.
  useEffect(() => {
    if (!item) return;
    setDate(item.date);
    setType(item.fullDay ? "full" : "partial");
    setStartTime(item.startTime ?? "09:00");
    setEndTime(item.endTime ?? "17:00");
    setNote(item.note ?? "");
  }, [item]);

  const authHeaders = () => ({
    authorization: `Bearer ${localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")}`,
  });

  const handleSave = async () => {
    if (!item) return;
    if (!date) { toast({ title: "יש לבחור תאריך", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: any = {
        date,
        fullDay: type === "full",
        note: note.trim() || null,
      };
      if (type === "partial") { body.startTime = startTime; body.endTime = endTime; }
      const r = await fetch(`/api/business/time-off/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast({ title: "האילוץ עודכן" });
      onChanged();
      onClose();
    } catch {
      toast({ title: "שגיאה בשמירה", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm("למחוק את האילוץ הזה?")) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/business/time-off/${item.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error();
      toast({ title: "האילוץ נמחק" });
      onChanged();
      onClose();
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={v => { if (!v) onClose(); }}>
      {/* max-w-md (vs max-w-sm before) + min-w-0 on the grid cells
          keeps the native date/time inputs from overflowing. The inputs
          themselves carry dir="ltr" so browsers render their internal
          hour/minute spinners + picker icon in the expected LTR layout
          without pushing chrome outside the border. */}
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>🚫</span> עריכת אילוץ
          </DialogTitle>
          <DialogDescription>עדכון או מחיקה של חסימה קיימת ביומן</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("full")}
              className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === "full" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              יום שלם
            </button>
            <button
              type="button"
              onClick={() => setType("partial")}
              className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === "partial" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              שעות ספציפיות
            </button>
          </div>

          {/* Use the same custom date + time pickers as the new-entry
              dialog so the owner sees a consistent Hebrew calendar and
              5-min wheel — no more native browser chrome overflowing
              the dialog box. */}
          <div className="space-y-1">
            <Label>תאריך</Label>
            <DatePickerField value={date} onChange={setDate} red />
          </div>

          {type === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 min-w-0">
                <Label>משעה</Label>
                <TimePickerField value={startTime} onChange={setStartTime} red />
              </div>
              <div className="space-y-1 min-w-0">
                <Label>עד שעה</Label>
                <TimePickerField value={endTime} onChange={setEndTime} red />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>הערה (אופציונלי)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="לדוגמה: חופשה משפחתית" />
          </div>

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "מוחק..." : "מחק"}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onClose} disabled={saving || deleting}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving || deleting}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DayOffTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState<"full" | "partial">("full");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const authHeaders = () => ({
    authorization: `Bearer ${localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")}`,
  });

  const load = async () => {
    try {
      const r = await fetch("/api/business/time-off", { headers: authHeaders() });
      if (r.ok) setItems(await r.json());
    } catch {}
    // Mirror local state into the shared ["time-off"] react-query cache
    // so the Appointments tab calendar shows the same data without an
    // extra network round-trip.
    queryClient.invalidateQueries({ queryKey: ["time-off"] });
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setType("full");
    setDate("");
    setStartTime("09:00");
    setEndTime("17:00");
    setNote("");
  };

  const handleEditClick = (item: any) => {
    setEditingId(item.id);
    setType(item.fullDay ? "full" : "partial");
    setDate(item.date);
    setStartTime(item.startTime ?? "09:00");
    setEndTime(item.endTime ?? "17:00");
    setNote(item.note ?? "");
  };

  const handleAdd = async () => {
    if (!date) { toast({ title: "יש לבחור תאריך", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const body = {
        date,
        fullDay: type === "full",
        // Omit (undefined) rather than null so the server-side parser
        // doesn't reject the request. Same for note.
        ...(type === "partial" ? { startTime, endTime } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      const url    = editingId ? `/api/business/time-off/${editingId}` : "/api/business/time-off";
      const method = editingId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        toast({ title: editingId ? "האילוץ עודכן" : "האילוץ נוסף" });
        resetForm();
        load();
      } else {
        toast({ title: "שגיאה בשמירה", variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("למחוק?")) return;
    try {
      const res = await fetch(`/api/business/time-off/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error();
      toast({ title: "האילוץ נמחק" });
      if (editingId === id) resetForm();
      load();
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" /> אילוצים
          </CardTitle>
          <CardDescription>חסימה של ימים שלמים או שעות ספציפיות שבהן לא ניתן לקבוע תורים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button onClick={() => setType("full")} className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === "full" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
              🚫 יום שלם
            </button>
            <button onClick={() => setType("partial")} className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === "partial" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
              ⏰ שעות ספציפיות
            </button>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label>תאריך</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
          </div>

          {/* Time range (partial only) */}
          {type === "partial" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>משעה</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>עד שעה</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1">
            <Label>הערה (אופציונלי)</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="לדוגמה: חופשה משפחתית" />
          </div>

          <div className="flex gap-2">
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} className="flex-1">
                בטל עריכה
              </Button>
            )}
            <Button onClick={handleAdd} disabled={loading} className="flex-1 gap-2">
              <Plus className="w-4 h-4" /> {editingId ? "שמור שינויים" : "הוסף אילוץ"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">אילוצים מתוכננים</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className={`flex items-center justify-between py-2 border-b last:border-0 transition-colors ${editingId === item.id ? "bg-primary/5 rounded-lg px-2 -mx-2" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{formatDate(item.date)}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.fullDay ? "יום שלם" : `${item.startTime} — ${item.endTime}`}
                    {item.note && ` • ${item.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEditClick(item)}
                    className="text-muted-foreground hover:text-primary p-1.5 rounded-lg hover:bg-muted transition-all"
                    title="ערוך"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all"
                    title="מחק"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{ name: string; phone: string } | null>(null);
  const [drilldownAppts, setDrilldownAppts] = useState<any[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  // Cancellation + attendance detail sections are collapsed by default —
  // the owner asked for a cleaner analytics screen where the rankings
  // only surface when they actually click the relevant stat tile.
  const [showCancelDetails, setShowCancelDetails] = useState(false);
  const [showAttendedDetails, setShowAttendedDetails] = useState(false);
  const { toast } = useToast();

  const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");

  const loadAnalytics = () => {
    setLoading(true);
    fetch("/api/business/analytics", { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => toast({ title: "שגיאה בטעינת סטטיסטיקות", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  const openDrilldown = (person: { name: string; phone: string }) => {
    setDrilldown(person);
    setDrilldownLoading(true);
    fetch(`/api/business/appointments/by-phone?phone=${encodeURIComponent(person.phone)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(appts => setDrilldownAppts(Array.isArray(appts) ? appts : []))
      .catch(() => setDrilldownAppts([]))
      .finally(() => setDrilldownLoading(false));
  };

  const hardDelete = async (id: number) => {
    const res = await fetch(`/api/business/appointments/${id}/permanent`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setDrilldownAppts(prev => prev.filter(a => a.id !== id));
      toast({ title: "הפגישה נמחקה" });
      loadAnalytics();
    } else {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  useEffect(() => { loadAnalytics(); }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">טוען נתונים...</div>;
  if (!data) return null;

  const stats = [
    { label: "תורים שבוטלו", value: data.cancelled, color: "text-red-500", bg: "bg-red-50" },
    { label: "תורים שהושלמו", value: data.past, color: "text-green-600", bg: "bg-green-50" },
    { label: "תורים קבועים עתידיים", value: data.future, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "סה\"כ תורים פעילים", value: data.total, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-4">
      {/* Drilldown modal */}
      <Dialog open={!!drilldown} onOpenChange={v => { if (!v) setDrilldown(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>פגישות מבוטלות — {drilldown?.name}</DialogTitle>
            <DialogDescription dir="ltr">{drilldown?.phone}</DialogDescription>
          </DialogHeader>
          {drilldownLoading ? (
            <div className="text-center py-8 text-muted-foreground">טוען...</div>
          ) : drilldownAppts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">אין פגישות מבוטלות</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {drilldownAppts.map((a: any) => {
                const [, m, d] = a.appointmentDate.split("-");
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.serviceName}</p>
                      <p className="text-xs text-muted-foreground">{d}/{m} בשעה {a.appointmentTime}</p>
                      {a.cancelReason && <p className="text-xs text-red-500 mt-0.5">{a.cancelReason}</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => hardDelete(a.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> נתוני עסק
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Trend banner */}
          {data.trending ? (
            <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2 text-green-700 text-sm font-medium">
              <span className="text-lg">📈</span>
              הממוצע החודשי עולה! החודש <strong>{data.currentMonth}</strong> תורים לעומת {data.prevMonth} בחודש הקודם
            </div>
          ) : data.prevMonth > 0 && data.currentMonth <= data.prevMonth ? (
            <div className="mb-4 p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center gap-2 text-orange-700 text-sm">
              <span className="text-lg">📊</span>
              החודש <strong>{data.currentMonth}</strong> תורים לעומת {data.prevMonth} בחודש הקודם
            </div>
          ) : null}

          {/* Stats grid — "תורים שהושלמו" and "תורים שבוטלו" are
              click-to-expand (open rankings below); the other two are
              passive display tiles. */}
          <div className="grid grid-cols-2 gap-3">
            {stats.map(s => {
              const isCancelled = s.label === "תורים שבוטלו";
              const isCompleted = s.label === "תורים שהושלמו";
              const isToggle = isCancelled || isCompleted;
              const isOpen = (isCancelled && showCancelDetails) || (isCompleted && showAttendedDetails);
              const onClick = isCancelled
                ? () => setShowCancelDetails(v => !v)
                : isCompleted
                ? () => setShowAttendedDetails(v => !v)
                : undefined;
              return (
                <button
                  key={s.label}
                  type="button"
                  disabled={!isToggle}
                  onClick={onClick}
                  className={`${s.bg} rounded-2xl p-4 text-center transition-all ${isToggle ? "cursor-pointer hover:brightness-95 active:scale-[0.98]" : "cursor-default"} ${isOpen ? "ring-2 ring-primary/40" : ""}`}
                >
                  <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    {s.label}
                    {isToggle && <span className="text-[10px] opacity-60">{isOpen ? "▲" : "▼"}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            ממוצע חודשי: <strong>{data.avg}</strong> תורים
          </div>
        </CardContent>
      </Card>

      {/* Cancellation rankings — shown only when the owner expands the
          "תורים שבוטלו" tile above. Keeps both ברזים and ביטולים tucked
          under one toggle since they answer the same question ("who's
          been flaky?"). */}
      {showCancelDetails && data.topNoShows?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">🚫 ברזים — מי לא הגיע הכי הרבה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topNoShows.map((c: any, i: number) => (
                <div key={c.phone} className="flex items-center gap-3 p-2.5 rounded-xl bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => openDrilldown(c)}>
                  <span className="text-lg font-bold text-red-400 w-6 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600 bg-red-100 px-2.5 py-1 rounded-full">{c.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showCancelDetails && data.topCancellers?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">↩️ ביטולים — מי ביטל הכי הרבה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topCancellers.map((c: any, i: number) => (
                <div key={c.phone} className="flex items-center gap-3 p-2.5 rounded-xl bg-orange-50 border border-orange-100 cursor-pointer hover:bg-orange-100 transition-colors"
                  onClick={() => openDrilldown(c)}>
                  <span className="text-lg font-bold text-orange-400 w-6 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>
                  </div>
                  <span className="text-sm font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full">{c.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top attendees — shown when the "תורים שהושלמו" tile is expanded.
          Blue palette mirrors the "favorite customer" ✓ badge on the
          Customers list so the owner recognises the same ranking there. */}
      {showAttendedDetails && data.topAttendees?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">⭐ מי הגיע הכי הרבה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topAttendees.map((c: any, i: number) => (
                <div key={c.phone} className="flex items-center gap-3 p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                  <span className="text-lg font-bold text-blue-400 w-6 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {c.name}
                      {i < 3 && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-100" />}
                    </p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full">{c.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RevenueTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    fetch("/api/business/revenue", { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => toast({ title: "שגיאה בטעינת דוח הכנסות", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">טוען נתונים...</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            💰 סיכום הכנסות
          </CardTitle>
          <CardDescription>מבוסס על מחירי השירותים והתורים הקבועים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div className="p-4 rounded-2xl bg-green-50 border border-green-200">
              <div className="text-sm text-green-700 font-medium mb-1">החודש (מה-1)</div>
              <div className="text-4xl font-bold text-green-700">₪{data.thisMonth.toLocaleString()}</div>
            </div>
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
              <div className="text-sm text-blue-700 font-medium mb-1">תורים קבועים לחודש הבא</div>
              <div className="text-3xl font-bold text-blue-700">₪{data.nextMonthBooked.toLocaleString()}</div>
              {data.forecast > 0 && (
                <div className="text-xs text-blue-500 mt-1">תחזית לפי ממוצע 3 חודשים: ₪{data.forecast.toLocaleString()}</div>
              )}
            </div>
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <div className="text-sm text-purple-700 font-medium mb-1">סה"כ מאז הצטרפות</div>
              <div className="text-3xl font-bold text-purple-700">₪{data.allTime.toLocaleString()}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center pt-2">* הנתונים מבוססים על מחירי השירותים ואינם כוללים מזומן שהתקבל ישירות</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersTab() {
  const { data: customers, isLoading } = useListBusinessCustomers();
  const { toast } = useToast();
  const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");

  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [quota, setQuota] = useState<{ sent: number; limit: number; remaining: number } | null>(null);
  // Cancellation-breakdown popup — set to a customer record to open, null to close.
  const [cancelBreakdown, setCancelBreakdown] = useState<any | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/business/broadcast/quota", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setQuota(data); })
      .catch(() => {});
  }, [token]);

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setBroadcastLoading(true);
    try {
      const res = await fetch("/api/business/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: broadcastMessage.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "שגיאה", description: data.message ?? "לא ניתן לשלוח", variant: "destructive" });
        return;
      }
      toast({ title: `✅ נשלח ל-${data.sent} לקוחות${data.failed > 0 ? ` (${data.failed} נכשלו)` : ""}` });
      setShowBroadcast(false);
      setBroadcastMessage("");
      setQuota(q => q ? { ...q, sent: q.sent + data.sent, remaining: q.remaining - data.sent } : q);
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setBroadcastLoading(false);
    }
  };

  const waLink = (phone: string, name: string) => {
    const e164 = phone.replace(/\D/g, "").replace(/^0/, "972");
    const msg = encodeURIComponent(`שלום ${name}, `);
    return `https://wa.me/${e164}?text=${msg}`;
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  const customerList = Array.isArray(customers) ? customers : [];
  const totalRevenue = customerList.reduce((s, c) => s + c.totalRevenue, 0);
  const totalVisits = customerList.reduce((s, c) => s + c.totalVisits, 0);

  return (
    <div className="space-y-6">
      {/* Broadcast dialog */}
      {showBroadcast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setShowBroadcast(false)}>
          <div className="bg-background rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" /> הודעה לכל הלקוחות
              </h3>
              <button onClick={() => setShowBroadcast(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            {quota && (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
                <span>נשלחו החודש: {quota.sent}/{quota.limit}</span>
                <span className={quota.remaining < 20 ? "text-red-500 font-medium" : ""}>{quota.remaining} נותרו</span>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-2">ההודעה תישלח ל-{customerList.length} לקוחות דרך WhatsApp</p>
              <textarea
                className="w-full border rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={4}
                placeholder="כתוב/י את ההודעה כאן..."
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                maxLength={1000}
              />
              <div className="text-xs text-muted-foreground text-end mt-1">{broadcastMessage.length}/1000</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowBroadcast(false)}>ביטול</Button>
              <Button
                className="flex-1 gap-2"
                disabled={!broadcastMessage.trim() || broadcastLoading || (quota?.remaining ?? 1) <= 0}
                onClick={handleBroadcast}
              >
                {broadcastLoading ? "שולח..." : <><Send className="w-4 h-4" /> שלח לכולם</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">לקוחות ייחודיים</div>
            <div className="text-3xl font-bold">{customerList.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">סה״כ ביקורים</div>
            <div className="text-3xl font-bold">{totalVisits}</div>
          </CardContent>
        </Card>
        {/* 'סה״כ הכנסות' moved to RevenueTab below (also displayed here in the
            merged Customers tab) — avoid duplicating the same number twice
            in the same scroll. */}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>מאגר לקוחות</CardTitle>
            <CardDescription>כל הלקוחות שהזמינו תורים עם היסטוריית ביקורים והכנסות</CardDescription>
          </div>
          {customerList.length > 0 && (
            <Button
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => setShowBroadcast(true)}
            >
              <MessageSquare className="w-4 h-4" /> הודעה לכולם
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {customerList.length ? (
            <div className="space-y-3">
              {customerList.map((c, i) => {
                // Top-3 attendees are "favorite customers" — surfaced with a
                // blue ✓ next to the name. Backend already sorts by
                // totalVisits desc, so `i < 3` picks the top three.
                const isFavorite = i < 3 && c.totalVisits > 0;
                const noShowCount = (c as any).noShowCount ?? 0;
                const cancelledCount = (c as any).cancelledCount ?? 0;
                return (
                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl hover:border-primary/40 transition-colors gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      {isFavorite && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-100" aria-label="לקוח/ה מועדף/ת" />}
                      {c.clientName}
                      {c.totalVisits >= 5 && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">לקוחה נאמנה</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5" dir="ltr">{c.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.firstVisitDate ? <>ביקור ראשון: {c.firstVisitDate} • אחרון: {c.lastVisitDate}</> : "טרם ביקר/ה"}
                    </div>
                    {/* Reliability breakdown — attendance / no-shows / cancellations.
                        Zero-count chips are hidden so a perfectly-attended
                        customer doesn't get visual "0 ברזים" noise. */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                        ✓ {c.totalVisits} הגיע/ה
                      </span>
                      {noShowCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-100">
                          🚫 {noShowCount} ברזים
                        </span>
                      )}
                      {cancelledCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setCancelBreakdown(c)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-100 hover:bg-orange-100 transition-colors cursor-pointer"
                          title="הצג פירוט ביטולים"
                        >
                          ↩️ {cancelledCount} ביטולים
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Phone call */}
                    <a href={`tel:${c.phoneNumber}`} aria-label="חייג">
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> חייג
                      </Button>
                    </a>
                    {/* WhatsApp */}
                    <a href={waLink(c.phoneNumber, c.clientName)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                      <Button size="sm" variant="outline" className="gap-1.5 border-green-300 hover:bg-green-50 text-green-700">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.38A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.946 7.946 0 01-4.073-1.117l-.29-.174-3.007.834.847-3.087-.189-.301A8 8 0 1112 20zm4.472-5.618c-.247-.124-1.458-.72-1.685-.802-.226-.082-.39-.124-.554.124-.165.247-.638.802-.782.966-.143.165-.288.186-.534.062-.247-.124-1.044-.385-1.988-1.228-.735-.655-1.232-1.464-1.376-1.711-.143-.247-.015-.38.108-.503.11-.11.247-.288.37-.432.124-.144.165-.247.247-.41.082-.164.041-.308-.021-.432-.062-.124-.554-1.337-.76-1.83-.2-.48-.404-.415-.554-.422l-.473-.009c-.165 0-.432.062-.658.308-.226.247-.864.844-.864 2.06 0 1.215.885 2.39 1.008 2.554.124.165 1.741 2.658 4.218 3.727.59.254 1.05.406 1.409.52.592.188 1.131.161 1.557.098.475-.071 1.458-.596 1.664-1.172.206-.576.206-1.07.144-1.172-.062-.103-.226-.165-.473-.288z"/></svg>
                        WhatsApp
                      </Button>
                    </a>
                    {/* Revenue */}
                    <div className="text-right">
                      <div className="font-bold text-primary text-base">₪{(c.totalRevenue / 100).toFixed(0)}</div>
                      <div className="text-xs text-muted-foreground">{c.totalVisits} ביקורים</div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          ) : <EmptyState text="אין לקוחות עדיין" />}
        </CardContent>
      </Card>

      {/* Cancellation breakdown dialog — opens when the owner taps a
          customer's "↩️ N ביטולים" chip. Shows how many the client
          cancelled vs how many the business cancelled. Older rows that
          predate the cancelled_by column get bucketed as "לא ידוע". */}
      <Dialog open={!!cancelBreakdown} onOpenChange={v => { if (!v) setCancelBreakdown(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>פירוט ביטולים — {cancelBreakdown?.clientName}</DialogTitle>
            <DialogDescription>
              מי ביטל כל תור. ביטולים ישנים לפני השדרוג יופיעו כ״לא ידוע״.
            </DialogDescription>
          </DialogHeader>
          {cancelBreakdown && (() => {
            const byClient = (cancelBreakdown as any).cancelledByClientCount ?? 0;
            const byBusiness = (cancelBreakdown as any).cancelledByBusinessCount ?? 0;
            const total = (cancelBreakdown as any).cancelledCount ?? 0;
            const unknown = Math.max(0, total - byClient - byBusiness);
            return (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3 rounded-xl bg-orange-50 border border-orange-100">
                  <span className="font-semibold text-orange-800">הלקוח/ה ביטל/ה</span>
                  <span className="text-2xl font-bold text-orange-700">{byClient}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <span className="font-semibold text-blue-800">את/ה ביטלת</span>
                  <span className="text-2xl font-bold text-blue-700">{byBusiness}</span>
                </div>
                {unknown > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border">
                    <span className="font-semibold text-muted-foreground">לא ידוע</span>
                    <span className="text-2xl font-bold text-muted-foreground">{unknown}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">סה״כ ביטולים</span>
                  <span className="text-lg font-bold">{total}</span>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WaitlistTab() {
  const { data: waitlist, isLoading } = useListBusinessWaitlist();
  const removeMutation = useRemoveFromWaitlist();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRemove = (id: number) => {
    removeMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "הוסר מרשימת ההמתנה" }); queryClient.invalidateQueries({ queryKey: getListBusinessWaitlistQueryKey() }); },
      onError: (err: any) => toast({ title: "שגיאה בהסרה", description: err?.response?.data?.message ?? err?.message ?? "נסה שוב", variant: "destructive" }),
    });
  };

  const waitlistItems = Array.isArray(waitlist) ? waitlist : [];

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>רשימת המתנה</CardTitle>
        <CardDescription>לקוחות שהצטרפו לרשימת ההמתנה כאשר הלוח היה מלא</CardDescription>
      </CardHeader>
      <CardContent>
        {waitlistItems.length ? (
          <div className="space-y-3">
            {waitlistItems.map(w => (
              <div key={w.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl hover:border-primary/40 transition-colors gap-3">
                <div>
                  <div className="font-semibold">{w.clientName}</div>
                  <div className="text-sm text-muted-foreground" dir="ltr">{w.phoneNumber}</div>
                  {w.serviceName && <div className="text-sm text-muted-foreground mt-0.5">שירות: {w.serviceName}</div>}
                  {w.preferredDate && <div className="text-sm text-primary mt-0.5">תאריך מבוקש: {w.preferredDate}</div>}
                  {w.notes && <div className="text-xs text-muted-foreground mt-1">הערה: {w.notes}</div>}
                  <div className="text-xs text-muted-foreground mt-1">נרשם: {format(new Date(w.createdAt), "d בMMMM yyyy", { locale: he })}</div>
                </div>
                <div className="flex gap-2">
                  <a href={`https://wa.me/972${w.phoneNumber.replace(/^0/, "").replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50">
                      <Phone className="w-3.5 h-3.5" /> WhatsApp
                    </Button>
                  </a>
                  <button onClick={() => handleRemove(w.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all">
                    <Trash2 className="w-3 h-3" /> הסר
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="רשימת ההמתנה ריקה" />
        )}
      </CardContent>
    </Card>
  );
}

function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = HEBREW_FONTS.filter(f => f.label.toLowerCase().includes(search.toLowerCase()));
  const current = HEBREW_FONTS.find(f => f.value === value) ?? HEBREW_FONTS[0];

  // Load all fonts once
  useEffect(() => {
    const families = HEBREW_FONTS.map(f => encodeURIComponent(f.value) + ":wght@400;700").join("&family=");
    const id = "gfonts-all";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base border-b pb-2">פונט</h3>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between p-3 border-2 rounded-xl hover:border-primary/40 transition-all bg-card"
        >
          <span style={{ fontFamily: current.value }} className="text-lg">{current.label} — שלום עולם</span>
          <span className="text-xs text-muted-foreground ml-2">▼</span>
        </button>
        {open && (
          <div className="absolute z-20 top-full mt-1 w-full bg-card border rounded-xl shadow-xl overflow-hidden">
            <div className="p-2 border-b">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חפש פונט..."
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => { onChange(f.value); setOpen(false); setSearch(""); }}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-right ${value === f.value ? "bg-primary/5 text-primary font-semibold" : ""}`}
                >
                  <span style={{ fontFamily: f.value }} className="text-base">{f.label} — שלום עולם</span>
                  {value === f.value && <span className="text-primary text-sm">✓</span>}
                </button>
              ))}
              {!filtered.length && <p className="text-center text-muted-foreground text-sm py-4">לא נמצאו פונטים</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandingTab() {
  const { data: profile } = useGetBusinessProfile();
  const { data: brandingServices } = useListBusinessServices();
  const updateBranding = useUpdateBusinessBranding();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logoUpload = useImageUpload();
  const bannerUpload = useImageUpload();
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  // Baseline snapshot of `form` taken right after it hydrates from the
  // profile — used to detect unsaved edits and drive the floating save
  // button. Reset on every successful save so the bar disappears.
  const baselineFormRef = useRef<any>(null);

  // Preview mockup pulls real services so the card reads like the
  // owner's actual profile — name, price (with "החל מ-" flag if set),
  // and duration all come from real rows. Grid style uses two services
  // when available. Falls back to a generic "דוגמא" sample for
  // brand-new accounts.
  const previewServiceList = (() => {
    const list = Array.isArray(brandingServices) ? brandingServices : [];
    const active = list.filter(s => (s as any).isActive);
    const pool = active.length > 0 ? active : list;
    return pool.slice(0, 2);
  })();
  const fmtServicePrice = (s: any) =>
    `${s.priceStartsFrom ? "החל מ-" : ""}₪${(s.price / 100).toFixed(0)}`;
  const fmtServiceDuration = (s: any) => formatDuration(s.durationMinutes ?? 30);
  const previewService = previewServiceList[0] ?? null;
  const previewServiceName = (previewService as any)?.name || "דוגמא";
  const previewPriceStr = previewService ? fmtServicePrice(previewService) : "₪0";
  const previewDurationStr = previewService ? fmtServiceDuration(previewService) : "30 דקות";
  const previewServiceDescription = (previewService as any)?.description?.trim() || null;

  // Live-apply the picked font to the whole dashboard. The outer useEffect
  // in the Dashboard root applies whatever's SAVED on the profile; this
  // one takes over while the user is hovering over the BrandingTab so the
  // font change is visible immediately (not only after hitting save).
  // Cleanup: when the user leaves the tab or unsaves, the parent effect
  // re-applies the saved value on the next profile refetch.
  const liveFontRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    primaryColor: "#2563eb",
    fontFamily: "Heebo",
    logoUrl: "",
    bannerUrl: "",
    themeMode: "light" as "light" | "dark" | "fuchsia",
    borderRadius: "medium" as "sharp" | "medium" | "rounded",
    buttonRadius: "medium" as "sharp" | "medium" | "rounded",
    welcomeText: "",
    showBusinessName: true,
    showLogo: true,
    showBanner: true,
    headerLayout: "stacked" as "stacked" | "side",
    // Profile landing page
    websiteUrl: "",
    instagramHandle: "",
    wazeUrl: "",
    businessDescription: "",
    galleryImages: [] as string[],
    bannerPosition: "center" as string,
    contactPhone: "",
    address: "",
    city: "",
    // Advanced design
    designPreset: "" as string,
    accentColor: "",
    gradientEnabled: false,
    gradientFrom: "",
    gradientTo: "",
    gradientAngle: 135,
    backgroundPattern: "none" as string,
    heroLayout: "stacked" as string,
    serviceCardStyle: "card" as string,
    animationStyle: "none" as string,
    hoverEffect: "none" as string,
    backgroundColor: "" as string,
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const galleryUpload = useImageUpload();
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      let galleryImages: string[] = [];
      try {
        const raw = (profile as any).galleryImages;
        if (raw) galleryImages = JSON.parse(raw);
      } catch {}
      const next = {
        primaryColor: profile.primaryColor ?? "#2563eb",
        fontFamily: profile.fontFamily ?? "Heebo",
        logoUrl: profile.logoUrl ?? "",
        bannerUrl: profile.bannerUrl ?? "",
        themeMode: (profile.themeMode ?? "light") as "light" | "dark" | "fuchsia",
        borderRadius: ((profile as any).borderRadius ?? "medium") as "sharp" | "medium" | "rounded",
        buttonRadius: ((profile as any).buttonRadius ?? "medium") as "sharp" | "medium" | "rounded",
        welcomeText: (profile as any).welcomeText ?? "",
        showBusinessName: (profile as any).showBusinessName ?? true,
        showLogo: (profile as any).showLogo ?? true,
        showBanner: (profile as any).showBanner ?? true,
        headerLayout: ((profile as any).headerLayout ?? "stacked") as "stacked" | "side",
        websiteUrl: (profile as any).websiteUrl ?? "",
        instagramHandle: ((profile as any).instagramUrl ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, ""),
        wazeUrl: (profile as any).wazeUrl ?? "",
        businessDescription: (profile as any).businessDescription ?? "",
        galleryImages,
        bannerPosition: (profile as any).bannerPosition ?? "center",
        contactPhone: (profile as any).contactPhone ?? "",
        address: (profile as any).address ?? "",
        city: (profile as any).city ?? "",
        designPreset: (profile as any).designPreset ?? "",
        accentColor: (profile as any).accentColor ?? "",
        gradientEnabled: (profile as any).gradientEnabled ?? false,
        gradientFrom: (profile as any).gradientFrom ?? "",
        gradientTo: (profile as any).gradientTo ?? "",
        gradientAngle: (profile as any).gradientAngle ?? 135,
        backgroundPattern: (profile as any).backgroundPattern ?? "none",
        heroLayout: (profile as any).heroLayout ?? (profile as any).headerLayout ?? "stacked",
        serviceCardStyle: (profile as any).serviceCardStyle ?? "card",
        animationStyle: (profile as any).animationStyle ?? "none",
        hoverEffect: (profile as any).hoverEffect ?? "none",
        backgroundColor: (profile as any).backgroundColor ?? "",
      };
      setForm(next);
      // Snapshot the hydrated form as the "saved" baseline so the
      // floating save bar only appears after a real user edit.
      baselineFormRef.current = next;
      try {
        const cats = (profile as any).businessCategories;
        if (cats) setSelectedCategories(JSON.parse(cats));
      } catch {}
    }
  }, [profile]);

  // ── Live font preview ──────────────────────────────────────────────────
  // As soon as the user picks a font in FontPicker we (a) pull the
  // Google Font stylesheet for it and (b) swap the --dashboard-font
  // CSS var. The whole dashboard re-renders in the new typeface even
  // before the owner hits save. On unmount / profile reload the root
  // Dashboard useEffect restores the saved value.
  useEffect(() => {
    const f = form.fontFamily;
    if (!f || f === "inherit") return;
    const id = `gfont-live-${f.replace(/\s+/g, "-")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id   = id;
      link.rel  = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
    document.documentElement.style.setProperty("--dashboard-font", `'${f}', sans-serif`);
    liveFontRef.current = f;
  }, [form.fontFamily]);

  // Update form when uploads complete. Gallery uses uploadMany (inline
  // in the input onChange), so no useEffect for galleryUpload.url.
  useEffect(() => { if (logoUpload.url) setForm(p => ({ ...p, logoUrl: logoUpload.url! })); }, [logoUpload.url]);
  useEffect(() => { if (bannerUpload.url) setForm(p => ({ ...p, bannerUrl: bannerUpload.url! })); }, [bannerUpload.url]);

  const uploading = logoUpload.isUploading || bannerUpload.isUploading || galleryUpload.isUploading;
  // isDirty drives the floating save bar — shown only after the form
  // diverges from the snapshot taken when the profile hydrated.
  const isDirty = useMemo(
    () => !!baselineFormRef.current && JSON.stringify(form) !== JSON.stringify(baselineFormRef.current),
    [form],
  );

  const handleSave = () => {
    updateBranding.mutate({
      data: {
        primaryColor: form.primaryColor || null,
        fontFamily: form.fontFamily || null,
        logoUrl: form.logoUrl || null,
        bannerUrl: form.bannerUrl || null,
        themeMode: "light",  // Deprecated — theme is now per-client via toggle buttons on Book/Portal
        borderRadius: form.borderRadius || null,
        buttonRadius: form.buttonRadius || null,
        welcomeText: null,
        backgroundColor: form.backgroundColor || null,
        showBusinessName: form.showBusinessName,
        showLogo: form.showLogo,
        showBanner: form.showBanner,
        headerLayout: form.headerLayout,
        galleryImages: form.galleryImages.length > 0 ? JSON.stringify(form.galleryImages) : null,
        bannerPosition: form.bannerPosition || "center",
        designPreset: form.designPreset || null,
        accentColor: form.accentColor || null,
        gradientEnabled: !!form.gradientEnabled,
        gradientFrom: form.gradientFrom || null,
        gradientTo: form.gradientTo || null,
        gradientAngle: Number(form.gradientAngle) || 135,
        backgroundPattern: form.backgroundPattern === "none" ? null : form.backgroundPattern,
        heroLayout: form.heroLayout || null,
        serviceCardStyle: form.serviceCardStyle || null,
        animationStyle: form.animationStyle === "none" ? null : form.animationStyle,
        hoverEffect: form.hoverEffect === "none" ? null : form.hoverEffect,
      } as any
    }, {
      onSuccess: async () => {
        toast({ title: "עיצוב נשמר" });
        // Promote the just-sent form to the new "saved" baseline so
        // the floating bar disappears immediately after a successful
        // save, without waiting for the refetch round-trip.
        baselineFormRef.current = form;
        await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey(), refetchType: "active" });
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירת העיצוב",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
  };

  // Apply a preset — bulk-updates all design fields
  const applyPreset = (presetId: string) => {
    const preset = DESIGN_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    setForm(p => ({
      ...p,
      designPreset: preset.id,
      primaryColor: preset.values.primaryColor,
      accentColor: preset.values.accentColor,
      fontFamily: preset.values.fontFamily,
      themeMode: preset.values.themeMode as any,
      borderRadius: (preset.values.borderRadius === "small" ? "sharp" : preset.values.borderRadius === "large" || preset.values.borderRadius === "full" ? "rounded" : preset.values.borderRadius === "none" ? "sharp" : "medium") as any,
      buttonRadius: (preset.values.buttonRadius === "small" ? "sharp" : preset.values.buttonRadius === "large" || preset.values.buttonRadius === "full" ? "rounded" : preset.values.buttonRadius === "none" ? "sharp" : "medium") as any,
      gradientEnabled: preset.values.gradientEnabled,
      gradientFrom: preset.values.gradientFrom || "",
      gradientTo: preset.values.gradientTo || "",
      gradientAngle: preset.values.gradientAngle,
      backgroundPattern: preset.values.backgroundPattern,
      heroLayout: preset.values.heroLayout,
      serviceCardStyle: preset.values.serviceCardStyle,
      animationStyle: preset.values.animationStyle,
      hoverEffect: preset.values.hoverEffect,
      backgroundColor: preset.values.backgroundColor || "",
    }));
    toast({ title: `הופעל עיצוב: ${preset.name}`, description: "לחץ 'שמור' כדי להחיל על הפרופיל" });
  };

  const handleImageUpload = async (file: File, field: "logoUrl" | "bannerUrl") => {
    if (field === "logoUrl") await logoUpload.upload(file);
    else await bannerUpload.upload(file);
  };

  const isPro = profile?.subscriptionPlan === "pro";
  if (profile && !isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
          <Crown className="w-10 h-10 text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">עיצוב אישי — מנוי PRO בלבד</h2>
          <p className="text-muted-foreground max-w-sm">שדרג למנוי PRO כדי להתאים את צבעים, פונטים, לוגו ומראה עמוד ההזמנות שלך</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <div className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground">✓ צבע ראשי</div>
          <div className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground">✓ פונט מותאם</div>
          <div className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground">✓ לוגו ובאנר</div>
          <div className="px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground">✓ עיצוב כפתורים</div>
        </div>
        <Button size="lg" className="gap-2 bg-blue-500 hover:bg-blue-600 text-white" onClick={() => toast({ title: "צור קשר לשדרוג", description: "פנה אלינו כדי לשדרג למנוי PRO" })}>
          <Crown className="w-4 h-4" /> שדרג ל-PRO
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Design presets removed per owner request — every business
          now gets the same default look (Rubik, Kavati brand colours)
          and customises only what they need: background, gradient,
          primary colour, corner style. */}

      {/* Live preview — mirrors the real Book.tsx rendering */}
      {(() => {
        const isDark = form.themeMode === "dark" || form.themeMode === "fuchsia";
        const textMain = isDark ? "rgba(255,255,255,0.95)" : "#1a1a1a";
        const textMuted = isDark ? "rgba(255,255,255,0.6)" : "#6b7280";
        // When a gradient is enabled (e.g. the "נועז" preset) we lighten the
        // card backgrounds significantly so the gradient shows through.
        // 0.65 is low enough to let purple-pink bleed through, high enough
        // to keep text readable.
        const cardBg = isDark
          ? "rgba(255,255,255,0.08)"
          : (form.gradientEnabled ? "rgba(255,255,255,0.65)" : "#ffffff");
        const buttonPx = form.buttonRadius === "sharp" ? "4px" : form.buttonRadius === "rounded" ? "9999px" : "12px";
        const cardPx = form.borderRadius === "sharp" ? "4px" : form.borderRadius === "rounded" ? "24px" : "14px";
        // Background is locked — cream in light, dark-neutral in dark
        // mode. Matches what Book.tsx renders so the preview never
        // drifts from the actual profile page.
        const bgStyle: React.CSSProperties = {
          backgroundColor: isDark ? "#141414" : "#ffffff",
        };

        return (
          // Sticky under the top nav so the preview stays on screen as the
          // owner scrolls through colour / font / logo / button controls.
          // Uses position: sticky + self-start so flex ancestors (the
          // TabsContent primitive) don't collapse it back into the normal
          // flow; previously showed as a static card after the Tabs
          // primitive switched to flex-col internally.
          <Card className="sticky top-4 z-20 self-start md:scale-[0.9] md:origin-top md:max-w-md md:mx-auto"
            style={{ position: "sticky" }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">תצוגה מקדימה</CardTitle>
              <CardDescription className="text-xs">מתעדכנת בזמן אמת תוך כדי שינוי ההגדרות למטה</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-2xl overflow-hidden shadow-md"
                dir="rtl"
                style={{
                  fontFamily: `'${form.fontFamily}', sans-serif`,
                  ...bgStyle,
                  border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex flex-col items-center text-center gap-2 mb-5">
                    {form.showLogo && form.logoUrl && (
                      <img src={form.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover ring-4 ring-white/80 shadow-lg" />
                    )}
                    {form.showBusinessName && (
                      <div className="text-2xl font-bold" style={{ color: form.primaryColor }}>
                        {profile?.name || "העסק שלך"}
                      </div>
                    )}
                    <div className="text-xs" style={{ color: textMuted }}>קבע תור אונליין</div>
                  </div>

                  {/* Sample service card — reflects serviceCardStyle. Every
                      variant pulls real service rows (name, price, duration,
                      description) from the owner's own services, so the
                      preview matches the business instead of a generic barber
                      placeholder. */}
                  {form.serviceCardStyle === "minimal" ? (
                    <div
                      className="flex items-center justify-between gap-3 py-3"
                      style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate" style={{ color: textMain }}>{previewServiceName}</div>
                        <div className="text-xs" style={{ color: textMuted }}>{previewDurationStr} · {previewPriceStr}</div>
                      </div>
                      <button className="shrink-0 px-4 py-1.5 text-xs font-medium text-white shadow" style={{ background: form.primaryColor, borderRadius: buttonPx }}>קבע</button>
                    </div>
                  ) : form.serviceCardStyle === "bubble" ? (
                    <button
                      className="w-full flex items-center gap-3 p-3 shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${form.primaryColor}20, ${(form.accentColor || form.primaryColor)}20)`,
                        border: `2px solid ${form.primaryColor}40`,
                        borderRadius: "9999px",
                      }}
                    >
                      <div className="w-12 h-12 rounded-full shrink-0" style={{ background: form.primaryColor + "40" }} />
                      <div className="flex-1 min-w-0 text-right">
                        <div className="font-bold text-sm truncate" style={{ color: textMain }}>{previewServiceName}</div>
                        <div className="text-xs" style={{ color: textMuted }}>{previewDurationStr}</div>
                      </div>
                      <div className="shrink-0 font-bold text-lg" style={{ color: form.primaryColor }}>{previewPriceStr}</div>
                    </button>
                  ) : form.serviceCardStyle === "grid" ? (
                    <div className="grid grid-cols-2 gap-3">
                      {(previewServiceList.length > 0
                        ? previewServiceList.concat(previewServiceList.length === 1 ? [previewServiceList[0]] : []).slice(0, 2)
                        : [null, null]
                      ).map((s, i) => {
                        const name = (s as any)?.name || "דוגמא";
                        const price = s ? fmtServicePrice(s as any) : "₪0";
                        const duration = s ? fmtServiceDuration(s as any) : "30 דקות";
                        return (
                          <div key={i} className="overflow-hidden shadow-sm" style={{ background: cardBg, borderRadius: cardPx }}>
                            <div className="h-16" style={{ background: `linear-gradient(135deg, ${form.primaryColor}40, ${(form.accentColor || form.primaryColor)}40)` }} />
                            <div className="p-2">
                              {/* Owner preference: full name, even if it
                                  wraps — scanning a grid of services, the
                                  name is the primary data, so no truncate. */}
                              <div className="font-bold text-xs leading-tight break-words" style={{ color: textMain }}>{name}</div>
                              <div className="flex justify-between gap-1 text-xs mt-1">
                                <span className="truncate" style={{ color: textMuted }}>{duration}</span>
                                <span className="shrink-0 font-bold" style={{ color: form.primaryColor }}>{price}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : form.serviceCardStyle === "split" ? (
                    // Side-by-side layout: image (or gradient placeholder)
                    // on one half, full service info + price badge on the
                    // other. Reads like a menu item in a café.
                    <div className="overflow-hidden shadow-sm flex" style={{ background: cardBg, borderRadius: cardPx, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}` }}>
                      <div className="w-24 shrink-0" style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor || form.primaryColor})` }} />
                      <div className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm leading-tight break-words" style={{ color: textMain }}>{previewServiceName}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: textMuted }}>{previewDurationStr}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold" style={{ color: form.primaryColor }}>{previewPriceStr}</span>
                          <button className="px-3 py-1 text-[11px] font-medium text-white shadow" style={{ background: form.primaryColor, borderRadius: buttonPx }}>קבע</button>
                        </div>
                      </div>
                    </div>
                  ) : form.serviceCardStyle === "banner" ? (
                    // Wide banner with the name + price overlaid on a
                    // branded gradient — feels premium/hero-style and
                    // works well for salons with strong branding.
                    <button
                      className="w-full overflow-hidden shadow-md relative h-24 flex items-end p-3 text-start"
                      style={{
                        borderRadius: cardPx,
                        background: `linear-gradient(120deg, ${form.primaryColor} 0%, ${form.accentColor || form.primaryColor} 100%)`,
                      }}
                    >
                      <div className="relative z-10 text-white">
                        <div className="font-extrabold text-base leading-tight break-words drop-shadow">{previewServiceName}</div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] opacity-95">
                          <span>{previewDurationStr}</span>
                          <span>·</span>
                          <span className="font-bold">{previewPriceStr}</span>
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </button>
                  ) : (
                    <div className="overflow-hidden shadow-sm" style={{ background: cardBg, borderRadius: cardPx, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}` }}>
                      <div className="p-4">
                        <div className="flex justify-between items-start gap-3 mb-1">
                          <div className="font-bold text-sm min-w-0 truncate" style={{ color: textMain }}>{previewServiceName}</div>
                          <div className="shrink-0 font-bold" style={{ color: form.primaryColor }}>{previewPriceStr}</div>
                        </div>
                        <div className="text-xs mb-3 line-clamp-2" style={{ color: textMuted }}>
                          {previewServiceDescription ? `${previewServiceDescription} · ${previewDurationStr}` : previewDurationStr}
                        </div>
                        <div className="flex justify-end">
                          <button className="px-4 py-1.5 text-xs font-medium text-white shadow" style={{ background: form.primaryColor, borderRadius: buttonPx }}>קבע תור</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle>עיצוב חנות</CardTitle>
          <CardDescription>התאם אישית את מראה עמוד ההזמנות שלך</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">צבע ראשי</h3>
            <p className="text-xs text-muted-foreground">הצבע הדומיננטי של העסק — כפתורים ראשיים, הדגשות, שם עסק ומספרי מחיר</p>
            <div className="flex flex-wrap gap-3 items-center">
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, primaryColor: c }))}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${form.primaryColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }} />
              ))}
              <div className="flex items-center gap-2 border rounded-lg p-2">
                <input type="color" value={form.primaryColor} onChange={e => setForm(p => ({ ...p, primaryColor: e.target.value }))} className="w-9 h-9 rounded cursor-pointer border-none bg-transparent" />
                <span className="text-sm font-mono text-muted-foreground">{form.primaryColor}</span>
              </div>
            </div>
            <div className="p-4 rounded-xl border" style={{ borderColor: form.primaryColor + "40", backgroundColor: form.primaryColor + "10" }}>
              <div className="font-bold mb-2" style={{ color: form.primaryColor }}>תצוגה מקדימה של הצבע</div>
              <button className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: form.primaryColor }}>קבע תור</button>
            </div>
            {/* Live readability check — if the primary colour doesn't
                give white button text enough contrast (WCAG AA = 4.5:1
                for body text, 3:1 for large text) warn the owner so
                they don't ship unreadable buttons. */}
            {/* Contrast warning removed per owner — the helper is kept in
                the file in case we want to resurrect it later. */}
          </div>

          <Separator />

          <FontPicker value={form.fontFamily} onChange={v => setForm(p => ({ ...p, fontFamily: v }))} />

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">סגנון פינות כרטיסים</h3>
            <p className="text-xs text-muted-foreground">משפיע על כרטיסים ומיכלים בעמוד ההזמנות</p>
            <div className="flex gap-3 mb-3">
              {([
                { value: "sharp", label: "ישר" },
                { value: "medium", label: "מעוגל" },
                { value: "rounded", label: "עגול" },
              ] as const).map(s => (
                <button key={s.value} onClick={() => setForm(p => ({ ...p, borderRadius: s.value }))}
                  className={`flex-1 py-3 border-2 text-sm font-medium transition-all ${form.borderRadius === s.value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  style={{ borderRadius: s.value === "sharp" ? "4px" : s.value === "medium" ? "12px" : "999px" }}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Live card preview */}
            <div className="p-4 rounded-xl border bg-muted/30 flex gap-3 justify-center">
              {[1, 2].map(i => (
                <div key={i} className="border-2 p-3 w-28 space-y-1.5 transition-all"
                  style={{
                    borderColor: form.primaryColor + "60",
                    borderRadius: form.borderRadius === "sharp" ? "4px" : form.borderRadius === "rounded" ? "24px" : "14px",
                    background: form.primaryColor + "08",
                  }}>
                  <div className="h-2 w-12 rounded-full" style={{ background: form.primaryColor + "40" }} />
                  <div className="h-2 w-16 rounded-full bg-muted" />
                  <div className="h-5 w-full rounded-md mt-1" style={{ background: form.primaryColor + "30" }} />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">עיצוב כפתורים</h3>
            <p className="text-xs text-muted-foreground">משפיע על כפתורי קביעת תור ואישור</p>
            <div className="flex gap-3 mb-3">
              {([
                { value: "sharp", label: "ישר" },
                { value: "medium", label: "מעוגל" },
                { value: "rounded", label: "עגול" },
              ] as const).map(s => (
                <button key={s.value} onClick={() => setForm(p => ({ ...p, buttonRadius: s.value }))}
                  className={`flex-1 py-3 border-2 text-sm font-medium transition-all ${(form as any).buttonRadius === s.value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  style={{ borderRadius: s.value === "sharp" ? "4px" : s.value === "medium" ? "12px" : "999px" }}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Live button preview */}
            <div className="p-4 rounded-xl border bg-muted/30 flex items-center justify-center gap-3">
              <button
                className="px-5 py-2.5 text-white text-sm font-semibold transition-all shadow-md"
                style={{
                  backgroundColor: form.primaryColor,
                  borderRadius: (form as any).buttonRadius === "sharp" ? "4px" : (form as any).buttonRadius === "rounded" ? "999px" : "12px",
                }}
              >
                קבע תור
              </button>
              <button
                className="px-5 py-2.5 text-sm font-semibold border-2 transition-all"
                style={{
                  borderColor: form.primaryColor,
                  color: form.primaryColor,
                  borderRadius: (form as any).buttonRadius === "sharp" ? "4px" : (form as any).buttonRadius === "rounded" ? "999px" : "12px",
                  background: "transparent",
                }}
              >
                ביטול
              </button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">לוגו ובאנר</h3>
            <p className="text-xs text-muted-foreground">לוגו מופיע כאייקון עגול בראש הדף, הבאנר הוא רקע אחורי בראש עמוד הפרופיל</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>לוגו העסק</Label>
                <p className="text-xs text-muted-foreground">מומלץ: 400×400px • PNG/JPG • עד 2MB</p>
                {form.logoUrl && (
                  // inline-block so the wrapper shrinks to the logo size —
                  // otherwise the X ends up pinned to the corner of the full
                  // grid cell (next to the banner column) instead of the logo.
                  <div className="relative inline-block">
                    <img src={form.logoUrl} alt="לוגו" className="w-24 h-24 rounded-xl object-cover border" />
                    <button className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      onClick={() => setForm(p => ({ ...p, logoUrl: "" }))}>✕</button>
                  </div>
                )}
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], "logoUrl")} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logoRef.current?.click()} disabled={uploading}>
                  <Upload className="w-4 h-4" /> {uploading ? "מעלה..." : "העלה לוגו"}
                </Button>
              </div>
              <div className="space-y-3">
                <Label>תמונת רקע (באנר)</Label>
                <p className="text-xs text-muted-foreground">מומלץ למובייל: 800×500px (יחס ~16:10) • כל מידה נתמכת • PNG/JPG • עד 5MB</p>
                {form.bannerUrl && (
                  // Preview renders the image at its natural aspect ratio
                  // (w-full + h-auto) instead of cropping to a short strip.
                  // Mirrors what the public page will show on mobile —
                  // owners upload all sorts of sizes (square, tall, wide)
                  // and the old h-24 + object-cover hid most of the picture.
                  <div className="relative">
                    <img src={form.bannerUrl} alt="באנר" className="w-full h-auto rounded-xl border" />
                    <button className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      onClick={() => setForm(p => ({ ...p, bannerUrl: "" }))}>✕</button>
                  </div>
                )}
                <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], "bannerUrl")} />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => bannerRef.current?.click()} disabled={uploading}>
                  <ImageIcon className="w-4 h-4" /> {uploading ? "מעלה..." : "העלה באנר"}
                </Button>
              </div>
            </div>
          </div>
          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">כותרת עמוד ההזמנות</h3>
            <p className="text-xs text-muted-foreground">בחר אילו אלמנטים יוצגו בראש עמוד הקביעת תורים</p>

            <div className="space-y-3">
              {[
                { key: "showBusinessName", label: "שם העסק" },
                { key: "showLogo", label: "לוגו" },
                { key: "showBanner", label: "באנר" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <span className="text-sm font-medium">{label}</span>
                  <Switch
                    checked={(form as any)[key]}
                    onCheckedChange={(v) => setForm(p => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}
            </div>

          </div>

          <Separator />

          {/* Banner position selector removed per owner request — the
              live preview didn't reflect it, and the default "center"
              works for the vast majority of banners. DB field kept so
              existing rows aren't disturbed; can be re-added later if
              we wire the preview to show it. */}

          {/* Gallery */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">גלריה (עד 12 תמונות)</h3>
            <p className="text-xs text-muted-foreground">תמונות מעבודות העסק שיוצגו בגלריה בעמוד הפרופיל</p>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async e => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length === 0) return;
                // Clamp the batch to the remaining gallery slots so we
                // never upload images that would just be dropped on the
                // .slice(0, 12) in the state update.
                const remaining = Math.max(0, 12 - form.galleryImages.length);
                const toUpload = files.slice(0, remaining);
                if (toUpload.length === 0) return;
                const urls = await galleryUpload.uploadMany(toUpload);
                if (urls.length > 0) {
                  setForm(p => ({ ...p, galleryImages: [...p.galleryImages, ...urls].slice(0, 12) }));
                }
              }}
            />
            {form.galleryImages.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {form.galleryImages.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img src={url} alt={`gallery-${i}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, galleryImages: p.galleryImages.filter((_, j) => j !== i) }))}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {form.galleryImages.length < 12 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={galleryUpload.isUploading}
                onClick={() => galleryRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                {galleryUpload.isUploading
                  ? galleryUpload.progress.total > 1
                      ? `מעלה ${galleryUpload.progress.done}/${galleryUpload.progress.total}...`
                      : "מעלה תמונה..."
                  : "הוסף תמונות לגלריה"}
              </Button>
            )}
            {galleryUpload.error && <p className="text-xs text-destructive">{galleryUpload.error}</p>}
          </div>

          {/* The whole "רקע מתקדם" block (gradient on/off, 2 colour
              pickers, angle slider, decorative pattern) was removed
              per owner request. Background is now locked to the
              cream default + dark-mode toggle; no more mismatch
              between preview and profile.
              The DB fields (gradientEnabled / gradientFrom / To /
              Angle / backgroundPattern / backgroundColor) stay in
              place — existing rows aren't disturbed, and if we ever
              want to restore the controls we can. */}
          <div className="space-y-6 pt-4 border-t">
            <div>
              <h3 className="font-semibold text-base border-b pb-2 mb-3">סגנון כרטיסיות שירות</h3>
              <p className="text-xs text-muted-foreground mb-3">איך כרטיסי השירותים (תספורת, טיפול וכד') מוצגים בעמוד ההזמנות</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "card",    label: "כרטיס",   desc: "קלאסי עם תמונה" },
                  { id: "minimal", label: "מינימלי", desc: "שורת טקסט + כפתור" },
                  { id: "grid",    label: "רשת",     desc: "2 עמודות עם תמונה" },
                  { id: "bubble",  label: "בועה",    desc: "עגול ומעוצב" },
                  { id: "split",   label: "מפוצל",   desc: "תמונה בצד, פרטים ומחיר" },
                  { id: "banner",  label: "באנר",    desc: "רקע מלא + טקסט עליו" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setForm(p => ({ ...p, serviceCardStyle: opt.id }))}
                    className={`p-3 text-right rounded-lg border-2 transition-all ${form.serviceCardStyle === opt.id ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

          </div>

        </CardContent>
        <div className="px-6 pb-6 flex justify-end">
          <Button onClick={handleSave} disabled={updateBranding.isPending} size="lg">שמור עיצוב</Button>
        </div>
      </Card>
      <FloatingSaveBar visible={isDirty} onClick={handleSave} saving={updateBranding.isPending} />
    </div>
  );
}

function IntegrationsTab() {
  const { data: profile } = useGetBusinessProfile();
  const updateProfile = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [sendBookingConfirmation, setSendBookingConfirmation] = useState(true);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementValidHours, setAnnouncementValidHours] = useState(24);
  const [sendReminders, setSendReminders] = useState(true);
  const [shabbatMode, setShabbatMode] = useState<"any" | "shabbat">("any");
  const [reminderTriggers, setReminderTriggers] = useState<Array<{ amount: string; unit: string }>>([
    { amount: "24", unit: "hours" }
  ]);

  useEffect(() => {
    if (profile) {
      setNotificationEnabled(profile.notificationEnabled ?? true);
      setSendBookingConfirmation((profile as any).sendBookingConfirmation ?? true);
      setSendReminders((profile as any).sendReminders ?? true);
      setAnnouncementText((profile as any).announcementText ?? "");
      setAnnouncementValidHours((profile as any).announcementValidHours ?? 24);
      setShabbatMode(((profile as any).shabbatMode ?? "any") as "any" | "shabbat");
      const saved = (profile as any).reminderTriggers;
      if (saved) { try {
        const arr = JSON.parse(saved);
        // Cap at 2 — older data may have up to 3 entries from before the
        // limit was tightened; drop the extras so the UI doesn't allow
        // the owner to stay out-of-policy.
        setReminderTriggers(Array.isArray(arr) ? arr.slice(0, 2) : []);
      } catch {} }
    }
  }, [profile]);

  const handleSave = () => {
    updateProfile.mutate({
      data: {
        notificationEnabled,
        // Custom per-booking WhatsApp text field was removed from the UI;
        // clear any stale value in the DB so it doesn't keep appending.
        notificationMessage: null,
        sendBookingConfirmation,
        sendReminders,
        announcementText: announcementText || null,
        announcementValidHours,
        // Hard cap at 2 reminders per booking on the write path too.
        reminderTriggers: JSON.stringify(reminderTriggers.slice(0, 2)),
        shabbatMode,
      } as any
    }, {
      onSuccess: async (updated) => {
        toast({ title: "הגדרות הודעות נשמרו" });
        // Force-refetch the active profile query so the sticky bar's
        // cancel-edit baseline + other tabs see the new value immediately.
        await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey(), refetchType: "active" });
        // Echo the server's response into local state — avoids any
        // scenario where the toggle flips back because the local state
        // didn't re-sync from the invalidated query.
        if (updated) {
          setNotificationEnabled((updated as any).notificationEnabled ?? true);
          setSendBookingConfirmation((updated as any).sendBookingConfirmation ?? true);
          setSendReminders((updated as any).sendReminders ?? true);
          setAnnouncementText((updated as any).announcementText ?? "");
          setAnnouncementValidHours((updated as any).announcementValidHours ?? 24);
          setShabbatMode(((updated as any).shabbatMode ?? "any") as "any" | "shabbat");
          const saved = (updated as any).reminderTriggers;
          if (saved) { try { setReminderTriggers(JSON.parse(saved)); } catch {} }
        }
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירה",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Status */}
      <div className="flex items-center gap-3 p-4 rounded-xl border bg-green-50 border-green-200">
        <div className="w-3 h-3 rounded-full shrink-0 bg-green-500" />
        <div>
          <div className="font-semibold text-sm text-green-800" dir="rtl"><span dir="ltr">WhatsApp</span> פעיל — מופעל על ידי קבעתי</div>
          <div className="text-xs text-green-600 mt-0.5">הודעות נשלחות ללקוחות ואליך מהמספר הרשמי של קבעתי</div>
        </div>
      </div>

      {/* Notification to owner */}
      <Card>
        <CardHeader>
          <CardTitle>התראות לבעלת העסק</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">קבלי התראה על כל תור חדש</div>
              <div className="text-xs text-muted-foreground" dir="rtl">הודעת <span dir="ltr">WhatsApp</span> תישלח לנייד שלך <span dir="ltr">({profile?.phone})</span></div>
            </div>
            <Switch checked={notificationEnabled} onCheckedChange={setNotificationEnabled} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">שלח אישור תור ללקוח</div>
              <div className="text-xs text-muted-foreground" dir="rtl">הודעת <span dir="ltr">WhatsApp</span> נשלחת ללקוח מיד עם קביעת התור</div>
            </div>
            <Switch checked={sendBookingConfirmation} onCheckedChange={setSendBookingConfirmation} />
          </div>
        </CardContent>
      </Card>

      {/* הודעת פתיחה ללקוח — shown when a client opens the business profile.
           Owner can set content + duration; client sees a popup with a
           "קראתי" checkbox that dismisses the message forever. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">📢</span> הודעת פתיחה
          </CardTitle>
          <CardDescription>
            הודעה שלקוח יראה בפעם הראשונה שייכנס לעמוד ההזמנות שלך. לקוח יכול לסמן "קראתי" ולא לראות אותה שוב.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>תוכן ההודעה</Label>
            <textarea
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="לדוגמא: חנוכה שמח! כל הטיפולים השבוע ב-20% הנחה 🎉"
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value.slice(0, 500))}
            />
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{announcementText.length} / 500 תווים</span>
              {announcementText.trim() && (
                <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> פעיל
                </span>
              )}
            </div>
          </div>

          {/* Duration + quick-adjust actions — only when there's content. */}
          {announcementText.trim() && (
            <>
              <div className="space-y-2 pt-2 border-t">
                <Label>כמה זמן ההודעה תופיע ללקוחות?</Label>
                <p className="text-xs text-muted-foreground">
                  הכמות בשעות. ברגע שהזמן נגמר, ההודעה תיעלם מהעמוד ולקוחות חדשים לא יראו אותה.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="number" min={1} max={8760}
                    className="w-28 rounded-xl border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
                    value={announcementValidHours}
                    onChange={e => setAnnouncementValidHours(Math.max(1, Number(e.target.value) || 24))}
                  />
                  <span className="text-sm text-muted-foreground">שעות</span>
                  {/* Quick presets */}
                  <div className="flex gap-1.5 ms-2">
                    {[
                      { label: "יום",    hours: 24 },
                      { label: "שבוע",   hours: 24 * 7 },
                      { label: "חודש",   hours: 24 * 30 },
                    ].map(p => (
                      <button
                        key={p.hours}
                        type="button"
                        onClick={() => setAnnouncementValidHours(p.hours)}
                        className={`px-3 py-1 text-xs rounded-full border transition-all ${announcementValidHours === p.hours ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick extend/shorten + delete actions */}
              <div className="flex gap-2 flex-wrap pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnouncementValidHours(h => Math.max(1, h - 24))}
                  className="text-xs"
                  title="הורד יום אחד"
                >
                  − יום
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnouncementValidHours(h => h + 24)}
                  className="text-xs"
                  title="הוסף יום אחד"
                >
                  + יום
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAnnouncementValidHours(h => h + 24 * 7)}
                  className="text-xs"
                  title="הוסף שבוע"
                >
                  + שבוע
                </Button>
                <div className="ms-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("למחוק את ההודעה?")) setAnnouncementText("");
                    }}
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    🗑 מחק הודעה
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reminders card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">🔔</span> תזכורות ללקוחות לפני התור
          </CardTitle>
          <CardDescription>הגדר מתי ואיך לשלוח תזכורות ללקוחות לפני התור</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/20">
              <div>
                <div className="font-medium text-sm">שליחת תזכורות</div>
                <div className="text-xs text-muted-foreground mt-0.5">תזכורות ישלחו ללקוחות לפני מועד התור</div>
              </div>
              <Switch checked={sendReminders} onCheckedChange={setSendReminders} />
            </div>
          </div>

          {sendReminders && (
            <div className="p-4 border rounded-xl bg-muted/20 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-medium text-sm">מתי לשלוח תזכורות?</span>
                <span className="text-xs text-muted-foreground">{reminderTriggers.length} / 2 תזכורות</span>
              </div>
              {reminderTriggers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {reminderTriggers.map((t, i) => {
                    if (t.unit === "morning") return (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                        🌅 בוקר יום התור (08:00)
                      </span>
                    );
                    const unitLabel = t.unit === "minutes" ? "דקות" : t.unit === "hours" ? "שעות" : "ימים";
                    return (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        🔔 {t.amount} {unitLabel} לפני
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="space-y-3">
                {reminderTriggers.map((trigger, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 border rounded-xl bg-background">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center">{idx + 1}</span>
                    {trigger.unit !== "morning" && (
                      <input type="number" min="1" max="999" value={trigger.amount}
                        onChange={e => setReminderTriggers(prev => prev.map((t, i) => i === idx ? { ...t, amount: e.target.value } : t))}
                        className="rounded-lg border bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary w-20"
                      />
                    )}
                    <select value={trigger.unit}
                      onChange={e => setReminderTriggers(prev => prev.map((t, i) => i === idx ? { ...t, unit: e.target.value } : t))}
                      className="rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                    >
                      <option value="minutes">דקות לפני</option>
                      <option value="hours">שעות לפני</option>
                      <option value="days">ימים לפני</option>
                      <option value="morning">🌅 בוקר יום התור (08:00)</option>
                    </select>
                    {reminderTriggers.length > 1 && (
                      <button type="button" onClick={() => setReminderTriggers(prev => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors text-lg leading-none">✕</button>
                    )}
                  </div>
                ))}
                {reminderTriggers.length < 2 && (
                  <button type="button"
                    onClick={() => setReminderTriggers(prev => [...prev, { amount: "1", unit: "hours" }])}
                    className="w-full py-2.5 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-all"
                  >+ הוסף תזכורת נוספת</button>
                )}
              </div>
              <div className="pt-2 border-t">
                <button type="button"
                  onClick={() => setShabbatMode(m => m === "shabbat" ? "any" : "shabbat")}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-right transition-all ${shabbatMode === "shabbat" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                >
                  <span className="text-2xl">🕍</span>
                  <div className="flex-1">
                    <div className={`text-sm font-semibold ${shabbatMode === "shabbat" ? "text-primary" : ""}`}>עסק שומר שבת</div>
                    <div className="text-xs text-muted-foreground mt-0.5">שישי 08:00 — תזכורת לפני כניסת שבת &nbsp;|&nbsp; שבת 21:00 — תזכורת במוצאי שבת</div>
                  </div>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${shabbatMode === "shabbat" ? "bg-primary border-primary" : "border-border"}`}>
                    {shabbatMode === "shabbat" && <Check className="w-3 h-3 text-white" />}
                  </div>
                </button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Save / cancel at the bottom of the tab — normal flow. */}
      <div className="flex items-center justify-between gap-3 pt-6 mt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            if (profile) {
              setNotificationEnabled(profile.notificationEnabled ?? true);
              setSendBookingConfirmation((profile as any).sendBookingConfirmation ?? true);
              setSendReminders((profile as any).sendReminders ?? true);
              setAnnouncementText((profile as any).announcementText ?? "");
              setAnnouncementValidHours((profile as any).announcementValidHours ?? 24);
              setShabbatMode(((profile as any).shabbatMode ?? "any") as "any" | "shabbat");
              const saved = (profile as any).reminderTriggers;
              setReminderTriggers(saved ? (() => { try { return JSON.parse(saved); } catch { return [{ amount: "24", unit: "hours" }]; } })() : [{ amount: "24", unit: "hours" }]);
              toast({ title: "השינויים בוטלו" });
            }
          }}
          className="flex-1 sm:flex-none"
        >
          בטל עריכה
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className="flex-1 sm:flex-none"
        >
          {updateProfile.isPending ? "שומר..." : "שמור הכל"}
        </Button>
      </div>
    </div>
  );
}

const API_BASE_DASH = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ─── Receipts Tab ─────────────────────────────────────────────────────────
// Business owners list + issue receipts to their clients. Sends receipt
// email via the backend (Resend). Requires the owner to fill in tax ID etc.
// in the settings tab first — the backend will return 400 otherwise.

interface ReceiptRow {
  id:               number;
  receipt_number:   number;
  client_name:      string | null;
  client_phone:     string | null;
  client_email:     string | null;
  amount_agorot:    number;
  currency:         string;
  payment_method:   string | null;
  description:      string | null;
  issued_at:        string;
}

function ReceiptsTab() {
  const { data: profile } = useGetBusinessProfile();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    clientName: "", clientPhone: "", clientEmail: "",
    amountILS: "", description: "", paymentMethod: "credit_card",
  });
  const [saving, setSaving] = useState(false);

  const hasTaxSetup = !!((profile as any)?.businessTaxId);

  const load = () => {
    setLoading(true);
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    fetch(`${API_BASE_DASH}/business/receipts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : []))
      .then((data: ReceiptRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amountILS || Number(form.amountILS) <= 0) {
      toast({ title: "סכום לא תקין", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_DASH}/business/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientName: form.clientName || null,
          clientPhone: form.clientPhone || null,
          clientEmail: form.clientEmail || null,
          amountILS: Number(form.amountILS),
          description: form.description || null,
          paymentMethod: form.paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "שגיאה");
      toast({ title: `קבלה מספר ${data.receiptNumber} הונפקה` });
      setForm({ clientName: "", clientPhone: "", clientEmail: "", amountILS: "", description: "", paymentMethod: "credit_card" });
      setFormOpen(false);
      load();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!hasTaxSetup) {
    return (
      <div className="max-w-2xl p-6 border-2 border-dashed rounded-xl text-center space-y-3">
        <h3 className="font-bold text-lg">לפני שניפיקי קבלות — צריך למלא פרטי עסק</h3>
        <p className="text-sm text-muted-foreground">
          כל קבלה חייבת לכלול ח.פ / ת.ז. וכתובת של העסק. לך להגדרות → "פרטי עסק לקבלות" ותמלאי את הפרטים.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">קבלות ללקוחות</h2>
          <p className="text-sm text-muted-foreground">כאן תוכל להנפיק ולנהל קבלות שיישלחו אוטומטית במייל ללקוחות.</p>
        </div>
        <Button onClick={() => setFormOpen(o => !o)} size="lg">
          <Plus className="w-4 h-4 ml-1" /> הנפק קבלה חדשה
        </Button>
      </div>

      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle>קבלה חדשה</CardTitle>
            <CardDescription>מלא פרטי הלקוח והסכום. הקבלה תישלח במייל אם תזין כתובת.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleIssue} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם הלקוח</Label>
                  <Input value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} placeholder="שם פרטי + משפחה" />
                </div>
                <div className="space-y-2">
                  <Label>אימייל הלקוח (לשליחת הקבלה)</Label>
                  <Input type="email" dir="ltr" value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} placeholder="client@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>טלפון הלקוח</Label>
                  <Input type="tel" dir="ltr" value={form.clientPhone} onChange={e => setForm(p => ({ ...p, clientPhone: e.target.value }))} placeholder="050-1234567" />
                </div>
                <div className="space-y-2">
                  <Label>סכום (₪)</Label>
                  <Input type="number" min="1" step="0.01" value={form.amountILS} onChange={e => setForm(p => ({ ...p, amountILS: e.target.value }))} placeholder="100" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>תיאור</Label>
                  <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="תיאור השירות או המוצר" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>ביטול</Button>
                <Button type="submit" disabled={saving}>{saving ? "מנפיק..." : "הנפק קבלה"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>קבלות אחרונות</CardTitle>
          <CardDescription>{rows.length > 0 ? `${rows.length} קבלות הונפקו` : "עדיין לא הנפקת קבלות"}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">טוען...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              לחץ "הנפק קבלה חדשה" למעלה כדי להתחיל.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="flex items-center justify-between p-4 border rounded-xl">
                  <div>
                    <div className="font-semibold">קבלה #{r.receipt_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.client_name ?? "—"} {r.client_email ? `· ${r.client_email}` : ""}
                    </div>
                    {r.description && <div className="text-xs text-muted-foreground mt-1">{r.description}</div>}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-lg">₪{(r.amount_agorot / 100).toFixed(2)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(r.issued_at).toLocaleDateString("he-IL")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const { data: profile } = useGetBusinessProfile();
  const updateMutation = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isPro = profile?.subscriptionPlan === "pro";
  // Snapshot of the loaded form — drives the floating save bar.
  const baselineFormRef = useRef<any>(null);
  const baselineCategoriesRef = useRef<string[] | null>(null);

  const [form, setForm] = useState({
    name: "", ownerName: "", ownerGender: "male" as "male" | "female" | "other", phone: "", email: "",
    requireAppointmentApproval: false, requirePhoneVerification: false,
    tranzilaEnabled: false,
    depositAmount: "0",
    // booking restrictions
    minLeadHours: "0",
    cancellationHours: "0",
    maxFutureWeeks: "15",
    futureBookingMode: "weeks" as "weeks" | "date",
    maxFutureDate: "",
    maxAppointmentsPerCustomer: "",
    requireActiveSubscription: false,
    maxAppointmentsPerDay: "",
    // Business profile (moved from Design tab)
    businessDescription: "",
    contactPhone: "",
    address: "",
    city: "",
    websiteUrl: "",
    instagramHandle: "",
    wazeUrl: "",
    // Receipt profile
    businessTaxId: "",
    businessLegalType: "exempt" as "exempt" | "authorized" | "company",
    businessLegalName: "",
    invoiceAddress: "",
    // URL slug
    slug: "",
  });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Password change state
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (profile) {
      const next = {
        name: profile.name,
        ownerName: profile.ownerName,
        ownerGender: (((profile as any).ownerGender ?? "male") as "male" | "female" | "other"),
        phone: (profile as any).phone ?? "",
        email: (profile as any).email ?? "",
        requireAppointmentApproval: (profile as any).requireAppointmentApproval ?? false,
        requirePhoneVerification: (profile as any).requirePhoneVerification ?? false,
        tranzilaEnabled: (profile as any).tranzilaEnabled ?? false,
        depositAmount: (((profile as any).depositAmountAgorot ?? 0) / 100).toString(),
        minLeadHours: ((profile as any).minLeadHours ?? 0).toString(),
        cancellationHours: ((profile as any).cancellationHours ?? 0).toString(),
        maxFutureWeeks: ((profile as any).maxFutureWeeks ?? 15).toString(),
        futureBookingMode: (profile as any).futureBookingMode ?? "weeks",
        maxFutureDate: (profile as any).maxFutureDate ?? "",
        maxAppointmentsPerCustomer: ((profile as any).maxAppointmentsPerCustomer ?? "").toString(),
        requireActiveSubscription: (profile as any).requireActiveSubscription ?? false,
        maxAppointmentsPerDay: ((profile as any).maxAppointmentsPerDay ?? 3).toString(),
        businessDescription: (profile as any).businessDescription ?? "",
        contactPhone: (profile as any).contactPhone ?? "",
        address: (profile as any).address ?? "",
        city: (profile as any).city ?? "",
        websiteUrl: (profile as any).websiteUrl ?? "",
        instagramHandle: ((profile as any).instagramUrl ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, ""),
        wazeUrl: (profile as any).wazeUrl ?? "",
        businessTaxId: (profile as any).businessTaxId ?? "",
        businessLegalType: ((profile as any).businessLegalType ?? "exempt") as "exempt" | "authorized" | "company",
        businessLegalName: (profile as any).businessLegalName ?? "",
        invoiceAddress: (profile as any).invoiceAddress ?? "",
        slug: profile.slug ?? "",
      };
      setForm(next);
      baselineFormRef.current = next;
      try {
        const cats = (profile as any).businessCategories;
        const parsed = cats ? JSON.parse(cats) : [];
        setSelectedCategories(parsed);
        baselineCategoriesRef.current = parsed;
      } catch {
        baselineCategoriesRef.current = [];
      }
    }
  }, [profile]);

  const isDirty = useMemo(() => {
    if (!baselineFormRef.current) return false;
    if (JSON.stringify(form) !== JSON.stringify(baselineFormRef.current)) return true;
    const baseCats = baselineCategoriesRef.current ?? [];
    return JSON.stringify(selectedCategories) !== JSON.stringify(baseCats);
  }, [form, selectedCategories]);

  // Prepend https:// to bare domains so the SettingsTab's website /
  // Waze inputs produce absolute URLs in the DB. Without this an owner
  // entering "example.com" ends up with a relative link the browser
  // resolves against kavati.net (→ kavati.net/example.com).
  const ensureHttps = (u: string): string | null => {
    const t = (u ?? "").trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      data: {
        name: form.name,
        ownerName: form.ownerName,
        ownerGender: form.ownerGender,
        phone: form.phone || null,
        email: form.email || undefined,
        requireAppointmentApproval: form.requireAppointmentApproval,
        requirePhoneVerification: form.requirePhoneVerification,
        minLeadHours: parseInt(form.minLeadHours) || 0,
        cancellationHours: parseInt(form.cancellationHours) || 0,
        maxFutureWeeks: parseInt(form.maxFutureWeeks) || 15,
        futureBookingMode: form.futureBookingMode,
        maxFutureDate: form.maxFutureDate || null,
        maxAppointmentsPerCustomer: form.maxAppointmentsPerCustomer ? parseInt(form.maxAppointmentsPerCustomer) : null,
        requireActiveSubscription: form.requireActiveSubscription,
        maxAppointmentsPerDay: form.maxAppointmentsPerDay ? parseInt(form.maxAppointmentsPerDay) : null,
        tranzilaEnabled: form.tranzilaEnabled,
        depositAmountAgorot: form.tranzilaEnabled ? Math.round(parseFloat(form.depositAmount || "0") * 100) : null,
        // Business profile fields (moved from Design tab)
        businessDescription: form.businessDescription || null,
        contactPhone: form.contactPhone || null,
        address: form.address || null,
        city: form.city || null,
        websiteUrl: ensureHttps(form.websiteUrl),
        instagramUrl: form.instagramHandle ? `https://www.instagram.com/${form.instagramHandle.replace(/^@/, "")}` : null,
        wazeUrl: ensureHttps(form.wazeUrl),
        businessCategories: selectedCategories.length > 0 ? JSON.stringify(selectedCategories) : null,
        // Receipt profile — what the business prints on its receipts
        businessTaxId: form.businessTaxId || null,
        businessLegalType: form.businessLegalType || null,
        businessLegalName: form.businessLegalName || null,
        invoiceAddress: form.invoiceAddress || null,
        // URL slug — only send if the owner actually changed it
        ...(form.slug && form.slug !== profile?.slug ? { slug: form.slug } : {}),
      } as any
    }, {
      onSuccess: async () => {
        toast({ title: "הגדרות נשמרו" });
        // Promote the just-sent form to the new baseline so the floating
        // bar disappears immediately after save.
        baselineFormRef.current = form;
        baselineCategoriesRef.current = [...selectedCategories];
        await queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey(), refetchType: "active" });
      },
      onError: (err: any) => {
        toast({
          title: "שגיאה בשמירה",
          description: err?.response?.data?.message ?? err?.message ?? "נסה שוב",
          variant: "destructive",
        });
      },
    });
  };


  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast({ title: "הסיסמאות החדשות אינן תואמות", variant: "destructive" });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast({ title: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }
    setPwLoading(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_DASH}/auth/business/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "שגיאה", description: data.message ?? "לא ניתן לשנות סיסמה", variant: "destructive" });
      } else {
        toast({ title: "הסיסמה שונתה בהצלחה" });
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      }
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setPwLoading(false);
    }
  };

  if (!profile) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Share-link banner moved to the home tab so the owner sees it
          the moment they log in. Settings stays focused on editable
          business details. */}

      {/* General settings card — merged with business profile and password change */}
      <Card>
        <CardHeader>
          <CardTitle>הגדרות כלליות</CardTitle>
          <CardDescription>פרטי עסק, פרטי הפרופיל הציבורי, אפשרויות קבלת תורים ושינוי סיסמה</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-8">
            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">פרטים כלליים</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>שם העסק</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                {/* Owner name is stored as a single `ownerName` in the DB but
                    edited as two fields here. We split on whitespace on read
                    and re-join on write so the existing backend/migration
                    doesn't need to change. Multi-word first name support:
                    the LAST token is treated as the family name, everything
                    before it is the first name — so "לילך שרה כהן" reads
                    back as first="לילך שרה", last="כהן" instead of losing
                    the middle name to the surname slot. */}
                {(() => {
                  const parts = (form.ownerName || "").trim().split(/\s+/).filter(Boolean);
                  const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
                  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
                  return (
                    <>
                      <div className="space-y-2">
                        <Label>שם פרטי</Label>
                        <Input
                          value={firstName}
                          onChange={e => {
                            const fn = e.target.value;
                            setForm(p => ({ ...p, ownerName: `${fn}${lastName ? " " + lastName : ""}` }));
                          }}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>שם משפחה</Label>
                        <Input
                          value={lastName}
                          onChange={e => {
                            const ln = e.target.value;
                            setForm(p => ({ ...p, ownerName: `${firstName}${ln ? " " + ln : ""}`.trim() }));
                          }}
                        />
                      </div>
                    </>
                  );
                })()}
                <div className="space-y-2 sm:col-span-2">
                  <Label>איך לפנות אליך?</Label>
                  <div className="flex gap-2">
                    {([
                      { v: "male",   label: "זכר" },
                      { v: "female", label: "נקבה" },
                      { v: "other",  label: "אחר" },
                    ] as const).map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, ownerGender: opt.v }))}
                        className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${form.ownerGender === opt.v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">הפנייה באתר תותאם ללשון (ברוך הבא / ברוכה הבאה וכו'). "אחר" = לשון זכר.</p>
                </div>
                <div className="space-y-2">
                  <Label>מספר טלפון</Label>
                  <Input
                    type="tel"
                    dir="ltr"
                    placeholder=""
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">ניתן להתחבר גם עם מספר הטלפון</p>
                </div>
                <div className="space-y-2">
                  <Label>אימייל</Label>
                  <Input type="email" dir="ltr" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                {/* Old "לינק לקביעת תור" block removed — the share
                    link now lives in the highlighted notice banner at
                    the top of the settings page. */}
                {/* Slug editor removed per owner — the canonical
                    share link is the /api/s/<slug> URL, and editing
                    the slug directly caused confusion (the inline
                    block still showed the old /book/<slug> form).
                    The slug is still set at signup and can be changed
                    by SuperAdmin if truly needed. */}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">אישור תורים ואבטחה</h3>
              {isPro && (
                <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
                  <div>
                    <div className="font-medium text-sm">דרוש אישור ידני לתורים</div>
                    <div className="text-xs text-muted-foreground mt-0.5">כבוי = תורים מאושרים אוטומטית | דלוק = אתה מאשר כל תור ידנית</div>
                  </div>
                  <Switch checked={form.requireAppointmentApproval} onCheckedChange={v => setForm(p => ({ ...p, requireAppointmentApproval: v }))} />
                </div>
              )}
              <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
                <div>
                  <div className="font-medium text-sm">אימות טלפון בקביעת תור</div>
                  <div className="text-xs text-muted-foreground mt-0.5" dir="rtl">דלוק = לקוח חייב לאמת מספר טלפון בקוד <span dir="ltr">WhatsApp</span> לפני קביעת תור</div>
                </div>
                <Switch checked={form.requirePhoneVerification} onCheckedChange={v => setForm(p => ({ ...p, requirePhoneVerification: v }))} />
              </div>
              {/* Tranzila Deposit */}
              <div className="flex items-center justify-between py-3 border-b border-border/50">
                <div>
                  <div className="font-medium text-sm">תשלום מקדמה (טרנזילה)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">דלוק = לקוח חייב לשלם מקדמה לפני אישור התור</div>
                </div>
                <Switch checked={form.tranzilaEnabled} onCheckedChange={v => setForm(p => ({ ...p, tranzilaEnabled: v }))} />
              </div>
              {form.tranzilaEnabled && (
                <div className="space-y-2 pb-3 border-b border-border/50">
                  <Label className="text-sm">סכום מקדמה (₪)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.depositAmount}
                    onChange={e => setForm(p => ({ ...p, depositAmount: e.target.value }))}
                    className="h-10 w-32"
                    placeholder="50"
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">פרטי העסק לעמוד הפרופיל</h3>
              <p className="text-xs text-muted-foreground -mt-2">מה שלקוחות רואים בעמוד ההזמנות שלך — קטגוריה, תיאור, דרכי יצירת קשר, קישורים</p>
          {/* Categories */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              סוג העסק
              <span className="text-xs text-muted-foreground font-normal">(אפשר לבחור כמה)</span>
            </Label>
            {selectedCategories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedCategories.map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {cat}
                    <button type="button" onClick={() => setSelectedCategories(p => p.filter(c => c !== cat))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setCategoryOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2.5 border rounded-xl text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-muted-foreground">{selectedCategories.length > 0 ? `${selectedCategories.length} נבחרו` : "בחר סוג עסק..."}</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
            </button>
            {categoryOpen && (
              <div className="border rounded-xl bg-background shadow-md">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="text"
                      placeholder="חפש סוג עסק..."
                      value={categorySearch}
                      onChange={e => setCategorySearch(e.target.value)}
                      className="pr-9 h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                  {BUSINESS_CATEGORIES.filter(c => c.includes(categorySearch)).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategories(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat])}
                      className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategories.includes(cat) ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>תיאור העסק</Label>
            <textarea
              value={form.businessDescription}
              onChange={e => setForm(p => ({ ...p, businessDescription: e.target.value }))}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="כתבו כמה מילים על העסק..."
            />
          </div>

          <div className="space-y-2">
            <Label>מספר טלפון ליצירת קשר (יוצג ללקוחות)</Label>
            <p className="text-xs text-muted-foreground">אם לא מוזן, יוצג מספר הטלפון הרשום בחשבון</p>
            <Input dir="ltr" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} placeholder="" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>כתובת העסק (תוצג בפרופיל)</Label>
              <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="רחוב הרצל 1, תל אביב" />
            </div>
            <div className="space-y-2">
              <Label>עיר (לחיפוש בספריית קבעתי)</Label>
              <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="תל אביב" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>קישור לאתר</Label>
            <Input dir="ltr" value={form.websiteUrl} onChange={e => setForm(p => ({ ...p, websiteUrl: e.target.value }))} placeholder="https://www.mywebsite.com" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><Instagram className="w-4 h-4 text-muted-foreground" /> שם משתמש באינסטגרם</Label>
            <div className="flex items-center rounded-xl border bg-muted/40 overflow-hidden focus-within:ring-2 focus-within:ring-primary">
              <span className="px-3 text-sm text-muted-foreground border-l bg-muted">@</span>
              <input
                dir="ltr"
                className="flex-1 px-3 py-2 bg-transparent text-sm outline-none"
                placeholder="my_business"
                value={form.instagramHandle}
                onChange={e => setForm(p => ({ ...p, instagramHandle: e.target.value.replace(/^@/, "") }))}
              />
            </div>
            {form.instagramHandle && (
              <p className="text-xs text-muted-foreground">instagram.com/{form.instagramHandle}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>קישור לוויז (אופציונלי)</Label>
            <p className="text-xs text-muted-foreground">אם ריק — ניווט יופעל אוטומטית לפי הכתובת שהוזנה</p>
            <Input dir="ltr" value={form.wazeUrl} onChange={e => setForm(p => ({ ...p, wazeUrl: e.target.value }))} placeholder="https://waze.com/ul/..." />
          </div>
            </div>

            {/* ── Business Receipt / Invoice Profile ── */}
            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">פרטי עסק לקבלות</h3>
              <p className="text-xs text-muted-foreground -mt-2">
                פרטים אלה יודפסו על כל קבלה שתנפיק ללקוחות. חובה למלא ח.פ / ת.ז. ושם משפטי לפני הנפקת הקבלה הראשונה.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ח.פ / ת.ז. (מספר עוסק)</Label>
                  <Input
                    dir="ltr"
                    value={form.businessTaxId}
                    onChange={e => setForm(p => ({ ...p, businessTaxId: e.target.value.replace(/\D/g, "") }))}
                    placeholder="123456789"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-2">
                  <Label>סוג העסק</Label>
                  <select
                    value={form.businessLegalType}
                    onChange={e => setForm(p => ({ ...p, businessLegalType: e.target.value as any }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="exempt">עוסק פטור</option>
                    <option value="authorized">עוסק מורשה</option>
                    <option value="company">חברה בע"מ</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>שם משפטי לקבלות (כפי שרשום ברשות המיסים)</Label>
                  <Input
                    value={form.businessLegalName}
                    onChange={e => setForm(p => ({ ...p, businessLegalName: e.target.value }))}
                    placeholder={form.ownerName || "שם מלא"}
                  />
                  <p className="text-xs text-muted-foreground">אם ריק, יוצג שם העסק הרגיל. עוסק פטור = שם מלא. חברה = השם המשפטי המלא.</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>כתובת לחשבונית</Label>
                  <Input
                    value={form.invoiceAddress}
                    onChange={e => setForm(p => ({ ...p, invoiceAddress: e.target.value }))}
                    placeholder="רחוב 1, עיר, מיקוד"
                  />
                  <p className="text-xs text-muted-foreground">הכתובת הרשומה במס הכנסה — לא בהכרח כתובת העסק הפיזית.</p>
                </div>
              </div>
            </div>

          </form>

          {/* ── Password change — nested here so it lives at the bottom of
                 the general-settings card instead of as a standalone block. */}
          <div className="pt-6 mt-6 border-t">
            <h3 className="font-medium text-base mb-1">שינוי סיסמה</h3>
            <p className="text-xs text-muted-foreground mb-4">עדכן את הסיסמה שלך לכניסה ללוח הבקרה</p>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label>סיסמה נוכחית</Label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    dir="ltr"
                    required
                    value={pwForm.currentPassword}
                    onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                    autoComplete="current-password"
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>סיסמה חדשה</Label>
                  <Input type={showPw ? "text" : "password"} dir="ltr" required placeholder="לפחות 6 תווים"
                    value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                    autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label>אימות סיסמה חדשה</Label>
                  <Input type={showPw ? "text" : "password"} dir="ltr" required placeholder="הכנס שוב"
                    value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    autoComplete="new-password" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={pwLoading} size="lg">
                  {pwLoading ? "שומר..." : "שנה סיסמה"}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Booking restrictions moved to the Services tab. */}

      {/* Custom domain — Pro-only */}
      {profile && <CustomDomainCard />}

      {/* Subscription status card — shown for both free and pro */}
      {profile && <SubscriptionStatusCard />}

      {/* Save / cancel at the bottom of the tab — one button for the
          entire Settings form (profile, receipts, booking restrictions,
          slug). Password change has its own submit button inside the
          card because it needs currentPassword + newPassword. */}
      <div className="flex items-center justify-between gap-3 pt-6 mt-4 border-t">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              // Revert all form fields from the last-loaded profile.
              if (profile) {
                setForm({
                  name: profile.name,
                  ownerName: profile.ownerName,
                  phone: (profile as any).phone ?? "",
                  email: (profile as any).email ?? "",
                  requireAppointmentApproval: (profile as any).requireAppointmentApproval ?? false,
                  requirePhoneVerification: (profile as any).requirePhoneVerification ?? false,
                  tranzilaEnabled: (profile as any).tranzilaEnabled ?? false,
                  depositAmount: (((profile as any).depositAmountAgorot ?? 0) / 100).toString(),
                  minLeadHours: ((profile as any).minLeadHours ?? 0).toString(),
                  cancellationHours: ((profile as any).cancellationHours ?? 0).toString(),
                  maxFutureWeeks: ((profile as any).maxFutureWeeks ?? 15).toString(),
                  futureBookingMode: (profile as any).futureBookingMode ?? "weeks",
                  maxFutureDate: (profile as any).maxFutureDate ?? "",
                  maxAppointmentsPerCustomer: ((profile as any).maxAppointmentsPerCustomer ?? "").toString(),
                  requireActiveSubscription: (profile as any).requireActiveSubscription ?? false,
                  maxAppointmentsPerDay: ((profile as any).maxAppointmentsPerDay ?? 3).toString(),
                  businessDescription: (profile as any).businessDescription ?? "",
                  contactPhone: (profile as any).contactPhone ?? "",
                  address: (profile as any).address ?? "",
                  city: (profile as any).city ?? "",
                  websiteUrl: (profile as any).websiteUrl ?? "",
                  instagramHandle: ((profile as any).instagramUrl ?? "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, ""),
                  wazeUrl: (profile as any).wazeUrl ?? "",
                  businessTaxId: (profile as any).businessTaxId ?? "",
                  businessLegalType: ((profile as any).businessLegalType ?? "exempt") as "exempt" | "authorized" | "company",
                  businessLegalName: (profile as any).businessLegalName ?? "",
                  invoiceAddress: (profile as any).invoiceAddress ?? "",
                  slug: profile.slug ?? "",
                });
                try {
                  const cats = (profile as any).businessCategories;
                  setSelectedCategories(cats ? JSON.parse(cats) : []);
                } catch { setSelectedCategories([]); }
                toast({ title: "השינויים בוטלו" });
              }
            }}
            className="flex-1 sm:flex-none"
          >
            בטל עריכה
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={e => handleSave(e as any)}
            disabled={updateMutation.isPending}
            className="flex-1 sm:flex-none"
          >
            {updateMutation.isPending ? "שומר..." : "שמור הכל"}
          </Button>
      </div>
      <FloatingSaveBar
        visible={isDirty}
        onClick={() => handleSave({ preventDefault: () => {} } as any)}
        saving={updateMutation.isPending}
      />
    </div>
  );
}

// ─── Custom domain card (Pro-only) ─────────────────────────────────────────
// Lets a Pro business register a hostname they own (e.g. book.theirsalon.co.il)
// so their customers don't see kavati.net in the URL. Ships with step-by-step
// instructions for both subdomain (recommended) and path-redirect (advanced)
// setups.

function CustomDomainCard() {
  const { data: profile } = useGetBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isPro = profile?.subscriptionPlan !== "free";

  const currentDomain  = (profile as any)?.customDomain ?? "";
  const isVerified     = !!(profile as any)?.customDomainVerified;

  const [input, setInput]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [mode, setMode]       = useState<"subdomain" | "path">("subdomain");

  useEffect(() => { setInput(currentDomain); }, [currentDomain]);

  const save = async (value: string | null) => {
    setSaving(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_DASH}/business/domain`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ domain: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "שגיאה");
      toast({ title: value ? "הדומיין נשמר" : "הדומיין הוסר", description: value ? "ממתין לאימות DNS אוטומטי (עד 5 דקות אחרי שה-CNAME יתפרסם)" : undefined });
      queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isPro) {
    return (
      <Card className="opacity-70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-blue-500" /> דומיין מותאם אישית
            <Badge variant="outline" className="text-xs">PRO</Badge>
          </CardTitle>
          <CardDescription>שדרג לפרו כדי שעמוד ההזמנות יופיע על הדומיין שלך (למשל book.yoursalon.co.il)</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🌐 דומיין מותאם אישית
          {currentDomain && (
            isVerified
              ? <Badge className="bg-green-100 text-green-700 border-green-200">פעיל</Badge>
              : <Badge className="bg-amber-100 text-amber-700 border-amber-200">ממתין לאישור</Badge>
          )}
        </CardTitle>
        <CardDescription>
          רוצה שעמוד ההזמנה יהיה על הדומיין שלך? לדוגמה <b dir="ltr">book.yoursalon.co.il</b> במקום <b dir="ltr">kavati.net/book/...</b>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Current value + save */}
        <div className="space-y-2">
          <Label>הדומיין שלך</Label>
          <div className="flex gap-2">
            <Input
              dir="ltr"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="book.yoursalon.co.il"
              className="flex-1"
            />
            <Button
              onClick={() => save(input.trim() || null)}
              disabled={saving || input.trim() === currentDomain.trim()}
              size="sm"
            >
              {saving ? "שומר..." : "שמור"}
            </Button>
            {currentDomain && (
              <Button
                onClick={() => { setInput(""); save(null); }}
                disabled={saving}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200"
              >
                הסר
              </Button>
            )}
          </div>
          {currentDomain && !isVerified && (
            <p className="text-xs text-amber-700">
              הדומיין נשמר אצלנו. הצוות של קבעתי יאשר אותו תוך 24 שעות — בד"כ תוך שעה-שעתיים. אחרי האישור העמוד יהיה פעיל על <b dir="ltr">{currentDomain}</b>.
            </p>
          )}
          {currentDomain && isVerified && (
            <p className="text-xs text-green-700">
              ✓ הדומיין פעיל. לקוחותיך יכולים לגלוש ל-<b dir="ltr">{currentDomain}</b>
            </p>
          )}
        </div>

        {/* Instructions tabs */}
        <div className="border rounded-xl p-4 bg-muted/30">
          <div className="text-sm font-semibold mb-3">הוראות חיבור — בחר את השיטה המתאימה לך:</div>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMode("subdomain")}
              className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${mode === "subdomain" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              Subdomain (מומלץ)
            </button>
            <button
              type="button"
              onClick={() => setMode("path")}
              className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${mode === "path" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
            >
              Path על האתר הקיים שלך
            </button>
          </div>

          {mode === "subdomain" ? (
            <ol className="space-y-3 text-xs leading-relaxed">
              <li>
                <b>1. היכנס לחברה שבה קנית את הדומיין</b><br />
                <span className="text-muted-foreground">דוגמאות: GoDaddy, Namecheap, Domain The Net (ישראמוניטור), One.com, Wix DNS, וכד'</span>
              </li>
              <li>
                <b>2. פתח את הגדרות DNS (לפעמים "ניהול רשומות" / "DNS Zone Editor")</b>
              </li>
              <li>
                <b>3. הוסף רשומה חדשה עם הפרטים הבאים:</b>
                <div className="mt-2 bg-background border rounded-lg p-3 font-mono text-xs" dir="ltr">
                  <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">סוג:</span> <span>CNAME</span>
                    <span className="text-muted-foreground">שם (Name):</span> <span>book</span>
                    <span className="text-muted-foreground">יעד (Value / Target):</span> <span>kavati.net</span>
                    <span className="text-muted-foreground">TTL:</span> <span>3600 (שעה)</span>
                  </div>
                </div>
                <p className="text-muted-foreground mt-1">
                  💡 במקום "book" אפשר לבחור כל שם: <code dir="ltr">tor</code>, <code dir="ltr">zimnu</code>, <code dir="ltr">my</code>, וכד'. זה מה שיופיע לפני הדומיין שלך.
                </p>
              </li>
              <li>
                <b>4. שמור את הרשומה</b>
              </li>
              <li>
                <b>5. חזור לכאן, הכנס את הדומיין המלא למעלה (לדוגמה <code dir="ltr">book.yoursalon.co.il</code>) ולחץ שמור</b>
              </li>
              <li>
                <b>6. המתן כ-5 דקות — המערכת מאמתת לבד</b><br />
                <span className="text-muted-foreground">ברגע ש-DNS מתפרסם ותעודת SSL מונפקת, הסטטוס מתעדכן אוטומטית מ"ממתין" ל"פעיל"</span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-xs leading-relaxed">
              <li>
                <b>1. היכנס לפאנל הניהול של האתר שלך</b><br />
                <span className="text-muted-foreground">WordPress, Wix, Webflow, cPanel, Plesk וכד'</span>
              </li>
              <li>
                <b>2. מצא את ההגדרות של "Redirect" או "URL Forwarding"</b><br />
                <span className="text-muted-foreground">ב-WordPress: plugin כמו Redirection. ב-cPanel: Domains → Redirects. ב-Wix: Settings → SEO → 301 Redirects.</span>
              </li>
              <li>
                <b>3. הוסף הפניה (redirect) מ-</b>
                <div className="mt-2 bg-background border rounded-lg p-3 font-mono text-xs" dir="ltr">
                  <div className="space-y-1">
                    <div><span className="text-muted-foreground">מ:</span> /appointment</div>
                    <div><span className="text-muted-foreground">אל:</span> https://{currentDomain || "book.yoursalon.co.il"} או https://kavati.net/book/{profile?.slug ?? "your-slug"}</div>
                    <div><span className="text-muted-foreground">סוג:</span> 301 (Permanent)</div>
                  </div>
                </div>
              </li>
              <li>
                <b>4. שמור ובדוק — גלוש ל-</b><code dir="ltr">yoursalon.co.il/appointment</code> <b>ותראה שזה מפנה לעמוד ההזמנה</b>
              </li>
              <li>
                <b>יתרון:</b> האתר הקיים שלך נשאר כמו שהוא, רק ה-path <code>/appointment</code> מופנה אלינו.<br />
                <b>חיסרון:</b> בכתובת של הלקוח תופיע כתובת קבעתי (לא שם הדומיין שלך) אחרי ההפניה.
              </li>
              <li>
                <b>💡 המלצה:</b> אם חשוב לך שלקוחותיך יראו את הדומיין שלך כל הזמן — שלב את שתי השיטות: Subdomain + קישור מה-<code>/appointment</code> שלך אל ה-subdomain.
              </li>
            </ol>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          🔒 אנחנו מפעילים אוטומטית תעודת HTTPS מאובטחת (SSL) — בלי עלות, תוך כמה דקות אחרי האישור.
        </p>
      </CardContent>
    </Card>
  );
}

function SubscriptionStatusCard() {
  const { data: profile } = useGetBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingUpgrade, setLoadingUpgrade] = useState(false);

  const isPro = profile?.subscriptionPlan === "pro";
  const renewDate: Date | null = (profile as any)?.subscriptionRenewDate
    ? new Date((profile as any).subscriptionRenewDate)
    : null;
  const cancelledAt: Date | null = (profile as any)?.subscriptionCancelledAt
    ? new Date((profile as any).subscriptionCancelledAt)
    : null;
  const subscriptionStartDate: Date | null = (profile as any)?.subscriptionStartDate
    ? new Date((profile as any).subscriptionStartDate)
    : null;

  const handleUpgrade = async () => {
    setLoadingUpgrade(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_DASH}/tranzila/subscription-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "שגיאה");
      window.open(data.url, "_blank", "width=500,height=700");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setLoadingUpgrade(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch(`${API_BASE_DASH}/subscription/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בביטול");
      toast({ title: "המנוי בוטל", description: data.message });
      queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
      setShowConfirm(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Card className={isPro ? "border-blue-200" : "border-slate-200"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className={`w-5 h-5 ${isPro ? "text-blue-500" : "text-slate-400"}`} />
            סטטוס מנוי
          </CardTitle>
          <CardDescription>
            {isPro ? "הגדרות חיוב חודשי אוטומטי" : "אתה במנוי חינמי — שדרג לפרו להסרת כל המגבלות"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`flex items-center justify-between p-4 border rounded-xl ${isPro ? "bg-blue-50/50" : "bg-slate-50"}`}>
            <div className="space-y-1">
              <div className={`font-medium text-sm ${isPro ? "text-blue-800" : "text-slate-900"}`}>
                {isPro
                  ? (cancelledAt ? "מנוי פרו — בוטל" : "מנוי פרו פעיל")
                  : "מנוי חינמי"}
              </div>
              {isPro && subscriptionStartDate && (
                <div className="text-xs text-muted-foreground">
                  פעיל מאז {format(subscriptionStartDate, "d בMMM yyyy", { locale: he })}
                </div>
              )}
              {/* Live Tranzila STO info — "next charge" line shows the real
                  date from Tranzila when available, else falls back to our
                  renewDate estimate. `status` was a ReferenceError here; the
                  intent is to read the stoInfo embedded in the business
                  profile response. */}
              {isPro && (profile as any)?.stoInfo?.nextChargeDateTime && !cancelledAt && (
                <div className="text-xs text-muted-foreground">
                  חיוב הבא: {format(new Date((profile as any).stoInfo.nextChargeDateTime), "d בMMM yyyy", { locale: he })}
                  {(profile as any).stoInfo.chargeAmount ? ` — ₪${(profile as any).stoInfo.chargeAmount}/חודש` : ""}
                </div>
              )}
              {isPro && !((profile as any)?.stoInfo?.nextChargeDateTime) && renewDate && !cancelledAt && (
                <div className="text-xs text-muted-foreground">
                  חידוש אוטומטי ב-{format(renewDate, "d בMMM yyyy", { locale: he })} — ₪100/חודש
                </div>
              )}
              {isPro && (profile as any)?.stoInfo?.lastChargeDateTime && (
                <div className="text-xs text-muted-foreground">
                  חיוב אחרון: {format(new Date((profile as any).stoInfo.lastChargeDateTime), "d בMMM yyyy", { locale: he })}
                </div>
              )}
              {isPro && cancelledAt && renewDate && (
                <div className="text-xs text-amber-600">
                  גישה לפרו בתוקף עד {format(renewDate, "d בMMM yyyy", { locale: he })}
                </div>
              )}
              {!isPro && (
                <div className="text-xs text-muted-foreground">
                  עד {FREE_SERVICE_LIMIT} שירותים · ללא עיצוב מותאם · ללא WhatsApp מותאם
                </div>
              )}
            </div>
            <Badge className={
              !isPro ? "bg-slate-100 text-slate-700 border-slate-200"
              : cancelledAt ? "bg-amber-100 text-amber-700 border-amber-200"
              : "bg-blue-100 text-blue-600 border-blue-200"
            }>
              {!isPro ? "חינמי" : cancelledAt ? "מבוטל" : "פעיל"}
            </Badge>
          </div>

          {!isPro && (
            <Button
              onClick={handleUpgrade}
              disabled={loadingUpgrade}
              className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
            >
              <Crown className="w-4 h-4" />
              {loadingUpgrade ? "טוען..." : "שדרג למנוי פרו — ₪100/חודש"}
            </Button>
          )}

          {isPro && !cancelledAt && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
              onClick={() => setShowConfirm(true)}
            >
              <X className="w-4 h-4 ml-1" /> בטל מנוי
            </Button>
          )}

          {isPro && cancelledAt && (
            <p className="text-xs text-muted-foreground">
              לחידוש המנוי לאחר הפקיעה, פתח שדרוג חדש מהבאנר למעלה.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>לבטל את המנוי?</DialogTitle>
            <DialogDescription>
              לא תחויב יותר. גישה לפרו תישמר עד תאריך החידוש הקרוב
              {renewDate ? ` (${format(renewDate, "d בMMM", { locale: he })})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowConfirm(false)}
              disabled={cancelling}
            >
              לא, המשך
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "מבטל..." : "כן, בטל"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Contrast helpers — WCAG relative-luminance + ratio. Used by the
// BrandingTab <ContrastWarning /> to surface unreadable colour combos
// in real time as the owner tweaks the brand palette.
function _luminance(hex: string): number {
  const m = hex.replace("#", "").padEnd(6, "0");
  const rs = [0, 2, 4].map(i => parseInt(m.substr(i, 2), 16) / 255);
  const [r, g, b] = rs.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function _contrastRatio(a: string, b: string): number {
  const la = _luminance(a);
  const lb = _luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function ContrastWarning({ colors }: { colors: Array<{ bg: string; fg: string; context: string }> }) {
  const failing = colors
    .filter(c => /^#?[0-9a-fA-F]{6}$/.test(c.bg.replace("#", "")) && /^#?[0-9a-fA-F]{6}$/.test(c.fg.replace("#", "")))
    .map(c => ({ ...c, ratio: _contrastRatio(c.bg, c.fg) }))
    .filter(c => c.ratio < 4.5);
  if (failing.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <span className="font-semibold">⚠️ הטקסט עלול להיות לא קריא</span>
    </div>
  );
}

function EmptyState({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`text-center py-12 text-muted-foreground ${className}`}>{text}</div>
  );
}

// Small glowing "PRO" chip for marking Pro-gated features without hiding them.
function ProShine() {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white bg-gradient-to-r from-blue-500 via-fuchsia-500 to-amber-400 shadow-[0_0_8px_rgba(168,85,247,0.5)] animate-pulse"
      title="זמין במנוי PRO"
    >
      <Crown className="w-2.5 h-2.5" />
      PRO
    </span>
  );
}

// Full-tab upgrade prompt shown when a free user opens a Pro-only tab.
function ProUpgradePrompt({ title, desc }: { title: string; desc: string }) {
  const { toast } = useToast();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-fuchsia-100 flex items-center justify-center shadow-[0_0_24px_rgba(168,85,247,0.35)]">
        <Crown className="w-10 h-10 text-blue-500" />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground max-w-sm">{desc}</p>
      </div>
      <Button
        size="lg"
        className="gap-2 bg-gradient-to-r from-blue-500 to-fuchsia-600 hover:from-blue-600 hover:to-fuchsia-700 text-white shadow-lg"
        onClick={() => toast({ title: "שדרוג למנוי PRO", description: "פתח את לשונית ההגדרות → סטטוס מנוי → שדרג" })}
      >
        <Crown className="w-4 h-4" /> שדרג למנוי PRO
      </Button>
    </div>
  );
}
