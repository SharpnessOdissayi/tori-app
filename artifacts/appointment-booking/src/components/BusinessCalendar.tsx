import { useEffect, useMemo, useRef, useState } from "react";
import {
  format, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth,
} from "date-fns";
import { he } from "date-fns/locale";
import { HebrewCalendar } from "@hebcal/core";
import { ChevronRight, ChevronLeft, RefreshCw, Search, MoreHorizontal } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
export type CalAppt = {
  id: number;
  appointmentDate: string;   // YYYY-MM-DD
  appointmentTime: string;   // HH:mm
  durationMinutes: number;
  clientName: string;
  phoneNumber: string;
  serviceName: string;
  status: string;
  notes?: string | null;
};

type View = "day" | "week" | "month";

// ─── Utilities ──────────────────────────────────────────────────────────────
const DAY_START_MINUTES = 8 * 60;   // Week/Day grid starts at 08:00
const DAY_END_MINUTES   = 22 * 60;  // … ends at 22:00
const SLOT_MINUTES      = 30;       // 30-min snap grid (matches owner flow)
const SLOT_PX           = 32;       // 32px per 30-min slot → hour = 64px
const SLOTS_PER_HOUR    = 60 / SLOT_MINUTES;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToTime(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = Math.max(0, total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function ymd(d: Date): string { return format(d, "yyyy-MM-dd"); }
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Convert a slot index (row) to minutes-from-midnight.
function slotIndexToMinutes(i: number): number { return DAY_START_MINUTES + i * SLOT_MINUTES; }

// Status → visual tier. Dark card = upcoming/confirmed, light = pending/other.
function statusTone(status: string): "confirmed" | "pending" | "past" | "cancelled" {
  if (status === "cancelled") return "cancelled";
  if (status === "no_show") return "cancelled";
  if (status === "pending" || status === "pending_payment") return "pending";
  return "confirmed";
}

// ─── Holidays (month view highlighting + all-day labels) ────────────────────
// Owner preference: skip Rosh Chodesh (noisy, not culturally a "holiday").
function useHolidaysInRange(start: Date, end: Date): Map<string, string[]> {
  const key = `${ymd(start)}..${ymd(end)}`;
  const [cache] = useState(() => new Map<string, Map<string, string[]>>());
  if (!cache.has(key)) {
    const events = HebrewCalendar.calendar({
      start, end,
      il: true,
      locale: "he",
      sedrot: false,
      omer: false,
      candlelighting: false,
    } as any);
    const m = new Map<string, string[]>();
    for (const ev of events) {
      const name = ev.render("he");
      if (name.startsWith("ראש חודש")) continue;
      // Also skip pure-fast "סדר עומר" type noise if any leaks through.
      const d = ev.getDate().greg();
      const k = ymd(d);
      const arr = m.get(k) ?? [];
      arr.push(name);
      m.set(k, arr);
    }
    cache.set(key, m);
  }
  return cache.get(key)!;
}

// ─── Header ─────────────────────────────────────────────────────────────────
function CalHeader({
  view, setView, cursor, setCursor, label,
}: {
  view: View;
  setView: (v: View) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
  label: string;
}) {
  const stepBack = () => {
    if (view === "day") setCursor(addDays(cursor, -1));
    else if (view === "week") setCursor(addDays(cursor, -7));
    else setCursor(addMonths(cursor, -1));
  };
  const stepForward = () => {
    if (view === "day") setCursor(addDays(cursor, 1));
    else if (view === "week") setCursor(addDays(cursor, 7));
    else setCursor(addMonths(cursor, 1));
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-2 bg-background" dir="rtl">
      {/* View toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full border border-border bg-card p-0.5">
          {(["חודש","שבוע","יום"] as const).map((label, i) => {
            const v: View = i === 0 ? "month" : i === 1 ? "week" : "day";
            const active = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-header: navigation + label + "היום" */}
      <div className="flex items-center justify-between gap-2">
        <button className="p-2 rounded-lg hover:bg-muted/60" aria-label="עוד"><MoreHorizontal className="w-4 h-4" /></button>
        <button onClick={() => setCursor(new Date())} className="p-2 rounded-lg hover:bg-muted/60" aria-label="רענן"><RefreshCw className="w-4 h-4" /></button>
        <button onClick={stepBack} className="p-2 rounded-lg hover:bg-muted/60" aria-label="הקודם"><ChevronRight className="w-4 h-4" /></button>

        <div className="flex-1 text-center font-bold text-base underline decoration-dotted underline-offset-4">{label}</div>

        <button onClick={stepForward} className="p-2 rounded-lg hover:bg-muted/60" aria-label="הבא"><ChevronLeft className="w-4 h-4" /></button>
        <button className="p-2 rounded-lg hover:bg-muted/60" aria-label="חיפוש"><Search className="w-4 h-4" /></button>
        <button onClick={() => setCursor(new Date())}
          className="px-3 py-1.5 rounded-lg border border-primary/60 text-primary text-sm font-semibold hover:bg-primary/5">
          היום
        </button>
      </div>
    </div>
  );
}

// ─── MONTH VIEW ─────────────────────────────────────────────────────────────
function MonthView({
  cursor, appts, onPickDay,
}: {
  cursor: Date;
  appts: CalAppt[];
  onPickDay: (d: Date) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthEnd   = endOfMonth(cursor);
  // Build a 6-week grid starting on Sunday (Israeli week).
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const holidays = useHolidaysInRange(gridStart, addDays(gridStart, 41));

  // Bucket appointments by date once.
  const byDate = useMemo(() => {
    const m = new Map<string, CalAppt[]>();
    for (const a of appts) {
      if (a.status === "cancelled") continue;
      const arr = m.get(a.appointmentDate) ?? [];
      arr.push(a);
      m.set(a.appointmentDate, arr);
    }
    return m;
  }, [appts]);

  const today = new Date();

  return (
    <div dir="rtl" className="bg-background">
      {/* Weekday header row (Sun–Sat, RTL = Sun on the right). */}
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground border-y border-border">
        {["יום א'","יום ב'","יום ג'","יום ד'","יום ה'","יום ו'","שבת"].map(d => (
          <div key={d} className="py-1.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const k = ymd(d);
          const inMonth = isSameMonth(d, cursor);
          const isToday = isSameDay(d, today);
          const list = byDate.get(k) ?? [];
          const holidayNames = holidays.get(k) ?? [];
          const hasHoliday = holidayNames.length > 0;
          return (
            <button
              key={i}
              onClick={() => onPickDay(d)}
              className={`relative h-20 border-b border-l border-border text-right p-1 transition-colors ${inMonth ? "bg-white" : "bg-muted/40"} ${isToday ? "" : ""} hover:bg-primary/5`}
            >
              <div className="flex items-start justify-between gap-1">
                <div className={`text-xs font-semibold ${inMonth ? "text-foreground" : "text-muted-foreground"}`}>{format(d, "d")}</div>
                {isToday && <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center -m-0.5">{format(d,"d")}</span>}
              </div>
              {/* Holiday pill (max 1 line, truncate) */}
              {hasHoliday && (
                <div className="mt-0.5 text-[10px] font-semibold px-1 py-px rounded bg-primary/15 text-primary truncate" title={holidayNames.join(" • ")}>
                  {holidayNames[0]}
                </div>
              )}
              {/* Appointment dots — max 4 visible, rest show as "+N". */}
              {list.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {list.slice(0, 4).map(a => (
                    <span key={a.id} className={`w-1.5 h-1.5 rounded-full ${
                      statusTone(a.status) === "pending" ? "bg-amber-400"
                      : statusTone(a.status) === "cancelled" ? "bg-gray-300"
                      : "bg-rose-500"
                    }`} />
                  ))}
                  {list.length > 4 && <span className="text-[9px] text-muted-foreground">+{list.length - 4}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── TIME GRID shared by Week + Day views ───────────────────────────────────
//
// Layout (RTL, from right to left across the screen):
//   [day columns …]   [time column (hours)]
// Each day column has "כל היום" above it for all-day holidays, then the
// hourly grid below. Appointments render as absolutely-positioned cards
// inside their day column, offset from the top by their start time.

type DragState = {
  appt: CalAppt;
  startY: number;          // pointer Y at drag start (client coords)
  originDate: string;      // original appointmentDate
  originMin: number;       // original start minutes (absolute)
  colEl: HTMLDivElement | null;
  // Current "snapped" preview values:
  previewDate: string;
  previewMin: number;
};

function useDragReschedule(
  onDrop: (appt: CalAppt, newDate: string, newTime: string) => void
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // Use refs for columns so we can hit-test on pointermove. Keyed by YYYY-MM-DD.
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerCol = (date: string, el: HTMLDivElement | null) => {
    if (el) colRefs.current.set(date, el);
    else colRefs.current.delete(date);
  };

  const onPointerDown = (e: React.PointerEvent, appt: CalAppt, colEl: HTMLDivElement | null) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const originMin = timeToMinutes(appt.appointmentTime);
    setDrag({
      appt,
      startY: e.clientY,
      originDate: appt.appointmentDate,
      originMin,
      colEl,
      previewDate: appt.appointmentDate,
      previewMin: originMin,
    });
  };

  useEffect(() => {
    if (!drag) return;
    let lastSnapKey = `${drag.previewDate}|${drag.previewMin}`;

    const handleMove = (e: PointerEvent) => {
      // Find the column under the pointer.
      let hitDate: string | null = null;
      let hitRect: DOMRect | null = null;
      for (const [d, el] of colRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          hitDate = d;
          hitRect = r;
          break;
        }
      }
      if (!hitDate || !hitRect) return;

      const relY = e.clientY - hitRect.top;
      const slotIdx = Math.max(0, Math.min(
        Math.floor(relY / SLOT_PX),
        Math.floor((DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES) - 1,
      ));
      const snappedMin = slotIndexToMinutes(slotIdx);

      const snapKey = `${hitDate}|${snappedMin}`;
      if (snapKey !== lastSnapKey) {
        lastSnapKey = snapKey;
        navigator.vibrate?.(5);
        setDrag(prev => prev ? { ...prev, previewDate: hitDate!, previewMin: snappedMin } : prev);
      }
    };

    const handleUp = () => {
      const d = dragRef.current;
      if (d && (d.previewDate !== d.originDate || d.previewMin !== d.originMin)) {
        onDrop(d.appt, d.previewDate, minutesToTime(d.previewMin));
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag?.appt.id]); // re-bind when the dragged appt changes

  return { drag, onPointerDown, registerCol };
}

function ApptCard({
  appt, top, height, isDragging, onPointerDown, onClick,
}: {
  appt: CalAppt;
  top: number;
  height: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const tone = statusTone(appt.status);
  const bg = tone === "pending" ? "bg-pink-100 text-rose-900 border-pink-300"
            : tone === "cancelled" ? "bg-gray-100 text-gray-500 border-gray-200 line-through"
            : "bg-rose-600 text-white border-rose-700";
  return (
    <div
      role="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`absolute right-0.5 left-0.5 rounded-lg border px-1.5 py-1 text-[10px] leading-tight cursor-grab active:cursor-grabbing select-none overflow-hidden shadow-sm ${bg} ${isDragging ? "opacity-70 ring-2 ring-primary" : ""}`}
      style={{ top, height, touchAction: "none" }}
    >
      <div className="font-bold truncate">{appt.clientName}</div>
      <div className="truncate opacity-90">{appt.serviceName}</div>
      <div className="opacity-75 font-mono text-[9px]" dir="ltr">
        {appt.appointmentTime} — {minutesToTime(timeToMinutes(appt.appointmentTime) + appt.durationMinutes)}
      </div>
    </div>
  );
}

function TimeGrid({
  days, appts, onApptClick, onReschedule,
}: {
  days: Date[];
  appts: CalAppt[];
  onApptClick: (a: CalAppt) => void;
  onReschedule: (a: CalAppt, newDate: string, newTime: string) => void;
}) {
  const holidays = useHolidaysInRange(days[0], days[days.length - 1]);
  const today = new Date();
  const totalMinutes = DAY_END_MINUTES - DAY_START_MINUTES;
  const totalSlots = totalMinutes / SLOT_MINUTES;
  const totalHeight = totalSlots * SLOT_PX;

  const byDate = useMemo(() => {
    const m = new Map<string, CalAppt[]>();
    for (const a of appts) {
      if (a.status === "cancelled") continue;
      const arr = m.get(a.appointmentDate) ?? [];
      arr.push(a);
      m.set(a.appointmentDate, arr);
    }
    return m;
  }, [appts]);

  const { drag, onPointerDown, registerCol } = useDragReschedule(onReschedule);

  // "Now" line position (only shown when today is in the view).
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const showNow = days.some(d => isSameDay(d, today));
  const nowTop = Math.max(0, Math.min(totalHeight, (nowMinutes - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX));

  return (
    <div dir="rtl" className="flex flex-col">
      {/* Column headers + "כל היום" row */}
      <div className="grid border-b border-border text-xs" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr)) 56px` }}>
        {days.map(d => {
          const k = ymd(d);
          const isToday = isSameDay(d, today);
          const names = holidays.get(k) ?? [];
          const weekday = format(d, "EEEEE", { locale: he });
          return (
            <div key={k} className="py-1.5 px-1 text-center border-l border-border">
              <div className={`text-[11px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{weekday}&#39;</div>
              <div className={`text-sm font-bold ${isToday ? "text-primary" : ""}`}>{format(d, "d.M")}</div>
              {names.length > 0 && (
                <div className="mt-1 text-[10px] font-bold text-primary bg-primary/10 rounded px-1 py-0.5 truncate">{names[0]}</div>
              )}
            </div>
          );
        })}
        <div className="py-1.5 px-1 text-[11px] font-semibold text-muted-foreground text-center">כל היום</div>
      </div>

      {/* Body */}
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr)) 56px`, height: totalHeight }}>
        {/* Day columns */}
        {days.map(d => {
          const k = ymd(d);
          const list = byDate.get(k) ?? [];
          const isHoliday = (holidays.get(k) ?? []).length > 0;
          return (
            <div
              key={k}
              ref={el => registerCol(k, el)}
              className={`relative border-l border-border ${isHoliday ? "bg-primary/5" : ""}`}
            >
              {/* Half-hour grid lines (bg every hour lighter, every 30 darker) */}
              {Array.from({ length: totalSlots }).map((_, i) => (
                <div key={i}
                  className="absolute inset-x-0 border-t border-border/40"
                  style={{ top: i * SLOT_PX, height: SLOT_PX }}
                />
              ))}
              {/* Appointments */}
              {list.map(a => {
                const mStart = timeToMinutes(a.appointmentTime);
                const top = Math.max(0, (mStart - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                const height = Math.max(SLOT_PX * 0.9, (a.durationMinutes / SLOT_MINUTES) * SLOT_PX - 2);
                const isDragging = drag?.appt.id === a.id;
                // If this appt is being dragged AND its preview is on a different column, hide it here.
                const hideSource = isDragging && drag!.previewDate !== k;
                if (hideSource) return null;
                return (
                  <ApptCard
                    key={a.id}
                    appt={a}
                    top={isDragging ? (drag!.previewMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX : top}
                    height={height}
                    isDragging={!!isDragging}
                    onPointerDown={e => onPointerDown(e, a, null)}
                    onClick={e => { if (isDragging) return; e.stopPropagation(); onApptClick(a); }}
                  />
                );
              })}
              {/* Drag ghost for cross-column moves */}
              {drag && drag.previewDate === k && drag.originDate !== k && (
                (() => {
                  const a = drag.appt;
                  const top = (drag.previewMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX;
                  const height = Math.max(SLOT_PX * 0.9, (a.durationMinutes / SLOT_MINUTES) * SLOT_PX - 2);
                  return (
                    <ApptCard
                      appt={a} top={top} height={height}
                      isDragging
                      onPointerDown={() => {}}
                      onClick={() => {}}
                    />
                  );
                })()
              )}
              {/* "Now" indicator */}
              {showNow && isSameDay(d, today) && (
                <div className="absolute inset-x-0 z-20" style={{ top: nowTop }}>
                  <div className="relative">
                    <div className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-orange-500" />
                    <div className="border-t-2 border-orange-500" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Time column (rightmost in RTL = leftmost in DOM order since we put it last) */}
        <div className="relative">
          {Array.from({ length: totalSlots + 1 }).map((_, i) => {
            const label = minutesToTime(DAY_START_MINUTES + i * SLOT_MINUTES);
            return (
              <div key={i} className="absolute inset-x-0 text-[10px] text-muted-foreground text-center font-mono"
                style={{ top: i * SLOT_PX - 6 }} dir="ltr">
                {i % 2 === 0 ? label : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Reschedule confirmation dialog ────────────────────────────────────────
// Mimics the native dialog in the reference app: old time struck through,
// new time below, toggle for sending a WhatsApp notification (which opens
// the owner's personal WhatsApp with a pre-filled message — NOT the
// platform's business-WhatsApp template).
function RescheduleConfirmDialog({
  appt, newDate, newTime, onCancel, onConfirm,
}: {
  appt: CalAppt | null;
  newDate: string;
  newTime: string;
  onCancel: () => void;
  onConfirm: (sendNotification: boolean) => void;
}) {
  const [sendNotif, setSendNotif] = useState(true);
  if (!appt) return null;
  const oldEnd = minutesToTime(timeToMinutes(appt.appointmentTime) + appt.durationMinutes);
  const newEnd = minutesToTime(timeToMinutes(newTime) + appt.durationMinutes);
  const fmtDate = (s: string) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div dir="rtl" className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-center">האם לעדכן את התור?</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono" dir="ltr">{newTime}, {fmtDate(newDate)}</span>
            <span className="text-muted-foreground">←</span>
            <span className="font-mono line-through text-muted-foreground" dir="ltr">{appt.appointmentTime}, {fmtDate(appt.appointmentDate)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono" dir="ltr">{newEnd}, {fmtDate(newDate)}</span>
            <span className="text-muted-foreground">←</span>
            <span className="font-mono line-through text-muted-foreground" dir="ltr">{oldEnd}, {fmtDate(appt.appointmentDate)}</span>
          </div>
        </div>
        <label className="flex items-center justify-end gap-2 cursor-pointer text-sm">
          <span>שליחת התראה ללקוח</span>
          <input
            type="checkbox"
            checked={sendNotif}
            onChange={e => setSendNotif(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
        </label>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-red-300 text-red-600 font-semibold hover:bg-red-50">ביטול</button>
          <button onClick={() => onConfirm(sendNotif)}
            className="flex-1 py-2.5 rounded-xl border border-primary bg-primary text-primary-foreground font-semibold hover:brightness-95">אישור</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main exported component ────────────────────────────────────────────────
export function BusinessCalendar({
  appointments,
  onApptClick,
  onRescheduleServer,
}: {
  appointments: CalAppt[];
  onApptClick: (a: CalAppt) => void;
  // Called after the owner confirms a reschedule. Parent is responsible
  // for the PATCH + WhatsApp open (so the calendar stays purely visual).
  onRescheduleServer: (appt: CalAppt, newDate: string, newTime: string, sendNotification: boolean) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [pendingReschedule, setPendingReschedule] = useState<{ appt: CalAppt; newDate: string; newTime: string } | null>(null);

  const weekDaysForCursor = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const headerLabel = useMemo(() => {
    if (view === "day") return format(cursor, "d בMMMM yyyy", { locale: he });
    if (view === "week") {
      const s = weekDaysForCursor[0];
      const e = weekDaysForCursor[6];
      return `${format(s, "d.M")} – ${format(e, "d.M")}`;
    }
    return format(cursor, "MMMM yyyy", { locale: he });
  }, [view, cursor, weekDaysForCursor]);

  return (
    <div className="border rounded-2xl overflow-hidden bg-card">
      <CalHeader view={view} setView={setView} cursor={cursor} setCursor={setCursor} label={headerLabel} />
      <div className="overflow-auto max-h-[calc(100vh-220px)]">
        {view === "month" && (
          <MonthView
            cursor={cursor}
            appts={appointments}
            onPickDay={d => { setCursor(d); setView("day"); }}
          />
        )}
        {view === "week" && (
          <TimeGrid
            days={weekDaysForCursor}
            appts={appointments}
            onApptClick={onApptClick}
            onReschedule={(a, nd, nt) => setPendingReschedule({ appt: a, newDate: nd, newTime: nt })}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[cursor]}
            appts={appointments}
            onApptClick={onApptClick}
            onReschedule={(a, nd, nt) => setPendingReschedule({ appt: a, newDate: nd, newTime: nt })}
          />
        )}
      </div>
      <RescheduleConfirmDialog
        appt={pendingReschedule?.appt ?? null}
        newDate={pendingReschedule?.newDate ?? ""}
        newTime={pendingReschedule?.newTime ?? ""}
        onCancel={() => setPendingReschedule(null)}
        onConfirm={sendNotif => {
          if (pendingReschedule) {
            onRescheduleServer(pendingReschedule.appt, pendingReschedule.newDate, pendingReschedule.newTime, sendNotif);
          }
          setPendingReschedule(null);
        }}
      />
    </div>
  );
}

// Utility used by parent (open WhatsApp with a pre-filled reschedule note).
export function openRescheduleWhatsApp(phone: string, clientName: string, businessName: string, newDate: string, newTime: string) {
  const e164 = phone.replace(/\D/g, "").replace(/^0/, "972");
  const [y, m, d] = newDate.split("-");
  const dateIL = `${d}/${m}/${y}`;
  const msg = `שלום ${clientName}, התור שלך ב${businessName} עודכן ל-${dateIL} בשעה ${newTime}. מצפים לראותך!`;
  window.open(`https://wa.me/${e164}?text=${encodeURIComponent(msg)}`, "_blank");
}
