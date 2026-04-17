import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "ראשי", href: "/" },
  { label: "פרטים", href: "/details" },
  { label: "יצירת קשר", href: "/contact" },
  { label: "כניסה לבעלי עסקים", href: "/dashboard" },
];

/**
 * Kavati site header — flat, brand-blue accent, no hard separator line.
 * Previous design was dark + gold stars; we dropped that look when the
 * brand switched to a single-hue blue identity (hsl(211 86% 59%)). A soft
 * shadow takes the place of the old border-bottom so the header blends
 * into the page instead of visually cutting it in half.
 */
export default function Navbar({
  leftContent,
  startContent,
}: {
  leftContent?: ReactNode;
  // Renders next to the logo on the reading-start side (right in RTL).
  // Unlike leftContent this is visible on BOTH mobile and desktop — the
  // owner's "פתח עמוד עסק" CTA uses it so it never hides on phones.
  startContent?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const brand = "hsl(211 86% 59%)";

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 w-full backdrop-blur-md"
      style={{
        background: "rgba(255,255,255,0.85)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03), 0 8px 24px -18px rgba(60,146,240,0.35)",
      }}
    >
      <div className="relative w-full px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Mobile hamburger — rendered FIRST so in RTL it sits on the right
            edge of the screen per owner's earlier request. Desktop hides it
            via md:hidden, so desktop layout is untouched. */}
        <button
          className="md:hidden p-2 rounded-lg order-1 transition-colors hover:bg-black/5"
          style={{ color: brand }}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="תפריט"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Logo + nav links + CTAs (desktop-right, mobile-left) */}
        <div className="flex items-center md:flex-1 order-2 md:order-1 justify-end md:justify-start gap-3">
          <Link href="/">
            <img
              src="/icon.svg"
              alt="קבעתי"
              className="h-14 w-14 object-contain cursor-pointer select-none"
            />
          </Link>

          {/* Reading-start slot — always visible, both mobile & desktop.
              Sits right after the logo (on the right in RTL, on the
              left in LTR). */}
          {startContent && (
            <div className="flex items-center">{startContent}</div>
          )}

          <nav className="hidden md:flex items-center gap-1 mr-2">
            {NAV_LINKS.map((link) => {
              const isActive = location === link.href;
              return (
                <Link key={link.href} href={link.href}>
                  <span
                    className="px-3 py-2 text-sm font-medium cursor-pointer rounded-lg transition-colors whitespace-nowrap"
                    style={{
                      color: isActive ? brand : "#475569",
                      background: isActive ? "rgba(60,146,240,0.10)" : "transparent",
                    }}
                    onMouseEnter={e => {
                      if (!isActive) e.currentTarget.style.background = "rgba(60,146,240,0.06)";
                    }}
                    onMouseLeave={e => {
                      if (!isActive) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}

            {/* CTAs — visible when no page-specific leftContent is injected */}
            {!leftContent && (
              <>
                <Link href="/portal">
                  <span
                    className="px-3 py-2 text-sm font-medium cursor-pointer rounded-lg transition-colors whitespace-nowrap"
                    style={{
                      color: location === "/portal" ? brand : "#475569",
                      background: location === "/portal" ? "rgba(60,146,240,0.10)" : "transparent",
                    }}
                  >
                    כניסה ללקוחות
                  </span>
                </Link>
                <Link href="/register">
                  <span
                    className="mr-2 px-5 py-2.5 rounded-full text-sm font-semibold cursor-pointer transition-all whitespace-nowrap text-white"
                    style={{
                      background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)",
                      boxShadow: "0 6px 16px -6px rgba(60,146,240,0.6)",
                    }}
                  >
                    הצטרפות למערכת קבעתי
                  </span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* LEFT: page-specific content (dashboard logout, bell, etc.). Visible
            on mobile too now — used to be desktop-only, but the owner's
            notifications bell needs to be reachable on phones. order-3 on
            mobile parks it at the visual-left edge (end of RTL flex). */}
        {leftContent && (
          <div className="flex items-center gap-2 order-3 md:order-2">
            {leftContent}
          </div>
        )}
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden" style={{ background: "rgba(255,255,255,0.98)", borderTop: "1px solid rgba(60,146,240,0.15)" }}>
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className="block px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-colors"
                  style={{ color: location === link.href ? brand : "#475569", background: location === link.href ? "rgba(60,146,240,0.08)" : "transparent" }}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </span>
              </Link>
            ))}
            <Link href="/portal">
              <span
                className="block px-4 py-3 rounded-xl text-sm font-medium cursor-pointer"
                style={{ color: brand }}
                onClick={() => setMenuOpen(false)}
              >
                כניסה ללקוחות
              </span>
            </Link>
            <Link href="/register">
              <span
                className="block px-4 py-3 rounded-xl text-sm font-bold cursor-pointer text-white text-center mt-1"
                style={{ background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)", boxShadow: "0 6px 16px -6px rgba(60,146,240,0.6)" }}
                onClick={() => setMenuOpen(false)}
              >
                הצטרפות למערכת קבעתי
              </span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
