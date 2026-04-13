import { useState, useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetPublicBusiness,
  useGetPublicServices,
  useGetPublicAvailability,
  useCreatePublicAppointment,
  useJoinWaitlist,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Check, ChevronRight, Clock, CalendarIcon, User, Phone, CheckCircle2, ListOrdered, Globe, MapPin, Instagram } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "react-day-picker/dist/style.css";
import { useToast } from "@/hooks/use-toast";

const DAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דקות`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}:00 שעות` : `${h}:${m.toString().padStart(2, "0")} שעות`;
}

export default function Book() {
  const { businessSlug } = useParams<{ businessSlug: string }>();
  // step 0 = profile page, 1-5 = booking wizard
  const [step, setStep] = useState(0);
  const [showNotification, setShowNotification] = useState(true);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showExistingBooking, setShowExistingBooking] = useState(false);
  const [activeTab, setActiveTab] = useState<"services" | "hours" | "gallery">("services");
  const [existingBooking, setExistingBooking] = useState<any>(null);
  const [workingHours, setWorkingHours] = useState<any[]>([]);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientData, setClientData] = useState({ name: "", phone: "", notes: "" });
  const [waitlistData, setWaitlistData] = useState({ name: "", phone: "", notes: "" });

  // Phone OTP verification state
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const { toast } = useToast();
  const { data: business, isLoading: businessLoading, error: businessError } = useGetPublicBusiness(businessSlug || "");
  const { data: services, isLoading: servicesLoading } = useGetPublicServices(businessSlug || "");

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const { data: availability, isLoading: availabilityLoading } = useGetPublicAvailability(
    businessSlug || "",
    { date: dateStr, serviceId: selectedServiceId! },
    { query: { enabled: !!dateStr && !!selectedServiceId } }
  );

  const createMutation = useCreatePublicAppointment();
  const waitlistMutation = useJoinWaitlist();

  const primaryColor = business?.primaryColor ?? "#2563eb";
  const fontFamily = business?.fontFamily ?? "Heebo";
  const backgroundColor = (business as any)?.backgroundColor ?? null;
  const borderRadius = (business as any)?.borderRadius ?? "medium";
  const themeMode = business?.themeMode ?? "light";
  const requireApproval = (business as any)?.requireAppointmentApproval ?? false;
  const showBusinessName = (business as any)?.showBusinessName ?? true;
  const showLogo = (business as any)?.showLogo ?? true;
  const showBanner = (business as any)?.showBanner ?? true;
  const logoUrl = business?.logoUrl ?? null;
  const bannerUrl = business?.bannerUrl ?? null;
  const phone = (business as any)?.phone ?? null;
  const websiteUrl = (business as any)?.websiteUrl ?? null;
  const instagramUrl = (business as any)?.instagramUrl ?? null;
  const wazeUrl = (business as any)?.wazeUrl ?? null;
  const businessDescription = (business as any)?.businessDescription ?? null;
  const bannerPosition = (business as any)?.bannerPosition ?? "center";
  const galleryImagesRaw = (business as any)?.galleryImages ?? null;
  let galleryImages: string[] = [];
  try { if (galleryImagesRaw) galleryImages = JSON.parse(galleryImagesRaw); } catch {}

  const cardRadius = borderRadius === "sharp" ? "8px" : borderRadius === "rounded" ? "24px" : "16px";

  // Load working hours
  useEffect(() => {
    if (!businessSlug) return;
    fetch(`/api/public/${businessSlug}/hours`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setWorkingHours(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [businessSlug]);

  // Load existing booking from localStorage
  useEffect(() => {
    if (!businessSlug) return;
    const saved = localStorage.getItem(`kavati_booking_${businessSlug}`);
    if (saved) {
      try { setExistingBooking(JSON.parse(saved)); } catch {}
    }
  }, [businessSlug]);

  useEffect(() => {
    if (!business) return;
    const root = document.documentElement;

    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    if (business.primaryColor) {
      const hex = business.primaryColor.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      root.style.setProperty("--primary-r", String(r));
      root.style.setProperty("--primary-g", String(g));
      root.style.setProperty("--primary-b", String(b));
    }

    if (fontFamily && fontFamily !== "inherit") {
      const id = `gfont-${fontFamily.replace(/\s+/g, "-")}`;
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;500;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }

    return () => { root.classList.remove("dark"); };
  }, [business, fontFamily, themeMode]);

  if (businessLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: primaryColor + " transparent transparent transparent" }} />
        <p className="text-muted-foreground">טוען...</p>
      </div>
    </div>
  );
  if (businessError || !business) return (
    <div className="min-h-screen flex items-center justify-center text-center p-8">
      <div>
        <div className="text-4xl mb-4">😔</div>
        <h1 className="text-2xl font-bold text-destructive mb-2">העסק לא נמצא</h1>
        <p className="text-muted-foreground">הכתובת שהזנת אינה תקינה</p>
      </div>
    </div>
  );

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);
  const servicesList = Array.isArray(services) ? services : [];
  const selectedService = servicesList.find(s => s.id === selectedServiceId);

  const handleSendOtp = async () => {
    if (!clientData.phone) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`/api/public/${businessSlug}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clientData.phone }),
      });
      if (!res.ok) throw new Error();
      setOtpSent(true);
      toast({ title: "קוד נשלח לנייד שלך בWhatsApp" });
    } catch {
      toast({ title: "שגיאה בשליחת הקוד", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`/api/public/${businessSlug}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clientData.phone, code: otpCode }),
      });
      if (!res.ok) {
        toast({ title: "קוד שגוי, נסה שוב", variant: "destructive" });
        return;
      }
      setPhoneVerified(true);
      toast({ title: "הטלפון אומת בהצלחה" });
    } catch {
      toast({ title: "שגיאה באימות", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || !dateStr || !selectedTime) return;
    createMutation.mutate(
      { businessSlug: businessSlug || "", data: { serviceId: selectedServiceId, clientName: clientData.name, phoneNumber: clientData.phone, appointmentDate: dateStr, appointmentTime: selectedTime, notes: clientData.notes } },
      {
        onSuccess: () => {
          // Save booking to localStorage
          const bookingData = {
            date: dateStr,
            time: selectedTime,
            service: selectedService?.name,
            name: clientData.name,
          };
          localStorage.setItem(`kavati_booking_${businessSlug}`, JSON.stringify(bookingData));
          setStep(5);
        },
        onError: () => toast({ title: "שגיאה", description: "לא ניתן לקבוע את התור, נסה שוב", variant: "destructive" }),
      }
    );
  };

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    waitlistMutation.mutate(
      { businessSlug: businessSlug || "", data: { serviceId: selectedServiceId ?? undefined, clientName: waitlistData.name, phoneNumber: waitlistData.phone, preferredDate: dateStr || undefined, notes: waitlistData.notes || undefined } },
      {
        onSuccess: () => { toast({ title: "✅ נרשמת לרשימת ההמתנה", description: "נודיע לך כשיתפנה מקום" }); setShowWaitlist(false); },
        onError: () => toast({ title: "שגיאה", variant: "destructive" }),
      }
    );
  };

  const slots: string[] = availability?.slots ?? [];
  const isFullyBooked = availability?.isFullyBooked ?? false;

  // ─── STEP 0: Profile landing page ──────────────────────────────────────────
  if (step === 0) {
    const tabs = [
      { id: "services" as const, label: "שירותים" },
      { id: "hours" as const, label: "שעות עבודה" },
      { id: "gallery" as const, label: "גלריה" },
    ];

    return (
      <div dir="rtl" style={{ fontFamily: `'${fontFamily}', sans-serif`, backgroundColor }} className="min-h-screen overflow-x-hidden">

        {/* Notification Dialog */}
        <Dialog open={business.notificationEnabled && showNotification} onOpenChange={setShowNotification}>
          <DialogContent className="sm:max-w-md text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
              {business.notificationMessage}
            </DialogDescription>
            <Button onClick={() => setShowNotification(false)} style={{ backgroundColor: primaryColor }}>הבנתי, תודה</Button>
          </DialogContent>
        </Dialog>

        {/* Existing booking dialog */}
        <Dialog open={showExistingBooking} onOpenChange={setShowExistingBooking}>
          <DialogContent className="sm:max-w-sm text-center" dir="rtl">
            <DialogHeader>
              <DialogTitle>התור שלך</DialogTitle>
            </DialogHeader>
            {existingBooking && (
              <div className="space-y-3 py-2">
                <div className="p-4 rounded-xl bg-muted/30 text-right space-y-2">
                  {existingBooking.service && <div className="font-semibold">{existingBooking.service}</div>}
                  {existingBooking.date && <div className="text-sm text-muted-foreground flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> {existingBooking.date}</div>}
                  {existingBooking.time && <div className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /><span dir="ltr">{existingBooking.time}</span></div>}
                  {existingBooking.name && <div className="text-sm text-muted-foreground flex items-center gap-2"><User className="w-4 h-4" /> {existingBooking.name}</div>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem(`kavati_booking_${businessSlug}`);
                    setExistingBooking(null);
                    setShowExistingBooking(false);
                  }}
                >
                  בטל תור שמור
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Hero banner */}
        <div className="relative">
          {showBanner && bannerUrl ? (
            <img
              src={bannerUrl}
              alt={business.name}
              className="w-full object-cover"
              style={{ height: "224px", objectPosition: bannerPosition }}
            />
          ) : (
            <div
              className="w-full"
              style={{ height: "224px", background: `linear-gradient(135deg, ${primaryColor}20, ${primaryColor}40)` }}
            />
          )}
          {/* Logo overlapping bottom edge of banner */}
          {showLogo && logoUrl && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
              <img
                src={logoUrl}
                alt={business.name}
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl"
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className={`pb-28 px-4 max-w-2xl mx-auto ${showLogo && logoUrl ? "pt-14" : "pt-6"}`}>
          {/* Business name */}
          {showBusinessName && (
            <h1 className="text-2xl font-bold text-center mb-1">{business.name}</h1>
          )}
          {/* Description */}
          {businessDescription && (
            <p className="text-center text-muted-foreground text-sm mb-4 max-w-sm mx-auto">{businessDescription}</p>
          )}

          {/* Social links row */}
          {(phone || websiteUrl || instagramUrl || wazeUrl) && (
            <div className="flex justify-center gap-3 mb-6 flex-wrap">
              {phone && (
                <a href={`tel:${phone}`}>
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="התקשר"
                  >
                    <Phone className="w-5 h-5" />
                  </button>
                </a>
              )}
              {phone && (
                <a
                  href={`https://wa.me/972${phone.replace(/^0/, "").replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-green-600 border-green-200 hover:border-green-400 transition-all text-sm"
                    title="WhatsApp"
                  >
                    W
                  </button>
                </a>
              )}
              {instagramUrl && (
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="אינסטגרם"
                  >
                    <Instagram className="w-5 h-5" />
                  </button>
                </a>
              )}
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="אתר"
                  >
                    <Globe className="w-5 h-5" />
                  </button>
                </a>
              )}
              {wazeUrl && (
                <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
                  <button
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-all"
                    title="Waze"
                  >
                    <MapPin className="w-5 h-5" />
                  </button>
                </a>
              )}
            </div>
          )}

          {/* Existing appointment banner */}
          {existingBooking && (
            <div
              className="mb-4 p-3 rounded-xl border text-sm text-center"
              style={{ backgroundColor: primaryColor + "0d", borderColor: primaryColor + "33" }}
            >
              יש לכם תור!{" "}
              <button
                onClick={() => setShowExistingBooking(true)}
                className="font-bold underline"
                style={{ color: primaryColor }}
              >
                לחצו לצפייה
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b mb-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-current font-semibold"
                    : "border-transparent text-muted-foreground"
                }`}
                style={activeTab === tab.id ? { color: primaryColor, borderColor: primaryColor } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Services tab */}
          {activeTab === "services" && (
            <div className="space-y-3">
              {servicesLoading && <div className="text-center py-8 text-muted-foreground">טוען שירותים...</div>}
              {servicesList.filter(s => s.isActive).map(service => (
                <div key={service.id} className="border rounded-2xl overflow-hidden shadow-sm">
                  {service.imageUrl && (
                    <img src={service.imageUrl} alt={service.name} className="w-full h-32 object-cover" />
                  )}
                  <div className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="font-bold text-base">{service.name}</div>
                      <div className="font-bold" style={{ color: primaryColor }}>₪{(service.price / 100).toFixed(0)}</div>
                    </div>
                    {(service as any).description && (
                      <p className="text-sm text-muted-foreground mt-1">{(service as any).description}</p>
                    )}
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {formatDuration(service.durationMinutes)}
                      </span>
                      <button
                        onClick={() => { setSelectedServiceId(service.id); setStep(2); }}
                        className="px-4 py-1.5 rounded-full text-sm font-medium text-white shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        קבע תור
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!servicesLoading && !servicesList.filter(s => s.isActive).length && (
                <div className="text-center py-8 text-muted-foreground">אין שירותים זמינים כרגע</div>
              )}
            </div>
          )}

          {/* Hours tab */}
          {activeTab === "hours" && (
            <div className="space-y-0">
              {DAYS_HE.map((day, i) => {
                const h = workingHours.find(h => h.dayOfWeek === i);
                return (
                  <div key={i} className="flex justify-between items-center py-3 border-b last:border-0">
                    <span className="font-medium">{day}</span>
                    {h?.isEnabled ? (
                      <span className="text-sm text-muted-foreground" dir="ltr">{h.startTime} — {h.endTime}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">סגור</span>
                    )}
                  </div>
                );
              })}
              {workingHours.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">שעות העבודה לא הוגדרו עדיין</div>
              )}
            </div>
          )}

          {/* Gallery tab */}
          {activeTab === "gallery" && (
            galleryImages.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {galleryImages.map((url, i) => (
                  <img key={i} src={url} alt={`gallery-${i}`} className="w-full aspect-square object-cover rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">אין תמונות בגלריה עדיין</div>
            )
          )}
        </div>

        {/* Floating book button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 dark:bg-black/90 backdrop-blur border-t">
          <button
            onClick={() => setStep(1)}
            className="w-full h-12 rounded-2xl text-white font-bold text-base shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            לקביעת תור ←
          </button>
        </div>

        <footer className="text-center py-4 text-xs text-muted-foreground border-t">
          מופעל על ידי{" "}
          <a href="/" className="font-bold text-foreground hover:text-primary transition-colors">קבעתי</a>
        </footer>
      </div>
    );
  }

  // ─── STEPS 1-5: Booking wizard ──────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col relative" dir="rtl" style={{ fontFamily: `'${fontFamily}', sans-serif`, backgroundColor }}>
      <div className="absolute top-0 w-full h-52 -z-10 rounded-b-[40px]" style={{ backgroundColor: primaryColor + "18" }} />

      <Dialog open={business.notificationEnabled && showNotification} onOpenChange={setShowNotification}>
        <DialogContent className="sm:max-w-md text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl">הודעה מבית העסק</DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-base py-4 whitespace-pre-wrap text-foreground">
            {business.notificationMessage}
          </DialogDescription>
          <Button onClick={() => setShowNotification(false)} style={{ backgroundColor: primaryColor }}>הבנתי, תודה</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showWaitlist} onOpenChange={setShowWaitlist}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered className="w-5 h-5" style={{ color: primaryColor }} />
              הצטרף לרשימת ההמתנה
            </DialogTitle>
            <DialogDescription>
              נודיע לך כשיתפנה מקום{dateStr ? ` ב-${dateStr}` : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleWaitlist} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>שם מלא *</Label>
              <Input required value={waitlistData.name} onChange={e => setWaitlistData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>מספר טלפון *</Label>
              <Input required type="tel" value={waitlistData.phone} onChange={e => setWaitlistData(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>הערה (אופציונלי)</Label>
              <Input value={waitlistData.notes} onChange={e => setWaitlistData(p => ({ ...p, notes: e.target.value }))} placeholder="שעות מועדפות, הערות..." />
            </div>
            <Button type="submit" className="w-full" disabled={waitlistMutation.isPending} style={{ backgroundColor: primaryColor }}>
              {waitlistMutation.isPending ? "נרשם..." : "הצטרף לרשימת ההמתנה"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <header className="mb-8 text-center">
          {showLogo && logoUrl && (
            <img src={logoUrl} alt={business.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md border" />
          )}
          {showBanner && bannerUrl && (!showLogo || !logoUrl) && (
            <img src={bannerUrl} alt={business.name} className="w-full h-32 rounded-2xl object-cover mb-4 shadow-md" style={{ objectPosition: bannerPosition }} />
          )}
          {showBusinessName && (
            <h1 className="text-3xl font-extrabold mb-2" style={{ color: primaryColor }}>{business.name}</h1>
          )}
          <p className="text-muted-foreground">קביעת תור אונליין</p>
        </header>

        <Card className="shadow-lg overflow-hidden" style={{ borderRadius: cardRadius }}>
          <div className="px-6 py-4 flex gap-2 border-b" style={{ backgroundColor: primaryColor + "10" }}>
            {[1, 2, 3, 4].map(num => (
              <div key={num} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step < num ? "bg-muted text-muted-foreground" : ""}`}
                  style={
                    step === num ? { backgroundColor: primaryColor, color: "white" } :
                    step > num ? { backgroundColor: primaryColor + "30", color: primaryColor } :
                    {}
                  }>
                  {step > num ? <Check className="w-4 h-4" /> : num}
                </div>
                {num < 4 && <div className={`w-4 h-0.5 ${step <= num ? "bg-border" : ""}`} style={step > num ? { backgroundColor: primaryColor + "60" } : {}} />}
              </div>
            ))}
          </div>

          <CardContent className="p-6 min-h-[380px]">
            <AnimatePresence mode="wait" initial={false}>

              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר שירות</h2>
                  {servicesLoading ? <div className="text-center py-8 text-muted-foreground">טוען שירותים...</div> : (
                    <div className="grid gap-3">
                      {servicesList.filter(s => s.isActive).map(service => (
                        <div key={service.id}
                          onClick={() => { setSelectedServiceId(service.id); }}
                          className={`border-2 rounded-xl cursor-pointer transition-all overflow-hidden ${selectedServiceId === service.id ? "border-primary" : "border-transparent bg-muted/40 hover:bg-muted"}`}
                          style={{ borderColor: selectedServiceId === service.id ? primaryColor : undefined, backgroundColor: selectedServiceId === service.id ? primaryColor + "0d" : undefined }}>
                          {service.imageUrl && (
                            <div className="h-28 overflow-hidden">
                              <img src={service.imageUrl} alt={service.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex justify-between items-center">
                              <div className="font-semibold text-lg">{service.name}</div>
                              <div className="font-bold text-lg" style={{ color: primaryColor }}>₪{(service.price / 100).toFixed(0)}</div>
                            </div>
                            {(service as any).description && (
                              <p className="text-sm text-muted-foreground mt-1">{(service as any).description}</p>
                            )}
                            <div className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                              <Clock className="w-4 h-4" />{formatDuration(service.durationMinutes)}
                            </div>
                          </div>
                        </div>
                      ))}
                      {!servicesList.filter(s => s.isActive).length && (
                        <div className="text-center py-8 text-muted-foreground">אין שירותים זמינים כרגע</div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר תאריך</h2>
                  <div className="flex justify-center bg-muted/20 p-4 rounded-xl border" dir="ltr">
                    <DayPicker mode="single" selected={selectedDate}
                      onSelect={(date) => { if (date) { setSelectedDate(date); setSelectedTime(null); } }}
                      locale={he} weekStartsOn={0} disabled={{ before: new Date() }}
                      modifiersClassNames={{ selected: "font-bold rounded-full", today: "font-bold" }}
                      modifiersStyles={{ selected: { backgroundColor: primaryColor, color: "white" } }}
                    />
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">בחר שעה</h2>
                  <p className="text-muted-foreground">{selectedDate ? format(selectedDate, "EEEE, d בMMMM", { locale: he }) : ""}</p>
                  {availabilityLoading ? (
                    <div className="text-center py-12 text-muted-foreground">טוען שעות פנויות...</div>
                  ) : slots.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {slots.map((time, i) => (
                        <button key={i} onClick={() => { setSelectedTime(time); }}
                          className={`p-3 rounded-xl border-2 text-center font-medium transition-all ${selectedTime === time ? "" : "bg-muted/40 text-foreground hover:bg-muted"}`}
                          style={selectedTime === time ? {
                            borderColor: primaryColor,
                            backgroundColor: primaryColor + "20",
                            color: primaryColor,
                          } : { borderColor: "transparent" }}
                          dir="ltr">
                          {time}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/20 rounded-xl space-y-4">
                      <p className="text-lg font-medium">אין תורים פנויים ביום זה</p>
                      <p className="text-muted-foreground text-sm">רוצה שנודיע לך כשיתפנה מקום?</p>
                      <Button variant="outline" onClick={() => setShowWaitlist(true)} className="gap-2">
                        <ListOrdered className="w-4 h-4" /> הצטרף לרשימת ההמתנה
                      </Button>
                      <Button variant="link" onClick={handleBack}>חזור לבחירת תאריך</Button>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <h2 className="text-xl font-bold">פרטים אישיים</h2>
                  <div className="p-4 rounded-xl border mb-2 space-y-2" style={{ borderColor: primaryColor + "30", backgroundColor: primaryColor + "08" }}>
                    <div className="flex items-center gap-2 font-medium">
                      <Check className="w-4 h-4" style={{ color: primaryColor }} /> {selectedService?.name}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <CalendarIcon className="w-4 h-4" />
                      {selectedDate ? format(selectedDate, "d בMMMM yyyy", { locale: he }) : ""} • <span dir="ltr">{selectedTime}</span>
                    </div>
                  </div>
                  <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label>שם מלא *</Label>
                      <Input required value={clientData.name} onChange={e => setClientData(p => ({ ...p, name: e.target.value }))} className="h-12 text-base" />
                    </div>
                    <div className="space-y-2">
                      <Label>מספר טלפון *</Label>
                      <div className="flex gap-2">
                        <Input
                          required
                          type="tel"
                          value={clientData.phone}
                          onChange={e => { setClientData(p => ({ ...p, phone: e.target.value })); setOtpSent(false); setPhoneVerified(false); setOtpCode(""); }}
                          className="h-12 text-base flex-1"
                          dir="ltr"
                          disabled={phoneVerified}
                        />
                        {!phoneVerified && (
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpLoading || !clientData.phone}
                            className="h-12 px-4 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {otpLoading && !otpSent ? "שולח..." : otpSent ? "שלח שוב" : "שלח קוד"}
                          </button>
                        )}
                        {phoneVerified && (
                          <div className="h-12 px-4 flex items-center gap-1 text-green-600 font-medium text-sm">
                            ✓ מאומת
                          </div>
                        )}
                      </div>
                    </div>

                    {otpSent && !phoneVerified && (
                      <div className="space-y-2">
                        <Label>קוד אימות SMS *</Label>
                        <div className="flex gap-2">
                          <Input
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value)}
                            className="h-12 text-base text-center tracking-widest font-bold flex-1"
                            dir="ltr"
                            placeholder="123456"
                            maxLength={6}
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={otpLoading || otpCode.length < 6}
                            className="h-12 px-4 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                            style={{ backgroundColor: primaryColor }}
                          >
                            {otpLoading ? "מאמת..." : "אמת"}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">שלחנו קוד בן 6 ספרות למספר שהזנת</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>הערה (אופציונלי)</Label>
                      <Input value={clientData.notes} onChange={e => setClientData(p => ({ ...p, notes: e.target.value }))} placeholder="בקשות מיוחדות..." />
                    </div>
                  </form>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="s5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-6">
                  <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: primaryColor + "20" }}>
                    <CheckCircle2 className="w-12 h-12" style={{ color: primaryColor }} />
                  </div>
                  {requireApproval ? (
                    <>
                      <h2 className="text-3xl font-extrabold">הבקשה נשלחה!</h2>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium" style={{ backgroundColor: "#fef9c3", color: "#92400e" }}>
                        ⏳ ממתין לאישור בעל העסק
                      </div>
                      <p className="text-muted-foreground max-w-xs mx-auto">
                        בקשת התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> התקבלה ותאושר בקרוב.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-3xl font-extrabold">התור נקבע!</h2>
                      <p className="text-muted-foreground max-w-xs mx-auto">
                        התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> נקבע בהצלחה!
                      </p>
                    </>
                  )}
                  <div className="bg-muted/20 border p-6 rounded-2xl max-w-sm mx-auto text-right space-y-3">
                    <div className="flex items-center gap-3">
                      <CalendarIcon className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium">{selectedDate ? format(selectedDate, "EEEE, d בMMMM yyyy", { locale: he }) : ""}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium" dir="ltr">{selectedTime}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium">{clientData.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5" style={{ color: primaryColor }} />
                      <span className="font-medium" dir="ltr">{clientData.phone}</span>
                    </div>
                  </div>
                  {!requireApproval && selectedDate && selectedTime && selectedService && (
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const [h, m] = selectedTime.split(":").map(Number);
                          const start = new Date(selectedDate);
                          start.setHours(h, m, 0, 0);
                          const end = new Date(start.getTime() + selectedService.durationMinutes * 60000);
                          const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                          const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`תור — ${selectedService.name} אצל ${business.name}`)}&dates=${fmt(start)}/${fmt(end)}`;
                          window.open(url, "_blank");
                        }}
                      >
                        <CalendarIcon className="w-4 h-4" /> הוסף ל-Google Calendar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                          const [h, m] = selectedTime.split(":").map(Number);
                          const start = new Date(selectedDate);
                          start.setHours(h, m, 0, 0);
                          const end = new Date(start.getTime() + selectedService.durationMinutes * 60000);
                          const fmt = (d: Date) => d.toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
                          const ics = [
                            "BEGIN:VCALENDAR", "VERSION:2.0",
                            "BEGIN:VEVENT",
                            `DTSTART:${fmt(start)}`,
                            `DTEND:${fmt(end)}`,
                            `SUMMARY:תור — ${selectedService.name} אצל ${business.name}`,
                            "END:VEVENT", "END:VCALENDAR",
                          ].join("\r\n");
                          const blob = new Blob([ics], { type: "text/calendar" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = "appointment.ics";
                          a.click();
                        }}
                      >
                        <CalendarIcon className="w-4 h-4" /> הוסף ל-Apple / Outlook
                      </Button>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => { setStep(0); }}>חזור לעמוד הפרופיל</Button>
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>

          {step < 5 && (
            <CardFooter className="border-t p-6 flex justify-between bg-muted/10">
              {step > 1 ? (
                <Button variant="outline" onClick={handleBack} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> חזור
                </Button>
              ) : step === 1 ? (
                <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
                  <ChevronRight className="w-4 h-4" /> פרופיל
                </Button>
              ) : <div />}
              {step === 4 ? (
                <Button form="booking-form" type="submit" size="lg" disabled={createMutation.isPending} style={{ backgroundColor: primaryColor }}>
                  {createMutation.isPending ? "קובע תור..." : "אשר תור"}
                </Button>
              ) : step === 3 && selectedTime ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : step === 2 && selectedDate ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : step === 1 && selectedServiceId ? (
                <Button onClick={handleNext} size="lg" style={{ backgroundColor: primaryColor }}>המשך</Button>
              ) : <div />}
            </CardFooter>
          )}
        </Card>
      </div>

      <footer className="text-center py-4 text-xs text-muted-foreground border-t">
        מופעל על ידי{" "}
        <a href="/" className="font-bold text-foreground hover:text-primary transition-colors">קבעתי</a>
      </footer>
    </div>
  );
}
