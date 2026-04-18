import { useEffect, useMemo, useRef, useState } from "react";
import {
  format, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth,
} from "date-fns";
import { he } from "date-fns/locale";
import { HebrewCalendar, flags as hebFlags } from "@hebcal/core";
import { ChevronRight, ChevronLeft, RefreshCw, Search, CalendarClock, ArrowDown, MessageSquare, Calendar, CalendarDays, LayoutGrid, X, Plus, Ban } from "lucide-react";
import { useGetWorkingHours } from "@workspace/api-client-react";

// Shape for a single day-of-week working-hours row. Matches the WorkingHour
// row returned by the API — kept local so BusinessCalendar doesn't pull
// the full schema type just to render a gray overlay.
export type WorkingHourLite = {
  dayOfWeek: number;  // 0 = Sunday
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  isEnabled: boolean;
};

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

// Time-off / constraint blocks (from /api/business/time-off). Rendered
// as striped red overlays in the week/day grid so the owner can see
// their blocked windows alongside appointments.
export type TimeOffItem = {
  id: number;
  date: string;               // YYYY-MM-DD
  fullDay: boolean;
  startTime?: string | null;  // HH:mm when partial
  endTime?: string | null;    // HH:mm when partial
  note?: string | null;
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
//
// hebcal renders names with nikud (Hebrew diacritics) — "יוֹם הָעַצְמָאוּת".
// Owners asked for the plain form. Unicode block U+0591–U+05C7 covers all
// Hebrew points and cantillation marks, so a single regex strips them
// without touching the base letters.
function stripNikud(s: string): string {
  return s.replace(/[\u0591-\u05C7]/g, "");
}

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
      // Skip Rosh Chodesh via the library flag — catches "ראש חודש אייר",
      // "שבת ראש חודש", and any other rendered variant the string-prefix
      // check missed.
      const f = (ev as any).getFlags ? (ev as any).getFlags() : 0;
      if (f & (hebFlags as any).ROSH_CHODESH) continue;
      if (f & (hebFlags as any).SHABBAT_MEVARCHIM) continue;
      const rawName = ev.render("he");
      // Fallback string check — belt-and-braces in case the flag bit
      // isn't set on some locale variants. Strip nikud only AFTER the
      // prefix check so the test works on the raw library output.
      if (rawName.startsWith("ראש חודש")) continue;
      const name = stripNikud(rawName);
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
  onNewAppointment, onNewTimeOff,
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
  onNewAppointment?: () => void;
  onNewTimeOff?: () => void;
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
        {onNewAppointment && (
          <button
            onClick={onNewAppointment}
            title="תור חדש"
            aria-label="תור חדש"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">תור חדש</span>
          </button>
        )}
        {onNewTimeOff && (
          <button
            onClick={onNewTimeOff}
            title="אילוץ"
            aria-label="אילוץ"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" }}
          >
            <Ban className="w-4 h-4" />
            <span className="hidden sm:inline">אילוץ</span>
          </button>
        )}
        <button onClick={() => setCursor(new Date())}
          className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)" }}>
          <span className="sm:hidden">היום</span>
          <span className="hidden sm:inline">חזור להיום</span>
        </button>
        <button onClick={() => setCursor(new Date())} className="p-2 rounded-lg hover:bg-muted/60 hidden sm:block" aria-label="רענן"><RefreshCw className="w-4 h-4" /></button>
        <button onClick={onOpenSearch} className="p-2 rounded-lg hover:bg-muted/60" aria-label="חיפוש"><Search className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// ─── MONTH VIEW ─────────────────────────────────────────────────────────────
