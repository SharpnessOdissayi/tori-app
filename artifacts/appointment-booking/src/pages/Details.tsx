import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  CalendarCheck, Crown, Zap, Briefcase, Star, ArrowLeft, Phone,
  Check, X, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";

const PLANS = [
  {
    name: "חינמי",
    price: "חינם",
    sub: "ללא כרטיס אשראי",
    icon: <Zap className="w-6 h-6 text-slate-500" />,
    color: "border-border",
    badge: null,
    items: [
      "עד 3 שירותים",
      "עד 20 לקוחות בחודש",
      "עמוד הזמנות אישי",
      "לוח בקרה מלא",
      "עסק 1 לכל מספר טלפון",
    ],
    cta: "התחל חינם",
    href: "/register",
    ctaStyle: { background: "#f1f5f9", color: "#0f172a" },
  },
  {
    name: "פרו",
    price: "₪100",
    sub: "לחודש • 14 ימי ניסיון חינם",
    icon: <Crown className="w-6 h-6 text-blue-500" />,
    color: "border-blue-400",
    badge: "מומלץ — 14 ימי ניסיון חינם",
    items: [
      "שירותים ולקוחות ללא הגבלה",
      "תזכורות WhatsApp אוטומטיות (עד 50 ביום)",
      "100 הודעות SMS בחודש",
      "הודעת פתיחה לפרופיל עם תוקף מותאם",
      "פרסום בספריית 'גלה עסקים'",
      "גלריה עם תצוגה מוגדלת",
      "ניווט אוטומטי לווייז",
      "עיצוב מלא — צבע, פונט, לוגו, באנר",
      "רשימת המתנה",
      "אישור תורים ידני",
      "אימות מספר טלפון",
      "תמיכה מועדפת",
    ],
    cta: "הצטרף לפרו",
    href: "/register",
    ctaStyle: { background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)", color: "white" },
  },
  {
    name: "עסקי",
    price: "₪150",
    sub: "לחודש • לעסקים עם צוות",
    icon: <Briefcase className="w-6 h-6 text-purple-600" />,
    color: "border-purple-400",
    badge: "חדש — לצוות שלם",
    items: [
      "כל מה שיש בפרו ועוד:",
      "ניהול צוות — עובדים מרובים בעסק",
      "יומן נפרד לכל איש צוות",
      "שירותים ושעות עבודה לכל עובד",
      "WhatsApp עד 100 הודעות ביום",
      "300 הודעות SMS בחודש",
      "דומיין מותאם אישית (white-label)",
      "אנליטיקה מתקדמת והכנסות",
      "מודול קבלות וחשבוניות",
      "ייצוא נתונים ל-CSV",
      "תמיכה בעדיפות גבוהה",
    ],
    cta: "הצטרף לעסקי",
    href: "/register",
    ctaStyle: { background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)", color: "white" },
  },
];

/**
 * Comparison-table source. Cell value semantics:
 *   true   → included
 *   false  → not included
 *   string → quantitative limit / qualitative tier (e.g. "עד 50 ביום")
 * Keep in sync with PLANS items above when editing.
 */
