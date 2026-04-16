import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Crown, Zap, CheckCircle, ArrowRight, ArrowLeft,
  Building2, User, Phone, Mail, Lock, Globe, PartyPopper, Search, X, ChevronDown, MapPin, Instagram
} from "lucide-react";

// Fallback list used ONLY while the API call is pending. The authoritative
// list lives in the DB (business_categories table) and is editable from
// super-admin. If the API call fails, we fall back to this.
const BUSINESS_CATEGORIES_FALLBACK = [
  // מספרות ועיצוב שיער
  "ספרות גברים",
  "מספרת נשים",
  "מספרה כללית",
  "החלקות שיער",
  "צביעת שיער",
  "עיצוב שיער ופאות",
  // יופי וטיפוח
  "מלחימת ריסים",
  "מלחימת גבות",
  "עיצוב גבות",
  "טיפולי פנים",
  "מניקור ופדיקור",
  "ציפורניים ג'ל / אקריליק",
  "מסאז'",
  "הסרת שיער בלייזר",
  "שעוות / הסרת שיער",
  "ספא וטיפולי גוף",
  "איפור ועיצוב",
  "סולריום",
  // קישוטי גוף
  "קעקוע",
  "פירסינג",
  "תכשיטי שיניים",
  // רפואה ובריאות
  "רפואה כללית",
  "רפואת שיניים",
  "פסיכולוגיה / טיפול רגשי",
  "פיזיותרפיה",
  "רפואה טבעית / אלטרנטיבית",
  "תזונה ודיאטה",
  "אופטומטריה",
  "נטורופתיה",
  "רפלקסולוגיה",
  // ספורט וכושר
  "אימון אישי",
  "יוגה / פילאטיס",
  "אומנויות לחימה",
  "שחייה",
  "ריקוד",
  // חינוך וייעוץ
  "שיעורים פרטיים",
  "ייעוץ עסקי",
  "ייעוץ משכנתאות",
  "ייעוץ משפטי",
  "אימון אישי (קואצ'ינג)",
  // שירותים מקצועיים
  "תיקון מחשבים ונייד",
  "תיקון רכב",
  "שיפוצים ובנייה",
  "חשמלאי",
  "שרברב",
  // יצירה ואמנות
  "צילום",
  "עיצוב גרפי",
  "שיעורי נגינה",
  // אחרים
  "וטרינר",
  "קייטרינג ואירועים",
  "אחר",
  "העסק שלי לא נמצא ברשימה",
];

type Plan = "free" | "pro";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\u0000-\u007Ea-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ────────────────────────────────────────────
// Step 1 — Subscription selection
// ────────────────────────────────────────────
function StepPlan({ onNext }: { onNext: (plan: Plan) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <a href="/" className="inline-block">
          <img src="/logo.png" alt="קבעתי" className="h-16 w-16 rounded-2xl object-cover mx-auto" />
        </a>
        <h1 className="text-3xl font-bold">ברוכים הבאים לקבעתי</h1>
        <p className="text-muted-foreground">בחר את התוכנית המתאימה לעסק שלך</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Free Plan */}
        <button
          onClick={() => onNext("free")}
          className="text-right border-2 rounded-2xl p-6 hover:border-primary hover:bg-primary/5 transition-all group focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-slate-500" />
            <span className="font-bold text-lg">חינמי</span>
          </div>
          <div className="text-3xl font-bold mb-1">חינם</div>
          <div className="text-sm text-muted-foreground mb-4">ללא עלות, ללא כרטיס אשראי</div>
          <ul className="space-y-2 text-sm text-right">
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> עד 3 שירותים</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> עד 20 לקוחות בחודש</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> עמוד הזמנות</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> לוח בקרה מלא</li>
          </ul>
          <div className="mt-5 w-full py-2 rounded-xl border-2 border-slate-400 text-slate-600 font-semibold text-sm group-hover:bg-slate-500 group-hover:text-white transition-colors">
            התחל חינם
          </div>
        </button>

        {/* Pro Plan */}
        <button
          onClick={() => onNext("pro")}
          className="text-right border-2 border-violet-400 rounded-2xl p-6 bg-violet-50 hover:bg-violet-100 hover:border-violet-600 transition-all group relative focus:outline-none focus:ring-2 focus:ring-violet-600"
        >
          <div className="absolute -top-3 left-4">
            <Badge className="bg-violet-600 text-white px-3 py-1">מומלץ</Badge>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-5 h-5 text-violet-600" />
            <span className="font-bold text-lg text-violet-800">פרו</span>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-3xl font-bold text-violet-800">₪50</span>
            <span className="text-sm text-violet-500 line-through">₪100</span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">🎉 -50%</span>
          </div>
          <div className="text-sm text-violet-600 mb-4">
            <span className="font-semibold">מבצע פתיחה!</span> לחודש הראשון — לאחר מכן ₪100/חודש
          </div>
          <ul className="space-y-2 text-sm text-right text-violet-800">
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> שירותים ללא הגבלה</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> תורים ללא הגבלה</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> עיצוב מותאם אישית</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> אינטגרציית WhatsApp</li>
            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> תמיכה מועדפת</li>
          </ul>
          <div className="mt-5 w-full py-2 rounded-xl bg-violet-600 text-white font-semibold text-sm group-hover:bg-violet-700 transition-colors">
            בחר תוכנית פרו
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        ניתן לשדרג או לשנות תוכנית בכל עת מלוח הבקרה
      </p>
    </div>
  );
}

