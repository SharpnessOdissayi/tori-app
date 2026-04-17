import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarIcon, Ban, Plane, User, Coffee, HelpCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hourPart = h === 0 ? "" : h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  const minPart = m === 0 ? "" : m === 1 ? "דקה" : `${m} דקות`;
  if (!hourPart) return minPart || "0 דקות";
  if (!minPart) return hourPart;
  return `${hourPart} ו-${minPart}`;
}

type ServiceLite = { id: number; name: string; durationMinutes: number };
type CustomerLite = { clientName: string; phoneNumber: string };

// Two-tab calendar entry dialog — the owner's single entry point for
// anything new on the calendar: a real appointment OR a constraint
// (time-off / personal block / break). One shared Date/Time header avoids
// teaching the owner two different forms.
export type CalendarEntryTab = "appointment" | "timeoff";

const TIME_OFF_TYPES: Array<{
  value: string;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: "vacation", label: "חופשה", icon: <Plane className="w-4 h-4" /> },
  { value: "personal", label: "אישי", icon: <User className="w-4 h-4" /> },
  { value: "break", label: "הפסקה", icon: <Coffee className="w-4 h-4" /> },
  { value: "other", label: "אחר", icon: <HelpCircle className="w-4 h-4" /> },
];

// ── Date / time pickers ────────────────────────────────────────────────────
// Owner asked to drop all the device-default date/time dialogs — the iOS
// wheel, the Chrome-Android popover etc — and replace them with pickers
// that match the rest of the app's visual language. Date uses the shadcn
// Calendar inside a Popover (same glass/shadow style as other popovers);
// time uses two Selects (hours 00–23, minutes at 5-min granularity) so
// the touch targets are big and the dropdown style matches the service
// dropdown right above it.

