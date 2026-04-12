import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "ראשי", href: "/" },
  { label: "פרטים", href: "/#pricing" },
  { label: "כניסה לבעלי עסקים", href: "/dashboard" },
  { label: "הצטרפות למנוי חדש", href: "/register", highlight: true },
];

// 8 stars: [top%, left%, size, opacity, animation-delay]
const STARS = [
  { top: "18%", left: "12%",  size: 14, delay: "0s",    opacity: 0.55 },
  { top: "55%", left: "5%",   size: 10, delay: "0.8s",  opacity: 0.4  },
  { top: "25%", left: "28%",  size: 8,  delay: "1.4s",  opacity: 0.35 },
  { top: "70%", left: "22%",  size: 12, delay: "0.4s",  opacity: 0.5  },
  { top: "15%", left: "55%",  size: 9,  delay: "1.8s",  opacity: 0.38 },
  { top: "60%", left: "48%",  size: 11, delay: "1.1s",  opacity: 0.45 },
  { top: "30%", left: "75%",  size: 8,  delay: "0.6s",  opacity: 0.35 },
  { top: "65%", left: "68%",  size: 13, delay: "2.0s",  opacity: 0.5  },
];

function StarIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <>
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: var(--star-opacity); transform: scale(1) rotate(0deg); }
          50% { opacity: calc(var(--star-opacity) * 0.3); transform: scale(0.7) rotate(20deg); }
        }
        .star-twinkle {
          animation: twinkle 3s ease-in-out infinite;
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
        {/* Decorative stars */}
        <div className="absolute inset-0 pointer-events-none">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="absolute star-twinkle"
              style={{
                top: s.top,
                left: s.left,
                color: "#d4af37",
                "--star-opacity": s.opacity,
                opacity: s.opacity,
                animationDelay: s.delay,
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

          {/* LEFT: gold CTA */}
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
          <div className="md:hidden border-t relative" style={{ background: "#111", borderColor: "#2a2a2a" }}>
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
    </>
  );
}
