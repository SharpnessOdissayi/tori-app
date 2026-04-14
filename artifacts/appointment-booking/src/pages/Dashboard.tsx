import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  ChevronLeft, ChevronRight, HelpCircle, Eye, EyeOff, Umbrella, DollarSign,
  MessageSquare, Send, Search, ChevronDown, Instagram
} from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import Navbar from "@/components/Navbar";

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

const HEBREW_FONTS = [
  { value: "Heebo", label: "Heebo" },
  { value: "Assistant", label: "Assistant" },
  { value: "Rubik", label: "Rubik" },
  { value: "Secular One", label: "Secular One" },
  { value: "Noto Sans Hebrew", label: "Noto Sans Hebrew" },
  { value: "Frank Ruhl Libre", label: "Frank Ruhl Libre" },
  { value: "Varela Round", label: "Varela Round" },
  { value: "Alef", label: "Alef" },
  { value: "Arimo", label: "Arimo" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Inter", label: "Inter" },
  { value: "Raleway", label: "Raleway" },
  { value: "Nunito", label: "Nunito" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "DM Sans", label: "DM Sans" },
];

const PRESET_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#dc2626",
  "#ea580c", "#16a34a", "#0891b2", "#0f172a",
];

const FREE_SERVICE_LIMIT = 3;
const FREE_MONTHLY_CUSTOMER_LIMIT = 20;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 1 && m === 0) return "שעה";
  if (h === 1 && m > 0) return `שעה ו-${m} דקות`;
  if (m === 0) return `${h} שעות`;
  return `${h} שעות ו-${m} דקות`;
}


function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const fullUrl = `${window.location.origin}/book/${slug}`;
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

function SubscriptionBanner() {
  const { data: profile } = useGetBusinessProfile();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { data: services } = useListBusinessServices();

  if (!profile) return null;

  const isPro = profile.subscriptionPlan !== "free";
  const servicesList = Array.isArray(services) ? services : [];
  const serviceCount = servicesList.filter(s => s.isActive).length;

  if (isPro) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-l from-violet-50 to-indigo-50 border border-violet-200 rounded-xl mb-4 text-sm">
        <Crown className="w-4 h-4 text-violet-600 shrink-0" />
        <span className="text-violet-800 font-medium">מנוי {profile.subscriptionPlan === "pro" ? "פרו" : "חינמי"} פעיל</span>
        <span className="text-violet-500 text-xs mr-auto">גישה מלאה לכל התכונות</span>
      </div>
    );
  }

  const nearLimit = serviceCount >= FREE_SERVICE_LIMIT - 1;

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
        <Button size="sm" onClick={() => setShowUpgrade(true)}
          className="bg-gradient-to-l from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white gap-1.5 shrink-0">
          <Crown className="w-3.5 h-3.5" /> שדרג לפרו — ₪100/חודש
        </Button>
      </div>

      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Crown className="w-6 h-6 text-violet-600" /> שדרג למנוי פרו
            </DialogTitle>
            <DialogDescription>הרחב את העסק שלך ללא מגבלות</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="border rounded-xl p-4 bg-muted/30">
                <div className="font-bold text-lg mb-1">חינמי</div>
                <div className="text-2xl font-bold text-muted-foreground mb-3">₪0<span className="text-sm font-normal">/חודש</span></div>
                <ul className="text-sm space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-1.5"><X className="w-3.5 h-3.5 text-red-400 shrink-0" /> עד 3 שירותים</li>
                  <li className="flex items-center gap-1.5"><X className="w-3.5 h-3.5 text-red-400 shrink-0" /> עד 20 לקוחות/חודש</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> עמוד הזמנות</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> לוח בקרה</li>
                </ul>
              </div>
              <div className="border-2 border-violet-300 rounded-xl p-4 bg-violet-50 relative">
                <div className="absolute -top-3 right-3">
                  <Badge className="bg-violet-600 text-white text-xs">מומלץ</Badge>
                </div>
                <div className="font-bold text-lg mb-1 text-violet-800">פרו</div>
                <div className="text-2xl font-bold text-violet-700 mb-3">₪100<span className="text-sm font-normal">/חודש</span></div>
                <ul className="text-sm space-y-1.5 text-violet-700">
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> שירותים ללא הגבלה</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> לקוחות ללא הגבלה</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> עיצוב מותאם אישית</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> אינטגרציות WhatsApp</li>
                  <li className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> תמיכה מועדפת</li>
                </ul>
              </div>
            </div>

            <div className="bg-muted rounded-xl p-4 text-sm text-center text-muted-foreground">
              לרכישת מנוי צור איתנו קשר בוואטסאפ
            </div>

            <a href="https://wa.me/972500000000?text=שלום%2C%20אני%20מעוניין%20לשדרג%20למנוי%20פרו%20של%20קבעתי" target="_blank" rel="noopener noreferrer">
              <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-11 text-base">
                <Phone className="w-5 h-5" /> צור קשר בוואטסאפ לשדרוג
              </Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Onboarding Tour
// ─────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    title: "ברוך הבא לקבעתי! 👋",
    description: "בוא נכיר את לוח הבקרה בכמה שניות. אפשר לדלג בכל שלב.",
    tab: null,
  },
  {
    title: "פגישות",
    description: "כאן תראה את כל התורים הקרובים והעבר, תוכל לבטל תורים ולעקוב אחרי הסטטיסטיקות.",
    tab: "appointments",
  },
  {
    title: "שירותים",
    description: "הגדר את השירותים שאתה מציע — שם, מחיר, משך זמן ותמונה. זה מה שהלקוחות יראו בעת ההזמנה.",
    tab: "services",
  },
  {
    title: "שעות עבודה",
    description: "קבע באילו ימים ושעות אתה זמין. הלקוחות יוכלו לקבוע רק בשעות שהגדרת.",
    tab: "hours",
  },
  {
    title: "הגדרות",
    description: "עדכן את פרטי העסק, שתף את הלינק שלך עם לקוחות, והתאם את הודעת הפתיחה.",
    tab: "settings",
  },
];

