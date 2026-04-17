import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

export function NewAppointmentDialog({
  open,
  onOpenChange,
  services,
  customers,
  initialDate,
  initialTime,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  services: ServiceLite[];
  customers: CustomerLite[];
  initialDate?: string; // "YYYY-MM-DD"
  initialTime?: string; // "HH:mm"
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog opens with (possibly new) defaults.
  useEffect(() => {
    if (!open) return;
    setPhone("");
    setName("");
    setServiceId(services[0]?.id ?? null);
    setDate(initialDate ?? new Date().toISOString().slice(0, 10));
    setTime(initialTime ?? "");
    setNotes("");
  }, [open, initialDate, initialTime, services]);

  // Customer suggestions — matches phone OR name, capped at 6.
  const suggestions = useMemo(() => {
    const q = phone.trim() || name.trim();
    if (!q) return [] as CustomerLite[];
    const qLow = q.toLowerCase();
    return customers
      .filter(c => c.phoneNumber.includes(q) || c.clientName.toLowerCase().includes(qLow))
      .slice(0, 6);
  }, [phone, name, customers]);

  const pickSuggestion = (c: CustomerLite) => {
    setPhone(c.phoneNumber);
    setName(c.clientName);
  };

  const submit = async (e: React.FormEvent) => {
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
          serviceId, clientName: name.trim(), phoneNumber: phone.trim(),
          appointmentDate: date, appointmentTime: time,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "שגיאה בקביעת התור", description: err.message ?? "נסה שוב", variant: "destructive" });
        return;
      }
      toast({ title: "התור נקבע" });
      onCreated();
      onOpenChange(false);
    } catch {
      toast({ title: "שגיאת רשת", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>תור חדש</DialogTitle>
          <DialogDescription>קביעת תור ידנית ללקוח — מילוי פרטים ושמירה</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>מספר טלפון</Label>
            <Input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder=""
            />
            <p className="text-[11px] text-muted-foreground">אם הלקוח כבר קיים — השם יתמלא אוטומטית כשתבחרי אותו מהרשימה</p>
          </div>

          {/* Customer suggestions dropdown — shown when user types
              anything in phone/name and there's a match. */}
          {suggestions.length > 0 && (
            <div className="border rounded-xl overflow-hidden bg-muted/20 divide-y">
              {suggestions.map(c => (
                <button
                  key={c.phoneNumber}
                  type="button"
                  onClick={() => pickSuggestion(c)}
                  className="w-full text-right px-3 py-2 hover:bg-muted/60 transition-colors"
                >
                  <div className="font-semibold text-sm">{c.clientName}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">{c.phoneNumber}</div>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>שם לקוח *</Label>
            <Input required value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>שירות *</Label>
            <select
              required
              value={serviceId ?? ""}
              onChange={e => setServiceId(Number(e.target.value) || null)}
              className="w-full px-3 py-2 border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>בחרי שירות</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatDuration(s.durationMinutes)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>תאריך *</Label>
              <Input required type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>שעה *</Label>
              <Input required type="time" step={300} value={time} onChange={e => setTime(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>הערה (אופציונלי)</Label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value.slice(0, 500))}
              rows={2}
              className="w-full px-3 py-2 border rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="הערה פנימית — מוצגת לבעל העסק בלבד"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              ביטול
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "קובעת..." : "קבעי תור"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
