import { useState } from "react";
import { Link } from "wouter";
import {
  Calendar, Clock, Settings, Briefcase, Users, TrendingUp,
  DollarSign, Umbrella, CheckCircle, X, Phone, Crown,
  ChevronRight, ArrowLeft, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Fake data ────────────────────────────────────────────────────────────────
const BUSINESS = {
  name: "מספרת דוד",
  ownerName: "דוד כהן",
  plan: "pro",
  slug: "demo-barber",
};

const TODAY = new Date();
const fmt = (d: Date) => d.toISOString().split("T")[0];
const addDays = (n: number) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const APPOINTMENTS = [
  { id: 1, clientName: "ירון לוי", phone: "050-1234567", service: "תספורת + זקן", duration: 45, date: fmt(TODAY), time: "09:00", status: "confirmed" },
  { id: 2, clientName: "משה אברהם", phone: "052-9876543", service: "תספורת", duration: 30, date: fmt(TODAY), time: "10:00", status: "confirmed" },
  { id: 3, clientName: "אריאל שמש", phone: "054-3456789", service: "צבע שיער", duration: 90, date: fmt(TODAY), time: "11:30", status: "pending" },
  { id: 4, clientName: "נועם בן-דוד", phone: "058-7654321", service: "תספורת", duration: 30, date: fmt(addDays(1)), time: "09:30", status: "confirmed" },
  { id: 5, clientName: "רוני גל", phone: "050-1111222", service: "גוון + תספורת", duration: 60, date: fmt(addDays(1)), time: "11:00", status: "confirmed" },
  { id: 6, clientName: "איתי פרץ", phone: "053-2223334", service: "תספורת", duration: 30, date: fmt(addDays(2)), time: "14:00", status: "confirmed" },
];

const SERVICES = [
  { id: 1, name: "תספורת", price: 60, duration: 30 },
  { id: 2, name: "תספורת + זקן", price: 90, duration: 45 },
  { id: 3, name: "צבע שיער", price: 200, duration: 90 },
  { id: 4, name: "גוון + תספורת", price: 150, duration: 60 },
];

const CUSTOMERS = [
  { id: 1, name: "ירון לוי", phone: "050-1234567", visits: 12 },
  { id: 2, name: "משה אברהם", phone: "052-9876543", visits: 7 },
  { id: 3, name: "אריאל שמש", phone: "054-3456789", visits: 3 },
  { id: 4, name: "נועם בן-דוד", phone: "058-7654321", visits: 19 },
  { id: 5, name: "רוני גל", phone: "050-1111222", visits: 5 },
];

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function formatDateHe(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${DAYS_HE[d.getDay()]}, ${d.getDate()} ב${MONTHS_HE[d.getMonth()]}`;
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────

function AppointmentsTab() {
  const pending = APPOINTMENTS.filter(a => a.status === "pending");
  const upcoming = APPOINTMENTS.filter(a => a.date >= fmt(TODAY) && a.status !== "pending");

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { title: "סה״כ פגישות", value: 47 },
          { title: "היום", value: 3 },
          { title: "השבוע", value: 12 },
          { title: "עתידיות", value: 18 },
        ].map(s => (
          <Card key={s.title} className="bg-primary/5 border-primary/10">
            <CardContent className="p-4">
              <div className="text-muted-foreground text-xs mb-1">{s.title}</div>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800 text-base">
              ⏳ ממתינים לאישור ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pending.map(apt => (
              <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border border-yellow-200 rounded-xl bg-white gap-2">
                <div>
                  <div className="font-semibold text-sm">{apt.clientName} <span className="text-muted-foreground font-normal" dir="ltr">{apt.phone}</span></div>
                  <div className="text-xs text-muted-foreground">{apt.service} • {apt.duration} דקות</div>
                  <div className="text-yellow-700 font-medium text-xs mt-0.5">{formatDateHe(apt.date)} • {apt.time}</div>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white">
                    <CheckCircle className="w-3 h-3" /> אשר
                  </button>
                  <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-500 border border-red-100">
                    <X className="w-3 h-3" /> דחה
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">פגישות קרובות</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {upcoming.map(apt => (
              <div key={apt.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-xl bg-card gap-2 hover:border-primary/40 transition-colors">
                <div>
                  <div className="font-semibold text-sm">{apt.clientName} <span className="text-muted-foreground font-normal text-xs" dir="ltr">{apt.phone}</span></div>
                  <div className="text-xs text-muted-foreground">{apt.service} • {apt.duration} דקות</div>
                  <div className="text-primary font-medium text-xs mt-0.5">{formatDateHe(apt.date)} • {apt.time}</div>
                </div>
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-500 border border-red-100">
                  <X className="w-3 h-3" /> ביטול
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServicesTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">השירותים שלי</h3>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
          + הוסף שירות
        </button>
      </div>
      <div className="space-y-2">
        {SERVICES.map(s => (
          <div key={s.id} className="flex items-center justify-between p-4 border rounded-xl bg-card hover:border-primary/40 transition-colors">
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-muted-foreground">{s.duration} דקות</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-primary">₪{s.price}</span>
              <button className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 border rounded-lg">עריכה</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomersTab() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">לקוחות ({CUSTOMERS.length})</h3>
      <div className="space-y-2">
        {CUSTOMERS.map(c => (
          <div key={c.id} className="flex items-center justify-between p-4 border rounded-xl bg-card">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {c.name[0]}
              </div>
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>
              </div>
            </div>
            <Badge variant="secondary">{c.visits} ביקורים</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeOffTab() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">ימי חופש וחסימות</h3>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground">
          + הוסף חופשה
        </button>
      </div>
      <div className="p-6 border-2 border-dashed rounded-xl text-center text-muted-foreground">
        <Umbrella className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">אין ימי חופש מתוכננים</p>
        <p className="text-xs mt-1">הוסף ימי חופש כדי שלקוחות לא יוכלו לקבוע בתאריכים אלו</p>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">נתוני פעילות</h3>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "השבוע", value: 12, trend: "+3", up: true },
          { label: "שבוע שעבר", value: 9, trend: "", up: true },
          { label: "החודש", value: 47, trend: "+8", up: true },
          { label: "ממוצע יומי", value: "2.3", trend: "", up: true },
        ].map(s => (
          <Card key={s.label} className="bg-primary/5 border-primary/10">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold">{s.value}</span>
                {s.trend && <span className="text-xs text-green-600 font-semibold mb-0.5">{s.trend} ↑</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-3">שירותים פופולריים</div>
          {SERVICES.map((s, i) => {
            const pct = [65, 48, 22, 31][i];
            return (
              <div key={s.id} className="flex items-center gap-3 mb-2">
                <div className="text-xs w-28 text-muted-foreground truncate">{s.name}</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs font-medium w-8 text-left">{pct}%</div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueTab() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">הכנסות</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "החודש", value: "₪3,240", sub: "27 תורים אושרו" },
          { label: "תחזית לחודש הבא", value: "₪3,800", sub: "לפי מגמה" },
          { label: "סה״כ כל הזמנים", value: "₪38,750", sub: "מאז ההצטרפות" },
        ].map(r => (
          <Card key={r.label} className="bg-emerald-50/50 border-emerald-200">
            <CardContent className="p-5">
              <div className="text-xs text-muted-foreground mb-1">{r.label}</div>
              <div className="text-2xl font-bold text-emerald-700">{r.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{r.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-3">הכנסה לפי שירות — החודש</div>
          {[
            { name: "תספורת", amount: 1320 },
            { name: "תספורת + זקן", amount: 810 },
            { name: "גוון + תספורת", amount: 750 },
            { name: "צבע שיער", amount: 360 },
          ].map(r => (
            <div key={r.name} className="flex justify-between items-center py-2 border-b last:border-0">
              <span className="text-sm">{r.name}</span>
              <span className="font-semibold text-emerald-700">₪{r.amount.toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">הגדרות עסק</h3>
      {[
        { label: "שם העסק", value: BUSINESS.name },
        { label: "שם הבעלים", value: BUSINESS.ownerName },
        { label: "ניהול תורים ידני", value: "כבוי" },
        { label: "אימות מספר טלפון", value: "פעיל" },
        { label: "תזכורות בווצאפ", value: "פעיל — 24ש׳ + שעה לפני" },
      ].map(item => (
        <div key={item.label} className="flex justify-between items-center p-4 border rounded-xl">
          <span className="text-sm text-muted-foreground">{item.label}</span>
          <span className="text-sm font-medium">{item.value}</span>
        </div>
      ))}
      <div className="p-4 border rounded-xl bg-muted/20">
        <div className="text-xs text-muted-foreground text-center">הגדרות נוספות זמינות בפאנל המלא</div>
      </div>
    </div>
  );
}

// ─── Main Demo component ───────────────────────────────────────────────────────

export default function Demo() {
  const [tab, setTab] = useState("appointments");

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">

      {/* Demo banner */}
      <div className="bg-amber-400 text-amber-900 text-center text-xs font-semibold py-2 px-4 sticky top-0 z-50 flex items-center justify-center gap-2">
        <Sparkles className="w-3.5 h-3.5" />
        מצב הדגמה — הנתונים המוצגים הם לדוגמה בלבד
        <Link href="/register">
          <span className="underline underline-offset-2 cursor-pointer">הצטרף חינם ←</span>
        </Link>
      </div>

      {/* Mobile-style header */}
      <div className="border-b px-4 py-3 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            {BUSINESS.name[0]}
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">{BUSINESS.name}</div>
            <div className="flex items-center gap-1">
              <Crown className="w-3 h-3 text-violet-600" />
              <span className="text-xs text-violet-600 font-medium">פרו</span>
            </div>
          </div>
        </div>
        <Link href="/register">
          <Button size="sm" className="text-xs h-8 rounded-xl gap-1">
            <Sparkles className="w-3 h-3" />
            הצטרף
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-4 pb-24 max-w-3xl mx-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-1 h-auto p-1 mb-5">
            <TabsTrigger value="appointments" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5" /> תורים
            </TabsTrigger>
            <TabsTrigger value="services" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <Briefcase className="w-3.5 h-3.5" /> שירותים
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <Users className="w-3.5 h-3.5" /> לקוחות
            </TabsTrigger>
            <TabsTrigger value="timeoff" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <Umbrella className="w-3.5 h-3.5" /> ימי חופש
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <TrendingUp className="w-3.5 h-3.5" /> נתונים
            </TabsTrigger>
            <TabsTrigger value="revenue" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <DollarSign className="w-3.5 h-3.5" /> כסף
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
              <Settings className="w-3.5 h-3.5" /> הגדרות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appointments"><AppointmentsTab /></TabsContent>
          <TabsContent value="services"><ServicesTab /></TabsContent>
          <TabsContent value="customers"><CustomersTab /></TabsContent>
          <TabsContent value="timeoff"><TimeOffTab /></TabsContent>
          <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
          <TabsContent value="revenue"><RevenueTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>

      {/* Bottom CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-black/95 backdrop-blur border-t z-40">
        <div className="max-w-3xl mx-auto flex gap-3">
          <Link href="/register" className="flex-1">
            <Button className="w-full rounded-2xl gap-2 h-12">
              <Sparkles className="w-4 h-4" />
              פתח עסק חינם — 30 שניות
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" className="h-12 rounded-2xl px-4 text-xs">
              כניסה
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