function OnboardingTour({ onComplete, onTabChange }: { onComplete: () => void; onTabChange: (tab: string) => void }) {
  const [step, setStep] = useState(0);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      const next = step + 1;
      setStep(next);
      const nextTab = TOUR_STEPS[next].tab;
      if (nextTab) onTabChange(nextTab);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      const prev = step - 1;
      setStep(prev);
      const prevTab = TOUR_STEPS[prev].tab;
      if (prevTab) onTabChange(prevTab);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">
              שלב {step + 1} מתוך {TOUR_STEPS.length}
            </div>
            <h3 className="font-bold text-lg leading-tight">{current.title}</h3>
          </div>
          <button
            onClick={onComplete}
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
            title="דלג על ההדרכה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={handleBack} className="gap-1">
              <ChevronRight className="w-4 h-4" /> אחורה
            </Button>
          )}
          <Button size="sm" onClick={handleNext} className="flex-1 gap-1">
            {isLast ? "סיים הדרכה" : <>הבא <ChevronLeft className="w-4 h-4" /></>}
          </Button>
        </div>

        <button
          onClick={onComplete}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          דלג על ההדרכה
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [token, setToken] = useState(
    () => localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")
  );
  const [activeTab, setActiveTab] = useState("appointments");
  const { data: headerProfile } = useGetBusinessProfile();
  const [showTour, setShowTour] = useState(() => {
    return localStorage.getItem("onboarding_pending") === "true" &&
           !localStorage.getItem("onboarding_completed");
  });

  const handleLogout = () => {
    localStorage.removeItem("biz_token");
    sessionStorage.removeItem("biz_token");
    setToken(null);
  };

  // Apply business font to the whole dashboard
  useEffect(() => {
    const fontFamily = (headerProfile as any)?.fontFamily;
    if (!fontFamily || fontFamily === "inherit") return;
    const id = `gfont-dash-${fontFamily.replace(/\s+/g, "-")}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
      document.head.appendChild(link);
    }
    document.documentElement.style.setProperty("--dashboard-font", `'${fontFamily}', sans-serif`);
  }, [headerProfile]);

  const completeTour = () => {
    localStorage.removeItem("onboarding_pending");
    localStorage.setItem("onboarding_completed", "true");
    setShowTour(false);
  };

  const handleLogin = (t: string) => {
    setToken(t);
    if (localStorage.getItem("onboarding_pending") === "true") {
      setShowTour(true);
    }
  };

  if (!token) return <Login onLogin={handleLogin} />;

  const dashFont = (headerProfile as any)?.fontFamily;

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl"
      style={dashFont && dashFont !== "inherit" ? { fontFamily: `'${dashFont}', sans-serif` } : undefined}
    >
      {showTour && (
        <OnboardingTour
          onComplete={completeTour}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      )}

      <Navbar
        leftContent={
          <div className="flex items-center gap-2">
            {!showTour && localStorage.getItem("onboarding_completed") && (
              <button
                onClick={() => setShowTour(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
                style={{ color: "#c0c0c0" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#d4af37")}
                onMouseLeave={e => (e.currentTarget.style.color = "#c0c0c0")}
              >
                <HelpCircle className="w-4 h-4" />
                הדרכה
              </button>
            )}
            {headerProfile?.name && (
              <span className="hidden sm:block text-sm font-medium px-3 py-1.5 rounded-lg"
                style={{ color: "#d4af37", border: "1px solid #d4af3740" }}>
                {headerProfile.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{ color: "#c0c0c0" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#d4af37")}
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
            <p className="font-bold text-lg" style={{ color: "#d4af37" }}>
              {(() => { const h = new Date().getHours(); return h < 12 ? "בוקר טוב! ☀️" : h < 17 ? "צהריים טובים! 🌤️" : h < 21 ? "ערב טוב! 🌆" : "לילה טוב! 🌙"; })()}
            </p>
            <p className="font-semibold text-sm" style={{ color: "#d4af37" }}>
              ברוכ/ה הבא/ה, {(headerProfile as any)?.ownerName?.split(" ")[0] ?? ""}!
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

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
              <TabsTrigger value="timeoff" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Umbrella className="w-4 h-4" /> ימי חופש
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Users className="w-4 h-4" /> לקוחות
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <ListOrdered className="w-4 h-4" /> רשימת המתנה
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <TrendingUp className="w-4 h-4" /> נתונים
              </TabsTrigger>
              <TabsTrigger value="revenue" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <DollarSign className="w-4 h-4" /> כסף
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Palette className="w-4 h-4" /> עיצוב
              </TabsTrigger>
              <TabsTrigger value="integrations" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Phone className="w-4 h-4" /> הודעות
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Settings className="w-4 h-4" /> הגדרות
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Mobile: icon grid */}
          <div className="sm:hidden">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "appointments", icon: <Calendar className="w-6 h-6" />, label: "פגישות" },
                { value: "services", icon: <Briefcase className="w-6 h-6" />, label: "שירותים" },
                { value: "hours", icon: <Clock className="w-6 h-6" />, label: "שעות" },
                { value: "timeoff", icon: <Umbrella className="w-6 h-6" />, label: "ימי חופש" },
                { value: "customers", icon: <Users className="w-6 h-6" />, label: "לקוחות" },
                { value: "waitlist", icon: <ListOrdered className="w-6 h-6" />, label: "המתנה" },
                { value: "analytics", icon: <TrendingUp className="w-6 h-6" />, label: "נתונים" },
                { value: "revenue", icon: <DollarSign className="w-6 h-6" />, label: "כסף" },
                { value: "branding", icon: <Palette className="w-6 h-6" />, label: "עיצוב" },
                { value: "integrations", icon: <Phone className="w-6 h-6" />, label: "הודעות" },
                { value: "settings", icon: <Settings className="w-6 h-6" />, label: "הגדרות" },
              ].map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => setActiveTab(value)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl border-2 transition-all text-sm font-medium ${
                    activeTab === value
                      ? "border-primary bg-primary text-primary-foreground shadow-md scale-[1.02]"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {icon}
                  <span className="text-xs leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <TabsContent value="appointments"><AppointmentsTab /></TabsContent>
          <TabsContent value="services"><ServicesTab /></TabsContent>
          <TabsContent value="hours"><WorkingHoursTab /></TabsContent>
          <TabsContent value="timeoff"><DayOffTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
          <TabsContent value="waitlist"><WaitlistTab /></TabsContent>
          <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
          <TabsContent value="revenue"><RevenueTab /></TabsContent>
          <TabsContent value="branding"><BrandingTab /></TabsContent>
          <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>

        {/* Suggestion banner */}
        <div className="mt-6 p-4 rounded-2xl bg-muted/40 border text-center text-sm text-muted-foreground">
          💡 יש לך הצעה לשיפור לוח הניהול?{" "}
          <a href="/contact" className="font-semibold text-primary underline">צור איתנו קשר</a>
        </div>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [identifier, setIdentifier] = useState("");
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
          sessionStorage.removeItem("biz_token");
        } else {
          sessionStorage.setItem("biz_token", data.token);
          localStorage.removeItem("biz_token");
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
            <a href="/" className="inline-block">
              <img src="/logo.png" alt="קבעתי" className="h-16 w-16 rounded-2xl object-cover mx-auto mb-2" />
            </a>
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

function AppointmentsTab() {
  const { data: stats } = useGetBusinessStats();
  const { data: appointments } = useListBusinessAppointments();
  const { data: profile } = useGetBusinessProfile();
  const cancelMutation = useCancelBusinessAppointment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [approvingId, setApprovingId] = useState<number | null>(null);

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
    if (confirm("האם אתה בטוח שברצונך לבטל פגישה זו?")) {
      cancelMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "הצלחה", description: "הפגישה בוטלה" });
          queryClient.invalidateQueries({ queryKey: getListBusinessAppointmentsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBusinessStatsQueryKey() });
        },
        onError: () => toast({ title: "שגיאה", description: "לא ניתן לבטל", variant: "destructive" }),
      });
    }
  };

  const now = new Date().toISOString().split("T")[0];
  const aptList = Array.isArray(appointments) ? appointments : [];
  const pending = aptList.filter(a => a.status === "pending");
  const upcoming = aptList.filter(a => a.appointmentDate >= now && a.status !== "pending" && a.status !== "cancelled" && a.status !== "pending_payment");
  const past = aptList.filter(a => a.appointmentDate < now && a.status !== "cancelled" && a.status !== "pending_payment");

  return (
    <div className="space-y-6">
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
                  <div className="flex-1">
                    <div className="font-semibold">{apt.clientName}
                      <span className="text-muted-foreground text-sm font-normal mr-2" dir="ltr">{apt.phoneNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {formatDuration(apt.durationMinutes)}</div>
                    <div className="text-yellow-700 font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
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

      <Card>
        <CardHeader><CardTitle>פגישות קרובות</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length ? (
            <div className="space-y-3">
              {upcoming.map(apt => (
                <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl bg-card gap-3 hover:border-primary/40 transition-colors">
                  <div className="flex-1">
                    <div className="font-semibold flex items-center gap-2">
                      {apt.clientName}
                      <span className="text-muted-foreground text-sm font-normal" dir="ltr">{apt.phoneNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {formatDuration(apt.durationMinutes)}</div>
                    <div className="text-primary font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
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
  const [form, setForm] = useState({ name: "", price: "", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "", description: "" });

  const activeServices = Array.isArray(services) ? services.filter(s => s.isActive) : [];
  const isPro = profile?.subscriptionPlan !== "free";
  const atLimit = !isPro && activeServices.length >= FREE_SERVICE_LIMIT;

  const reset = () => {
    setForm({ name: "", price: "", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "", description: "" });
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
      durationMinutes: parseInt(form.durationMinutes),
      bufferMinutes: parseInt(form.bufferMinutes),
      imageUrl,
      description: form.description || null,
    } as any;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { ...data, isActive: form.isActive } as any }, {
        onSuccess: () => { toast({ title: "עודכן" }); queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey() }); reset(); },
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
            {atLimit && <Crown className="w-3.5 h-3.5 text-violet-500 mr-1" />}
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
              </div>
              <div className="space-y-2">
                <Label>משך זמן (דקות) *</Label>
                <Input required type="number" min="5" step="5" value={form.durationMinutes} onChange={e => setForm(p => ({ ...p, durationMinutes: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>זמן מאגר אחרי השירות (דקות)</Label>
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
              <Button type="submit" className="rounded-xl px-5" disabled={createMutation.isPending || updateMutation.isPending || imageUpload.isUploading}>שמור שירות</Button>
            </div>
          </form>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Array.isArray(services) ? services : []).map(s => (
            <div key={s.id} className={`border rounded-xl overflow-hidden hover:border-primary/40 transition-colors ${!s.isActive ? "opacity-50 bg-muted/20" : "bg-card"}`}>
              {s.imageUrl && (
                <div className="h-32 overflow-hidden">
                  <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {s.name}
                    {!s.isActive && <Badge variant="secondary" className="text-xs">לא פעיל</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1" dir="rtl">
                    <bdi>₪{(s.price / 100).toFixed(0)}</bdi>{" • "}<bdi>{formatDuration(s.durationMinutes)}</bdi>
                    {s.bufferMinutes > 0 && <span className="mr-2"> • מאגר: {s.bufferMinutes} דקות</span>}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setEditingId(s.id);
                      setForm({ name: s.name, price: (s.price / 100).toString(), durationMinutes: s.durationMinutes.toString(), bufferMinutes: (s.bufferMinutes ?? 0).toString(), isActive: s.isActive, imageUrl: s.imageUrl ?? "", description: (s as any).description ?? "" });
                      setIsAdding(false);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary/8 hover:bg-primary/15 text-primary border border-primary/15 transition-all"
                  >
                    <Edit className="w-3 h-3" /> ערוך
                  </button>
                  <button
                    onClick={() => { if (confirm("למחוק שירות?")) deleteMutation.mutate({ id: s.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey() }) }); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" /> מחק
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!services?.length && !isAdding && <EmptyState text="אין שירותים מוגדרים עדיין" className="col-span-full" />}
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
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetWorkingHoursQueryKey() }); },
    });
    updateProfileMutation.mutate({ data: { bufferMinutes: parseInt(bufferMinutes) || 0 } as any }, {
      onSuccess: () => {
        toast({ title: "הגדרות שעות עבודה נשמרו" });
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
      },
    });
  };

  if (!hours) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>שעות עבודה</CardTitle>
        <CardDescription>סמן את הימים והשעות בהם העסק פעיל</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {localHours.map((h, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <Switch checked={h.isEnabled} onCheckedChange={v => {
              const n = [...localHours]; n[i].isEnabled = v; setLocalHours(n);
            }} />
            <span className="font-medium w-20">{DAYS[h.dayOfWeek]}</span>
            {h.isEnabled ? (
              <div className="flex items-center gap-2">
                <Input type="time" value={h.startTime} onChange={e => { const n = [...localHours]; n[i].startTime = e.target.value; setLocalHours(n); }} className="w-32" dir="ltr" />
                <span className="text-muted-foreground">—</span>
                <Input type="time" value={h.endTime} onChange={e => { const n = [...localHours]; n[i].endTime = e.target.value; setLocalHours(n); }} className="w-32" dir="ltr" />
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">סגור</span>
            )}
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
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending || updateProfileMutation.isPending} size="lg">שמור</Button>
        </div>
      </CardContent>
    </Card>
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
      else { const e = await r.json(); toast({ title: e.error || "שגיאה", variant: "destructive" }); }
    } catch {} finally { setLoading(false); }
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
      else { const e = await r.json(); toast({ title: e.error || "קוד שגוי", variant: "destructive" }); }
    } catch {} finally { setLoading(false); }
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
            <Input dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="050-0000000" />
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

function DayOffTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState<"full" | "partial">("full");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/business/time-off", { headers: { authorization: `Bearer ${localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token")}` } });
      if (r.ok) setItems(await r.json());
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!date) { toast({ title: "יש לבחור תאריך", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const r = await fetch("/api/business/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date,
          fullDay: type === "full",
          startTime: type === "partial" ? startTime : null,
          endTime: type === "partial" ? endTime : null,
          note: note || null,
        }),
      });
      if (r.ok) {
        toast({ title: "יום החופש נוסף" });
        setDate(""); setNote("");
        load();
      }
    } catch {} finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    await fetch(`/api/business/time-off/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    load();
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Umbrella className="w-5 h-5" /> יום חופש
          </CardTitle>
          <CardDescription>הוסף ימי חופש או שעות בהן לא ניתן לקבוע תורים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button onClick={() => setType("full")} className={`flex-1 py-2 rounded-xl border-2 text-sm font-medium transition-all ${type === "full" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
              🌴 יום חופש מלא
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

          <Button onClick={handleAdd} disabled={loading} className="w-full gap-2">
            <Plus className="w-4 h-4" /> הוסף יום חופש
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">ימי חופש מתוכננים</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <div className="font-medium text-sm">{formatDate(item.date)}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.fullDay ? "יום חופש מלא" : `${item.startTime} — ${item.endTime}`}
                    {item.note && ` • ${item.note}`}
                  </div>
                </div>
                <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
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

  useEffect(() => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    fetch("/api/business/analytics", { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground">טוען נתונים...</div>;
  if (!data) return null;

  const stats = [
    { label: "תורים קבועים עתידיים", value: data.future, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "תורים שהושלמו", value: data.past, color: "text-green-600", bg: "bg-green-50" },
    { label: "תורים שבוטלו", value: data.cancelled, color: "text-red-500", bg: "bg-red-50" },
    { label: "סה\"כ תורים פעילים", value: data.total, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-4">
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

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {stats.map(s => (
              <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
                <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            ממוצע חודשי: <strong>{data.avg}</strong> תורים
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
    fetch("/api/business/revenue", { headers: { authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
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
              <div className="text-xs text-muted-foreground text-left mt-1">{broadcastMessage.length}/1000</div>
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
        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-1">סה״כ הכנסות</div>
            <div className="text-3xl font-bold">₪{(totalRevenue / 100).toFixed(0)}</div>
          </CardContent>
        </Card>
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
              {customerList.map((c, i) => (
                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl hover:border-primary/40 transition-colors gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      {c.clientName}
                      {c.totalVisits >= 5 && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">לקוחה נאמנה</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5" dir="ltr">{c.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      ביקור ראשון: {c.firstVisitDate} • אחרון: {c.lastVisitDate}
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
              ))}
            </div>
          ) : <EmptyState text="אין לקוחות עדיין" />}
        </CardContent>
      </Card>
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
  const updateBranding = useUpdateBusinessBranding();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logoUpload = useImageUpload();
  const bannerUpload = useImageUpload();
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

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
      setForm({
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
      });
      try {
        const cats = (profile as any).businessCategories;
        if (cats) setSelectedCategories(JSON.parse(cats));
      } catch {}
    }
  }, [profile]);

  // Update form when uploads complete
  useEffect(() => { if (logoUpload.url) setForm(p => ({ ...p, logoUrl: logoUpload.url! })); }, [logoUpload.url]);
  useEffect(() => { if (bannerUpload.url) setForm(p => ({ ...p, bannerUrl: bannerUpload.url! })); }, [bannerUpload.url]);
  useEffect(() => {
    if (galleryUpload.url) {
      setForm(p => {
        const updated = [...p.galleryImages, galleryUpload.url!].slice(0, 12);
        return { ...p, galleryImages: updated };
      });
      galleryUpload.reset?.();
    }
  }, [galleryUpload.url]);

  const uploading = logoUpload.isUploading || bannerUpload.isUploading || galleryUpload.isUploading;

  const handleSave = () => {
    updateBranding.mutate({
      data: {
        primaryColor: form.primaryColor || null,
        fontFamily: form.fontFamily || null,
        logoUrl: form.logoUrl || null,
        bannerUrl: form.bannerUrl || null,
        themeMode: form.themeMode || null,
        borderRadius: form.borderRadius || null,
        buttonRadius: form.buttonRadius || null,
        welcomeText: null,
        backgroundColor: null,
        showBusinessName: form.showBusinessName,
        showLogo: form.showLogo,
        showBanner: form.showBanner,
        headerLayout: form.headerLayout,
        websiteUrl: form.websiteUrl || null,
        instagramUrl: form.instagramHandle ? `https://www.instagram.com/${form.instagramHandle.replace(/^@/, "")}` : null,
        wazeUrl: form.wazeUrl || null,
        businessDescription: form.businessDescription || null,
        galleryImages: form.galleryImages.length > 0 ? JSON.stringify(form.galleryImages) : null,
        bannerPosition: form.bannerPosition || "center",
        contactPhone: form.contactPhone || null,
        address: form.address || null,
        city: (form as any).city || null,
        businessCategories: selectedCategories.length > 0 ? JSON.stringify(selectedCategories) : null,
      } as any
    }, {
      onSuccess: () => { toast({ title: "עיצוב נשמר" }); queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() }); },
    });
  };

  const handleImageUpload = async (file: File, field: "logoUrl" | "bannerUrl") => {
    if (field === "logoUrl") await logoUpload.upload(file);
    else await bannerUpload.upload(file);
  };

  const isPro = profile?.subscriptionPlan === "pro";
  if (profile && !isPro) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
          <Crown className="w-10 h-10 text-violet-600" />
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
        <Button size="lg" className="gap-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => toast({ title: "צור קשר לשדרוג", description: "פנה אלינו כדי לשדרג למנוי PRO" })}>
          <Crown className="w-4 h-4" /> שדרג ל-PRO
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>עיצוב חנות</CardTitle>
          <CardDescription>התאם אישית את מראה עמוד ההזמנות שלך</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">צבע ראשי</h3>
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
          </div>

          <Separator />

          <FontPicker value={form.fontFamily} onChange={v => setForm(p => ({ ...p, fontFamily: v }))} />

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">מצב תצוגה</h3>
            <div className="grid grid-cols-3 gap-3">
              {/* Light */}
              <button onClick={() => setForm(p => ({ ...p, themeMode: "light" }))}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all text-right ${form.themeMode === "light" ? "border-primary shadow-lg scale-[1.02]" : "border-border hover:border-muted-foreground"}`}>
                <div className="bg-white p-3 space-y-1.5">
                  <div className="h-2 w-14 bg-gray-800 rounded-full" />
                  <div className="h-1.5 w-20 bg-gray-300 rounded-full" />
                  <div className="h-6 w-full bg-blue-500 rounded-lg mt-2" />
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div className="h-8 bg-gray-100 rounded-lg border border-gray-200" />
                    <div className="h-8 bg-gray-100 rounded-lg border border-gray-200" />
                  </div>
                </div>
                <div className={`py-2 text-center text-xs font-bold flex items-center justify-center gap-1 ${form.themeMode === "light" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                  ☀️ בהיר {form.themeMode === "light" && <Check className="w-3 h-3" />}
                </div>
              </button>

              {/* Dark */}
              <button onClick={() => setForm(p => ({ ...p, themeMode: "dark" }))}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all text-right ${form.themeMode === "dark" ? "border-primary shadow-lg scale-[1.02]" : "border-border hover:border-muted-foreground"}`}>
                <div className="p-3 space-y-1.5" style={{ background: "#0f172a" }}>
                  <div className="h-2 w-14 rounded-full" style={{ background: "#f8fafc" }} />
                  <div className="h-1.5 w-20 rounded-full" style={{ background: "#334155" }} />
                  <div className="h-6 w-full rounded-lg mt-2" style={{ background: "#6d28d9" }} />
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div className="h-8 rounded-lg border" style={{ background: "#1e293b", borderColor: "#334155" }} />
                    <div className="h-8 rounded-lg border" style={{ background: "#1e293b", borderColor: "#334155" }} />
                  </div>
                </div>
                <div className={`py-2 text-center text-xs font-bold flex items-center justify-center gap-1 ${form.themeMode === "dark" ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                  🌙 כהה {form.themeMode === "dark" && <Check className="w-3 h-3" />}
                </div>
              </button>

              {/* Fuchsia */}
              <button onClick={() => setForm(p => ({ ...p, themeMode: "fuchsia" }))}
                className={`relative rounded-2xl overflow-hidden border-2 transition-all text-right ${form.themeMode === "fuchsia" ? "shadow-lg scale-[1.02]" : "border-border hover:border-fuchsia-400"}`}
                style={{ borderColor: form.themeMode === "fuchsia" ? "#d946ef" : undefined }}>
                <div className="p-3 space-y-1.5" style={{ background: "#0a0a0a" }}>
                  <div className="h-2 w-14 rounded-full" style={{ background: "#f0abfc" }} />
                  <div className="h-1.5 w-20 rounded-full" style={{ background: "#3f0049" }} />
                  <div className="h-6 w-full rounded-lg mt-2" style={{ background: "linear-gradient(135deg,#d946ef,#a21caf)" }} />
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    <div className="h-8 rounded-lg border" style={{ background: "#1a0020", borderColor: "#7e22ce" }} />
                    <div className="h-8 rounded-lg border" style={{ background: "#1a0020", borderColor: "#7e22ce" }} />
                  </div>
                </div>
                <div className="py-2 text-center text-xs font-bold flex items-center justify-center gap-1"
                  style={{ background: form.themeMode === "fuchsia" ? "#d946ef" : "#1a0020", color: "#fff" }}>
                  💜 פוקסיה {form.themeMode === "fuchsia" && <Check className="w-3 h-3" />}
                </div>
              </button>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">סגנון פינות כרטיסים</h3>
            <p className="text-xs text-muted-foreground">משפיע על כרטיסים ומיכלים בעמוד ההזמנות</p>
            <div className="flex gap-3 mb-3">
              {([
                { value: "sharp", label: "ישר" },
                { value: "medium", label: "מעוגל" },
                { value: "rounded", label: "עגול מאוד" },
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>לוגו העסק</Label>
                <p className="text-xs text-muted-foreground">מומלץ: 400×400px • PNG/JPG • עד 2MB</p>
                {form.logoUrl && (
                  <div className="relative">
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
                <p className="text-xs text-muted-foreground">מומלץ: 1200×400px • PNG/JPG • עד 5MB</p>
                {form.bannerUrl && (
                  <div className="relative">
                    <img src={form.bannerUrl} alt="באנר" className="w-full h-24 rounded-xl object-cover border" />
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

            <div className="space-y-2 pt-2">
              <Label className="text-sm font-medium">סידור כותרת</Label>
              <div className="flex gap-3">
                <button
                  onClick={() => setForm(p => ({ ...p, headerLayout: "stacked" }))}
                  className={`flex-1 py-3 border-2 text-sm font-medium rounded-xl transition-all ${form.headerLayout === "stacked" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-lg bg-current opacity-20 mx-auto" />
                    <div className="w-16 h-2 rounded bg-current opacity-20" />
                    <span>מוערם</span>
                  </div>
                </button>
                <button
                  onClick={() => setForm(p => ({ ...p, headerLayout: "side" }))}
                  className={`flex-1 py-3 border-2 text-sm font-medium rounded-xl transition-all ${form.headerLayout === "side" ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 mx-auto">
                      <div className="w-6 h-6 rounded bg-current opacity-20" />
                      <div className="w-12 h-2 rounded bg-current opacity-20" />
                    </div>
                    <span>לצד</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Business profile info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">פרטי העסק לעמוד הפרופיל</h3>
            <div className="space-y-4">

              {/* Categories */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">סוג העסק <span className="text-xs text-muted-foreground font-normal">(אפשר לבחור כמה)</span></Label>
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
                <Input dir="ltr" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} placeholder="050-0000000" />
              </div>
              <div className="space-y-2">
                <Label>כתובת העסק (תוצג בפרופיל)</Label>
                <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="רחוב הרצל 1, תל אביב" />
              </div>
              <div className="space-y-2">
                <Label>עיר (לחיפוש בספריית קבעתי)</Label>
                <Input value={(form as any).city ?? ""} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="תל אביב" />
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
          </div>

          <Separator />

          {/* Banner position */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">מיקום תמונת הרקע בפרופיל</h3>
            <p className="text-xs text-muted-foreground">בחר את הנקודה המרכזית שתוצג בתמונת הרקע</p>
            <div className="flex gap-3">
              {([
                { value: "top", label: "עליון" },
                { value: "center", label: "מרכז" },
                { value: "bottom", label: "תחתון" },
              ] as const).map(pos => (
                <button
                  key={pos.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, bannerPosition: pos.value }))}
                  className={`flex-1 py-2.5 border-2 text-sm font-medium rounded-xl transition-all ${form.bannerPosition === pos.value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Gallery */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">גלריה (עד 12 תמונות)</h3>
            <p className="text-xs text-muted-foreground">תמונות מעבודות העסק שיוצגו בגלריה בעמוד הפרופיל</p>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) { galleryUpload.upload(e.target.files[0]); e.target.value = ""; } }}
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
                {galleryUpload.isUploading ? "מעלה תמונה..." : "הוסף תמונה לגלריה"}
              </Button>
            )}
            {galleryUpload.error && <p className="text-xs text-destructive">{galleryUpload.error}</p>}
          </div>

        </CardContent>
        <div className="px-6 pb-6 flex justify-end">
          <Button onClick={handleSave} disabled={updateBranding.isPending} size="lg">שמור עיצוב</Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link className="w-5 h-5" /> לינק לעמוד ההזמנות</CardTitle>
        </CardHeader>
        <CardContent>
          {profile && <CopyLinkButton slug={profile.slug} />}
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const { data: profile } = useGetBusinessProfile();
  const updateProfile = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [sendBookingConfirmation, setSendBookingConfirmation] = useState(true);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementValidHours, setAnnouncementValidHours] = useState(24);
  const [sendReminders, setSendReminders] = useState(true);
  const [requireArrivalConfirmation, setRequireArrivalConfirmation] = useState(true);
  const [sendWhatsAppReminders, setSendWhatsAppReminders] = useState(true);
  const [shabbatMode, setShabbatMode] = useState<"any" | "shabbat">("any");
  const [reminderCustomText, setReminderCustomText] = useState("");
  const [reminderTriggers, setReminderTriggers] = useState<Array<{ amount: string; unit: string }>>([
    { amount: "24", unit: "hours" }
  ]);

  useEffect(() => {
    if (profile) {
      setNotificationEnabled(profile.notificationEnabled ?? true);
      setNotificationMessage(profile.notificationMessage ?? "");
      setSendBookingConfirmation((profile as any).sendBookingConfirmation ?? true);
      setSendReminders((profile as any).sendReminders ?? true);
      setAnnouncementText((profile as any).announcementText ?? "");
      setAnnouncementValidHours((profile as any).announcementValidHours ?? 24);
      setRequireArrivalConfirmation((profile as any).requireArrivalConfirmation ?? true);
      setSendWhatsAppReminders((profile as any).sendWhatsAppReminders ?? true);
      setShabbatMode(((profile as any).shabbatMode ?? "any") as "any" | "shabbat");
      setReminderCustomText((profile as any).reminderCustomText ?? "");
      const saved = (profile as any).reminderTriggers;
      if (saved) { try { setReminderTriggers(JSON.parse(saved)); } catch {} }
    }
  }, [profile]);

  const handleSave = () => {
    updateProfile.mutate({
      data: {
        notificationEnabled,
        notificationMessage: notificationMessage || null,
        sendBookingConfirmation,
        sendReminders,
        announcementText: announcementText || null,
        announcementValidHours,
        requireArrivalConfirmation,
        sendWhatsAppReminders,
        reminderTriggers: JSON.stringify(reminderTriggers),
        shabbatMode,
        reminderCustomText: reminderCustomText || null,
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "הגדרות הודעות נשמרו" });
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
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
          <Separator />
          <div className="space-y-2">
            <Label>הודעה מותאמת אישית ללקוחות (אופציונלי)</Label>
            <p className="text-xs text-muted-foreground">תוסף לאישור שנשלח ללקוחות בעת קביעת תור</p>
            <Input
              placeholder="לביטול תור נא לפנות 24 שעות מראש"
              value={notificationMessage}
              onChange={e => setNotificationMessage(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Announcement popup card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-xl">📢</span> הודעת פתיחה לפרופיל העסק
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>תוכן ההודעה</Label>
            <p className="text-xs text-muted-foreground">תוצג ללקוח כחלון קופץ בכניסה לפרופיל שלך. ריק = ללא הודעה</p>
            <textarea
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="לדוגמא: חנוכה שמח! כל הטיפולים השבוע ב-20% הנחה 🎉"
              value={announcementText}
              onChange={e => setAnnouncementText(e.target.value.slice(0, 500))}
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{announcementText.length} / 500</span>
              {announcementText && (
                <button type="button" onClick={() => setAnnouncementText("")}
                  className="text-xs text-destructive hover:underline">מחק הודעה</button>
              )}
            </div>
          </div>
          {announcementText && (
            <div className="space-y-2">
              <Label>תוקף ההודעה</Label>
              <p className="text-xs text-muted-foreground">לקוח שסגר את ההודעה לא יראה אותה שוב עד שתוקפה פג</p>
              <div className="flex items-center gap-3">
                <input
                  type="number" min={1} max={720}
                  className="w-24 rounded-xl border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
                  value={announcementValidHours}
                  onChange={e => setAnnouncementValidHours(Number(e.target.value) || 24)}
                />
                <span className="text-sm text-muted-foreground">שעות</span>
                <span className="text-xs text-muted-foreground">(24 = יום, 168 = שבוע)</span>
              </div>
            </div>
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
            <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/20">
              <div>
                <div className="font-medium text-sm">דרישת אישור הגעה בתזכורת</div>
                <div className="text-xs text-muted-foreground mt-0.5">הלקוח יצטרך לאשר הגעה בהודעת התזכורת</div>
              </div>
              <Switch checked={requireArrivalConfirmation} onCheckedChange={setRequireArrivalConfirmation} />
            </div>
          </div>

          {sendReminders && (
            <div className="p-4 border rounded-xl bg-muted/20 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="font-medium text-sm">מתי לשלוח תזכורות?</span>
                <span className="text-xs text-muted-foreground">{reminderTriggers.length} / 3 תזכורות</span>
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
                {reminderTriggers.length < 3 && (
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

          <div className="space-y-2">
            <Label className="text-sm font-medium">תוספת מותאמת אישית לתזכורת</Label>
            <textarea value={reminderCustomText}
              onChange={e => setReminderCustomText(e.target.value.slice(0, 800))}
              rows={3} maxLength={800}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="לדוגמא: לשלוח הודעה במידה ויש עיכוב בהגעה"
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">תוספת זו תופיע בסוף התזכורת שנשלחת ללקוחות</p>
              <span className="text-xs text-muted-foreground">{reminderCustomText.length} / 800</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateProfile.isPending} size="lg" className="w-full">
        {updateProfile.isPending ? "שומר..." : "שמור הגדרות"}
      </Button>
    </div>
  );
}

const API_BASE_DASH = import.meta.env.VITE_API_BASE_URL ?? "/api";

function SettingsTab() {
  const { data: profile } = useGetBusinessProfile();
  const updateMutation = useUpdateBusinessProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", ownerName: "", phone: "", email: "",
    requireAppointmentApproval: false, requirePhoneVerification: false,
    tranzilaEnabled: false,
    depositAmount: "0",
    // booking restrictions
    minLeadHours: "20",
    cancellationHours: "24",
    maxFutureWeeks: "15",
    futureBookingMode: "weeks" as "weeks" | "date",
    maxFutureDate: "",
    maxAppointmentsPerCustomer: "",
    requireActiveSubscription: false,
    maxAppointmentsPerDay: "3",
  });

  // Password change state
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (profile) setForm({
      name: profile.name,
      ownerName: profile.ownerName,
      phone: (profile as any).phone ?? "",
      email: (profile as any).email ?? "",
      requireAppointmentApproval: (profile as any).requireAppointmentApproval ?? false,
      requirePhoneVerification: (profile as any).requirePhoneVerification ?? false,
      tranzilaEnabled: (profile as any).tranzilaEnabled ?? false,
      depositAmount: (((profile as any).depositAmountAgorot ?? 0) / 100).toString(),
      minLeadHours: ((profile as any).minLeadHours ?? 20).toString(),
      cancellationHours: ((profile as any).cancellationHours ?? 24).toString(),
      maxFutureWeeks: ((profile as any).maxFutureWeeks ?? 15).toString(),
      futureBookingMode: (profile as any).futureBookingMode ?? "weeks",
      maxFutureDate: (profile as any).maxFutureDate ?? "",
      maxAppointmentsPerCustomer: ((profile as any).maxAppointmentsPerCustomer ?? "").toString(),
      requireActiveSubscription: (profile as any).requireActiveSubscription ?? false,
      maxAppointmentsPerDay: ((profile as any).maxAppointmentsPerDay ?? 3).toString(),
    });
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      data: {
        name: form.name,
        ownerName: form.ownerName,
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
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "הגדרות נשמרו" });
        queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() });
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
      {/* General settings card */}
      <Card>
        <CardHeader>
          <CardTitle>הגדרות עסק</CardTitle>
          <CardDescription>עדכן פרטים כלליים ואפשרויות קבלת תורים</CardDescription>
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
                <div className="space-y-2">
                  <Label>שם הבעלים</Label>
                  <Input value={form.ownerName} onChange={e => setForm(p => ({ ...p, ownerName: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>מספר טלפון</Label>
                  <Input
                    type="tel"
                    dir="ltr"
                    placeholder="050-0000000"
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">ניתן להתחבר גם עם מספר הטלפון</p>
                </div>
                <div className="space-y-2">
                  <Label>אימייל</Label>
                  <Input type="email" dir="ltr" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>לינק לקביעת תור</Label>
                  <CopyLinkButton slug={profile.slug} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">אישור תורים ואבטחה</h3>
              <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
                <div>
                  <div className="font-medium text-sm">דרוש אישור ידני לתורים</div>
                  <div className="text-xs text-muted-foreground mt-0.5">כבוי = תורים מאושרים אוטומטית | דלוק = אתה מאשר כל תור ידנית</div>
                </div>
                <Switch checked={form.requireAppointmentApproval} onCheckedChange={v => setForm(p => ({ ...p, requireAppointmentApproval: v }))} />
              </div>
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

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending} size="lg">שמור הגדרות</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Booking Restrictions Card */}
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
            <p className="text-xs text-muted-foreground">הגבלת כמות תורים שניתן לקבוע ליום ל-<strong>{form.maxAppointmentsPerDay}</strong></p>
            <div className="flex items-center gap-3">
              <Input type="number" min="1" max="999" value={form.maxAppointmentsPerDay}
                onChange={e => setForm(p => ({ ...p, maxAppointmentsPerDay: e.target.value }))}
                className="w-28 text-center" />
              <span className="text-sm text-muted-foreground">תורים ליום</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">שמירה</Button>
          </div>
        </CardContent>
      </Card>


      {/* Password change card */}
      <Card>
        <CardHeader>
          <CardTitle>שינוי סיסמה</CardTitle>
          <CardDescription>עדכן את הסיסמה שלך לכניסה ללוח הבקרה</CardDescription>
        </CardHeader>
        <CardContent>
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
                <Input
                  type={showPw ? "text" : "password"}
                  dir="ltr"
                  required
                  placeholder="לפחות 6 תווים"
                  value={pwForm.newPassword}
                  onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label>אימות סיסמה חדשה</Label>
                <Input
                  type={showPw ? "text" : "password"}
                  dir="ltr"
                  required
                  placeholder="הכנס שוב"
                  value={pwForm.confirmPassword}
                  onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" disabled={pwLoading} size="lg">
                {pwLoading ? "שומר..." : "שנה סיסמה"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`text-center py-12 text-muted-foreground ${className}`}>{text}</div>
  );
}
