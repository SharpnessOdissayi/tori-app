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
      {/* Flow (RTL): hamburger → logo → startContent → nav → [spacer] → leftContent.
          Dropped the order/justify-between juggling — a plain flex row with a
          flex-1 spacer puts leftContent (bell) at the visual-left edge on both
          mobile and desktop without per-breakpoint order hacks. */}
      <div className="relative w-full px-4 sm:px-6 h-16 flex items-center gap-2 sm:gap-3">

        {/* Mobile hamburger — rightmost in RTL (first child) */}
        <button
          className="md:hidden p-2 rounded-lg transition-colors hover:bg-black/5 shrink-0"
          style={{ color: brand }}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="תפריט"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        <Link href="/">
          <img
            src="/icon.svg"
            alt="קבעתי"
            className="h-12 w-12 sm:h-14 sm:w-14 object-contain cursor-pointer select-none shrink-0"
          />
        </Link>

        {/* Reading-start slot — always visible. Sits right after the logo
            (on the right in RTL, on the left in LTR). */}
        {startContent && (
          <div className="flex items-center min-w-0">{startContent}</div>
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

          {/* CTAs — visible when no page-specific leftContent is injected.
              The "הצטרפות למערכת קבעתי" CTA moved to the Hero section of the
              homepage (as "הצטרפות למסלול הנסיון שלנו") so the navbar stays
              clean and clients-only paths are the only top-right shortcut. */}
          {!leftContent && (
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
          )}
        </nav>

        {/* Spacer — pushes leftContent to the visual-left edge */}
        <div className="flex-1" />

        {leftContent && (
          <div className="flex items-center gap-2 shrink-0">
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
          </nav>
        </div>
      )}
    </header>
  );
}
