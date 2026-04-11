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
  Calendar, Clock, Settings, Scissors, LogOut, Plus, Trash2, Edit,
  Users, ListOrdered, Palette, Puzzle, Phone, TrendingUp, CheckCircle,
  ExternalLink, Info, Upload, Image as ImageIcon, Crown, Zap, X, Copy, Check, Link,
  ChevronLeft, ChevronRight, HelpCircle, Eye, EyeOff
} from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

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
        <span className="text-violet-800 font-medium">מנוי {profile.subscriptionPlan === "pro" ? "פרו" : "בסיסי"} פעיל</span>
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

            <a href="https://wa.me/972500000000?text=שלום%2C%20אני%20מעוניין%20לשדרג%20למנוי%20פרו%20של%20תורי" target="_blank" rel="noopener noreferrer">
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
    title: "ברוך הבא לתורי! 👋",
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
  const [token, setToken] = useState(localStorage.getItem("biz_token"));
  const [activeTab, setActiveTab] = useState("appointments");
  const { data: headerProfile } = useGetBusinessProfile();
  const [showTour, setShowTour] = useState(() => {
    return localStorage.getItem("onboarding_pending") === "true" &&
           !localStorage.getItem("onboarding_completed");
  });

  const handleLogout = () => {
    localStorage.removeItem("biz_token");
    setToken(null);
  };

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

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      {showTour && (
        <OnboardingTour
          onComplete={completeTour}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      )}

      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="font-bold text-xl text-primary flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">ת</div>
            <div>
              <div className="text-sm font-bold leading-tight">תורי</div>
              {headerProfile?.name && (
                <div className="text-xs font-normal text-muted-foreground leading-tight">{headerProfile.name}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!showTour && localStorage.getItem("onboarding_completed") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTour(true)}
                className="text-muted-foreground hover:text-foreground gap-1.5 hidden sm:flex"
                title="הצג הדרכה מחדש"
              >
                <HelpCircle className="w-4 h-4" />
                הדרכה
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground gap-2">
              <LogOut className="w-4 h-4" />
              התנתק
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <SubscriptionBanner />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto pb-1">
            <TabsList className="bg-card border w-max h-auto p-1 gap-1 flex">
              <TabsTrigger value="appointments" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Calendar className="w-4 h-4" /> פגישות
              </TabsTrigger>
              <TabsTrigger value="services" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Scissors className="w-4 h-4" /> שירותים
              </TabsTrigger>
              <TabsTrigger value="hours" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Clock className="w-4 h-4" /> שעות עבודה
              </TabsTrigger>
              <TabsTrigger value="breaks" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                הפסקות
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Users className="w-4 h-4" /> לקוחות
              </TabsTrigger>
              <TabsTrigger value="waitlist" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <ListOrdered className="w-4 h-4" /> רשימת המתנה
              </TabsTrigger>
              <TabsTrigger value="branding" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Palette className="w-4 h-4" /> עיצוב
              </TabsTrigger>
              <TabsTrigger value="integrations" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Puzzle className="w-4 h-4" /> אינטגרציות
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                <Settings className="w-4 h-4" /> הגדרות
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="appointments"><AppointmentsTab /></TabsContent>
          <TabsContent value="services"><ServicesTab /></TabsContent>
          <TabsContent value="hours"><WorkingHoursTab /></TabsContent>
          <TabsContent value="breaks"><BreaksTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
          <TabsContent value="waitlist"><WaitlistTab /></TabsContent>
          <TabsContent value="branding"><BrandingTab /></TabsContent>
          <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const loginMutation = useBusinessLogin();
  const [, navigate] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email: identifier, password } }, {
      onSuccess: (data) => { localStorage.setItem("biz_token", data.token); onLogin(data.token); },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? "אימייל/טלפון או סיסמה שגויים";
        toast({ title: "כניסה נכשלה", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2 pb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">ת</div>
          </div>
          <CardTitle className="text-2xl">כניסה לתורי</CardTitle>
          <CardDescription>הזן אימייל או מספר טלפון וסיסמה</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>אימייל / מספר טלפון</Label>
              <Input
                required
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                dir="ltr"
                placeholder="email@example.com  או  050-0000000"
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
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "מתחבר..." : "כניסה"}
            </Button>
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
      const token = localStorage.getItem("biz_token");
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
  const upcoming = aptList.filter(a => a.appointmentDate >= now && a.status !== "pending");
  const past = aptList.filter(a => a.appointmentDate < now);

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
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {apt.durationMinutes} דקות</div>
                    <div className="text-yellow-700 font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleApprove(apt.id)} disabled={approvingId === apt.id}>
                      {approvingId === apt.id ? "מאשר..." : "אשר תור"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => handleCancel(apt.id)} disabled={cancelMutation.isPending}>
                      דחה
                    </Button>
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
                    <div className="text-sm text-muted-foreground mt-0.5">{apt.serviceName} • {apt.durationMinutes} דקות</div>
                    <div className="text-primary font-medium text-sm mt-1">
                      {format(parseISO(apt.appointmentDate + "T" + apt.appointmentTime), "EEEE, d בMMMM yyyy", { locale: he })} • {apt.appointmentTime}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={() => handleCancel(apt.id)} disabled={cancelMutation.isPending}>
                    ביטול
                  </Button>
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
  const [form, setForm] = useState({ name: "", price: "", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "" });

  const activeServices = Array.isArray(services) ? services.filter(s => s.isActive) : [];
  const isPro = profile?.subscriptionPlan !== "free";
  const atLimit = !isPro && activeServices.length >= FREE_SERVICE_LIMIT;

  const reset = () => {
    setForm({ name: "", price: "", durationMinutes: "30", bufferMinutes: "0", isActive: true, imageUrl: "" });
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
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { ...data, isActive: form.isActive } }, {
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
              <Button type="button" variant="outline" onClick={reset}>ביטול</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || imageUpload.isUploading}>שמור שירות</Button>
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
                  <div className="text-sm text-muted-foreground mt-1">
                    ₪{(s.price / 100).toFixed(0)} • {s.durationMinutes} דקות
                    {s.bufferMinutes > 0 && <span className="mr-2">• מאגר: {s.bufferMinutes} דקות</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => {
                    setEditingId(s.id);
                    setForm({ name: s.name, price: (s.price / 100).toString(), durationMinutes: s.durationMinutes.toString(), bufferMinutes: (s.bufferMinutes ?? 0).toString(), isActive: s.isActive, imageUrl: s.imageUrl ?? "" });
                    setIsAdding(false);
                  }}><Edit className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => {
                    if (confirm("למחוק שירות?")) deleteMutation.mutate({ id: s.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListBusinessServicesQueryKey() }) });
                  }}><Trash2 className="w-4 h-4" /></Button>
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
  const updateMutation = useSetWorkingHours();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [localHours, setLocalHours] = useState<any[]>([]);

  useEffect(() => {
    if (hours) {
      setLocalHours(DAYS.map((_, i) => {
        const ex = hours.find(h => h.dayOfWeek === i);
        return ex ? { ...ex } : { dayOfWeek: i, startTime: "09:00", endTime: "18:00", isEnabled: false };
      }));
    }
  }, [hours]);

  const handleSave = () => {
    updateMutation.mutate({ data: { hours: localHours.map(h => ({ dayOfWeek: h.dayOfWeek, startTime: h.startTime, endTime: h.endTime, isEnabled: h.isEnabled })) } }, {
      onSuccess: () => { toast({ title: "שעות עבודה נשמרו" }); queryClient.invalidateQueries({ queryKey: getGetWorkingHoursQueryKey() }); },
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
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">שמור שעות</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BreaksTab() {
  const { data: breaks } = useGetBreakTimes();
  const updateMutation = useSetBreakTimes();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [localBreaks, setLocalBreaks] = useState<any[]>([]);

  useEffect(() => { if (breaks) setLocalBreaks([...breaks]); }, [breaks]);

  const handleSave = () => {
    updateMutation.mutate({ data: { breaks: localBreaks.map(b => ({ dayOfWeek: parseInt(b.dayOfWeek), startTime: b.startTime, endTime: b.endTime, label: b.label || null })) } }, {
      onSuccess: () => { toast({ title: "הפסקות נשמרו" }); queryClient.invalidateQueries({ queryKey: getGetBreakTimesQueryKey() }); },
    });
  };

  if (!breaks) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>הפסקות</CardTitle>
          <CardDescription>הגדר זמני מנוחה בהם לא ניתן לקבוע תורים</CardDescription>
        </div>
        <Button onClick={() => setLocalBreaks([...localBreaks, { dayOfWeek: 0, startTime: "12:00", endTime: "13:00", label: "" }])} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> הוסף הפסקה
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {localBreaks.length === 0 ? (
          <EmptyState text="אין הפסקות מוגדרות" />
        ) : (
          localBreaks.map((b, i) => (
            <div key={i} className="flex flex-wrap gap-3 p-4 border rounded-xl bg-card items-center">
              <select value={b.dayOfWeek} onChange={e => { const n = [...localBreaks]; n[i].dayOfWeek = e.target.value; setLocalBreaks(n); }} className="border rounded-lg h-10 px-3 bg-background text-sm">
                {DAYS.map((d, j) => <option key={j} value={j}>{d}</option>)}
              </select>
              <Input type="time" value={b.startTime} onChange={e => { const n = [...localBreaks]; n[i].startTime = e.target.value; setLocalBreaks(n); }} className="w-28" dir="ltr" />
              <span className="text-muted-foreground">—</span>
              <Input type="time" value={b.endTime} onChange={e => { const n = [...localBreaks]; n[i].endTime = e.target.value; setLocalBreaks(n); }} className="w-28" dir="ltr" />
              <Input placeholder="תיאור (אופציונלי)" value={b.label || ""} onChange={e => { const n = [...localBreaks]; n[i].label = e.target.value; setLocalBreaks(n); }} className="flex-1 min-w-32" />
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { const n = [...localBreaks]; n.splice(i, 1); setLocalBreaks(n); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">שמור הפסקות</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomersTab() {
  const { data: customers, isLoading } = useListBusinessCustomers();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">טוען...</div>;

  const customerList = Array.isArray(customers) ? customers : [];
  const totalRevenue = customerList.reduce((s, c) => s + c.totalRevenue, 0);
  const totalVisits = customerList.reduce((s, c) => s + c.totalVisits, 0);

  return (
    <div className="space-y-6">
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
        <CardHeader>
          <CardTitle>מאגר לקוחות</CardTitle>
          <CardDescription>כל הלקוחות שהזמינו תורים עם היסטוריית ביקורים והכנסות</CardDescription>
        </CardHeader>
        <CardContent>
          {customerList.length ? (
            <div className="space-y-3">
              {customerList.map((c, i) => (
                <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl hover:border-primary/40 transition-colors">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {c.clientName}
                      {c.totalVisits >= 5 && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">לקוח נאמן</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5" dir="ltr">{c.phoneNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      ביקור ראשון: {c.firstVisitDate} • אחרון: {c.lastVisitDate}
                    </div>
                  </div>
                  <div className="text-left sm:text-right mt-2 sm:mt-0">
                    <div className="font-bold text-primary text-lg">₪{(c.totalRevenue / 100).toFixed(0)}</div>
                    <div className="text-sm text-muted-foreground">{c.totalVisits} ביקורים</div>
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
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => handleRemove(w.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
  const { upload, uploading } = useImageUpload();
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    primaryColor: "#2563eb",
    backgroundColor: "#f8fafc",
    fontFamily: "Heebo",
    logoUrl: "",
    bannerUrl: "",
    themeMode: "light" as "light" | "dark",
    borderRadius: "medium" as "sharp" | "medium" | "rounded",
    welcomeText: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        primaryColor: profile.primaryColor ?? "#2563eb",
        backgroundColor: (profile as any).backgroundColor ?? "#f8fafc",
        fontFamily: profile.fontFamily ?? "Heebo",
        logoUrl: profile.logoUrl ?? "",
        bannerUrl: profile.bannerUrl ?? "",
        themeMode: (profile.themeMode ?? "light") as "light" | "dark",
        borderRadius: ((profile as any).borderRadius ?? "medium") as "sharp" | "medium" | "rounded",
        welcomeText: (profile as any).welcomeText ?? "",
      });
    }
  }, [profile]);

  const handleSave = () => {
    updateBranding.mutate({ data: { ...form, themeMode: form.themeMode } }, {
      onSuccess: () => { toast({ title: "עיצוב נשמר" }); queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() }); },
    });
  };

  const handleImageUpload = async (file: File, field: "logoUrl" | "bannerUrl") => {
    const result = await upload(file);
    if (result) setForm(p => ({ ...p, [field]: result.previewUrl }));
  };

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
            <div className="flex gap-3">
              {[{ value: "light", label: "בהיר ☀️" }, { value: "dark", label: "כהה 🌙" }].map(m => (
                <button key={m.value} onClick={() => setForm(p => ({ ...p, themeMode: m.value as "light" | "dark" }))}
                  className={`px-5 py-3 border-2 rounded-xl text-sm font-medium transition-all ${form.themeMode === m.value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">צבע רקע</h3>
            <div className="flex items-center gap-3">
              {["#ffffff", "#f8fafc", "#f0f4ff", "#fdf4ff", "#fff7ed", "#f0fdf4", "#1e1e2e", "#0f172a"].map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, backgroundColor: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.backgroundColor === c ? "border-foreground scale-110" : "border-border"}`}
                  style={{ backgroundColor: c }} />
              ))}
              <div className="flex items-center gap-2 border rounded-lg p-2">
                <input type="color" value={form.backgroundColor} onChange={e => setForm(p => ({ ...p, backgroundColor: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-none bg-transparent" />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">סגנון פינות</h3>
            <div className="flex gap-3">
              {([
                { value: "sharp", label: "ישר", preview: "rounded-none" },
                { value: "medium", label: "מעוגל", preview: "rounded-xl" },
                { value: "rounded", label: "עגול", preview: "rounded-full" },
              ] as const).map(s => (
                <button key={s.value} onClick={() => setForm(p => ({ ...p, borderRadius: s.value }))}
                  className={`flex-1 py-3 border-2 text-sm font-medium transition-all ${form.borderRadius === s.value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}
                  style={{ borderRadius: s.value === "sharp" ? "4px" : s.value === "medium" ? "12px" : "999px" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-semibold text-base border-b pb-2">הודעת פתיחה (אופציונלי)</h3>
            <p className="text-sm text-muted-foreground">תוצג ללקוח בראש עמוד ההזמנות</p>
            <textarea
              value={form.welcomeText}
              onChange={e => setForm(p => ({ ...p, welcomeText: e.target.value }))}
              placeholder="ברוכים הבאים! אנחנו שמחים לראות אתכם. ניתן לבטל עד 24 שעות לפני התור."
              rows={3}
              className="w-full border rounded-xl p-3 text-sm bg-background resize-none outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-semibold text-base border-b pb-2">לוגו ובאנר</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label>לוגו העסק</Label>
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
  const updateIntegrations = useUpdateBusinessIntegrations();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    whatsappApiKey: "",
    whatsappPhoneId: "",
    googleCalendarEnabled: false,
    stripeEnabled: false,
    stripePublicKey: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        whatsappApiKey: profile.whatsappApiKey ?? "",
        whatsappPhoneId: profile.whatsappPhoneId ?? "",
        googleCalendarEnabled: profile.googleCalendarEnabled,
        stripeEnabled: profile.stripeEnabled,
        stripePublicKey: profile.stripePublicKey ?? "",
      });
    }
  }, [profile]);

  const handleSave = () => {
    updateIntegrations.mutate({ data: { ...form, whatsappApiKey: form.whatsappApiKey || null, whatsappPhoneId: form.whatsappPhoneId || null, stripePublicKey: form.stripePublicKey || null } }, {
      onSuccess: () => { toast({ title: "אינטגרציות נשמרו" }); queryClient.invalidateQueries({ queryKey: getGetBusinessProfileQueryKey() }); },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>WhatsApp Business API</CardTitle>
              <CardDescription>שלח אישורים ותזכורות אוטומטיות ללקוחות</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-green-800 flex items-center gap-2"><Info className="w-4 h-4" /> איך להגדיר WhatsApp API?</div>
            <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
              <li>כנס ל-<a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="underline">Facebook Business Manager</a></li>
              <li>צור חשבון WhatsApp Business API</li>
              <li>קבל Token גישה ו-Phone Number ID</li>
              <li>הכנס את הפרטים בטפסים למטה</li>
            </ol>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input type="password" placeholder="EAAxxxx..." value={form.whatsappApiKey} onChange={e => setForm(p => ({ ...p, whatsappApiKey: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>Phone Number ID</Label>
              <Input placeholder="12345678..." value={form.whatsappPhoneId} onChange={e => setForm(p => ({ ...p, whatsappPhoneId: e.target.value }))} dir="ltr" />
            </div>
          </div>
          {form.whatsappApiKey && form.whatsappPhoneId && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4" /> WhatsApp מוגדר — לקוחות יקבלו אישור אוטומטי
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Google Calendar</CardTitle>
              <CardDescription>חסום תורים אוטומטית לפי האירועים ביומן האישי שלך</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-blue-800 flex items-center gap-2"><Info className="w-4 h-4" /> איך לחבר Google Calendar?</div>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>פתח <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
              <li>צור פרויקט חדש ואפשר את Calendar API</li>
              <li>צור OAuth 2.0 credentials</li>
              <li>הוסף את הדומיין שלך ל-Authorized redirect URIs</li>
            </ol>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.googleCalendarEnabled} onCheckedChange={v => setForm(p => ({ ...p, googleCalendarEnabled: v }))} />
            <Label>חבר Google Calendar</Label>
            <Badge variant={form.googleCalendarEnabled ? "default" : "secondary"}>
              {form.googleCalendarEnabled ? "מחובר" : "מנותק"}
            </Badge>
          </div>
          {form.googleCalendarEnabled && (
            <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => toast({ title: "בקרוב!", description: "חיבור OAuth יהיה זמין בגרסה הבאה" })}>
              <ExternalLink className="w-4 h-4" /> חבר חשבון Google
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>תשלומים / פיקדון</CardTitle>
              <CardDescription>גבה פיקדון מראש בעת קביעת תור</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
            <div className="font-semibold text-violet-800 flex items-center gap-2"><Info className="w-4 h-4" /> איך להגדיר Stripe?</div>
            <ol className="text-sm text-violet-700 space-y-1 list-decimal list-inside">
              <li>הירשם ל-<a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="underline">Stripe</a></li>
              <li>קבל את ה-Publishable Key מלוח הבקרה</li>
              <li>הכנס את המפתח למטה</li>
              <li>לקוחות יוכלו לשלם פיקדון בעת ההזמנה</li>
            </ol>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.stripeEnabled} onCheckedChange={v => setForm(p => ({ ...p, stripeEnabled: v }))} />
            <Label>אפשר תשלום פיקדון</Label>
          </div>
          {form.stripeEnabled && (
            <div className="space-y-2">
              <Label>Stripe Publishable Key</Label>
              <Input placeholder="pk_live_..." value={form.stripePublicKey} onChange={e => setForm(p => ({ ...p, stripePublicKey: e.target.value }))} dir="ltr" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateIntegrations.isPending} size="lg">שמור אינטגרציות</Button>
      </div>
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
    name: "", ownerName: "", phone: "",
    bufferMinutes: "0", notificationEnabled: false, notificationMessage: "", requireAppointmentApproval: false,
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
      bufferMinutes: (profile.bufferMinutes ?? 0).toString(),
      notificationEnabled: profile.notificationEnabled ?? false,
      notificationMessage: profile.notificationMessage ?? "",
      requireAppointmentApproval: (profile as any).requireAppointmentApproval ?? false,
    });
  }, [profile]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      data: {
        name: form.name,
        ownerName: form.ownerName,
        phone: form.phone || null,
        bufferMinutes: parseInt(form.bufferMinutes),
        notificationEnabled: form.notificationEnabled,
        notificationMessage: form.notificationMessage || null,
        requireAppointmentApproval: form.requireAppointmentApproval,
      }
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
      const token = localStorage.getItem("biz_token");
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
                  <Label>אימייל (לא ניתן לשינוי)</Label>
                  <Input value={profile.email} disabled dir="ltr" className="bg-muted/50" />
                </div>
                <div className="space-y-2">
                  <Label>זמן מאגר כללי (דקות)</Label>
                  <Input type="number" min="0" step="5" value={form.bufferMinutes} onChange={e => setForm(p => ({ ...p, bufferMinutes: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">זמן ברירת מחדל בין תורים</p>
                </div>
                <div className="space-y-2">
                  <Label>לינק לקביעת תור</Label>
                  <CopyLinkButton slug={profile.slug} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">הודעת כניסה ללקוחות</h3>
              <div className="flex items-center gap-3">
                <Switch checked={form.notificationEnabled} onCheckedChange={v => setForm(p => ({ ...p, notificationEnabled: v }))} />
                <Label>הצג הודעת פתיחה ללקוחות</Label>
              </div>
              {form.notificationEnabled && (
                <div className="space-y-2">
                  <Label>תוכן ההודעה</Label>
                  <textarea
                    value={form.notificationMessage}
                    onChange={e => setForm(p => ({ ...p, notificationMessage: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    placeholder="שלום! נא לקבוע תור לפחות 24 שעות מראש..."
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-base border-b pb-2">אישור תורים</h3>
              <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
                <div>
                  <div className="font-medium text-sm">דרוש אישור ידני לתורים</div>
                  <div className="text-xs text-muted-foreground mt-0.5">כבוי = תורים מאושרים אוטומטית | דלוק = אתה מאשר כל תור ידנית</div>
                </div>
                <Switch checked={form.requireAppointmentApproval} onCheckedChange={v => setForm(p => ({ ...p, requireAppointmentApproval: v }))} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending} size="lg">שמור הגדרות</Button>
            </div>
          </form>
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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
