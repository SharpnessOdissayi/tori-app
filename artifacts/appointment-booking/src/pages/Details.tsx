import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  CalendarCheck, MessageCircle, Bell, Clock, Shield, Zap, Crown,
  CheckCircle, Users, Settings, Palette, Star, ArrowLeft, Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";

const FEATURES = [
  {
    icon: <CalendarCheck className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "קביעת תורים אונליין",
    desc: "לקוחות קובעים תור בכל שעה, מכל מקום, דרך עמוד הזמנה ייחודי לעסק שלך.",
  },
  {
    icon: <MessageCircle className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "תזכורות בוואטסאפ",
    desc: "24 שעות ושעה לפני כל תור — לקוח מקבל תזכורת אוטומטית בווצאפ ולא שוכח.",
  },
  {
    icon: <Bell className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "הודעת כניסה אישית",
    desc: "הגדר הודעה שתוצג ללקוחות כשנכנסים לדף ההזמנה — מבצע, חוק העסק, מידע חשוב.",
  },
  {
    icon: <Palette className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "עיצוב מותאם אישית",
    desc: "בחר צבע, פונט, רדיוס פינות, תמונת לוגו ובאנר — הדף יראה בדיוק כמו המותג שלך.",
  },
  {
    icon: <Clock className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "ניהול שעות וחסימות",
    desc: "הגדר שעות עבודה, הפסקות, חופשות וימים שאתה סגור — המערכת לא תציג תורים בזמן הזה.",
  },
  {
    icon: <Users className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "ניהול לקוחות",
    desc: "ראה את כל הלקוחות שלך, ההיסטוריה שלהם, ורשימת המתנה לתורים שמתמלאים.",
  },
  {
    icon: <Shield className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "אימות מספר טלפון",
    desc: "מנע הזמנות ספאם עם אימות SMS — רק לקוחות אמיתיים עם מספר תקין יוכלו לקבוע תור.",
  },
  {
    icon: <Settings className="w-7 h-7" style={{ color: "#d4af37" }} />,
    title: "אישור תורים ידני",
    desc: "בחר לאשר כל תור ידנית לפני שהוא נכנס ליומן — שליטה מלאה בזמינות שלך.",
  },
];

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
    price: "₪50",
    sub: "לחודש הראשון • לאחר מכן ₪100/חודש",
    icon: <Crown className="w-6 h-6 text-violet-600" />,
    color: "border-violet-400",
    badge: "מומלץ — 50% הנחה לחודש ראשון",
    items: [
      "שירותים ללא הגבלה",
      "לקוחות ללא הגבלה",
      "תזכורות וואטסאפ אוטומטיות",
      "הודעת כניסה מותאמת אישית",
      "עיצוב מלא — צבע, פונט, לוגו, באנר",
      "רשימת המתנה",
      "אישור תורים ידני",
      "אימות מספר טלפון",
      "תמיכה מועדפת",
    ],
    cta: "הצטרף לפרו",
    href: "/register",
    ctaStyle: { background: "linear-gradient(135deg, #7c3aed, #9f56f0)", color: "white" },
  },
];

export default function Details() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar />

      {/* Hero */}
      <section className="py-20 px-6 text-center max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
            <Star className="w-4 h-4" fill="currentColor" />
            מי אנחנו ומה אנחנו עושים
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            קבעתי — מערכת ניהול תורים <span className="text-primary">חכמה</span> לעסקים ישראליים
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            בנינו פלטפורמה שמאפשרת לכל עסק — מספרה, קליניקה, קוסמטיקאית, מאמן ספורט ועוד —
            לנהל תורים בצורה מקצועית, חכמה ואוטומטית, בלי להשקיע שעות בניהול ידני.
          </p>
          <Link href="/register">
            <Button size="lg" className="h-13 px-8 text-base rounded-2xl gap-2 mt-2">
              <CalendarCheck className="w-5 h-5" />
              התחל חינם עכשיו
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-16 px-6 max-w-5xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <h2 className="text-3xl font-bold text-center mb-12">מה כלול במערכת?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f, i) => (
              <Card key={i} className="border-border hover:shadow-lg transition-shadow">
                <CardContent className="pt-6 pb-6 space-y-3 text-right">
                  <div>{f.icon}</div>
                  <h3 className="font-bold text-lg">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 px-6 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <h2 className="text-3xl font-bold text-center mb-4">תוכניות מחיר</h2>
          <p className="text-center text-muted-foreground mb-12">ניתן לשדרג בכל עת מלוח הבקרה</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {PLANS.map((plan, i) => (
              <div key={i} className={`rounded-2xl border-2 p-8 space-y-6 relative ${plan.color} ${i === 1 ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}>
                {plan.badge && (
                  <div className="absolute -top-3 right-6">
                    <Badge className="bg-violet-600 text-white px-3 py-1 text-xs">{plan.badge}</Badge>
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
            <Link href="/book/lilash">
              <Button size="lg" variant="outline" className="h-12 px-8 rounded-2xl gap-2">
                <CalendarCheck className="w-4 h-4" />
                צפה בדוגמה חיה
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t">
        <p>קבעתי — מערכת ניהול תורים לעסקים ישראליים</p>
      </footer>
    </div>
  );
}
