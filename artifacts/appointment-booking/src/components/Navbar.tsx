import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "ראשי", href: "/" },
  { label: "פרטים", href: "/#pricing" },
  { label: "כניסה לבעלי עסקים", href: "/dashboard" },
  { label: "הצטרפות למנוי חדש", href: "/register", highlight: true },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 w-full"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)", borderBottom: "1px solid #2a2a2a" }}
    >
      <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* RIGHT side: logo + nav links tight together */}
        <div className="flex items-center">
          <Link href="/">
            <img src="/logo.png" alt="קבעתי" className="h-12 w-12 rounded-xl object-cover cursor-pointer select-none" />
          </Link>

          <nav className="hidden md:flex items-center gap-0 mr-3">
            {NAV_LINKS.filter(l => !l.highlight).map((link) => {
              const isActive = location === link.href;
              return (
                <Link key={link.href} href={link.href}>
                  <span
                    className="px-3 py-2 text-sm font-medium cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      color: isActive ? "#d4af37" : "#c0c0c0",
                      borderBottom: isActive ? "2px solid #d4af37" : "2px solid transparent",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#d4af37")}
                    onMouseLeave={e => (e.currentTarget.style.color = isActive ? "#d4af37" : "#c0c0c0")}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* LEFT side: gold CTA button */}
        <div className="hidden md:block">
          {NAV_LINKS.filter(l => l.highlight).map((link) => (
            <Link key={link.href} href={link.href}>
              <span
                className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: "linear-gradient(135deg, #d4af37, #f0c040)",
                  color: "#0a0a0a",
                  boxShadow: "0 0 14px rgba(212,175,55,0.35)",
                }}
              >
                {link.label}
              </span>
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg"
          style={{ color: "#d4af37" }}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="תפריט"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t" style={{ background: "#111", borderColor: "#2a2a2a" }}>
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className="block px-4 py-3 rounded-xl text-sm font-medium cursor-pointer"
                  style={
                    link.highlight
                      ? { background: "linear-gradient(135deg, #d4af37, #f0c040)", color: "#0a0a0a", fontWeight: 700 }
                      : { color: "#c0c0c0" }
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