function MonthView({
  cursor, appts, timeOff, onPickDay,
}: {
  cursor: Date;
  appts: CalAppt[];
  timeOff?: TimeOffItem[];
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

  const timeOffByDate = useMemo(() => {
    const m = new Map<string, TimeOffItem[]>();
    for (const t of (timeOff ?? [])) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [timeOff]);

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
          const offs = timeOffByDate.get(k) ?? [];
          const hasFullDayOff = offs.some(t => t.fullDay);
          const holidayNames = holidays.get(k) ?? [];
          const hasHoliday = holidayNames.length > 0;
          return (
            <button
              key={i}
              onClick={() => onPickDay(d)}
              className={`relative h-20 border-b border-l border-border text-right p-1 transition-colors ${inMonth ? "bg-white" : "bg-muted/40"} ${isToday ? "" : ""} hover:bg-primary/5`}
              style={hasFullDayOff ? { backgroundImage: TIME_OFF_STRIPES } : undefined}
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
              {/* Time-off pill — red to match the grid-view blocks; shown
                  whenever any constraint touches the day (full or partial). */}
              {offs.length > 0 && (
                <div className="mt-0.5 text-[10px] font-bold px-1 py-px rounded bg-red-100 text-red-700 truncate flex items-center gap-0.5"
                  title={offs.map(t => t.note || (t.fullDay ? "אילוץ — יום שלם" : `${t.startTime}-${t.endTime}`)).join(" • ")}>
                  <Ban className="w-2.5 h-2.5" />
                  <span className="truncate">אילוץ</span>
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

// Parallel state for time-off blocks. Unlike appointments, partial
// blocks carry TWO minute anchors (start + end) so we can drop them
// elsewhere while preserving their length; full-day blocks only move
// between dates.
type TimeOffDragState = {
  item: TimeOffItem;
  startY: number;
  originDate: string;
  originStartMin: number;  // relevant only for partial
  originEndMin: number;    // relevant only for partial
  colEl: HTMLDivElement | null;
  previewDate: string;
  previewStartMin: number; // relevant only for partial
  previewEndMin: number;   // relevant only for partial
};

function useDragReschedule(
  onDrop: (appt: CalAppt, newDate: string, newTime: string) => void,
  colRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

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
  }, [drag?.appt.id, colRefs, onDrop]);

  return { drag, onPointerDown };
}

// Drag hook for time-off blocks. Full-day blocks only change date on
// drop (the vertical axis is meaningless — the block always spans the
// entire visible grid). Partial blocks move the start AND end minutes
// by the same delta so the duration stays fixed.
function useDragTimeOff(
  onDrop: (item: TimeOffItem, newDate: string, newStartTime: string | null, newEndTime: string | null) => void,
  colRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
) {
  const [drag, setDrag] = useState<TimeOffDragState | null>(null);
  const dragRef = useRef<TimeOffDragState | null>(null);
  dragRef.current = drag;

  const onPointerDown = (e: React.PointerEvent, item: TimeOffItem, colEl: HTMLDivElement | null) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const startMin = item.fullDay ? DAY_START_MINUTES : timeToMinutes(item.startTime ?? "00:00");
    const endMin   = item.fullDay ? DAY_END_MINUTES   : timeToMinutes(item.endTime   ?? "23:59");
    setDrag({
      item,
      startY: e.clientY,
      originDate: item.date,
      originStartMin: startMin,
      originEndMin: endMin,
      colEl,
      previewDate: item.date,
      previewStartMin: startMin,
      previewEndMin: endMin,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const duration = drag.originEndMin - drag.originStartMin;
    let lastSnapKey = `${drag.previewDate}|${drag.previewStartMin}`;

    const handleMove = (e: PointerEvent) => {
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

      // Full-day blocks only snap by date; start/end are fixed to the
      // full visible window so we skip the vertical math entirely.
      if (drag.item.fullDay) {
        const snapKey = `${hitDate}|`;
        if (snapKey !== lastSnapKey) {
          lastSnapKey = snapKey;
          navigator.vibrate?.(5);
          setDrag(prev => prev ? { ...prev, previewDate: hitDate! } : prev);
        }
        return;
      }

      const relY = e.clientY - hitRect.top;
      const slotIdx = Math.max(0, Math.min(
        Math.floor(relY / SLOT_PX),
        Math.floor((DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_MINUTES) - 1,
      ));
      let snappedStart = slotIndexToMinutes(slotIdx);
      // Keep the block inside the visible grid — clamp the end to
      // DAY_END_MINUTES and shift the start back if needed.
      if (snappedStart + duration > DAY_END_MINUTES) {
        snappedStart = DAY_END_MINUTES - duration;
      }
      if (snappedStart < DAY_START_MINUTES) snappedStart = DAY_START_MINUTES;
      const snappedEnd = snappedStart + duration;

      const snapKey = `${hitDate}|${snappedStart}`;
      if (snapKey !== lastSnapKey) {
        lastSnapKey = snapKey;
        navigator.vibrate?.(5);
        setDrag(prev => prev ? { ...prev, previewDate: hitDate!, previewStartMin: snappedStart, previewEndMin: snappedEnd } : prev);
      }
    };

    const handleUp = () => {
      const d = dragRef.current;
      if (d) {
        const moved = d.previewDate !== d.originDate
          || d.previewStartMin !== d.originStartMin;
        if (moved) {
          if (d.item.fullDay) {
            onDrop(d.item, d.previewDate, null, null);
          } else {
            onDrop(d.item, d.previewDate, minutesToTime(d.previewStartMin), minutesToTime(d.previewEndMin));
          }
        }
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
  }, [drag?.item.id, colRefs, onDrop]);

  return { drag, onPointerDown };
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

// Resolve the absolute-position "lane" for an item inside its day
// column. lane is the 0-indexed horizontal slot (right-most in RTL),
// laneCount is the total number of parallel lanes in the collision
// group. A 2px gap between lanes keeps the edges readable without
// eating noticeable width.
function laneRect(lane: number, laneCount: number) {
  const count = Math.max(1, laneCount);
  const idx = Math.min(count - 1, Math.max(0, lane));
  const widthPct = 100 / count;
  const GAP = 2; // px — visual separator between adjacent lanes
  // Using `inset-inline-*` (logical) so the rightmost lane lands on
  // the reading-start side in RTL and on the left in LTR.
  return {
    insetInlineStart: `calc(${idx * widthPct}% + ${idx === 0 ? 0 : GAP / 2}px)`,
    width: `calc(${widthPct}% - ${(count === 1 ? 0 : GAP)}px)`,
  } as const;
}

function ApptCard({
  appt, top, height, isDragging, onPointerDown, onClick, serviceColor, lane = 0, laneCount = 1,
}: {
  appt: CalAppt;
  top: number;
  height: number;
  isDragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  serviceColor?: string | null;
  lane?: number;
  laneCount?: number;
}) {
  const tone = statusTone(appt.status);

  // A resolved service colour wins over the status-tone default for
  // confirmed appointments. Pending/cancelled stay on their semantic
  // colours — a cancelled card shouldn't look "filled" just because
  // the service had a brand colour set.
  const useCustomColour = !!serviceColor && tone === "confirmed";

  // Shrink the text a hair when the card is in a narrow lane so the
  // full client name + service can still wrap and stay readable at
  // 50%/33% column width, instead of being ellipsis-cut.
  const narrow = laneCount > 1;
  const textClass = narrow ? "text-[9px]" : "text-[10px]";
  const className = useCustomColour
    ? `absolute rounded-lg border px-1 py-0.5 ${textClass} leading-tight cursor-grab active:cursor-grabbing select-none overflow-hidden shadow-sm`
    : `absolute rounded-lg border px-1 py-0.5 ${textClass} leading-tight cursor-grab active:cursor-grabbing select-none overflow-hidden shadow-sm ${
        tone === "pending"   ? "bg-pink-100 text-rose-900 border-pink-300"
        : tone === "cancelled" ? "bg-gray-100 text-gray-500 border-gray-200 line-through"
        : "bg-rose-600 text-white border-rose-700"
      }`;

  // touch-action:none is required on the card itself so the browser
  // lets our pointer handler capture the gesture — otherwise the
  // first finger-move is hijacked as a page scroll and drag-to-
  // reschedule never fires on mobile. Vertical scrolling still works
  // anywhere the finger lands OUTSIDE a card (empty grid / gridlines).
  const laneStyle = laneRect(lane, laneCount);
  const customStyle = useCustomColour
    ? {
        top, height, touchAction: "none" as const, ...laneStyle,
        background: serviceColor!,
        color: readableOn(serviceColor!),
        borderColor: serviceColor!,
      }
    : { top, height, touchAction: "none" as const, ...laneStyle };

  return (
    <div
      role="button"
      data-cal-drag="1"
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={`${className} ${isDragging ? "opacity-70 ring-2 ring-primary" : ""}`}
      style={customStyle}
    >
      {/* Let names + service + time wrap to multiple lines — owner
          preference: everything should stay readable even when the
          card is squeezed into a half/third-width lane. break-words
          handles long wordmark-style Hebrew names; leading-[1.05]
          packs the lines tight so two names + time still fit. A tiny
          💬 icon next to the name flags "this booking has a client
          note" — full text lives in the details dialog. */}
      <div className="font-bold break-words leading-[1.05] flex items-start gap-1">
        <span className="break-words">{appt.clientName}</span>
        {appt.notes && appt.notes.trim() && (
          <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 opacity-90" aria-label="יש הערה מהלקוח" />
        )}
      </div>
      <div className="opacity-90 break-words leading-[1.05]">{appt.serviceName}</div>
      <div className="opacity-75 font-mono text-[9px] leading-[1.05]" dir="ltr">
        {appt.appointmentTime}–{minutesToTime(timeToMinutes(appt.appointmentTime) + appt.durationMinutes)}
      </div>
    </div>
  );
}

// Red diagonal-stripe background (SVG data URL) — used for time-off
// blocks so they read as "blocked" at a glance without needing a full
// solid red fill that would fight the appointment cards.
const TIME_OFF_STRIPES =
  "repeating-linear-gradient(135deg, rgba(239,68,68,0.18) 0 8px, rgba(239,68,68,0.30) 8px 16px)";

// Shared "item" shape used for collision-grouping inside a day column.
// Both appointments and time-off blocks get mapped into this before the
// lane assignment so overlapping entries — regardless of kind — split
// the column side-by-side instead of stacking and hiding each other.
type DayItem =
  | { kind: "appt"; id: number; startMin: number; endMin: number; appt: CalAppt }
  | { kind: "timeoff"; id: number; startMin: number; endMin: number; item: TimeOffItem };

type LaidOut = DayItem & { lane: number; laneCount: number };

// Greedy lane assignment — the standard calendar algorithm. Items are
// processed start-ascending (longer first on ties), each slotting into
// the first lane whose last item has already ended; otherwise a new
// lane is created. Lanes are grouped into collision sets so isolated
// items stay full-width and only actual overlaps trigger a split.
function computeDayLayout(appts: CalAppt[], offs: TimeOffItem[]): LaidOut[] {
  const combined: DayItem[] = [];
  for (const a of appts) {
    const startMin = timeToMinutes(a.appointmentTime);
    const endMin = startMin + Math.max(1, a.durationMinutes);
    combined.push({ kind: "appt", id: a.id, startMin, endMin, appt: a });
  }
  for (const t of offs) {
    const startMin = t.fullDay ? DAY_START_MINUTES : timeToMinutes(t.startTime ?? "00:00");
    const endMin   = t.fullDay ? DAY_END_MINUTES   : timeToMinutes(t.endTime   ?? "23:59");
    combined.push({ kind: "timeoff", id: t.id, startMin, endMin, item: t });
  }
  combined.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const results: LaidOut[] = [];
  let groupStart = 0;
  let groupMaxEnd = -Infinity;
  const flushGroup = (startIdx: number, endIdx: number) => {
    const group = combined.slice(startIdx, endIdx);
    const laneEnds: number[] = [];
    const laneAssignments: number[] = new Array(group.length).fill(0);
    group.forEach((it, i) => {
      let laneIdx = laneEnds.findIndex(end => end <= it.startMin);
      if (laneIdx === -1) { laneIdx = laneEnds.length; laneEnds.push(it.endMin); }
      else laneEnds[laneIdx] = it.endMin;
      laneAssignments[i] = laneIdx;
    });
    const laneCount = laneEnds.length;
    group.forEach((it, i) => {
      results.push({ ...(it as DayItem), lane: laneAssignments[i], laneCount });
    });
  };

  for (let i = 0; i < combined.length; i++) {
    const it = combined[i];
    if (i === groupStart) {
      groupMaxEnd = it.endMin;
      continue;
    }
    if (it.startMin < groupMaxEnd) {
      groupMaxEnd = Math.max(groupMaxEnd, it.endMin);
    } else {
      flushGroup(groupStart, i);
      groupStart = i;
      groupMaxEnd = it.endMin;
    }
  }
  if (combined.length > 0) flushGroup(groupStart, combined.length);

  return results;
}

function TimeOffBlock({
  top, height, label, fullDay, isDragging, onClick, onPointerDown, lane = 0, laneCount = 1,
}: {
  top: number;
  height: number;
  label: string;
  fullDay: boolean;
  isDragging?: boolean;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  lane?: number;
  laneCount?: number;
}) {
  const interactive = !!(onClick || onPointerDown);
  // Distinguish click vs drag — if the pointer moved only a few px
  // between down and up, treat as a click (opens edit dialog). Past
  // that threshold the drag hook takes over and click is suppressed.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const laneStyle = laneRect(lane, laneCount);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-cal-drag={interactive ? "1" : undefined}
      onPointerDown={onPointerDown ? (e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        onPointerDown(e);
      } : undefined}
      onClick={onClick ? (e) => {
        e.stopPropagation();
        // Ignore synthetic click that follows a real drag.
        const start = downPos.current;
        if (start) {
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx > 5 || dy > 5) return;
        }
        onClick();
      } : undefined}
      className={`absolute z-0 border-y border-red-400/60 overflow-hidden ${interactive ? "cursor-grab active:cursor-grabbing hover:brightness-95" : "pointer-events-none"} ${isDragging ? "ring-2 ring-red-500 opacity-80" : ""}`}
      // touch-action:none pins the browser so our pointer handler can
      // capture the drag — otherwise a finger on the block would be
      // consumed as a page scroll before we see the first pointermove.
      // Scrolling the calendar still works anywhere outside a block.
      style={{ top, height, ...laneStyle, background: TIME_OFF_STRIPES, touchAction: interactive ? "none" : undefined }}
      title={label}
    >
      {/* Owner preference: drop the Ban icon — the striped red pattern
          is already a clear "blocked" signal. Show the reason (or the
          default אילוץ label when no note) as the only content so it
          reads as text, not as a warning sign. */}
      <div className={`px-1.5 py-0.5 ${laneCount > 1 ? "text-[9px]" : "text-[10px]"} font-bold text-red-800 leading-[1.05] break-words`}>
        {label}
      </div>
    </div>
  );
}

function TimeGrid({
  days, appts, timeOff, workingHours, onApptClick, onReschedule, serviceColors, onPickSlot, onTimeOffClick, onTimeOffReschedule,
}: {
  days: Date[];
  appts: CalAppt[];
  timeOff?: TimeOffItem[];
  // Business's weekly working hours — drives the gray background on
  // slots outside the open window. Undefined = don't gray anything
  // (server hasn't responded yet).
  workingHours?: WorkingHourLite[];
  onApptClick: (a: CalAppt) => void;
  onReschedule: (a: CalAppt, newDate: string, newTime: string) => void;
  serviceColors?: ServiceColorMap;
  // Called when the owner clicks an empty slot in a day column —
  // snaps to the nearest 30-min slot and passes date + HH:mm.
  onPickSlot?: (date: string, time: string) => void;
  // Called when the owner clicks a time-off (constraint) block —
  // parent opens an edit/delete dialog.
  onTimeOffClick?: (t: TimeOffItem) => void;
  // Called after the owner drags a time-off block to a new date/time.
  // newStartTime/newEndTime are null for full-day items (date only).
  onTimeOffReschedule?: (t: TimeOffItem, newDate: string, newStartTime: string | null, newEndTime: string | null) => void;
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

  const timeOffByDate = useMemo(() => {
    const m = new Map<string, TimeOffItem[]>();
    for (const t of (timeOff ?? [])) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return m;
  }, [timeOff]);

  // Working-hours lookup keyed by day-of-week. null = explicitly closed,
  // a { startMin, endMin } range means open that window. Any weekday not
  // in the map is treated as closed. Used to paint a gray background on
  // slots outside the open window so the owner can see at a glance what
  // they're scheduling into — manual booking outside hours still works
  // (pointer-events disabled on the overlay).
  const workingByDow = useMemo(() => {
    const m = new Map<number, { startMin: number; endMin: number } | null>();
    for (const wh of workingHours ?? []) {
      if (wh.isEnabled) m.set(wh.dayOfWeek, { startMin: timeToMinutes(wh.startTime), endMin: timeToMinutes(wh.endTime) });
      else              m.set(wh.dayOfWeek, null);
    }
    return m;
  }, [workingHours]);

  // Shared column refs so both the appointment-drag hook and the
  // time-off-drag hook can hit-test the same day columns.
  const colRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerCol = (date: string, el: HTMLDivElement | null) => {
    if (el) colRefs.current.set(date, el);
    else colRefs.current.delete(date);
  };
  const { drag, onPointerDown } = useDragReschedule(onReschedule, colRefs);
  const noopTimeOffDrop = (_: TimeOffItem, __: string, ___: string | null, ____: string | null) => {};
  const { drag: timeOffDrag, onPointerDown: onTimeOffPointerDown } =
    useDragTimeOff(onTimeOffReschedule ?? noopTimeOffDrop, colRefs);

  // "Now" line position (only shown when today is in the view).
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const showNow = days.some(d => isSameDay(d, today));
  const nowTop = Math.max(0, Math.min(totalHeight, (nowMinutes - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX));

  return (
    <div dir="rtl" className="flex flex-col">
      {/* Column headers — time/"כל היום" column on the RIGHT (start in RTL),
          then day columns flowing right-to-left. Owner preference: the
          hours ruler should sit where reading starts, not on the far left. */}
      <div className="grid border-b border-border text-xs" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="py-1.5 px-1 text-[11px] font-semibold text-muted-foreground text-center border-l border-border">כל היום</div>
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
                // Removed `truncate` — on mobile the column is ~45px wide,
                // so "יום הזכרון" rendered as "יום הז..." and owners couldn't
                // tell which holiday it was. Allowing wrap + tap-to-toast
                // (handled below) lets them see the full text without
                // enlarging the header row.
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    alert(names.join(" • "));
                  }}
                  className="mt-1 w-full text-[10px] font-bold text-primary bg-primary/10 rounded px-1 py-0.5 leading-tight break-words text-right hover:bg-primary/20 transition-colors"
                  title={names.join(" • ")}
                >
                  {names[0]}
                  {names.length > 1 && <span className="mr-1 opacity-75">+{names.length - 1}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Body — same column order as the header: time ruler on the right,
          then day columns. */}
      <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: totalHeight }}>
        {/* Time column (start in RTL = visually right). Labels for every
            30-min slot; whole hours bold-ish, half-hours lighter so the
            hour gridlines still dominate visually. */}
        <div className="relative border-l border-border">
          {Array.from({ length: totalSlots + 1 }).map((_, i) => {
            const minutes = DAY_START_MINUTES + i * SLOT_MINUTES;
            const label = minutesToTime(minutes);
            const isHour = i % 2 === 0;
            return (
              <div
                key={i}
                className={`absolute inset-x-0 text-center font-mono ${isHour ? "text-[10px] text-muted-foreground" : "text-[9px] text-muted-foreground/60"}`}
                style={{ top: i * SLOT_PX - 6 }}
                dir="ltr"
              >
                {label}
              </div>
            );
          })}
        </div>
        {/* Day columns */}
        {days.map(d => {
          const k = ymd(d);
          const list = byDate.get(k) ?? [];
          const offs = timeOffByDate.get(k) ?? [];
          // Single lane-assignment pass covers BOTH appointments and
          // time-off blocks, so an appt that clashes with a partial
          // אילוץ (or two parallel appts) splits the column instead of
          // stacking one on top of the other.
          const layout = computeDayLayout(list, offs);
          const isHoliday = (holidays.get(k) ?? []).length > 0;
          return (
            <div
              key={k}
              ref={el => registerCol(k, el)}
              onClick={e => {
                // Only fire when the click was on the column background
                // itself — not on an appointment card (cards stop
                // propagation) and not while a drag is active.
                if (!onPickSlot) return;
                if (drag) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const relY = e.clientY - rect.top;
                const slotIdx = Math.max(0, Math.min(
                  Math.floor(relY / SLOT_PX),
                  totalSlots - 1,
                ));
                onPickSlot(k, minutesToTime(slotIndexToMinutes(slotIdx)));
              }}
              className={`relative border-l border-border ${onPickSlot ? "cursor-pointer" : ""} ${isHoliday ? "bg-primary/5" : ""}`}
            >
              {/* Gray-out overlay for hours outside the business's open
                  window on THIS weekday. `pointer-events-none` so the
                  owner can still click-to-book outside hours if they
                  need to (e.g. a one-off late appointment). */}
              {(() => {
                const dow = d.getDay();
                // workingByDow has an entry only for days the owner has
                // configured. Missing entry = nothing to highlight yet
                // (working-hours query still loading) — leave white.
                if (!workingByDow.has(dow)) return null;
                const wh = workingByDow.get(dow);
                if (wh == null) {
                  // Day explicitly closed — entire column gray.
                  return <div className="absolute inset-0 bg-muted/40 pointer-events-none" />;
                }
                const beforeTop = 0;
                const beforeHeight = Math.max(0, (wh.startMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                const afterTop = Math.min(totalHeight, (wh.endMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                const afterHeight = Math.max(0, totalHeight - afterTop);
                return (
                  <>
                    {beforeHeight > 0 && (
                      <div className="absolute inset-x-0 bg-muted/40 pointer-events-none"
                        style={{ top: beforeTop, height: beforeHeight }} />
                    )}
                    {afterHeight > 0 && (
                      <div className="absolute inset-x-0 bg-muted/40 pointer-events-none"
                        style={{ top: afterTop, height: afterHeight }} />
                    )}
                  </>
                );
              })()}
              {/* Half-hour grid lines (bg every hour lighter, every 30 darker) */}
              {Array.from({ length: totalSlots }).map((_, i) => (
                <div key={i}
                  className="absolute inset-x-0 border-t border-border/40"
                  style={{ top: i * SLOT_PX, height: SLOT_PX }}
                />
              ))}
              {/* Render every item in source order with its assigned lane.
                  Time-off first (so the striped background sits under any
                  ghost copy of a dragged appt), then appointments — still
                  one pass, same lane metadata. */}
              {layout.map(it => {
                if (it.kind === "timeoff") {
                  const t = it.item;
                  const isDragging = timeOffDrag?.item.id === t.id;
                  const hideSource = isDragging && timeOffDrag!.previewDate !== k;
                  if (hideSource) return null;
                  const baseStart = t.fullDay ? DAY_START_MINUTES : timeToMinutes(t.startTime ?? "00:00");
                  const baseEnd   = t.fullDay ? DAY_END_MINUTES   : timeToMinutes(t.endTime   ?? "23:59");
                  const sMin = isDragging ? timeOffDrag!.previewStartMin : baseStart;
                  const eMin = isDragging ? timeOffDrag!.previewEndMin   : baseEnd;
                  const top = Math.max(0, (sMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                  const rawHeight = (eMin - sMin) / SLOT_MINUTES * SLOT_PX;
                  const height = Math.max(SLOT_PX * 0.6, Math.min(totalHeight - top, rawHeight));
                  // Prefer the owner's note when present — that's the
                  // "reason" they typed in. Fallback to plain "אילוץ"
                  // so a note-less block still labels itself.
                  const label = (t.note && t.note.trim()) || "אילוץ";
                  return (
                    <TimeOffBlock
                      key={`t${t.id}`}
                      top={top}
                      height={height}
                      label={label}
                      fullDay={t.fullDay}
                      isDragging={isDragging}
                      lane={it.lane}
                      laneCount={it.laneCount}
                      onClick={onTimeOffClick ? () => onTimeOffClick(t) : undefined}
                      onPointerDown={onTimeOffReschedule ? (e) => onTimeOffPointerDown(e, t, null) : undefined}
                    />
                  );
                }
                const a = it.appt;
                const mStart = timeToMinutes(a.appointmentTime);
                const top = Math.max(0, (mStart - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                const height = Math.max(SLOT_PX * 0.9, (a.durationMinutes / SLOT_MINUTES) * SLOT_PX - 2);
                const isDragging = drag?.appt.id === a.id;
                const hideSource = isDragging && drag!.previewDate !== k;
                if (hideSource) return null;
                return (
                  <ApptCard
                    key={`a${a.id}`}
                    appt={a}
                    top={isDragging ? (drag!.previewMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX : top}
                    height={height}
                    isDragging={!!isDragging}
                    lane={it.lane}
                    laneCount={it.laneCount}
                    serviceColor={a.serviceId != null ? serviceColors?.[a.serviceId] : null}
                    onPointerDown={e => onPointerDown(e, a, null)}
                    onClick={e => { if (isDragging) return; e.stopPropagation(); onApptClick(a); }}
                  />
                );
              })}
              {/* Drag ghost for cross-column moves of a time-off block —
                  rendered in the target column using lane 0 / single-lane
                  width. Real-time collision recompute during drag is
                  overkill; the final drop re-fetches and re-lays-out. */}
              {timeOffDrag && timeOffDrag.previewDate === k && timeOffDrag.originDate !== k && (
                (() => {
                  const t = timeOffDrag.item;
                  const top = Math.max(0, (timeOffDrag.previewStartMin - DAY_START_MINUTES) / SLOT_MINUTES * SLOT_PX);
                  const rawHeight = (timeOffDrag.previewEndMin - timeOffDrag.previewStartMin) / SLOT_MINUTES * SLOT_PX;
                  const height = Math.max(SLOT_PX * 0.6, Math.min(totalHeight - top, rawHeight));
                  const label = (t.note && t.note.trim()) || "אילוץ";
                  return (
                    <TimeOffBlock top={top} height={height} label={label} fullDay={t.fullDay} isDragging />
                  );
                })()
              )}
              {/* Drag ghost for cross-column moves of an appointment. */}
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
  timeOff,
  onApptClick,
  onTimeOffClick,
  onTimeOffReschedule,
  onRescheduleServer,
  serviceColors,
  onNewAppointment,
  onNewTimeOff,
}: {
  appointments: CalAppt[];
  // Constraint / time-off blocks rendered as red striped overlays in
  // the day/week views. Owner manages them in the אילוצים section
  // under Working Hours.
  timeOff?: TimeOffItem[];
  onApptClick: (a: CalAppt) => void;
  // Clicking a time-off block — parent opens its edit/delete dialog.
  onTimeOffClick?: (t: TimeOffItem) => void;
  // Called after the owner drags a time-off block to a new date/time.
  // Parent issues the PATCH and invalidates the ["time-off"] query.
  onTimeOffReschedule?: (t: TimeOffItem, newDate: string, newStartTime: string | null, newEndTime: string | null) => void;
  // Called after the owner confirms a reschedule. Parent is responsible
  // for the PATCH + WhatsApp open (so the calendar stays purely visual).
  onRescheduleServer: (appt: CalAppt, newDate: string, newTime: string, sendNotification: boolean) => void;
  serviceColors?: ServiceColorMap;
  // Opens the parent's "new appointment" dialog. No args → open with
  // empty defaults (from the header "+"); with args → prefilled from
  // the empty slot the owner clicked.
  onNewAppointment?: (opts?: { date?: string; time?: string }) => void;
  // Red "אילוץ" button in the header. Opens the same shared dialog
  // with the timeoff tab preselected.
  onNewTimeOff?: (opts?: { date?: string; time?: string }) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  // Working-hours for the current business — one row per weekday, each
  // marked enabled or not. We feed this into <TimeGrid> so slots outside
  // the open window get a gray background, but stay clickable.
  const { data: workingHours } = useGetWorkingHours();
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

  // Swipe-to-navigate across weeks/days/months. In the RTL calendar
  // the content flows right-to-left (Sunday on the right, Saturday on
  // the left) — newer periods extend off the LEFT edge of the view.
  // So sweeping the finger LEFT→RIGHT drags the visible period toward
  // the right and advances forward (next period), and RIGHT→LEFT goes
  // back. Touches that start inside an appointment card or time-off
  // block are ignored — those own the drag-to-reschedule handler.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const stepByGesture = (dir: 1 | -1) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else setCursor(addMonths(cursor, dir));
  };
  const onSwipeStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-cal-drag]")) { swipeStart.current = null; return; }
    const t = e.touches[0];
    swipeStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    if (!end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    // Require a decent horizontal distance AND a horizontal-dominant
    // gesture so accidental diagonal scrolls don't trigger paging.
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    // RTL calendar: dx > 0 (L→R) = next, dx < 0 (R→L) = previous.
    stepByGesture(dx > 0 ? 1 : -1);
  };

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
        onNewAppointment={onNewAppointment ? () => onNewAppointment() : undefined}
        onNewTimeOff={onNewTimeOff ? () => onNewTimeOff() : undefined}
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

      <div
        className="overflow-auto max-h-[calc(100vh-220px)]"
        onTouchStart={onSwipeStart}
        onTouchEnd={onSwipeEnd}
      >
        {view === "month" && (
          <MonthView
            cursor={cursor}
            appts={appointments}
            timeOff={timeOff}
            onPickDay={d => { setCursor(d); setView("day"); }}
          />
        )}
        {view === "week" && (
          <TimeGrid
            days={weekDaysForCursor}
            appts={appointments}
            timeOff={timeOff}
            workingHours={workingHours as WorkingHourLite[] | undefined}
            serviceColors={serviceColors}
            onApptClick={onApptClick}
            onTimeOffClick={onTimeOffClick}
            onTimeOffReschedule={onTimeOffReschedule}
            onReschedule={(a, nd, nt) => setPendingReschedule({ appt: a, newDate: nd, newTime: nt })}
            onPickSlot={onNewAppointment ? (date, time) => onNewAppointment({ date, time }) : undefined}
          />
        )}
        {view === "day" && (
          <TimeGrid
            days={[cursor]}
            appts={appointments}
            timeOff={timeOff}
            workingHours={workingHours as WorkingHourLite[] | undefined}
            serviceColors={serviceColors}
            onApptClick={onApptClick}
            onTimeOffClick={onTimeOffClick}
            onTimeOffReschedule={onTimeOffReschedule}
            onReschedule={(a, nd, nt) => setPendingReschedule({ appt: a, newDate: nd, newTime: nt })}
            onPickSlot={onNewAppointment ? (date, time) => onNewAppointment({ date, time }) : undefined}
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