const PLAN_FEATURES: Array<{
  section: string;
  items: Array<{ name: string; desc: string; free: boolean | string; pro: boolean | string; biz: boolean | string }>;
}> = [
  {
    section: "ניהול בסיסי",
    items: [
      { name: "עמוד הזמנה אישי",      desc: "כתובת ייחודית עם לוגו, באנר ועיצוב",         free: true,    pro: true,           biz: true },
      { name: "לוח בקרה מלא",         desc: "ניהול תורים, שירותים ושעות במקום אחד",        free: true,    pro: true,           biz: true },
      { name: "ניהול שעות וחופשות",   desc: "שעות פעילות, הפסקות וימי חופש",               free: true,    pro: true,           biz: true },
      { name: "שירותים פעילים",       desc: "מספר השירותים שאפשר להוסיף",                  free: "עד 3",  pro: "ללא הגבלה",   biz: "ללא הגבלה" },
      { name: "לקוחות בחודש",         desc: "כמות לקוחות שיכולים לקבוע תור",               free: "עד 20", pro: "ללא הגבלה",   biz: "ללא הגבלה" },
    ],
  },
  {
    section: "אוטומציה ותקשורת",
    items: [
      { name: "תזכורות WhatsApp",     desc: "תזכורת אוטומטית לפני התור",                   free: false,   pro: "עד 50 ביום",  biz: "עד 100 ביום" },
      { name: "הודעות SMS",           desc: "ללקוחות שאין להם וואטסאפ",                    free: false,   pro: "100 בחודש",   biz: "300 בחודש" },
      { name: "הודעת broadcast",      desc: "שליחה בבת אחת לכל הלקוחות",                   free: false,   pro: true,           biz: true },
      { name: "אימות מספר טלפון",     desc: "מניעת תורי ספאם עם SMS",                      free: false,   pro: true,           biz: true },
      { name: "רשימת המתנה",          desc: "לקוחות נכנסים אוטומטית כשמתפנה תור",          free: false,   pro: true,           biz: true },
      { name: "אישור תורים ידני",     desc: "אתה מאשר/ת כל תור לפני שנכנס ליומן",          free: false,   pro: true,           biz: true },
    ],
  },
  {
    section: "פרופיל ושיווק",
    items: [
      { name: "עיצוב מותאם אישית",        desc: "צבע, פונט, רדיוס פינות, לוגו ובאנר",      free: "בסיסי", pro: "מלא",          biz: "מלא" },
      { name: "הודעת פתיחה לפרופיל",      desc: "הכרזה זמנית עם תוקף מותאם בשעות",         free: false,   pro: true,           biz: true },
      { name: "פרסום בספריית 'גלה עסקים'", desc: "לקוחות חדשים מוצאים אותך מהפורטל",        free: false,   pro: true,           biz: true },
      { name: "גלריה עם תצוגה מוגדלת",    desc: "תמונות איכות במסך מלא",                   free: false,   pro: true,           biz: true },
      { name: "ניווט אוטומטי לווייז",     desc: "כפתור שפותח ווייז עם הכתובת מוכנה",        free: false,   pro: true,           biz: true },
    ],
  },
  {
    section: "צוות ואנליטיקה",
    items: [
      { name: "ניהול צוות",            desc: "מספר עובדים בעסק אחד",                       free: false,   pro: false,          biz: true },
      { name: "יומן נפרד לכל עובד",     desc: "כל איש צוות עם יומן ושירותים משלו",          free: false,   pro: false,          biz: true },
      { name: "אנליטיקה מתקדמת",       desc: "LTV, תחזיות הכנסה, סיווג לקוחות בסיכון",     free: false,   pro: false,          biz: true },
      { name: "קבלות וחשבוניות",        desc: "הנפקת קבלות חוקיות ללקוחות",                 free: false,   pro: false,          biz: true },
      { name: "ייצוא ל-CSV",           desc: "לקוחות, תורים והכנסות לקובץ",                free: false,   pro: false,          biz: true },
      { name: "דומיין מותאם אישית",     desc: "your-domain.com (white-label)",              free: false,   pro: false,          biz: true },
    ],
  },
  {
    section: "תמיכה",
    items: [
      { name: "תמיכה טכנית",           desc: "צוות תמיכה זמין באימייל ובוואטסאפ",          free: "בסיסית", pro: "מועדפת",      biz: "עדיפות גבוהה" },
    ],
  },
];

function PlanCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="inline-flex w-7 h-7 rounded-full bg-green-500 items-center justify-center shadow-sm">
        <Check className="w-4 h-4 text-white" strokeWidth={3} />
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="inline-flex w-7 h-7 rounded-full bg-red-400 items-center justify-center shadow-sm">
        <X className="w-4 h-4 text-white" strokeWidth={3} />
      </div>
    );
  }
  return (
    <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-tight text-center px-1">
      {value}
    </span>
  );
}

