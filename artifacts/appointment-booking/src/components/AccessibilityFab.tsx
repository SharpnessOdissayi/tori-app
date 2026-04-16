import { useEffect, useState } from "react";
import { FaWheelchair } from "react-icons/fa";

/**
 * Floating accessibility widget — a11y controls (font size, contrast, etc.)
 * Sits in the right-bottom corner and opens a small panel when tapped.
 * Extracted from Book.tsx so it can be reused across the app (booking
 * page, client portal, dashboard — everywhere a public-facing surface
 * wants to comply with Israel's a11y regulations).
 */
export default function AccessibilityFab({ primaryColor }: { primaryColor?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState(0); // -2 to +4 steps
  const [highContrast, setHighContrast] = useState(false);
  const [largeLinks, setLargeLinks] = useState(false);
  const [letterSpacing, setLetterSpacing] = useState(false);

  // Each a11y effect now has a cleanup that reverts the change on unmount.
  // Previously, navigating away with (say) high-contrast active left the
  // <html> element stuck with the .a11y-* classes because nothing removed
  // them — the next mount added them again but the old ones never cleared.
  useEffect(() => {
    const root = document.documentElement;
    const base = 16 + fontSize * 2;
    root.style.setProperty("font-size", `${base}px`);
    return () => { root.style.removeProperty("font-size"); };
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (highContrast) root.classList.add("a11y-high-contrast");
    else              root.classList.remove("a11y-high-contrast");
    return () => { root.classList.remove("a11y-high-contrast"); };
  }, [highContrast]);

  useEffect(() => {
    const root = document.documentElement;
    if (largeLinks) root.classList.add("a11y-large-links");
    else            root.classList.remove("a11y-large-links");
    return () => { root.classList.remove("a11y-large-links"); };
  }, [largeLinks]);

  useEffect(() => {
    const root = document.documentElement;
    if (letterSpacing) root.classList.add("a11y-letter-spacing");
    else               root.classList.remove("a11y-letter-spacing");
    return () => { root.classList.remove("a11y-letter-spacing"); };
  }, [letterSpacing]);

  const handleReset = () => {
    setFontSize(0);
    setHighContrast(false);
    setLargeLinks(false);
    setLetterSpacing(false);
    document.documentElement.style.removeProperty("font-size");
    document.documentElement.classList.remove("a11y-high-contrast", "a11y-large-links", "a11y-letter-spacing");
  };

  return (
    <>
      {/* Global a11y CSS — injected once, idempotent across instances. */}
      <style>{`
        .a11y-high-contrast { filter: contrast(1.6) !important; }
        .a11y-large-links a, .a11y-large-links button { min-height: 44px !important; min-width: 44px !important; }
        .a11y-letter-spacing * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      `}</style>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="הגדרות נגישות"
          dir="rtl"
          className="fixed bottom-24 right-4 z-[60] bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl shadow-2xl p-4 w-64"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">הגדרות נגישות</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="סגור"
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >✕</button>
          </div>

          {/* Font size */}
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-1.5">גודל טקסט</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize(f => Math.max(f - 1, -2))}
                aria-label="הקטן טקסט"
                className="w-9 h-9 rounded-lg border text-lg font-bold flex items-center justify-center hover:bg-muted"
              >A−</button>
              <div className="flex-1 text-center text-xs text-muted-foreground">{fontSize === 0 ? "ברירת מחדל" : fontSize > 0 ? `+${fontSize * 2}px` : `${fontSize * 2}px`}</div>
              <button
                onClick={() => setFontSize(f => Math.min(f + 1, 4))}
                aria-label="הגדל טקסט"
                className="w-9 h-9 rounded-lg border text-lg font-bold flex items-center justify-center hover:bg-muted"
              >A+</button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 mb-3">
            {[
              { label: "ניגודיות גבוהה",            state: highContrast,  set: setHighContrast },
              { label: "כפתורים וקישורים גדולים",   state: largeLinks,    set: setLargeLinks },
              { label: "ריווח אותיות מוגדל",        state: letterSpacing, set: setLetterSpacing },
            ].map(({ label, state, set }) => (
              <button
                key={label}
                onClick={() => set(s => !s)}
                role="switch"
                aria-checked={state}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-all ${state ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "border-border hover:bg-muted"}`}
              >
                <span>{label}</span>
                <span className={`w-8 h-4 rounded-full transition-colors relative ${state ? "bg-green-500" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${state ? "right-0.5" : "left-0.5"}`} />
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleReset}
            className="w-full py-2 text-xs text-muted-foreground border rounded-xl hover:bg-muted transition-all"
          >
            איפוס הגדרות נגישות
          </button>

          <p className="text-[10px] text-muted-foreground text-center mt-2">
            תואם תקן IS 5568 / WCAG 2.1 AA
          </p>
        </div>
      )}

      {/* FAB trigger — bottom-right, same y offset the dark-mode FAB sits
          above so they stack neatly together. */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="פתח תפריט נגישות"
        aria-expanded={open}
        title="נגישות"
        className="fixed right-4 z-[55] w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ backgroundColor: primaryColor ?? "#1560BD", bottom: "5rem" }}
      >
        <FaWheelchair size={22} color="white" aria-hidden="true" />
      </button>
    </>
  );
}
