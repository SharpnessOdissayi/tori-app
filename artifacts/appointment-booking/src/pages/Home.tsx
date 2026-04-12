import { motion } from "framer-motion";
import { Link } from "wouter";
import { CalendarCheck, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar>
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-sm">כניסה לבעלי עסקים</Button>
        </Link>
        <Link href="/super-admin">
          <Button variant="outline" size="sm" className="text-sm">ניהול</Button>
        </Link>
      </Navbar>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 max-w-3xl mx-auto w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="space-y-8"
        >
          <div className="space-y-4">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="קבעתי" className="h-24 w-24 rounded-2xl object-cover shadow-lg" />
            </div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-2 text-sm font-medium mb-2">
              <CalendarCheck className="w-4 h-4" />
              מערכת ניהול תורים חכמה
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
              קבע תור <span className="text-primary">בקלות</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              פלטפורמת ניהול תורים מתקדמת לעסקים ישראליים. ניהול פשוט, חוויית לקוח מעולה.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/book/lilash">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-base rounded-2xl shadow-lg hover:shadow-xl transition-all gap-2">
                <CalendarCheck className="w-5 h-5" />
                נסה הזמנה לדוגמה
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

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 w-full"
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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 p-6 bg-muted/50 rounded-2xl border border-dashed w-full max-w-md"
        >
          <p className="text-muted-foreground text-sm mb-3">דוגמה לעסק: <strong className="text-foreground">Lilash — הלחמת ריסים באשדוד</strong></p>
          <Link href="/book/lilash">
            <Button variant="link" className="text-primary font-semibold gap-1 p-0 h-auto">
              כנס לדף ההזמנה
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
        </motion.div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t">
        <p>קבעתי — מערכת ניהול תורים לעסקים ישראליים</p>
      </footer>
    </div>
  );
}
