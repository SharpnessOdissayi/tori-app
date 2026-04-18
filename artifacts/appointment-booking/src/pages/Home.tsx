import { motion } from "framer-motion";
import { Link } from "wouter";
import { Sparkles, Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";

// Four stills from the production Lilash booking flow + dashboard, used as
// visual proof inside the iPhone mockups in the hero. Referenced from
// /public/hero so the bundler doesn't re-hash them on every build.
const PHONE_SHOTS: ReadonlyArray<{
  src: string;
  title: string;
  desc: string;
  anim: "kv-float-a" | "kv-float-b" | "kv-float-c" | "kv-float-d";
  bump: boolean; // alt-row vertical stagger on desktop so it's not a flat line
}> = [
  {
    src: "/hero/lilash-1.png",
    title: "עמוד הזמנה מעוצב לעסק",
    desc:  "לוגו, באנר, שירותים ומחירים — הלקוח קובע תור בשניות, ישר מהפלאפון.",
    anim:  "kv-float-a",
    bump:  false,
  },
  {
    src: "/hero/lilash-2.png",
    title: "יומן וניהול מהנייד",
    desc:  "יומן שבועי ותפריט מלא — פגישות, שירותים, קבלות, לקוחות, הגדרות, הכל ממקום אחד.",
    anim:  "kv-float-b",
    bump:  true,
  },
  {
    src: "/hero/lilash-3.png",
    title: "מאגר לקוחות חכם",
    desc:  "כל לקוח עם היסטוריית תורים והכנסות, וקיצורים ל-WhatsApp, חיוג והנפקת קבלה.",
    anim:  "kv-float-c",
    bump:  false,
  },
  {
    src: "/hero/lilash-4.png",
    title: "שעות עבודה גמישות",
    desc:  "סמנו את הימים והשעות שבהם העסק פעיל — מעודכן אוטומטית בעמוד ההזמנות.",
    anim:  "kv-float-d",
    bump:  true,
  },
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col" dir="rtl">
      <Navbar />

      <main className="flex-1 kv-hero-bg">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-16">

          {/* Hero text */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="text-center max-w-3xl mx-auto space-y-6"
          >
            {/* Big centered brand logo — first thing visitors see above the
                fold. h-28 on mobile, h-40 on desktop keeps it prominent
                without pushing the h1 below the first viewport on short
                laptops. */}
            <div className="flex justify-center">
              <img src="/logo.svg" alt="קבעתי" className="h-28 md:h-40 w-auto select-none" />
            </div>

            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-semibold">
              🎁 14 ימי ניסיון חינם · ללא כרטיס אשראי
            </div>

            <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight text-foreground">
              מערכת ש<span className="text-primary">עובדת</span> בשבילך.
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              מערכת קביעת תורים מלאה לעסקים בישראל — תזכורות ב-WhatsApp, פורטל ללקוחות,
              קבלות אוטומטיות, עיצוב מותאם אישית לכל עסק.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl shadow-lg hover:shadow-xl transition-all gap-2">
                  <Sparkles className="w-5 h-5" />
                  הצטרפות למסלול הנסיון שלנו
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl gap-2">
                  <Building2 className="w-5 h-5" />
                  כניסה לבעלי עסקים
                </Button>
              </Link>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-1">
              <Check className="w-4 h-4 text-emerald-500" />
              בלי להתקין כלום · שיתוף לינק ללקוחות תוך 3 דקות
            </div>
          </motion.section>

          {/* 4 phones row — mirrors the approved preview at home-preview/index.html */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 items-start"
          >
            {PHONE_SHOTS.map(p => (
              <div key={p.src} className={`flex flex-col items-center text-center ${p.bump ? "md:mt-8" : ""}`}>
                <div className={`w-full max-w-[200px] ${p.anim}`}>
                  <div className="kv-phone">
                    <div className="kv-phone-screen">
                      <img src={p.src} alt={p.title} loading="lazy" />
                    </div>
                  </div>
                </div>
                <h3 className="font-extrabold text-base mt-5 text-foreground">{p.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1 px-2">{p.desc}</p>
              </div>
            ))}
          </motion.section>

          {/* "איך זה עובד" — 3 steps */}
          <section className="mt-24">
            <h2 className="text-center text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">איך זה עובד?</h2>
            <p className="text-center text-muted-foreground mt-2">3 שלבים. חצי שעה. ואתם באוויר.</p>

            <div className="grid md:grid-cols-3 gap-5 mt-10">
              {[
                { n: 1, t: "נרשמים",   d: "חשבון פרו חינם ל-14 יום. בלי כרטיס אשראי." },
                { n: 2, t: "מעצבים",   d: "צבעים, לוגו, שעות עבודה, שירותים — חמש דקות." },
                { n: 3, t: "משתפים",   d: "לינק אחד ללקוחות → הם קובעים בלי להתקשר." },
              ].map(step => (
                <div key={step.n} className="relative bg-card rounded-2xl border p-6">
                  <div className="absolute -top-4 right-6 w-10 h-10 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center justify-center shadow-lg shadow-primary/30">
                    {step.n}
                  </div>
                  <h3 className="font-extrabold text-lg mt-2 text-foreground">{step.t}</h3>
                  <p className="text-muted-foreground text-sm mt-1">{step.d}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
