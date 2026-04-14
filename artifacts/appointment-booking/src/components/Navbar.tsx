import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "ראשי", href: "/" },
  { label: "פרטים", href: "/details" },
  { label: "יצירת קשר", href: "/contact" },
  { label: "כניסה לבעלי עסקים", href: "/dashboard" },
];

// 8 stars: top%, left%, size, delay, duration, drift (horizontal drift px)
const STARS = [
  { top: -20, left: 8,   size: 20, delay: "0s",   dur: "4.5s", drift: 15  },
  { top: -20, left: 18,  size: 16, delay: "0.7s",  dur: "5.2s", drift: -10 },
  { top: -20, left: 32,  size: 22, delay: "1.3s",  dur: "4.8s", drift: 12  },
  { top: -20, left: 47,  size: 18, delay: "0.3s",  dur: "5.5s", drift: -8  },
  { top: -20, left: 58,  size: 14, delay: "1.8s",  dur: "4.2s", drift: 18  },
  { top: -20, left: 70,  size: 20, delay: "0.9s",  dur: "5.0s", drift: -14 },
  { top: -20, left: 82,  size: 16, delay: "2.2s",  dur: "4.6s", drift: 10  },
  { top: -20, left: 92,  size: 18, delay: "1.5s",  dur: "5.3s", drift: -12 },
];

function StarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

export default function Navbar({ leftContent }: { leftContent?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <>
      <style>{`
        @keyframes starFall {
          0%   { transform: translateY(-20px) translateX(0px) rotate(0deg);  opacity: 0; }
          10%  { opacity: 0.7; }
          85%  { opacity: 0.5; }
          100% { transform: translateY(80px) translateX(var(--drift)) rotate(180deg); opacity: 0; }
        }
        .star-fall {
          animation: starFall var(--dur) ease-in infinite;
          animation-delay: var(--delay);
        }
      `}</style>

      <header
        dir="rtl"
        className="sticky top-0 z-50 w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          borderBottom: "1px solid #2a2a2a",
        }}
      >
        {/* Falling stars */}
        <div className="absolute inset-0 pointer-events-none">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="absolute star-fall"
              style={{
                top: `${s.top}px`,
                left: `${s.left}%`,
                color: "#d4af37",
                "--dur": s.dur,
                "--delay": s.delay,
                "--drift": `${s.drift}px`,
              } as React.CSSProperties}
            >
              <StarIcon size={s.size} />
            </span>
          ))}
        </div>

        <div className="relative w-full px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* RIGHT: logo + nav links tight together */}
          <div className="flex items-center">
            <Link href="/">
              <img
                src="/logo.png"
                alt="קבעתי"
                className="h-12 w-12 rounded-xl object-cover cursor-pointer select-none"
              />
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

          {/* LEFT: custom content (dashboard logout etc.) OR CTAs */}
          <div className="hidden md:flex items-center gap-2">
            {leftContent ?? (
              <>
                <Link href="/portal">
                  <span
                    className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all whitespace-nowrap border"
                    style={{ color: "#d4af37", borderColor: "#d4af3750" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "#d4af37")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#d4af3750")}
                  >
                    כניסה ללקוחות
                  </span>
                </Link>
                <Link href="/register">
                  <span
                    className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all whitespace-nowrap"
                    style={{
                      background: "linear-gradient(135deg, #d4af37, #f0c040)",
                      color: "#0a0a0a",
                      boxShadow: "0 0 14px rgba(212,175,55,0.35)",
                    }}
                  >
                    הצטרפות למערכת קבעתי
                  </span>
                </Link>
              </>
            )}
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
          <div className="md:hidden border-t relative" style={{ background: "#111", borderColor: "#2a2a2a" }}>
            <nav className="flex flex-col px-4 py-3 gap-1">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span
                    className="block px-4 py-3 rounded-xl text-sm font-medium cursor-pointer"
                    style={{ color: "#c0c0c0" }}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </span>
                </Link>
              ))}
              <Link href="/portal">
                <span
                  className="block px-4 py-3 rounded-xl text-sm font-medium cursor-pointer"
                  style={{ color: "#d4af37" }}
                  onClick={() => setMenuOpen(false)}
                >
                  כניסה ללקוחות
                </span>
              </Link>
              <Link href="/register">
                <span
                  className="block px-4 py-3 rounded-xl text-sm font-bold cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #d4af37, #f0c040)", color: "#0a0a0a" }}
                  onClick={() => setMenuOpen(false)}
                >
                  הצטרפות למערכת קבעתי
                </span>
              </Link>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
