import { motion } from "framer-motion";
import { Link } from "wouter";
import { CalendarCheck, Building2, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";

function BookingMockup() {
  return (
    <Link href="/book/lilash">
      <div className="w-full max-w-sm mx-auto cursor-pointer group" dir="rtl">
        {/* Browser chrome */}
        <div className="rounded-t-2xl overflow-hidden shadow-2xl border border-border/60">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/80 border-b">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 mx-3 bg-background rounded-md px-3 py-1 text-xs text-muted-foreground font-mono border">
              kavati.net/book/lilash
            </div>
          </div>

          {/* Page content mockup */}
          <div className="bg-background px-5 py-5 space-y-4">
            {/* Business header */}
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto text-2xl">💜</div>
              <h3 className="font-extrabold text-lg text-purple-600">Lilash</h3>
              <p className="text-xs text-muted-foreground">קביעת תור אונליין</p>
            </div>

            {/* Step indicators */}
            <div className="flex justify-center gap-2">
              {[1,2,3,4].map(n => (
                <div key={n} className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${n === 1 ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"}`}>
                    {n === 1 ? <Check className="w-3.5 h-3.5" /> : n}
                  </div>
                  {n < 4 && <div className={`w-4 h-0.5 ${n < 1 ? "bg-purple-400" : "bg-muted"}`} />}
                </div>
              ))}
            </div>

            {/* Service card */}
            <div className="border-2 border-purple-200 rounded-xl bg-purple-50/50 p-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">הלחמת ריסים קלאסי</span>
                <span className="font-bold text-sm text-purple-600">₪150</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="w-3.5 h-3.5" /> 60 דקות
              </div>
            </div>

            <div className="border rounded-xl bg-muted/30 p-3 opacity-60">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">הלחמת ריסים רוסי</span>
                <span className="font-bold text-sm text-purple-600">₪200</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock className="w-3.5 h-3.5" /> 90 דקות
              </div>
            </div>

            {/* CTA */}
            <div
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold text-center transition-all group-hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7c3aed, #9f56f0)" }}
            >
              המשך לבחירת תאריך ←
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3 group-hover:text-primary transition-colors">
          לחץ לניסוי האמיתי ←
        </p>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar />

      <main className="flex-1 flex flex-col items-center px-6 py-16 max-w-5xl mx-auto w-full">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full flex flex-col lg:flex-row items-center gap-12 text-center lg:text-right"
        >
          {/* Left: text */}
          <div className="flex-1 space-y-6">
            <div className="flex justify-center lg:justify-start mb-2">
              <img src="/logo.png" alt="קבעתי" className="h-24 w-24 rounded-2xl object-cover shadow-lg" />
            </div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
              <CalendarCheck className="w-4 h-4" />
              מערכת ניהול תורים חכמה
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
              קבע תור <span className="text-primary">בקלות</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-xl leading-relaxed">
              פלטפורמת ניהול תורים מתקדמת לעסקים ישראליים. ניהול פשוט, חוויית לקוח מעולה.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-2">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl shadow-lg hover:shadow-xl transition-all gap-2">
                  <CalendarCheck className="w-5 h-5" />
                  התחל בחינם
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl gap-2">
                  <Building2 className="w-5 h-5" />
                  כניסה לבעלי עסקים
                </Button>
              </Link>
            </div>
          </div>

          {/* Right: booking mockup */}
          <div className="flex-1 w-full flex justify-center">
            <BookingMockup />
          </div>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-24 w-full"
        >
          {[
            { title: "ניהול שירותים", desc: "הגדר שירותים, מחירים ומשכי זמן" },
            { title: "שעות עבודה", desc: "קבע שעות פתיחה וזמני הפסקה" },
            { title: "לינק ייחודי", desc: "כל עסק מקבל עמוד הזמנה אישי" },
          ].map((f, i) => (
            <Card key={i} className="text-right border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6 pb-6 space-y-2">
                <h3 className="font-bold text-foreground text-lg">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t">
        <p>קבעתי — מערכת ניהול תורים לעסקים ישראליים</p>
      </footer>
    </div>
  );
}