// ────────────────────────────────────────────
// Step 1.5 — Pro: Payment placeholder
// ────────────────────────────────────────────
function StepPayment({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold">תשלום — תוכנית פרו</h2>
          <p className="text-sm text-muted-foreground">חודש ראשון ב-₪50 בלבד</p>
        </div>
      </div>

      <Card className="border-2 border-violet-200 bg-violet-50/50">
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between text-sm">
            <span>תוכנית פרו — חודש ראשון</span>
            <span className="font-bold">₪50</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>לאחר מכן</span>
            <span>₪100/חודש</span>
          </div>
          <div className="border-t pt-3 flex justify-between font-bold">
            <span>לתשלום עכשיו</span>
            <span className="text-violet-700">₪50</span>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-violet-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-xl">🔒</div>
          <div>
            <div className="font-semibold">תשלום מאובטח — Tranzila</div>
            <p className="text-xs text-muted-foreground">סליקה מוצפנת לפי תקן PCI-DSS</p>
          </div>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5 pr-1">
          <li>• השלמת הרישום תעביר אותך לעמוד התשלום</li>
          <li>• חיוב ראשון ₪50, מהחודש השני ₪100/חודש</li>
          <li>• ניתן לבטל בכל עת מהדשבורד — ללא קנסות</li>
        </ul>
      </div>

      <Button className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white gap-2" onClick={onNext}>
        המשך לרישום <ArrowLeft className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────
// Step 2 — Business details form
// ────────────────────────────────────────────
interface DetailsForm {
  businessName: string;
  slug: string;
  username: string;
  ownerName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  address: string;
  websiteUrl: string;
  instagramHandle: string;
}

function StepDetails({
  plan,
  onBack,
  onSuccess,
}: {
  plan: Plan;
  onBack: () => void;
  onSuccess: (token: string) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  // Load categories from the server. Falls back to the hard-coded list on
  // error so the form still works even if the API is down mid-render.
  const [categories, setCategories] = useState<string[]>(BUSINESS_CATEGORIES_FALLBACK);
  useEffect(() => {
    fetch(`${API_BASE}/public/categories`)
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<{ name: string }> | null) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setCategories(rows.map(r => r.name));
        }
      })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState<DetailsForm>({
    businessName: "",
    slug: "",
    username: "",
    ownerName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    address: "",
    websiteUrl: "",
    instagramHandle: "",
  });

  // ── Email verification state ─────────────────────────────────────────────
  // The user must verify their email with a 6-digit code before registration.
  // Verification is tied to the email string — changing the email resets it.
  const [verificationCode, setVerificationCode] = useState("");
  const [verifiedEmail, setVerifiedEmail]       = useState("");
  const [sendingCode, setSendingCode]           = useState(false);
  const [codeSent, setCodeSent]                 = useState(false);
  const [verifyingCode, setVerifyingCode]       = useState(false);
  const emailIsVerified = verifiedEmail && verifiedEmail === form.email.trim().toLowerCase();

  const sendVerificationCode = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email || !/@.+\./.test(email)) {
      toast({ title: "הזן אימייל תקין לפני שליחת קוד", variant: "destructive" });
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch(`${API_BASE}/auth/email/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("send_failed");
      setCodeSent(true);
      toast({ title: "הקוד נשלח", description: `בדקו את תיבת המייל של ${email}` });
    } catch {
      toast({ title: "שגיאה בשליחת קוד", variant: "destructive" });
    } finally {
      setSendingCode(false);
    }
  };

  const verifyEmailCode = async () => {
    const email = form.email.trim().toLowerCase();
    if (!verificationCode.trim()) {
      toast({ title: "הזן את הקוד שהגיע במייל", variant: "destructive" });
      return;
    }
    setVerifyingCode(true);
    try {
      const res = await fetch(`${API_BASE}/auth/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: verificationCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "verify_failed");
      setVerifiedEmail(email);
      toast({ title: "האימייל אומת בהצלחה ✓" });
    } catch {
      toast({ title: "הקוד שגוי או פג תוקף", variant: "destructive" });
    } finally {
      setVerifyingCode(false);
    }
  };

  const filteredCategories = categories.filter(c =>
    c.includes(categorySearch)
  );

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const set = (k: keyof DetailsForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm(prev => {
      const next = { ...prev, [k]: val };
      if (k === "businessName" && !slugManuallyEdited) {
        next.slug = slugify(val);
      }
      return next;
    });
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    setForm(prev => ({ ...prev, slug: slugify(e.target.value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast({ title: "הסיסמאות אינן תואמות", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }
    if (!form.slug) {
      toast({ title: "כתובת העסק אינה תקינה", variant: "destructive" });
      return;
    }
    if (!emailIsVerified) {
      toast({ title: "יש לאמת את כתובת האימייל לפני יצירת החשבון", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/business/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.businessName,
          slug: form.slug,
          username: form.username.trim() || undefined,
          ownerName: form.ownerName,
          phone: form.phone,
          email: form.email,
          password: form.password,
          subscriptionPlan: plan,
          businessCategories: selectedCategories.length > 0 ? selectedCategories : undefined,
          address: form.address.trim() || undefined,
          websiteUrl: form.websiteUrl.trim() || undefined,
          instagramHandle: form.instagramHandle.trim().replace(/^@/, "") || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.message ??
          (data.error === "email_taken" ? "האימייל כבר רשום במערכת" :
           data.error === "phone_taken" ? "מספר הטלפון כבר רשום" :
           data.error === "slug_taken" ? "כתובת העסק כבר תפוסה" :
           data.error === "username_taken" ? "שם המשתמש כבר תפוס" :
           "שגיאה ברישום, נסה שוב");
        toast({ title: "שגיאה", description: msg, variant: "destructive" });
        return;
      }

      onSuccess(data.token);
    } catch {
      toast({ title: "שגיאת רשת", description: "לא ניתן להתחבר לשרת", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold">פרטי העסק</h2>
          <p className="text-sm text-muted-foreground">
            תוכנית{" "}
            <span className={plan === "pro" ? "text-violet-600 font-semibold" : "text-blue-600 font-semibold"}>
              {plan === "pro" ? "פרו" : "חינמי"}
            </span>{" "}
            נבחרה
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Business name */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-muted-foreground" /> שם העסק
          </Label>
          <Input
            required
            placeholder="למשל: מספרת אופנה"
            value={form.businessName}
            onChange={set("businessName")}
          />
        </div>

        {/* Business categories */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-muted-foreground" /> סוג העסק
            <span className="text-xs text-muted-foreground font-normal">(אפשר לבחור כמה)</span>
          </Label>
          {selectedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedCategories.map(cat => (
                <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {cat}
                  <button type="button" onClick={() => toggleCategory(cat)}>
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
                {filteredCategories.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-3">לא נמצאו תוצאות</p>
                ) : filteredCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategories.includes(cat) ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Subdomain / slug */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-muted-foreground" /> כתובת ייחודית לעסק
          </Label>
          <div
            dir="ltr"
            className="flex items-stretch rounded-xl border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all"
          >
            <input
              required
              dir="ltr"
              className="flex-1 min-w-0 px-4 py-2.5 bg-transparent text-sm outline-none font-mono"
              placeholder="my-business"
              value={form.slug}
              onChange={handleSlugChange}
            />
            <span className="px-4 flex items-center text-sm text-muted-foreground whitespace-nowrap border-r bg-muted/50 font-mono">
              kavati.net/book/
            </span>
          </div>
          <p className="text-xs text-muted-foreground">רק אותיות באנגלית, מספרים ומקפים. ניתן לשנות בהגדרות בהמשך.</p>
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-muted-foreground" /> שם משתמש לכניסה
            <span className="text-xs text-muted-foreground font-normal">(אופציונלי)</span>
          </Label>
          <Input dir="ltr" placeholder="my-username" value={form.username} onChange={set("username")} />
          <p className="text-xs text-muted-foreground">ניתן להתחבר עם שם משתמש במקום אימייל</p>
        </div>

        {/* Owner name */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-muted-foreground" /> שם מלא של בעל העסק
          </Label>
          <Input required value={form.ownerName} onChange={set("ownerName")} />
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-muted-foreground" /> מספר טלפון
          </Label>
          <Input
            required
            type="tel"
            dir="ltr"
            placeholder=""
            value={form.phone}
            onChange={set("phone")}
          />
          <p className="text-xs text-muted-foreground">ישמש גם להתחברות לחשבון</p>
        </div>

        {/* Email + verification */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-muted-foreground" /> אימייל
            {emailIsVerified && <span className="text-green-600 text-xs font-medium">✓ מאומת</span>}
          </Label>
          <div className="flex gap-2">
            <Input
              required
              type="email"
              dir="ltr"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => {
                set("email")(e);
                // Changing the email resets verification — must re-verify new address
                if (codeSent || verifiedEmail) { setCodeSent(false); setVerifiedEmail(""); setVerificationCode(""); }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={sendVerificationCode}
              disabled={sendingCode || emailIsVerified}
              className="shrink-0"
            >
              {emailIsVerified ? "מאומת ✓" : sendingCode ? "שולח..." : codeSent ? "שלח שוב" : "שלח קוד"}
            </Button>
          </div>

          {codeSent && !emailIsVerified && (
            <div className="pt-2">
              <Label className="text-sm text-muted-foreground">קוד אימות מהמייל</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="flex-1 font-mono text-center text-lg tracking-widest"
                />
                <Button
                  type="button"
                  onClick={verifyEmailCode}
                  disabled={verifyingCode || verificationCode.length !== 6}
                  className="shrink-0"
                >
                  {verifyingCode ? "בודק..." : "אמת"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                קוד בן 6 ספרות נשלח ל-{form.email}. תקף ל-15 דקות.
              </p>
            </div>
          )}
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-muted-foreground" /> כתובת העסק
            <span className="text-xs text-muted-foreground font-normal">(אופציונלי)</span>
          </Label>
          <Input placeholder="רחוב הרצל 1, תל אביב" value={form.address} onChange={set("address")} />
        </div>

        {/* Website */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-muted-foreground" /> אתר העסק
            <span className="text-xs text-muted-foreground font-normal">(אופציונלי)</span>
          </Label>
          <Input dir="ltr" placeholder="https://www.mysite.com" value={form.websiteUrl} onChange={set("websiteUrl")} />
        </div>

        {/* Instagram */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Instagram className="w-4 h-4 text-muted-foreground" /> אינסטגרם
            <span className="text-xs text-muted-foreground font-normal">(אופציונלי)</span>
          </Label>
          <div className="flex items-center rounded-xl border bg-muted/40 overflow-hidden focus-within:ring-2 focus-within:ring-primary">
            <span className="px-3 text-sm text-muted-foreground border-l bg-muted">@</span>
            <input
              dir="ltr"
              className="flex-1 px-3 py-2 bg-transparent text-sm outline-none"
              placeholder="my_business"
              value={form.instagramHandle}
              onChange={set("instagramHandle")}
            />
          </div>
          {form.instagramHandle && (
            <p className="text-xs text-muted-foreground">instagram.com/{form.instagramHandle.replace(/^@/, "")}</p>
          )}
        </div>

        {/* Password */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-muted-foreground" /> סיסמה
            </Label>
            <Input required type="password" dir="ltr" placeholder="לפחות 6 תווים" value={form.password} onChange={set("password")} />
          </div>
          <div className="space-y-2">
            <Label>אימות סיסמה</Label>
            <Input required type="password" dir="ltr" placeholder="הכנס שוב" value={form.confirmPassword} onChange={set("confirmPassword")} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          בלחיצה על "צור חשבון" אתה מסכים ל
          <a href="#" className="text-primary underline underline-offset-2 mx-1">תנאי השימוש</a>
          ו
          <a href="#" className="text-primary underline underline-offset-2 mx-1">מדיניות הפרטיות</a>
        </p>

        <Button type="submit" disabled={loading} className="w-full h-11 text-base gap-2">
          {loading ? "יוצר חשבון..." : <>צור חשבון <ArrowLeft className="w-4 h-4" /></>}
        </Button>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────
// Step 3 — Success
// ────────────────────────────────────────────
function StepSuccess({ onDashboard }: { onDashboard: () => void }) {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <PartyPopper className="w-10 h-10 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">החשבון נוצר בהצלחה!</h2>
        <p className="text-muted-foreground mt-2">קבעתי מוכן לשימוש. בוא ניכנס ללוח הבקרה ונתחיל.</p>
      </div>
      <Button className="w-full h-11 text-base" onClick={onDashboard}>
        כנס ללוח הבקרה
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────
// Main Register page
// ────────────────────────────────────────────
type Step = "plan" | "payment" | "details" | "success";

export default function Register() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<Plan>("free");

  const handlePlanSelect = (selected: Plan) => {
    setPlan(selected);
    if (selected === "pro") {
      setStep("payment");
    } else {
      setStep("details");
    }
  };

  const handleRegisterSuccess = (token: string) => {
    localStorage.setItem("biz_token", token);
    localStorage.setItem("onboarding_pending", "true");
    setStep("success");
  };

  const handleDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col" dir="rtl">
      <Navbar />
      <div className="flex-1 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        {step !== "success" && (
          <div className="flex items-center gap-2 mb-8 justify-center">
            {(["plan", "details"] as const).map((s, i) => {
              const current = step === "plan" ? 0 : step === "payment" ? 0.5 : 1;
              const active = i <= current;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  {i < 1 && <div className={`h-0.5 w-12 transition-colors ${current > i ? "bg-primary" : "bg-muted"}`} />}
                </div>
              );
            })}
          </div>
        )}

        <Card className="shadow-xl border-0">
          <CardContent className="pt-8 pb-8 px-8">
            {step === "plan" && <StepPlan onNext={handlePlanSelect} />}
            {step === "payment" && <StepPayment onNext={() => setStep("details")} onBack={() => setStep("plan")} />}
            {step === "details" && (
              <StepDetails
                plan={plan}
                onBack={() => plan === "pro" ? setStep("payment") : setStep("plan")}
                onSuccess={handleRegisterSuccess}
              />
            )}
            {step === "success" && <StepSuccess onDashboard={handleDashboard} />}
          </CardContent>
        </Card>

        {step !== "success" && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            כבר יש לך חשבון?{" "}
            <a href="/dashboard" className="text-primary font-medium hover:underline">
              כנס כאן
            </a>
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
