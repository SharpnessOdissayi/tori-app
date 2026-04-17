import { useEffect, useMemo, useRef, useState } from "react";
import {
  format, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth,
} from "date-fns";
import { he } from "date-fns/locale";
import { HebrewCalendar } from "@hebcal/core";
import { ChevronRight, ChevronLeft, RefreshCw, Search, CalendarClock, ArrowDown, MessageSquare, Calendar, CalendarDays, LayoutGrid, X } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
export type CalAppt = {
  id: number;
  serviceId?: number;
  appointmentDate: string;   // YYYY-MM-DD
  appointmentTime: string;   // HH:mm
  durationMinutes: number;
  clientName: string;
  phoneNumber: string;
  serviceName: string;
  status: string;
  notes?: string | null;
};

// Optional map of serviceId → hex colour. Owner sets this per service
// in the dashboard; calendar paints appointment cards in the matching
// colour. Missing / null values fall back to status-tone defaults.
export type ServiceColorMap = Record<number, string | null | undefined>;

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
  searchOpen, onOpenSearch, onCloseSearch, searchQuery, setSearchQuery,
}: {
  view: View;
  setView: (v: View) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
  label: string;
  searchOpen: boolean;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
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

  // Intentional design departure from the reference app:
  // - No centred pill toggle above the header — it was too close to
  //   the reference's look.
  // - Instead, the three views live inline in the sub-header as small
  //   icon buttons (Calendar / CalendarDays / LayoutGrid), grouped on
  //   the reading-start side so the date label stays centred.
  const viewButtons: Array<{ v: View; icon: React.ReactNode; label: string }> = [
    { v: "day",   icon: <Calendar     className="w-4 h-4" />, label: "יום" },
    { v: "week",  icon: <CalendarDays className="w-4 h-4" />, label: "שבוע" },
    { v: "month", icon: <LayoutGrid   className="w-4 h-4" />, label: "חודש" },
  ];

  // When search is open the header collapses into a single search input
  // with a close (X) button — keeps the phone header compact and focused.
  if (searchOpen) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 bg-background border-b border-border" dir="rtl" style={{ fontFamily: "'Rubik', sans-serif" }}>
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          autoFocus
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="חפש לקוח לפי שם..."
          className="flex-1 bg-transparent border-0 focus:outline-none text-sm"
        />
        <button onClick={() => { setSearchQuery(""); onCloseSearch(); }}
          className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
          aria-label="סגור חיפוש">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-3 bg-background border-b border-border" dir="rtl" style={{ fontFamily: "'Rubik', sans-serif" }}>
      {/* View switcher — icon segmented control on the right (reading start). */}
      <div className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5 shrink-0">
        {viewButtons.map(({ v, icon, label }) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              title={label}
              aria-label={label}
              aria-pressed={active}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {icon}
              <span className="hidden xs:inline sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Prev / label / Next — centred. */}
      <div className="flex-1 flex items-center justify-center gap-1">
        <button onClick={stepBack} className="p-2 rounded-lg hover:bg-muted/60" aria-label="הקודם"><ChevronRight className="w-4 h-4" /></button>
        <div className="font-bold text-sm sm:text-base px-1">{label}</div>
        <button onClick={stepForward} className="p-2 rounded-lg hover:bg-muted/60" aria-label="הבא"><ChevronLeft className="w-4 h-4" /></button>
      </div>

      {/* "חזור להיום" + search on the left (reading end). */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setCursor(new Date())}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}>
          חזור להיום
        </button>
        <button onClick={() => setCursor(new Date())} className="p-2 rounded-lg hover:bg-muted/60 hidden sm:block" aria-label="רענן"><RefreshCw className="w-4 h-4" /></button>
        <button onClick={onOpenSearch} className="p-2 rounded-lg hover:bg-muted/60" aria-label="חיפוש"><Search className="w-4 h-4" /></button>
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
              <div className="flex items-start justify-end">
                {isToday ? (
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center -m-0.5">{format(d, "d")}</span>
                ) : (
                  <div className={`text-xs font-semibold ${inMonth ? "text-foreground" : "text-muted-foreground"}`}>{format(d, "d")}</div>
                )}
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

// Pick a readable foreground (white or near-black) for a given hex bg.
// Standard YIQ luminance threshold — good enough for the owner palette.
function readableOn(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#ffffff";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#111827" : "#ffffff";
}

function ApptCard({
  appt, top, height, isDragging, onPointerDown, onClick, serviceColor,
}: {
  appt: CalAppt;
  top: number;
  height: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  serviceColor?: string | null;
}) {
  const tone = statusTone(appt.status);

  // A resolved service colour wins over the status-tone default for
  // confirmed appointments. Pending/cancelled stay on their semantic
  // colours — a cancelled card shouldn't look "filled" just because
  // the service had a brand colour set.
  const useCustomColour = !!serviceColor && tone === "confirmed";

  const className = useCustomColour
    ? "absolute right-0.5 left-0.5 rounded-lg border px-1.5 py-1 text-[10px] leading-tight cursor-grab active:cursor-grabbing select-none overflow-hidden shadow-sm"
    : `absolute right-0.5 left-0.5 rounded-lg border px-1.5 py-1 text-[10px] leading-tight cursor-grab active:cursor-grabbing select-none overflow-hidden shadow-sm ${
        tone === "pending"   ? "bg-pink-100 text-rose-900 border-pink-300"
        : tone === "cancelled" ? "bg-gray-100 text-gray-500 border-gray-200 line-through"
        : "bg-rose-600 text-white border-rose-700"
      }`;

  const customStyle = useCustomColour
    ? {
        top, height, touchAction: "none" as const,
        background: serviceColor!,
        color: readableOn(serviceColor!),
        borderColor: serviceColor!,
      }
    : { top, height, touchAction: "none" as const };

  return (
    <div
      role="button"
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`${className} ${isDragging ? "opacity-70 ring-2 ring-primary" : ""}`}
      style={customStyle}
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
  days, appts, onApptClick, onReschedule, serviceColors,
}: {
  days: Date[];
  appts: CalAppt[];
  onApptClick: (a: CalAppt) => void;
  onReschedule: (a: CalAppt, newDate: string, newTime: string) => void;
  serviceColors?: ServiceColorMap;
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
              <div className={`text-[11px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{weekday}</div>
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
                    serviceColor={a.serviceId != null ? serviceColors?.[a.serviceId] : null}
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
                      serviceColor={a.serviceId != null ? serviceColors?.[a.serviceId] : null}
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3 backdrop-blur-sm animate-in fade-in duration-150" onClick={onCancel}>
      <div
        dir="rtl"
        className="w-full max-w-sm bg-background rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
        style={{ fontFamily: "'Rubik', sans-serif" }}
      >
        {/* Gradient header — Kavati blue → cyan. Distinct from the
            reference app which used a plain white header. */}
        <div
          className="px-5 py-4 text-white flex items-center gap-3"
          style={{ background: "linear-gradient(135deg, #3c92f0 0%, #95dbf4 100%)" }}
        >
          <div className="w-10 h-10 rounded-2xl bg-white/25 backdrop-blur-sm flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-medium opacity-90">עדכון תור</div>
            <div className="text-base font-bold leading-tight">{appt.clientName}</div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Before/after cards — stacked with a big down arrow between
              them. The struck-through "old" card is visually muted; the
              "new" card pops in Kavati blue. */}
          <div className="space-y-2">
            <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3">
              <div className="text-[11px] font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                מ־
              </div>
              <div className="flex items-baseline justify-between gap-2 font-mono text-muted-foreground line-through" dir="ltr">
                <span className="text-lg font-bold">{appt.appointmentTime}–{oldEnd}</span>
                <span className="text-xs">{fmtDate(appt.appointmentDate)}</span>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <ArrowDown className="w-4 h-4 text-primary" />
              </div>
            </div>

            <div className="rounded-2xl border-2 border-primary bg-primary/5 px-4 py-3 shadow-sm">
              <div className="text-[11px] font-semibold text-primary mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                אל־
              </div>
              <div className="flex items-baseline justify-between gap-2 font-mono" dir="ltr">
                <span className="text-xl font-extrabold text-primary">{newTime}–{newEnd}</span>
                <span className="text-xs font-semibold text-foreground">{fmtDate(newDate)}</span>
              </div>
            </div>
          </div>

          {/* Notification toggle — pill-style with icon. Different from
              the reference's tiny checkbox; easier to hit on mobile. */}
          <button
            type="button"
            onClick={() => setSendNotif(v => !v)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors"
            aria-pressed={sendNotif}
          >
            <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${sendNotif ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${sendNotif ? "right-0.5" : "left-0.5"}`} />
            </span>
            <span className="flex-1 flex items-center gap-2 text-right text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">שליחת הודעה ללקוח</span>
            </span>
          </button>

          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-2xl border border-border text-foreground font-semibold hover:bg-muted/60 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={() => onConfirm(sendNotif)}
              className="flex-1 py-3 rounded-2xl font-bold text-white shadow-md hover:brightness-105 active:scale-[0.99] transition-all"
              style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}
            >
              אשר שינוי
            </button>
          </div>
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
  serviceColors,
}: {
  appointments: CalAppt[];
  onApptClick: (a: CalAppt) => void;
  // Called after the owner confirms a reschedule. Parent is responsible
  // for the PATCH + WhatsApp open (so the calendar stays purely visual).
  onRescheduleServer: (appt: CalAppt, newDate: string, newTime: string, sendNotification: boolean) => void;
  serviceColors?: ServiceColorMap;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [pendingReschedule, setPendingReschedule] = useState<{ appt: CalAppt; newDate: string; newTime: string } | null>(null);
  // Client-name search. Magnifying-glass in the header toggles an input;
  // non-empty query surfaces a dropdown of matches. Clicking a match
  // jumps the cursor to that date + opens the appointment edit dialog
  // via the same onApptClick prop the cards use.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as CalAppt[];
    return appointments
      .filter(a => (a.clientName || "").toLowerCase().includes(q) && a.status !== "cancelled")
      .slice(0, 30);
  }, [searchQuery, appointments]);

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
    <div className="border rounded-2xl overflow-hidden bg-card relative">
      <CalHeader
        view={view} setView={setView}
        cursor={cursor} setCursor={setCursor}
        label={headerLabel}
        searchOpen={searchOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onCloseSearch={() => setSearchOpen(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Search results dropdown — shown while the input has text.
          Absolutely positioned so it doesn't push the calendar body
          down while the owner types. */}
      {searchOpen && searchQuery.trim() && (
        <div dir="rtl" className="absolute inset-x-3 top-[52px] z-30 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
          {searchResults.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">אין תוצאות עבור "{searchQuery}"</div>
          ) : (
            <ul className="divide-y">
              {searchResults.map(a => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCursor(parseYmd(a.appointmentDate));
                      setView("day");
                      setSearchOpen(false);
                      setSearchQuery("");
                      onApptClick(a);
                    }}
                    className="w-full text-right px-3 py-2 hover:bg-muted/60 focus:bg-muted/60 focus:outline-none"
                  >
                    <div className="font-semibold text-sm">{a.clientName}</div>
                    <div className="text-xs text-muted-foreground flex gap-2">
                      <span>{a.serviceName}</span>
                      <span>·</span>
                      <span dir="ltr">{a.appointmentDate} {a.appointmentTime}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            serviceColors={serviceColors}
            onApptClick={onApptClick}
            onReschedule={(a, nd, nt) => setPendingReschedule({ appt: a, newDate: nd, newTime: nt })}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[cursor]}
            appts={appointments}
            serviceColors={serviceColors}
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