export default function Details() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar />

      {/* Hero */}
      <section className="py-16 sm:py-20 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
            <Star className="w-4 h-4" fill="currentColor" />
            המסלולים שלנו
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            המסלול שמתאים <span className="text-primary">לעסק שלך</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            התחל חינם, שדרג כשמתאים לך — בלי התחייבות, בלי הפתעות.
            ניתן לשדרג ולבטל בכל רגע ישירות מלוח הבקרה.
          </p>
          <a href="#compare">
            <Button size="lg" className="h-13 px-8 text-base rounded-2xl gap-2 mt-2">
              <CalendarCheck className="w-5 h-5" />
              השווה מסלולים
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </a>
        </motion.div>
      </section>

      {/* Pricing cards */}
      <section className="px-6 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <div key={i} className={`rounded-2xl border-2 p-8 space-y-6 relative ${plan.color} ${i === 1 ? "bg-blue-50/50 dark:bg-blue-950/20" : i === 2 ? "bg-purple-50/50 dark:bg-purple-950/20" : ""}`}>
                {plan.badge && (
                  <div className="absolute -top-3 right-6">
                    <Badge className={`${i === 2 ? "bg-purple-500" : "bg-blue-500"} text-white px-3 py-1 text-xs`}>{plan.badge}</Badge>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {plan.icon}
                  <span className="font-bold text-xl">{plan.name}</span>
                </div>
                <div>
                  <div className="text-4xl font-extrabold">{plan.price}</div>
                  <div className="text-sm text-muted-foreground mt-1">{plan.sub}</div>
                </div>
                <ul className="space-y-2.5">
                  {plan.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href}>
                  <button
                    className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                    style={plan.ctaStyle}
                  >
                    {plan.cta}
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Comparison table — morning-style. The middle (פרו) column carries
          a continuous blue tint across header/section/data rows so it reads
          as a single highlighted track even when section headers visually
          break the rows. */}
      <section id="compare" className="py-16 px-6 max-w-5xl mx-auto w-full scroll-mt-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
          <h2 className="text-3xl font-bold text-center mb-3">השוואת מסלולים</h2>
          <p className="text-center text-muted-foreground mb-10">כל מה שכלול בכל מסלול — במבט אחד</p>

          <div className="rounded-2xl border-2 border-border overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
            {/* Header row */}
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] border-b-2 border-border">
              <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50"></div>
              <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 text-center font-bold text-sm sm:text-base text-slate-700 dark:text-slate-300">חינמי</div>
              <div className="p-3 sm:p-4 bg-blue-50 dark:bg-blue-950/40 text-center font-bold text-sm sm:text-base text-blue-700 dark:text-blue-300">פרו</div>
              <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 text-center font-bold text-sm sm:text-base text-purple-700 dark:text-purple-300">עסקי</div>
            </div>

            {PLAN_FEATURES.map((section, sIdx) => (
              <div key={sIdx}>
                {/* Section header — feature label only; track columns keep their column tint */}
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr]">
                  <div className="p-2.5 sm:p-3 bg-slate-100/80 dark:bg-slate-800/40 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 text-right">
                    {section.section}
                  </div>
                  <div className="bg-slate-100/80 dark:bg-slate-800/40"></div>
                  <div className="bg-blue-100/50 dark:bg-blue-950/30"></div>
                  <div className="bg-slate-100/80 dark:bg-slate-800/40"></div>
                </div>

                {section.items.map((feat, fIdx) => (
                  <div key={fIdx} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] border-t border-border">
                    <div className="p-3 sm:p-4 text-right">
                      <div className="font-semibold text-sm sm:text-base">{feat.name}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug">{feat.desc}</div>
                    </div>
                    <div className="p-3 sm:p-4 flex items-center justify-center bg-white dark:bg-slate-900">
                      <PlanCell value={feat.free} />
                    </div>
                    <div className="p-3 sm:p-4 flex items-center justify-center bg-blue-50/50 dark:bg-blue-950/20">
                      <PlanCell value={feat.pro} />
                    </div>
                    <div className="p-3 sm:p-4 flex items-center justify-center bg-white dark:bg-slate-900">
                      <PlanCell value={feat.biz} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            ניתן לשדרג מסלול בכל רגע מלוח הבקרה — השינוי תקף מיידית
          </p>
        </motion.div>
      </section>

      {/* About us */}
      <section className="py-16 px-6 max-w-3xl mx-auto w-full text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="space-y-6">
          <h2 className="text-3xl font-bold">מי אנחנו?</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            קבעתי היא סטארטאפ ישראלי שמאמין שכל עסק — גדול או קטן — מגיע לכלים מקצועיים לניהול תורים.
            פיתחנו את המערכת מהניסיון האמיתי של בעלי עסקים שבזבזו שעות על הודעות "אפשר לקבוע תור?"
            בוואטסאפ. המטרה שלנו: לחסוך לך זמן, להגביר נוכחות דיגיטלית, ולתת ללקוחות שלך חוויה מודרנית.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="h-12 px-8 rounded-2xl gap-2">
                <Phone className="w-4 h-4" />
                התחל ב-30 שניות
              </Button>
            </Link>
            <Link href="/book/demo">
              <Button size="lg" variant="outline" className="h-12 px-8 rounded-2xl gap-2">
                <CalendarCheck className="w-4 h-4" />
                צפה בדוגמה חיה
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <SiteFooter />
    </div>
  );
}
