import { motion } from "framer-motion";
import { Link } from "wouter";
import { CalendarCheck, Building2, MessageCircle, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar />

      <main className="flex-1 flex flex-col items-center px-6 py-20 max-w-4xl mx-auto w-full text-center">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-8"
        >
          <div className="flex justify-center">
            <img src="/logo.png" alt="קבעתי" className="h-24 w-24 rounded-2xl object-cover shadow-lg" />
          </div>

          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium">
            <CalendarCheck className="w-4 h-4" />
            מערכת ניהול תורים חכמה
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight max-w-2xl mx-auto">
            פלטפורמת קביעת תורים חכמה לבעלי עסקים
          </h1>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            תן ללקוחות שלך את שיא הנוחות והמהירות בקביעת תורים לעסק שלך.
            <br />
            תזכורות בווצאפ, הודעות פוש מותאמות אישית בכניסה ללינק קביעת התורים ועוד המון מחכים לך בפנים!
            <br />
            <span className="text-primary font-semibold">הנחה של 50% לחודש הראשון למנוי הפרו!</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
            <Link href="/book/lilash">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl shadow-lg hover:shadow-xl transition-all gap-2">
                <Sparkles className="w-5 h-5" />
                איך זה נראה באמת?
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl gap-2">
                <Building2 className="w-5 h-5" />
                כניסה לבעלי עסקים
              </Button>
            </Link>
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
            { icon: <MessageCircle className="w-5 h-5 text-primary" />, title: "תזכורות בווצאפ", desc: "לקוחות מקבלים תזכורת אוטומטית לפני כל תור" },
            { icon: <Bell className="w-5 h-5 text-primary" />, title: "הודעות כניסה", desc: "הודעת פתיחה מותאמת אישית ללקוחות שנכנסים לדף" },
            { icon: <CalendarCheck className="w-5 h-5 text-primary" />, title: "לינק ייחודי", desc: "כל עסק מקבל עמוד הזמנה אישי ומעוצב" },
          ].map((f, i) => (
            <Card key={i} className="text-right border-border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="pt-6 pb-6 space-y-2">
                <div className="mb-1">{f.icon}</div>
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
