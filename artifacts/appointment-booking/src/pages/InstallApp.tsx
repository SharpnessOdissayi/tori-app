import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Smartphone, Apple, Download, Zap, Bell, WifiOff, Info } from "lucide-react";
import {
  getDeviceKind,
  getBrowserKind,
  hasInstallPrompt,
  isInstalled,
  onInstallStateChange,
  triggerInstall,
  type DeviceKind,
} from "@/lib/pwa";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";

// "Install Kavati as an app" landing page. Reached from the dashboard's
// mobile menu. Purpose:
//   1. Tell owners that the Play Store / App Store apps aren't live yet
//      — they should use the PWA in the interim.
//   2. Show platform-specific install steps (Android Chrome differs from
//      iOS Safari differs from desktop).
//   3. Trigger the native install prompt when the browser supplies one
//      (Chrome Android / Edge desktop), otherwise fall back to the
//      per-platform "tap share → add to home screen" instructions.

export default function InstallApp() {
  const { toast } = useToast();
  const [device, setDevice] = useState<DeviceKind>("unknown");
  const [canPrompt, setCanPrompt] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    setDevice(getDeviceKind());
    setCanPrompt(hasInstallPrompt());
    setAlready(isInstalled());
    const off = onInstallStateChange(() => {
      setCanPrompt(hasInstallPrompt());
      setAlready(isInstalled());
    });
    return off;
  }, []);

  const handleInstall = async () => {
    const outcome = await triggerInstall();
    if (outcome === "accepted") {
      toast({ title: "🎉 האפליקציה הותקנה!", description: "תוכל למצוא אותה במסך הבית של המכשיר." });
    } else if (outcome === "dismissed") {
      toast({ title: "ההתקנה בוטלה", description: "אפשר לנסות שוב בכל עת." });
    } else {
      toast({
        title: "לא זמין כרגע",
        description: "הדפדפן שלך לא מציע התקנה אוטומטית. עקוב אחר השלבים הידניים למטה.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl" style={{ background: "#ffffff" }}>
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* Back link — mobile users came here from the dashboard menu */}
        <Link href="/dashboard">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowRight className="w-4 h-4" />
            חזרה לדשבורד
          </a>
        </Link>

        {/* Hero */}
        <header className="text-center py-6 sm:py-10 px-6 rounded-3xl text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur text-xs font-semibold mb-4">
            <Zap className="w-3.5 h-3.5" />
            גרסה זמנית עד ההשקה בחנויות
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">התקן את קבעתי כאפליקציה</h1>
          <p className="text-base sm:text-lg text-white/90 max-w-xl mx-auto">
            אייקון על המסך הבית, מסך מלא בלי שורת כתובת — כמו אפליקציה אמיתית.
          </p>
        </header>

        {already && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-green-50 border border-green-200 text-green-800">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">האפליקציה כבר מותקנת אצלך.</p>
              <p className="text-sm text-green-700/80 mt-1">
                אתה גולש כרגע דרך גרסת ה-PWA של קבעתי. אין צורך בהתקנה נוספת.
              </p>
            </div>
          </div>
        )}

        {/* One-tap install button — only Chrome-family surfaces this */}
        {canPrompt && !already && (
          <div className="rounded-3xl border-2 border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">הדפדפן שלך תומך בהתקנה בלחיצה אחת:</p>
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white font-bold text-lg shadow-lg hover:brightness-110 active:scale-[0.98] transition-all"
            >
              <Download className="w-5 h-5" />
              התקן עכשיו
            </button>
          </div>
        )}

        {/* What is this */}
        <section className="rounded-3xl bg-card border p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">מה זו האפליקציה הזו?</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            זו אותה האפליקציה שאתה מכיר מ-kavati.net — רק בצורת <strong className="text-foreground">PWA</strong>, ראשי תיבות של
            Progressive Web App. אתר אינטרנט שמותקן על המכשיר שלך כמו אפליקציה.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            אנחנו באמצע התהליך של פרסום האפליקציה הרשמית ב-Google Play וב-App Store. זה דורש בדיקת בודקים של שבועיים לפי דרישת Google
            (זה חדש — לחשבונות מפתח אישיים מ-2024). <strong className="text-foreground">עד שנסיים, זו הדרך הכי טובה לקבל חוויית אפליקציה מלאה</strong>.
          </p>
        </section>

        {/* Benefits */}
        <section className="rounded-3xl bg-card border p-5 sm:p-6 space-y-4">
          <h2 className="font-bold text-lg">למה להתקין?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Benefit icon={<Zap className="w-5 h-5" />} title="פתיחה מהירה">
              אייקון ישיר במסך הבית — בלי לחפש כרום ולהקליד כתובת.
            </Benefit>
            <Benefit icon={<Smartphone className="w-5 h-5" />} title="מסך מלא">
              בלי שורת כתובת של הדפדפן — יותר מקום לממשק של קבעתי.
            </Benefit>
            <Benefit icon={<Bell className="w-5 h-5" />} title="התראות בזמן אמת">
              פעמון ההתראות בדשבורד עובד גם מהאפליקציה — תקבל תור חדש מיד.
            </Benefit>
            <Benefit icon={<WifiOff className="w-5 h-5" />} title="עובד גם ברשת חלשה">
              Service Worker שומר את הקוד במטמון, אז האפליקציה נטענת מהר גם ברשת איטית.
            </Benefit>
          </div>
        </section>

        {/* Platform-specific instructions */}
        <section className="space-y-3">
          <h2 className="font-bold text-lg">איך מתקינים — לפי המכשיר שלך</h2>

          {/* We show ALL platforms, but expand the one that matches the
              user's device so they don't have to guess. */}
          <PlatformCard
            icon={<Smartphone className="w-5 h-5" />}
            title="אנדרואיד (Chrome / Edge / Samsung Internet)"
            isActive={device === "android"}
            steps={[
              { text: "פתח את האתר kavati.net בדפדפן Chrome" },
              { text: "לחץ על 3 הנקודות ⋮ בפינה העליונה של הדפדפן" },
              { text: "בחר 'הוספה למסך הבית' או 'התקן אפליקציה'" },
              { text: "אשר, והאייקון יופיע במסך הבית שלך" },
            ]}
          />

          <PlatformCard
            icon={<Apple className="w-5 h-5" />}
            title="אייפון / אייפד (Safari בלבד!)"
            isActive={device === "ios" || device === "desktop"}
            warning="ב-iOS רק Safari תומך בהתקנה. לא Chrome, לא Firefox."
            steps={[
              { text: "פתח את kavati.net ב-Safari ולחץ על כפתור השיתוף (הריבוע עם החץ כלפי מעלה) בתחתית המסך", image: "/ios-install-1.png" },
              { text: "בחר 'שיתוף' אם התפריט שנפתח שואל", image: "/ios-install-2.png" },
              { text: "גלול ובחר 'הצגת עוד' כדי לראות את כל האפשרויות", image: "/ios-install-3.png" },
              { text: "לחץ על 'הוספה למסך הבית' ואשר — האייקון של קבעתי יופיע במסך הבית שלך", image: "/ios-install-4.png" },
            ]}
          />
        </section>

        {/* Limitations — be honest */}
        <section className="rounded-3xl bg-amber-50 border border-amber-200 p-5 space-y-2">
          <h2 className="font-bold text-base text-amber-900">חשוב לדעת על המגבלות</h2>
          <ul className="text-sm text-amber-900/80 space-y-1.5 list-disc pr-5">
            <li>
              <strong>התראות Push במסך נעול</strong> — עובד חלקית באנדרואיד, לא עובד באייפון.
              עד לאפליקציה הרשמית בחנויות, מומלץ להשאיר את קבעתי פתוח ברקע.
            </li>
            <li>
              <strong>אין באפליקציה בחנות</strong> — אם לקוחות יחפשו "קבעתי" ב-Google Play / App Store, הם לא ימצאו אותך כרגע.
              רק מי שמגיע דרך kavati.net יכול להתקין.
            </li>
            <li>
              <strong>גישה למצלמה / מיקום</strong> — מוגבלת לפי הרשאות הדפדפן. באפליקציה נייטיב יהיה ללא מגבלות.
            </li>
          </ul>
        </section>

        {/* The real thing is coming */}
        <section className="rounded-3xl border-2 border-dashed border-primary/40 p-6 text-center space-y-2 bg-white">
          <div className="text-4xl">🚀</div>
          <h2 className="font-bold text-lg">האפליקציה הרשמית בדרך</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            תוך כ-3 שבועות, קבעתי יגיע לחנויות האפליקציות של Google ו-Apple. אם התקנת את ה-PWA עכשיו, תוכל להחליף בקלות —
            מסיר את ה-PWA, מתקין מהחנות, והנתונים נשארים.
          </p>
        </section>
      </main>
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

type Step = { text: string; image?: string };

function PlatformCard({
  icon,
  title,
  steps,
  warning,
  isActive,
}: {
  icon: React.ReactNode;
  title: string;
  steps: Step[];
  warning?: string;
  isActive?: boolean;
}) {
  return (
    <details
      open={isActive}
      className={`group rounded-2xl border p-4 transition-colors ${
        isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <summary className="flex items-center gap-2.5 cursor-pointer list-none select-none">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isActive ? "bg-primary text-white" : "bg-muted text-muted-foreground"
        }`}>
          {icon}
        </div>
        <span className="font-semibold flex-1">{title}</span>
        {isActive && <span className="text-xs text-primary font-bold">המכשיר שלך</span>}
        <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
      </summary>
      {warning && (
        <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          ⚠️ {warning}
        </p>
      )}
      <ol className="mt-3 space-y-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="leading-relaxed pt-0.5">{step.text}</p>
              {step.image && (
                <img
                  src={step.image}
                  alt={`שלב ${i + 1}`}
                  loading="lazy"
                  className="w-full max-w-xs rounded-xl border shadow-sm"
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
