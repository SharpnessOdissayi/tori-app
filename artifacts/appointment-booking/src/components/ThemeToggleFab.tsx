import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Floating dark-mode toggle. Fixed to the right-bottom corner on BOTH the
 * public booking page (Book.tsx) and the client portal (ClientPortal.tsx).
 *
 * State is persisted in localStorage under `kavati_theme`; the "dark" class
 * is added to <html> so the global .dark CSS overrides in index.css kick in
 * across the entire page.
 */
export default function ThemeToggleFab() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    try {
      return localStorage.getItem("kavati_theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try { localStorage.setItem("kavati_theme", theme); } catch {}
    return () => root.classList.remove("dark");
  }, [theme]);

  const toggle = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
      title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
      // Bottom-right corner, stacked directly ABOVE the accessibility FAB
      // (which sits at bottom: 5rem). 44px button + 12px gap ≈ 8.5rem.
      className="fixed right-4 z-[56] w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 hover:scale-110 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-neutral-800 dark:text-gray-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
      style={{ bottom: "8.5rem" }}
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
