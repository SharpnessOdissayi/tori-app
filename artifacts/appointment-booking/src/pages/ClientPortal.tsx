  import { useState, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { Home, CalendarDays, Plus, LogOut, Trash2, Edit2, X, ChevronLeft, Settings, Search, MapPin, Tag, Bell, Sun, Moon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_BASE_URL ?? "/api";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID ?? "";
const TOKEN_KEY = "kavati_client_token";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientSession = { clientName: string; phone: string | null; email: string | null; receiveNotifications: boolean; gender: string | null };

type Business = {
  businessId: number;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  address?: string | null;
};

type DirectoryBusiness = {
  slug: string;
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  address?: string | null;
  city?: string | null;
  businessCategories?: string | null;
  businessDescription?: string | null;
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
  const [remember, setRemember] = useState(true);
  const { toast } = useToast();

  const storeToken = (token: string) =>
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);

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
      storeToken(data.token);
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
        storeToken(data.token);
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
        storeToken(data.token);
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
                placeholder=""
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-center"
              />
            </div>
            <button onClick={sendOtp} disabled={loading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition-all">
              {loading ? "שולח..." : <span dir="rtl">שלח קוד <span dir="ltr">WhatsApp</span></span>}
            </button>
            <label className="flex items-center gap-2 cursor-pointer select-none justify-end mt-1">
              <span className="text-sm text-gray-500">זכור אותי</span>
              <div
                onClick={() => setRemember(v => !v)}
                className="relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0"
                style={{ background: remember ? "#7c3aed" : "#d1d5db" }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
                  style={{ right: remember ? "2px" : "auto", left: remember ? "auto" : "2px" }}
                />
              </div>
            </label>
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
            <button
              onClick={() => (window as any).google?.accounts?.id?.prompt()}
              disabled={loading}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold border transition-all disabled:opacity-50 hover:bg-gray-50"
              style={{ borderColor: "#dadce0", color: "#3c4043" }}
            >
              {loading ? "מתחבר..." : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
                    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
                  </svg>
                  המשך עם <span dir="ltr">Google</span>
                </>
              )}
            </button>
          )}
          {/* Facebook login hidden — pending Meta App Review */}
        </div>
      </div>
    </div>
  );
}

// ─── Portal ───────────────────────────────────────────────────────────────────

type Tab = "home" | "appointments";

