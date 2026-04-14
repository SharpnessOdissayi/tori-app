import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Home, CalendarDays, Plus, Bell, Menu, X, ChevronRight, Clock, MapPin, Phone, LogOut, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "kavati_client_phone";
const PRIMARY = "#7C3AED";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 1 && m === 0) return "שעה";
  if (h === 1 && m > 0) return `שעה ו-${m} דקות`;
  if (m === 0) return `${h} שעות`;
  return `${h} שעות ו-${m} דקות`;
}

function renderBizName(name: string): React.ReactNode {
  if (!/[a-zA-Z]/.test(name) || !/[\u0590-\u05FF]/.test(name)) return name;
  const m = name.match(/^(.+?)\s*([-–—|\/])\s*(.+)$/);
  if (!m) return name;
  const [, p1, rawSep, p2] = m;
  const heb = /[\u0590-\u05FF]/.test(p1) ? p1 : p2;
  const eng = /[a-zA-Z]/.test(p1) ? p1 : p2;
  return (
    <span dir="ltr" style={{ display: "inline-flex", alignItems: "baseline", whiteSpace: "nowrap" }}>
      <span dir="rtl" style={{ whiteSpace: "nowrap" }}>{heb}</span>
      <span style={{ whiteSpace: "nowrap" }}>{` ${rawSep} `}</span>
      <span dir="ltr" style={{ whiteSpace: "nowrap" }}>{eng}</span>
    </span>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateShort(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function isUpcoming(dateStr: string, timeStr: string): boolean {
  const now = new Date();
  const apptDate = new Date(`${dateStr}T${timeStr}:00`);
  return apptDate > now;
}

type Appointment = {
  id: number;
  clientName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  status: string;
  notes?: string;
  businessId: number;
  businessName: string;
  businessSlug: string;
  businessLogoUrl?: string;
  businessPrimaryColor?: string;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? "/api";

export default function ClientPortal() {
  const [phone, setPhone] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [inputPhone, setInputPhone] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem(STORAGE_KEY));
  const [activeTab, setActiveTab] = useState<"home" | "appointments">("home");
  const [appointmentTab, setAppointmentTab] = useState<"upcoming" | "history" | "cancelled">("upcoming");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch appointments when logged in
  useEffect(() => {
    if (!isLoggedIn || !phone) return;
    setLoading(true);
    fetch(`${API_BASE}/client/appointments?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setAppointments(data);
      })
      .catch(() => toast({ title: "שגיאה", description: "לא ניתן לטעון תורים", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [isLoggedIn, phone]);

  const handleLogin = () => {
    const cleaned = inputPhone.trim().replace(/\D/g, "");
    if (!cleaned || cleaned.length < 9) {
      toast({ title: "מספר טלפון לא תקין", variant: "destructive" });
      return;
    }
    const formatted = cleaned.startsWith("972") ? `0${cleaned.slice(3)}` : cleaned.startsWith("0") ? cleaned : `0${cleaned}`;
    localStorage.setItem(STORAGE_KEY, formatted);
    setPhone(formatted);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPhone("");
    setIsLoggedIn(false);
    setAppointments([]);
    setMenuOpen(false);
  };

  // Derived data
  const upcoming = useMemo(() => appointments.filter(a => a.status !== "cancelled" && isUpcoming(a.appointmentDate, a.appointmentTime)), [appointments]);
  const history = useMemo(() => appointments.filter(a => a.status !== "cancelled" && !isUpcoming(a.appointmentDate, a.appointmentTime)), [appointments]);
  const cancelled = useMemo(() => appointments.filter(a => a.status === "cancelled"), [appointments]);

  const businesses = useMemo(() => {
    const seen = new Set<number>();
    return appointments.filter(a => {
      if (seen.has(a.businessId)) return false;
      seen.add(a.businessId);
      return true;
    });
  }, [appointments]);

  const nextAppt = upcoming[0];

  // ── Login screen ────────────────────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6" style={{ fontFamily: "Heebo, sans-serif" }}>
        <div className="w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor: PRIMARY }}>
              <Calendar className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ברוכים הבאים</h1>
            <p className="text-gray-500 text-sm">הזן את מספר הטלפון שלך לצפייה בתורים</p>
          </div>

          {/* Phone input */}
          <div className="space-y-3">
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                value={inputPhone}
                onChange={e => setInputPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="05X-XXXXXXX"
                dir="ltr"
                className="w-full h-14 rounded-2xl border border-gray-200 bg-white pr-10 pl-4 text-base text-center focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": PRIMARY } as any}
              />
            </div>
            <button
              onClick={handleLogin}
              className="w-full h-14 rounded-2xl text-white font-bold text-base transition-opacity hover:opacity-90"
              style={{ backgroundColor: PRIMARY }}
            >
              כניסה
            </button>
          </div>

          <p className="text-center text-xs text-gray-400">
            מנהל עסק?{" "}
            <button onClick={() => navigate("/dashboard")} className="underline" style={{ color: PRIMARY }}>
              כנס לפאנל הניהול
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Appointment card ─────────────────────────────────────────────────────────
  const AppointmentCard = ({ appt }: { appt: Appointment }) => {
    const upcoming = isUpcoming(appt.appointmentDate, appt.appointmentTime);
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: appt.businessPrimaryColor ?? PRIMARY }}>
              {appt.businessName.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900" dir="ltr">{renderBizName(appt.businessName)}</div>
              <div className="text-xs text-gray-500">{appt.serviceName}</div>
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${appt.status === "cancelled" ? "bg-red-50 text-red-600" : upcoming ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {appt.status === "cancelled" ? "בוטל" : upcoming ? "קרוב" : "עבר"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <CalendarDays className="w-4 h-4" />
            <span>{formatDate(appt.appointmentDate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span dir="ltr">{appt.appointmentTime}</span>
          </div>
          <div className="text-xs text-gray-400">{formatDuration(appt.durationMinutes)}</div>
        </div>
        {upcoming && appt.status !== "cancelled" && (
          <button
            onClick={() => navigate(`/book/${appt.businessSlug}`)}
            className="w-full text-center text-xs py-2 rounded-xl border font-medium transition-colors hover:bg-gray-50"
            style={{ borderColor: PRIMARY, color: PRIMARY }}
          >
            קביעה מחדש / ביטול
          </button>
        )}
      </div>
    );
  };

  // ── Main app ─────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: "Heebo, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-white border-b border-gray-100">
        <button onClick={() => setMenuOpen(true)}>
          <Menu className="w-6 h-6 text-gray-700" />
        </button>
        <h1 className="font-bold text-lg text-gray-900">
          {activeTab === "home" ? "דף הבית" : "כל התורים"}
        </h1>
        <button className="relative">
          <Bell className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        <AnimatePresence mode="wait">
          {/* ── HOME TAB ── */}
          {activeTab === "home" && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 px-5 pt-5">

              {/* Next appointment hero */}
              {nextAppt && (
                <div className="rounded-3xl p-5 text-white space-y-3" style={{ background: `linear-gradient(135deg, ${PRIMARY}, #9F67FF)` }}>
                  <div className="text-xs opacity-80">התור הקרוב שלך</div>
                  <div className="font-bold text-xl" dir="ltr">{renderBizName(nextAppt.businessName)}</div>
                  <div className="text-sm opacity-90">{nextAppt.serviceName}</div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="w-4 h-4" />
                      {formatDateShort(nextAppt.appointmentDate)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span dir="ltr">{nextAppt.appointmentTime}</span>
                    </div>
                  </div>
                </div>
              )}

              {!nextAppt && !loading && (
                <div className="rounded-3xl p-5 text-center text-gray-400 bg-white border border-gray-100 space-y-2">
                  <CalendarDays className="w-8 h-8 mx-auto opacity-40" />
                  <div className="text-sm">אין תורים קרובים</div>
                </div>
              )}

              {/* My businesses */}
              {businesses.length > 0 && (
                <div className="space-y-3">
                  <h2 className="font-bold text-gray-900">מעגל העסקים שלך</h2>
                  <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                    {businesses.map(b => (
                      <button key={b.businessId} onClick={() => navigate(`/book/${b.businessSlug}`)} className="flex flex-col items-center gap-1 flex-shrink-0">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm" style={{ backgroundColor: b.businessPrimaryColor ?? PRIMARY }}>
                          {b.businessName.charAt(0)}
                        </div>
                        <span className="text-xs text-gray-600 max-w-[56px] truncate" dir="ltr">{renderBizName(b.businessName)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming list */}
              {upcoming.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-900">הפגישות הבאות</h2>
                    <button onClick={() => setActiveTab("appointments")} className="text-xs flex items-center gap-0.5" style={{ color: PRIMARY }}>
                      הכל <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {upcoming.slice(0, 3).map(a => <AppointmentCard key={a.id} appt={a} />)}
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: PRIMARY, borderTopColor: "transparent" }} />
                </div>
              )}
            </motion.div>
          )}

          {/* ── APPOINTMENTS TAB ── */}
          {activeTab === "appointments" && (
            <motion.div key="appointments" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 pt-5">
              {/* Tabs */}
              <div className="flex px-5 gap-2">
                {(["upcoming", "history", "cancelled"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setAppointmentTab(tab)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${appointmentTab === tab ? "text-white" : "bg-white text-gray-500 border border-gray-200"}`}
                    style={appointmentTab === tab ? { backgroundColor: PRIMARY } : {}}
                  >
                    {tab === "upcoming" ? "הבאות" : tab === "history" ? "היסטוריה" : "מבוטלים"}
                  </button>
                ))}
              </div>

              <div className="px-5 space-y-3">
                {appointmentTab === "upcoming" && (upcoming.length === 0 ? <Empty text="אין פגישות עתידיות" /> : upcoming.map(a => <AppointmentCard key={a.id} appt={a} />))}
                {appointmentTab === "history" && (history.length === 0 ? <Empty text="אין היסטוריית פגישות" /> : history.map(a => <AppointmentCard key={a.id} appt={a} />))}
                {appointmentTab === "cancelled" && (cancelled.length === 0 ? <Empty text="אין פגישות מבוטלות" /> : cancelled.map(a => <AppointmentCard key={a.id} appt={a} />))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-gray-100 flex items-center justify-around px-4 py-3 z-10">
        <NavBtn icon={<Home className="w-5 h-5" />} label="בית" active={activeTab === "home"} onClick={() => setActiveTab("home")} color={PRIMARY} />
        <NavBtn icon={<CalendarDays className="w-5 h-5" />} label="כל התורים" active={activeTab === "appointments"} onClick={() => setActiveTab("appointments")} color={PRIMARY} />
        <button
          onClick={() => businesses[0] && navigate(`/book/${businesses[0].businessSlug}`)}
          className="w-14 h-14 -mt-6 rounded-2xl flex items-center justify-center text-white shadow-lg"
          style={{ backgroundColor: PRIMARY }}
        >
          <Plus className="w-6 h-6" />
        </button>
        <div className="w-14" />
        <div className="w-14" />
      </div>

      {/* Side menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black z-20" onClick={() => setMenuOpen(false)} />
            <motion.div initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }} transition={{ type: "spring", damping: 25 }} className="fixed top-0 right-0 h-full w-72 bg-white z-30 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-5 pt-12 pb-6 border-b border-gray-100">
                <div>
                  <div className="font-bold text-gray-900">{appointments[0]?.clientName ?? "הפרופיל שלי"}</div>
                  <div className="text-sm text-gray-500 mt-0.5" dir="ltr">{phone}</div>
                </div>
                <button onClick={() => setMenuOpen(false)}>
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 py-4">
                <MenuItem icon="🏠" label="בית" onClick={() => { setActiveTab("home"); setMenuOpen(false); }} />
                <MenuItem icon="📅" label="כל התורים" onClick={() => { setActiveTab("appointments"); setMenuOpen(false); }} />
              </div>
              <div className="border-t border-gray-100 p-4">
                <button onClick={handleLogout} className="flex items-center gap-3 text-red-500 text-sm font-medium w-full px-3 py-3">
                  <LogOut className="w-4 h-4" /> התנתק
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavBtn({ icon, label, active, onClick, color }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-0.5 w-14">
      <span style={{ color: active ? color : "#9CA3AF" }}>{icon}</span>
      <span className="text-[10px]" style={{ color: active ? color : "#9CA3AF" }}>{label}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 w-full px-5 py-3 text-gray-700 hover:bg-gray-50 text-sm font-medium">
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-12 gap-3 text-gray-400">
      <CalendarDays className="w-10 h-10 opacity-30" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
