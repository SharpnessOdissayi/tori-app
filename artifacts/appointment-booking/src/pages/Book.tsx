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
import { Check, ChevronRight, Clock, CalendarIcon, User, Phone, CheckCircle2, ListOrdered } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "react-day-picker/dist/style.css";
import { useToast } from "@/hooks/use-toast";

export default function Book() {
  const { businessSlug } = useParams<{ businessSlug: string }>();
  const [step, setStep] = useState(1);
  const [showNotification, setShowNotification] = useState(true);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientData, setClientData] = useState({ name: "", phone: "", notes: "" });
  const [waitlistData, setWaitlistData] = useState({ name: "", phone: "", notes: "" });

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

  useEffect(() => {
    if (!business) return;
    const root = document.documentElement;
    if (business.primaryColor) {
      const hex = business.primaryColor.replace("#", "");
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      root.style.setProperty("--primary-r", String(r));
      root.style.setProperty("--primary-g", String(g));
      root.style.setProperty("--primary-b", String(b));
    }
    // Load Google Font dynamically
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
  }, [business, fontFamily]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || !dateStr || !selectedTime) return;
    createMutation.mutate({ businessSlug: businessSlug || "", data: { serviceId: selectedServiceId, clientName: clientData.name, phoneNumber: clientData.phone, appointmentDate: dateStr, appointmentTime: selectedTime, notes: clientData.notes } }, {
      onSuccess: () => setStep(5),
      onError: () => toast({ title: "שגיאה", description: "לא ניתן לקבוע את התור, נסה שוב", variant: "destructive" }),
    });
  };

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    waitlistMutation.mutate({ businessSlug: businessSlug || "", data: { serviceId: selectedServiceId ?? undefined, clientName: waitlistData.name, phoneNumber: waitlistData.phone, preferredDate: dateStr || undefined, notes: waitlistData.notes || undefined } }, {
      onSuccess: () => { toast({ title: "✅ נרשמת לרשימת ההמתנה", description: "נודיע לך כשיתפנה מקום" }); setShowWaitlist(false); },
      onError: () => toast({ title: "שגיאה", variant: "destructive" }),
    });
  };

  const slots: string[] = availability?.slots ?? [];
  const isFullyBooked = availability?.isFullyBooked ?? false;

  return (
    <div className="min-h-[100dvh] bg-muted/20 flex flex-col relative" dir="rtl" style={{ fontFamily: `'${fontFamily}', sans-serif` }}>
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
          {business.logoUrl && (
            <img src={business.logoUrl} alt={business.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-md border" />
          )}
          {business.bannerUrl && !business.logoUrl && (
            <img src={business.bannerUrl} alt={business.name} className="w-full h-32 rounded-2xl object-cover mb-4 shadow-md" />
          )}
          <h1 className="text-3xl font-extrabold mb-2" style={{ color: primaryColor }}>{business.name}</h1>
          <p className="text-muted-foreground">קביעת תור אונליין</p>
        </header>

        <Card className="shadow-lg overflow-hidden">
          <div className="px-6 py-4 flex gap-2 border-b" style={{ backgroundColor: primaryColor + "10" }}>
            {[1, 2, 3, 4].map(num => (
              <div key={num} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all"
                  style={{
                    backgroundColor: step === num ? primaryColor : step > num ? primaryColor + "30" : "#f1f5f9",
                    color: step === num ? "white" : step > num ? primaryColor : "#94a3b8",
                  }}>
                  {step > num ? <Check className="w-4 h-4" /> : num}
                </div>
                {num < 4 && <div className="w-4 h-0.5" style={{ backgroundColor: step > num ? primaryColor + "60" : "#e2e8f0" }} />}
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
                          onClick={() => { setSelectedServiceId(service.id); setTimeout(handleNext, 150); }}
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
                            <div className="text-muted-foreground text-sm flex items-center gap-1 mt-1">
                              <Clock className="w-4 h-4" />{service.durationMinutes} דקות
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
                  <div className="flex justify-center bg-muted/20 p-4 rounded-xl border">
                    <DayPicker mode="single" selected={selectedDate}
                      onSelect={(date) => { if (date) { setSelectedDate(date); setSelectedTime(null); setTimeout(handleNext, 150); } }}
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
                        <button key={i} onClick={() => { setSelectedTime(time); setTimeout(handleNext, 150); }}
                          className="p-3 rounded-xl border-2 text-center font-medium transition-all"
                          style={{
                            borderColor: selectedTime === time ? primaryColor : "transparent",
                            backgroundColor: selectedTime === time ? primaryColor + "15" : "#f8fafc",
                            color: selectedTime === time ? primaryColor : "inherit",
                          }} dir="ltr">
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
                      <Input required value={clientData.name} onChange={e => setClientData(p => ({ ...p, name: e.target.value }))} className="h-12 text-base" placeholder="ישראל ישראלי" />
                    </div>
                    <div className="space-y-2">
                      <Label>מספר טלפון *</Label>
                      <Input required type="tel" value={clientData.phone} onChange={e => setClientData(p => ({ ...p, phone: e.target.value }))} className="h-12 text-base" dir="ltr" placeholder="050-0000000" />
                    </div>
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
                  <h2 className="text-3xl font-extrabold">התור נקבע!</h2>
                  <p className="text-muted-foreground max-w-xs mx-auto">
                    התור שלך ל<strong className="text-foreground">{selectedService?.name}</strong> אצל <strong className="text-foreground">{business.name}</strong> נקבע בהצלחה!
                  </p>
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
                  <Button variant="outline" onClick={() => window.location.reload()}>קבע תור נוסף</Button>
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
        מופעל על ידי <strong>תורי</strong>
      </footer>
    </div>
  );
}