export default function ClientPortal() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY));
  const [session, setSession] = useState<ClientSession | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(search).get("tab");
    return t === "appointments" ? "appointments" : "home";
  });
  const [editMode, setEditMode] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileReceiveNotifications, setProfileReceiveNotifications] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [clientNotifs, setClientNotifs] = useState<any[]>([]);
  const [clientUnread, setClientUnread] = useState(0);
  const [profileGender, setProfileGender] = useState<string>("other");
  const [loading, setLoading] = useState(false);

  // Discover
  const [hiddenApptIds, setHiddenApptIds] = useState<Set<number>>(
    () => new Set(JSON.parse(localStorage.getItem("kavati_hidden_appts") ?? "[]"))
  );
  // Client-side dark-mode preference — lives only in the client's browser
  const [portalTheme, setPortalTheme] = useState<"light" | "dark">(() => {
    try { return localStorage.getItem("kavati_portal_theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const togglePortalTheme = () => {
    setPortalTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem("kavati_portal_theme", next); } catch {}
      return next;
    });
  };
  useEffect(() => {
    const root = document.documentElement;
    if (portalTheme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    return () => root.classList.remove("dark");
  }, [portalTheme]);

  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverList, setDiscoverList] = useState<DirectoryBusiness[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [discoverCategory, setDiscoverCategory] = useState("");
  const [discoverCity, setDiscoverCity] = useState("");

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setSession(null);
  };

  const handleLogin = (newToken: string, name: string) => {
    setToken(newToken);
    setSession({ clientName: name, phone: null, email: null, receiveNotifications: true, gender: null });
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
        setProfileReceiveNotifications(data.receiveNotifications ?? true);
        setProfileGender(data.gender ?? "other");
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

  // Fetch client notifications
  const fetchClientNotifs = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API}/notifications/client`, { headers: { ...authHeaders() } });
      if (!r.ok) return;
      const d = await r.json();
      setClientNotifs(d.notifications ?? []);
      setClientUnread(d.unreadCount ?? 0);
    } catch {}
  }, [token]);
  useEffect(() => { fetchClientNotifs(); const t = setInterval(fetchClientNotifs, 30000); return () => clearInterval(t); }, [fetchClientNotifs]);

  const markClientNotifsRead = async () => {
    await fetch(`${API}/notifications/client/read-all`, { method: "POST", headers: { ...authHeaders() } });
    setClientUnread(0);
    setClientNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const deleteAllClientNotifs = async () => {
    if (!confirm("למחוק את כל ההתראות? לא ניתן לשחזר.")) return;
    await fetch(`${API}/notifications/client/all`, { method: "DELETE", headers: { ...authHeaders() } });
    setClientNotifs([]);
    setClientUnread(0);
  };

  const openDiscover = () => {
    setDiscoverOpen(true);
    setDiscoverLoading(true);
    fetch(`${API}/public/directory`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setDiscoverList(Array.isArray(data) ? data : []))
      .catch(() => setDiscoverList([]))
      .finally(() => setDiscoverLoading(false));
  };

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
      body: JSON.stringify({ clientName: profileName, phone: profilePhone, receiveNotifications: profileReceiveNotifications, gender: profileGender }),
    });
    setLoading(false);
    if (res.ok) { toast({ title: "פרטים עודכנו" }); setProfileOpen(false); setSession(s => s ? { ...s, clientName: profileName, phone: profilePhone || s.phone, receiveNotifications: profileReceiveNotifications, gender: profileGender } : s); }
    else toast({ title: "שגיאה", variant: "destructive" });
  };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  if (!session) return <div className="min-h-screen flex items-center justify-center" dir="rtl"><div className="text-gray-400">טוען...</div></div>;

  const hideAppt = (id: number) => {
    const next = new Set(hiddenApptIds).add(id);
    setHiddenApptIds(next);
    localStorage.setItem("kavati_hidden_appts", JSON.stringify([...next]));
  };

  const upcoming = appointments.filter(a => a.status !== "cancelled" && isUpcoming(a.appointmentDate, a.appointmentTime));
  const past = appointments.filter(a => !hiddenApptIds.has(a.id) && (!isUpcoming(a.appointmentDate, a.appointmentTime) || a.status === "cancelled"));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative" dir="rtl">

      {/* Header — z-30 so the notifications panel rendered inside beats the
          bottom nav's z-20 stacking context. Sticky elements create their
          own stacking context, so the child z-[100] alone isn't enough. */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div>
          <p className="font-bold text-base text-gray-900">
            {session.clientName ? `שלום, ${session.clientName.split(" ")[0]}!` : "פורטל לקוח"}
          </p>
          <p className="text-xs text-gray-400">{session.phone ?? session.email ?? ""}</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Notification bell */}
          <div className="relative">
            <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) fetchClientNotifs(); }}
              className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition relative">
              <Bell className="w-4 h-4" />
              {clientUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {clientUnread > 9 ? "9+" : clientUnread}
                </span>
              )}
            </button>
            {notifOpen && (
              <>
                <div onClick={() => setNotifOpen(false)} className="fixed inset-0 bg-black/20 z-[99] sm:hidden" />
                <div
                  className="fixed sm:absolute bottom-0 sm:bottom-auto sm:top-11 left-0 sm:left-auto sm:right-0 right-0 w-full sm:w-72 max-h-[80vh] sm:max-h-[440px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border z-[100] overflow-hidden flex flex-col"
                  dir="rtl"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
                    <span className="font-bold text-sm">התראות</span>
                    <div className="flex items-center gap-3">
                      {clientUnread > 0 && <button onClick={markClientNotifsRead} className="text-xs text-violet-600 hover:underline">סמן הכל כנקרא</button>}
                      {clientNotifs.length > 0 && <button onClick={deleteAllClientNotifs} className="text-xs text-red-600 hover:underline">מחק הכל</button>}
                      <button onClick={() => setNotifOpen(false)} className="sm:hidden text-lg leading-none text-muted-foreground">×</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y">
                    {clientNotifs.length === 0
                      ? <div className="py-8 text-center text-muted-foreground text-sm">אין התראות</div>
                      : clientNotifs.map((n: any) => (
                        <div key={n.id} className={`px-4 py-3 flex gap-3 items-start ${!n.is_read ? "bg-blue-50/60" : ""}`}>
                          <span className="text-base mt-0.5 shrink-0">{n.type === "cancellation" ? "❌" : n.type === "reschedule" ? "🔄" : "📅"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-500 font-medium">{n.business_name}</p>
                            <p className="text-sm leading-snug text-gray-800">{n.message}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(n.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* Dark/light toggle */}
          <button
            onClick={togglePortalTheme}
            aria-label={portalTheme === "dark" ? "מצב בהיר" : "מצב כהה"}
            title={portalTheme === "dark" ? "מצב בהיר" : "מצב כהה"}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition"
          >
            {portalTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={() => { setProfileOpen(true); }}
            className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 hover:bg-violet-100 transition">
            <Settings className="w-4 h-4" />
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
              <div className="flex items-center gap-2">
                <button onClick={openDiscover}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition">
                  <Plus className="w-3 h-3" />
                  גלה עסקים
                </button>
                {businesses.length > 0 && (
                  <button onClick={() => setEditMode(v => !v)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition ${editMode ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    <Edit2 className="w-3 h-3" />
                    {editMode ? "סיום עריכה" : "עריכה"}
                  </button>
                )}
              </div>
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
                        לפרופיל העסק
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
                        {a.status === "cancelled" && (
                          <button
                            onClick={() => hideAppt(a.id)}
                            className="p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                            title="הסר מהרשימה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
              <h3 className="font-bold text-lg">הגדרות</h3>
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
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">מין</label>
                <div className="flex gap-2">
                  {[{ v: "male", l: "זכר" }, { v: "female", l: "נקבה" }, { v: "other", l: "אחר" }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setProfileGender(v)}
                      className="flex-1 py-2 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        background: profileGender === v ? "#7c3aed" : "transparent",
                        color: profileGender === v ? "#fff" : "#6b7280",
                        borderColor: profileGender === v ? "#7c3aed" : "#e5e7eb",
                      }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div>
                  <div className="text-sm font-medium text-gray-700">קבל/י התראות מעסקים</div>
                  <div className="text-xs text-gray-400">הודעות אישור ותזכורות תורים</div>
                </div>
                <div
                  onClick={() => setProfileReceiveNotifications(v => !v)}
                  className="relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0"
                  style={{ background: profileReceiveNotifications ? "#7c3aed" : "#d1d5db" }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
                    style={{ right: profileReceiveNotifications ? "2px" : "auto", left: profileReceiveNotifications ? "auto" : "2px" }}
                  />
                </div>
              </div>
            </div>
            <button onClick={saveProfile} disabled={loading}
              className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition">
              {loading ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}

      {/* ── DISCOVER MODAL ── */}
      {discoverOpen && (() => {
        const allCategories = Array.from(new Set(
          discoverList.flatMap(b => {
            try { return b.businessCategories ? JSON.parse(b.businessCategories) as string[] : []; }
            catch { return []; }
          })
        )).sort();

        const allCities = Array.from(new Set(
          discoverList.map(b => b.city).filter(Boolean)
        )).sort() as string[];

        const filtered = discoverList.filter(b => {
          if (discoverSearch && !b.name.includes(discoverSearch) && !(b.address ?? "").includes(discoverSearch)) return false;
          if (discoverCity && b.city !== discoverCity) return false;
          if (discoverCategory) {
            try {
              const cats: string[] = b.businessCategories ? JSON.parse(b.businessCategories) : [];
              if (!cats.includes(discoverCategory)) return false;
            } catch { return false; }
          }
          return true;
        });

        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" dir="rtl">
            <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
              <button onClick={() => { setDiscoverOpen(false); setDiscoverSearch(""); setDiscoverCategory(""); setDiscoverCity(""); }}
                className="text-gray-500 hover:text-gray-800 transition">
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="font-bold text-base text-gray-900">גלה עסקים בקבעתי</h2>
                <p className="text-xs text-gray-400">עסקים שעובדים עם קבעתי בלבד</p>
              </div>
            </div>

            <div className="bg-white border-b px-4 py-3 space-y-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="חפש שם עסק..."
                  value={discoverSearch}
                  onChange={e => setDiscoverSearch(e.target.value)}
                  className="w-full pr-9 pl-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-gray-50"
                />
              </div>
              <div className="flex gap-2">
                {allCategories.length > 0 && (
                  <div className="relative flex-1">
                    <Tag className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <select
                      value={discoverCategory}
                      onChange={e => setDiscoverCategory(e.target.value)}
                      className="w-full appearance-none pr-8 pl-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">כל הסוגים</option>
                      {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {allCities.length > 0 && (
                  <div className="relative flex-1">
                    <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <select
                      value={discoverCity}
                      onChange={e => setDiscoverCity(e.target.value)}
                      className="w-full appearance-none pr-8 pl-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">כל הערים</option>
                      {allCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {discoverLoading ? (
                <div className="text-center py-16 text-gray-400 text-sm">טוען עסקים...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">לא נמצאו עסקים</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map(biz => (
                    <div key={biz.slug} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-2">
                      <BusinessAvatar biz={{ name: biz.name, logoUrl: biz.logoUrl, primaryColor: biz.primaryColor }} size={56} />
                      <p className="font-semibold text-sm text-center text-gray-900 leading-tight" dir="auto">{biz.name}</p>
                      {(biz.city || biz.address) && (
                        <p className="text-xs text-gray-400 text-center">{biz.city ?? biz.address}</p>
                      )}
                      <button
                        onClick={() => navigate(`/book/${biz.slug}`)}
                        className="w-full py-2 rounded-xl text-xs font-bold text-white transition-all mt-1"
                        style={{ background: biz.primaryColor ?? "#7C3AED" }}>
                        לפרופיל העסק
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
