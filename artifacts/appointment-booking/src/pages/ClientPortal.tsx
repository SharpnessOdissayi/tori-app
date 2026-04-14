import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Home, CalendarDays, Plus, LogOut, Trash2, Edit2, X, ChevronLeft, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_BASE_URL ?? "/api";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID ?? "";
const TOKEN_KEY = "kavati_client_token";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientSession = { clientName: string; phone: string | null; email: string | null };

type Business = {
  businessId: number;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  address?: string | null;
};

type Appointment = {
  id: number;
  clientName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  durationMinutes: number;
  status: string;
  businessName: string;
  businessSlug: string;
  businessLogoUrl?: string | null;
  businessPrimaryColor?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { "x-client-token": token } : {};
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(day));
  const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  return `${days[date.getDay()]}, ${day}/${m}/${y}`;
}

function isUpcoming(date: string, time: string) {
  return new Date(`${date}T${time}:00`) > new Date();
}

function BusinessAvatar({ biz, size = 56 }: { biz: { name: string; logoUrl?: string | null; primaryColor?: string | null }; size?: number }) {
  if (biz.logoUrl) return (
    <img src={biz.logoUrl} alt={biz.name} className="rounded-full object-cover border-2 border-white shadow"
      style={{ width: size, height: size }} />
  );
  const initials = biz.name.slice(0, 2);
  const color = biz.primaryColor ?? "#7C3AED";
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shadow border-2 border-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.32 }}>
      {initials}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string, name: string) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const sendOtp = async () => {
    if (!phone.trim()) { toast({ title: "הכנס מספר טלפון", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/client/send-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      if (!res.ok) throw new Error();
      setStep("otp");
      toast({ title: "קוד נשלח לווצאפ שלך" });
    } catch { toast({ title: "שגיאה בשליחת קוד", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/client/verify-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem(TOKEN_KEY, data.token);
      onLogin(data.token, data.clientName);
    } catch (e: any) { toast({ title: e?.message ?? "קוד שגוי", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  // Load Facebook SDK
  useEffect(() => {
    if (!FACEBOOK_APP_ID || (window as any).FB) return;
    (window as any).fbAsyncInit = () => {
      (window as any).FB.init({ appId: FACEBOOK_APP_ID, cookie: true, xfbml: false, version: "v19.0" });
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/he_IL/sdk.js";
    document.head.appendChild(s);
  }, []);

  const handleFacebookLogin = () => {
    const FB = (window as any).FB;
    if (!FB) return;
    setLoading(true);
    FB.login((response: any) => {
      if (!response.authResponse) { setLoading(false); return; }
      const { accessToken, userID } = response.authResponse;
      fetch(`${API}/client/facebook-auth`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, userId: userID }),
      }).then(r => r.json()).then(data => {
        if (!data.token) throw new Error();
        localStorage.setItem(TOKEN_KEY, data.token);
        onLogin(data.token, data.clientName);
      }).catch(() => toast({ title: "שגיאת Facebook", variant: "destructive" }))
        .finally(() => setLoading(false));
    }, { scope: "public_profile,email" });
  };

  useEffect(() => {
    const handleCredential = async (response: any) => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/client/google-auth`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem(TOKEN_KEY, data.token);
        onLogin(data.token, data.clientName);
      } catch (e: any) { toast({ title: e?.message ?? "שגיאת Google", variant: "destructive" }); }
      finally { setLoading(false); }
    };

    const init = () => {
      if (!GOOGLE_CLIENT_ID) return;
      (window as any).google?.accounts?.id?.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      const btn = document.getElementById("google-signin-btn");
      if (btn) {
        (window as any).google?.accounts?.id?.renderButton(btn, {
          theme: "outline",
          size: "large",
          width: btn.offsetWidth || 320,
          locale: "he",
        });
      }
    };

    if ((window as any).google?.accounts?.id) { init(); }
    else {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) { existing.addEventListener("load", init); }
      else {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = init;
        document.head.appendChild(script);
      }
    }
  }, [onLogin]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-indigo-100 p-6" dir="rtl">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="text-4xl mb-3">📅</div>
          <h1 className="text-2xl font-bold text-gray-900">ברוכים הבאים</h1>
          <p className="text-sm text-gray-500">התחברו לניהול התורים שלכם</p>
        </div>

        {step === "phone" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">מספר טלפון</label>
              <input
                type="tel" dir="ltr" value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendOtp()}
                placeholder="050-0000000"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-center"
              />
            </div>
            <button onClick={sendOtp} disabled={loading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition-all">
              {loading ? "שולח..." : "שלח קוד WhatsApp"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-violet-50 rounded-xl text-center text-sm text-violet-700">
              קוד נשלח לווצאפ {phone}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">קוד אימות</label>
              <input
                type="text" dir="ltr" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && verifyOtp()}
                placeholder="123456"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-xl font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
              />
            </div>
            <button onClick={verifyOtp} disabled={loading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition-all">
              {loading ? "מאמת..." : "כניסה"}
            </button>
            <button onClick={() => { setStep("phone"); setCode(""); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline">
              חזור
            </button>
          </div>
        )}

        <div className="relative flex items-center">
          <div className="flex-1 border-t border-gray-200" />
          <span className="px-3 text-xs text-gray-400">או</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <div className="space-y-2">
          {GOOGLE_CLIENT_ID && (
            <div id="google-signin-btn" className="w-full flex justify-center" style={{ minHeight: 44 }} />
          )}
          {FACEBOOK_APP_ID && (
            <button
              onClick={handleFacebookLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: "#1877F2", color: "#fff" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              {loading ? "מתחבר..." : "המשך עם Facebook"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Portal ───────────────────────────────────────────────────────────────────

type Tab = "home" | "appointments";

export default function ClientPortal() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [session, setSession] = useState<ClientSession | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [editMode, setEditMode] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [loading, setLoading] = useState(false);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSession(null);
  };

  const handleLogin = (newToken: string, name: string) => {
    setToken(newToken);
    setSession({ clientName: name, phone: null, email: null });
  };

  // Load session data
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/client/me`, { headers: { ...authHeaders() } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setSession(data);
        setProfileName(data.clientName ?? "");
        setProfilePhone(data.phone ?? "");
      })
      .catch(logout);
  }, [token]);

  // Load businesses
  const loadBusinesses = useCallback(() => {
    if (!token) return;
    fetch(`${API}/client/businesses`, { headers: { ...authHeaders() } })
      .then(r => r.json()).then(setBusinesses).catch(() => {});
  }, [token]);

  // Load appointments
  const loadAppointments = useCallback(() => {
    if (!token) return;
    fetch(`${API}/client/appointments`, { headers: { ...authHeaders() } })
      .then(r => r.json()).then(setAppointments).catch(() => {});
  }, [token]);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);
  useEffect(() => { if (tab === "appointments") loadAppointments(); }, [tab, loadAppointments]);

  const removeBusiness = async (slug: string) => {
    await fetch(`${API}/client/businesses/${slug}`, { method: "DELETE", headers: { ...authHeaders() } });
    loadBusinesses();
  };

  const cancelAppointment = async (id: number) => {
    if (!confirm("לבטל את התור?")) return;
    const res = await fetch(`${API}/client/appointments/${id}/cancel`, { method: "PATCH", headers: { ...authHeaders() } });
    if (res.ok) { toast({ title: "התור בוטל" }); loadAppointments(); }
    else toast({ title: "שגיאה בביטול", variant: "destructive" });
  };

  const saveProfile = async () => {
    setLoading(true);
    const res = await fetch(`${API}/client/me`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ clientName: profileName, phone: profilePhone }),
    });
    setLoading(false);
    if (res.ok) { toast({ title: "פרטים עודכנו" }); setProfileOpen(false); setSession(s => s ? { ...s, clientName: profileName, phone: profilePhone } : s); }
    else toast({ title: "שגיאה", variant: "destructive" });
  };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  if (!session) return <div className="min-h-screen flex items-center justify-center" dir="rtl"><div className="text-gray-400">טוען...</div></div>;

  const upcoming = appointments.filter(a => a.status !== "cancelled" && isUpcoming(a.appointmentDate, a.appointmentTime));
  const past = appointments.filter(a => !isUpcoming(a.appointmentDate, a.appointmentTime) || a.status === "cancelled");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative" dir="rtl">

      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-base text-gray-900">
            {session.clientName ? `שלום, ${session.clientName.split(" ")[0]}!` : "פורטל לקוח"}
          </p>
          <p className="text-xs text-gray-400">{session.phone ?? session.email ?? ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setProfileOpen(true); }}
            className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition">
            <User className="w-4 h-4" />
          </button>
          <button onClick={logout}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* ── HOME TAB ── */}
        {tab === "home" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-gray-900">העסקים שלי</h2>
              {businesses.length > 0 && (
                <button onClick={() => setEditMode(v => !v)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition ${editMode ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  <Edit2 className="w-3 h-3" />
                  {editMode ? "סיום עריכה" : "עריכה"}
                </button>
              )}
            </div>

            {businesses.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="text-5xl">🏪</div>
                <p className="text-gray-500 text-sm">עוד אין עסקים ברשימה</p>
                <p className="text-gray-400 text-xs">היכנסי לקישור של עסק כדי להוסיפו</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {businesses.map(biz => (
                  <div key={biz.businessId}
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3 relative">
                    {editMode && (
                      <button onClick={() => removeBusiness(biz.slug)}
                        className="absolute top-2 left-2 w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <BusinessAvatar biz={biz} size={60} />
                    <p className="font-semibold text-sm text-center text-gray-900 leading-tight" dir="auto">{biz.name}</p>
                    {biz.address && <p className="text-xs text-gray-400 text-center">{biz.address}</p>}
                    {!editMode && (
                      <button onClick={() => navigate(`/book/${biz.slug}`)}
                        className="w-full py-2 rounded-xl text-xs font-bold text-white transition-all"
                        style={{ background: biz.primaryColor ?? "#7C3AED" }}>
                        קבעי תור
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── APPOINTMENTS TAB ── */}
        {tab === "appointments" && (
          <div className="p-4 space-y-5">
            {/* Upcoming */}
            <div>
              <h3 className="font-bold text-base text-gray-900 mb-3">תורים קרובים</h3>
              {upcoming.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-2xl border border-dashed">אין תורים קרובים</div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-start gap-3">
                        <BusinessAvatar biz={{ name: a.businessName, logoUrl: a.businessLogoUrl, primaryColor: a.businessPrimaryColor }} size={44} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900" dir="auto">{a.businessName}</p>
                          <p className="text-sm text-gray-600">{a.serviceName}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatDate(a.appointmentDate)} · {a.appointmentTime}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => navigate(`/book/${a.businessSlug}`)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 border-gray-200 text-gray-600 hover:border-gray-300 transition">
                          עדכון תור
                        </button>
                        <button onClick={() => cancelAppointment(a.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition">
                          ביטול
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* History */}
            {past.length > 0 && (
              <div>
                <h3 className="font-bold text-base text-gray-900 mb-3">היסטוריה</h3>
                <div className="space-y-2">
                  {past.map(a => (
                    <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4 opacity-80">
                      <div className="flex items-center gap-3">
                        <BusinessAvatar biz={{ name: a.businessName, logoUrl: a.businessLogoUrl, primaryColor: a.businessPrimaryColor }} size={36} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-700" dir="auto">{a.businessName}</p>
                          <p className="text-xs text-gray-500">{a.serviceName} · {formatDate(a.appointmentDate)}</p>
                        </div>
                        {a.status === "cancelled" && (
                          <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">בוטל</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 px-4 pt-2 pb-safe z-20">
        <div className="flex items-end justify-between gap-2 pb-2">
          {/* Home */}
          <button onClick={() => { setTab("home"); setEditMode(false); }}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all flex-1 ${tab === "home" ? "text-violet-600 bg-violet-50" : "text-gray-400 hover:text-gray-600"}`}>
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">בית</span>
          </button>

          {/* Book — prominent center */}
          <button
            onClick={() => {
              if (businesses.length === 1) { navigate(`/book/${businesses[0].slug}`); }
              else if (businesses.length > 1) { setTab("home"); }
              else { toast({ title: "הוסיפי עסק תחילה", description: "הכנסי לקישור של עסק כדי להתחיל" }); }
            }}
            className="flex flex-col items-center gap-1 py-3 px-6 rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200 active:scale-95 transition-all -translate-y-2">
            <Plus className="w-6 h-6" />
            <span className="text-[10px] font-bold">קבעי תור</span>
          </button>

          {/* Appointments */}
          <button onClick={() => setTab("appointments")}
            className={`flex flex-col items-center gap-1 py-2 px-4 rounded-2xl transition-all flex-1 ${tab === "appointments" ? "text-violet-600 bg-violet-50" : "text-gray-400 hover:text-gray-600"}`}>
            <CalendarDays className="w-5 h-5" />
            <span className="text-[10px] font-medium">התורים שלי</span>
          </button>
        </div>
      </div>

      {/* ── PROFILE SHEET ── */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={() => setProfileOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">פרופיל</h3>
              <button onClick={() => setProfileOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">שם מלא</label>
                <input value={profileName} onChange={e => setProfileName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">טלפון</label>
                <input type="tel" dir="ltr" value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-right" />
              </div>
            </div>
            <button onClick={saveProfile} disabled={loading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition">
              {loading ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