function DatePickerField({
  value,
  onChange,
  className,
  red,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  red?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Parse a YYYY-MM-DD string without the timezone-shift trap — new Date("2026-04-17")
  // parses as midnight UTC, which in IST becomes the *previous* day's afternoon.
  const parsed = useMemo(() => {
    if (!value) return undefined;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-start text-right font-normal ${className ?? ""} ${red ? "focus:ring-red-500 focus:border-red-500" : ""}`}
          style={{ fontFamily: "'Rubik', sans-serif" }}
        >
          <CalendarIcon className="w-4 h-4 ml-2 opacity-70" />
          {parsed ? format(parsed, "EEEE, d בMMMM yyyy", { locale: he }) : "בחר תאריך"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsed}
          onSelect={(d) => {
            if (!d) return;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            onChange(`${y}-${m}-${day}`);
            setOpen(false);
          }}
          locale={he}
          dir="rtl"
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function TimePickerField({
  value,
  onChange,
  red,
}: {
  value: string;
  onChange: (v: string) => void;
  red?: boolean;
}) {
  const [h, m] = value ? value.split(":") : ["", ""];
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);
  // 5-minute granularity — owner can still hit 9:00, 9:05, 9:10 etc.
  // Covers 99% of salon bookings; keeping the list short so the
  // dropdown doesn't become a mile-long scroll.
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")), []);

  const onHourChange = (nh: string) => onChange(`${nh}:${m || "00"}`);
  const onMinuteChange = (nm: string) => onChange(`${h || "09"}:${nm}`);

  return (
    <div className="flex items-center gap-2" dir="ltr">
      <Select value={h} onValueChange={onHourChange}>
        <SelectTrigger className="w-20 text-center justify-center">
          <SelectValue placeholder="שעה" />
        </SelectTrigger>
        <SelectContent>
          {hours.map((hh) => (
            <SelectItem key={hh} value={hh}>{hh}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className={`text-lg font-bold ${red ? "text-red-500" : "text-muted-foreground"}`}>:</span>
      <Select value={m} onValueChange={onMinuteChange}>
        <SelectTrigger className="w-20 text-center justify-center">
          <SelectValue placeholder="דקה" />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((mm) => (
            <SelectItem key={mm} value={mm}>{mm}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Clock className={`w-4 h-4 ${red ? "text-red-500" : "text-muted-foreground"} mr-auto`} />
    </div>
  );
}

export function NewAppointmentDialog({
  open,
  onOpenChange,
  services,
  customers,
  initialDate,
  initialTime,
  initialTab,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: ServiceLite[];
  customers: CustomerLite[];
  initialDate?: string; // "YYYY-MM-DD"
  initialTime?: string; // "HH:mm"
  initialTab?: CalendarEntryTab;
  onCreated: (tab?: CalendarEntryTab) => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<CalendarEntryTab>(initialTab ?? "appointment");

  // Appointment-tab state
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");

  // Time-off tab state
  const [toName, setToName] = useState("");
  const [toType, setToType] = useState<string>("other");
  const [toDate, setToDate] = useState("");
  const [toFullDay, setToFullDay] = useState(false);
  const [toStartTime, setToStartTime] = useState("");
  const [toEndTime, setToEndTime] = useState("");
  const [toNotes, setToNotes] = useState("");

  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens with (possibly new) defaults.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? "appointment");
    const today = new Date().toISOString().slice(0, 10);

    setPhone("");
    setName("");
    setServiceId(services[0]?.id ?? null);
    setDate(initialDate ?? today);
    setTime(initialTime ?? "");
    setNotes("");

    setToName("");
    setToType("other");
    setToDate(initialDate ?? today);
    setToFullDay(false);
    setToStartTime(initialTime ?? "");
    setToEndTime(initialTime ? addHourClamp(initialTime) : "");
    setToNotes("");
  }, [open, initialDate, initialTime, initialTab, services]);

  // Customer suggestions — name-first (owners know clients by name).
  const suggestions = useMemo(() => {
    const q = name.trim() || phone.trim();
    if (!q) return [] as CustomerLite[];
    const qLow = q.toLowerCase();
    return customers
      .filter((c) => c.clientName.toLowerCase().includes(qLow) || c.phoneNumber.includes(q))
      .slice(0, 6);
  }, [name, phone, customers]);

  const pickSuggestion = (c: CustomerLite) => {
    setPhone(c.phoneNumber);
    setName(c.clientName);
  };

  // Auto-fill phone from an exact name match (case-insensitive). Won't
  // overwrite manual phone input.
  useEffect(() => {
    const typed = name.trim().toLowerCase();
    if (!typed || phone.trim().length > 0) return;
    const exact = customers.find((c) => c.clientName.toLowerCase() === typed);
    if (exact) setPhone(exact.phoneNumber);
  }, [name, customers, phone]);

  const submitAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId || !name.trim() || !date || !time) {
      toast({ title: "שדות חסרים", description: "שם לקוח, שירות, תאריך ושעה חובה", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      const res = await fetch("/api/business/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serviceId,
          clientName: name.trim(),
          phoneNumber: phone.trim(),
          appointmentDate: date,
          appointmentTime: time,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "שגיאה בקביעת התור", description: err.message ?? "נסה שוב", variant: "destructive" });
        return;
      }
      toast({ title: "התור נקבע" });
      onCreated("appointment");
      onOpenChange(false);
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toName.trim() || !toDate) {
      toast({ title: "שדות חסרים", description: "שם האילוץ ותאריך חובה", variant: "destructive" });
      return;
    }
    if (!toFullDay && (!toStartTime || !toEndTime)) {
      toast({ title: "שעות חסרות", description: "אם לא חסום כל היום, צריך שעת התחלה וסיום", variant: "destructive" });
      return;
    }
    if (!toFullDay && toStartTime >= toEndTime) {
      toast({ title: "שעות לא תקינות", description: "שעת הסיום חייבת להיות אחרי שעת ההתחלה", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("biz_token") || sessionStorage.getItem("biz_token");
      // `note` on the DB row is used as the display name for the constraint.
      // The optional free-text notes from the owner are appended after
      // a separator so both survive without a schema migration.
      const notePayload = [toName.trim(), toNotes.trim() ? `(${toNotes.trim()})` : "", toType !== "other" ? `[${toType}]` : ""]
        .filter(Boolean)
        .join(" ");
      const res = await fetch("/api/business/time-off", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          date: toDate,
          fullDay: toFullDay,
          startTime: toFullDay ? null : toStartTime,
          endTime: toFullDay ? null : toEndTime,
          note: notePayload || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "שגיאה בשמירת האילוץ", description: err.message ?? "נסה שוב", variant: "destructive" });
        return;
      }
      toast({ title: "האילוץ נוסף ליומן" });
      onCreated("timeoff");
      onOpenChange(false);
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        style={{ fontFamily: "'Rubik', sans-serif" }}
      >
        <DialogHeader>
          <DialogTitle>הוספה ליומן</DialogTitle>
          <DialogDescription>
            {tab === "appointment" ? "קביעת תור ידנית ללקוח" : "חסימת זמן ביומן — חופשה, הפסקה או כל אילוץ אחר"}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs — toggle between the two flows. Keeps one dialog, one
            mental model. The constraint tab is red so it reads as a
            destructive/block action at a glance. */}
        <div className="grid grid-cols-2 gap-0 border border-border rounded-2xl p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => setTab("appointment")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "appointment" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            קביעת תור
          </button>
          <button
            type="button"
            onClick={() => setTab("timeoff")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === "timeoff" ? "text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === "timeoff" ? { background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" } : undefined}
          >
            <Ban className="w-4 h-4" />
            אילוץ
          </button>
        </div>

        {tab === "appointment" ? (
          <form onSubmit={submitAppointment} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>שם לקוח *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">אם הלקוח כבר קיים — הטלפון יתמלא אוטומטית</p>
            </div>

            {suggestions.length > 0 && (
              <div className="border rounded-xl overflow-hidden bg-muted/20 divide-y">
                {suggestions.map((c) => (
                  <button
                    key={c.phoneNumber}
                    type="button"
                    onClick={() => pickSuggestion(c)}
                    className="w-full text-right px-3 py-2 hover:bg-muted/60 transition-colors"
                  >
                    <div className="font-semibold text-sm">{c.clientName}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {c.phoneNumber}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>מספר טלפון</Label>
              <Input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="" />
            </div>

            <div className="space-y-2">
              <Label>שירות *</Label>
              <Select
                value={serviceId ? String(serviceId) : ""}
                onValueChange={(v) => setServiceId(Number(v) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר שירות" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} · {formatDuration(s.durationMinutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>תאריך *</Label>
                <DatePickerField value={date} onChange={setDate} />
              </div>
              <div className="space-y-2">
                <Label>שעה *</Label>
                <TimePickerField value={time} onChange={setTime} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>הערה (אופציונלי)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                rows={2}
                className="w-full px-3 py-2 border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                placeholder="הערה פנימית — מוצגת לבעל העסק בלבד"
                style={{ fontFamily: "'Rubik', sans-serif" }}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
                ביטול
              </Button>
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? "קובע..." : "קבע תור"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitTimeOff} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>שם האילוץ *</Label>
              <Input
                required
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="למשל: חופשה, תספורת אישית, פגישה"
              />
            </div>

            <div className="space-y-2">
              <Label>סוג (אופציונלי)</Label>
              <Select value={toType} onValueChange={setToType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OFF_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="inline-flex items-center gap-2">
                        {t.icon}
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>תאריך *</Label>
              <DatePickerField value={toDate} onChange={setToDate} red />
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={toFullDay}
                onCheckedChange={(v) => setToFullDay(v === true)}
                className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
              />
              <span className="text-sm font-semibold">חסימת כל היום</span>
            </label>

            {!toFullDay && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>שעת התחלה *</Label>
                  <TimePickerField value={toStartTime} onChange={setToStartTime} red />
                </div>
                <div className="space-y-2">
                  <Label>שעת סיום *</Label>
                  <TimePickerField value={toEndTime} onChange={setToEndTime} red />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>הערות (אופציונלי)</Label>
              <textarea
                value={toNotes}
                onChange={(e) => setToNotes(e.target.value.slice(0, 300))}
                rows={2}
                className="w-full px-3 py-2 border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                placeholder="פרטים נוספים לעצמך — לא יוצגו ללקוחות"
                style={{ fontFamily: "'Rubik', sans-serif" }}
              />
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 px-3 py-2 leading-relaxed">
              ℹ️ לקוחות לא יוכלו לקבוע תור בזמן החסום. אם יש תורים קיימים באותו טווח, הם יישארו — רק הזמינות העתידית מושפעת.
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
                ביטול
              </Button>
              <Button
                type="submit"
                className="flex-1 text-white"
                disabled={saving}
                style={{ background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" }}
              >
                {saving ? "שומר..." : "שמור אילוץ"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Pads a bookable time ("14:30") by +1h, clamping to 23:59 to avoid
// overflow into the next day. Used as a sensible default end time when
// the owner clicks a slot and opens the time-off tab.
function addHourClamp(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  let nh = (h ?? 0) + 1;
  let nm = m ?? 0;
  if (nh > 23) {
    nh = 23;
    nm = 59;
  }
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}
