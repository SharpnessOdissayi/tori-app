import { Home, CalendarClock, BadgeCheck, UsersRound, LayoutGrid } from "lucide-react";

// Fixed 5-tab bottom nav for the mobile business-owner experience.
// Rendered on top of the dashboard content (not inside the scrolling
// tabs region) so it's always reachable regardless of scroll position.
// Desktop layout keeps the classic top tab bar and hides this nav.
export type BottomTab = "home" | "calendar" | "approvals" | "customers" | "menu";

export function MobileBottomNav({
  active,
  onChange,
  pendingCount = 0,
}: {
  active: BottomTab;
  onChange: (t: BottomTab) => void;
  pendingCount?: number;
}) {
  // Order in RTL grid: items[0] renders rightmost, items[4] leftmost.
  // Owner preference: approvals (w/ badge) on the right, בית in the
  // centre, תפריט on the far left.
  // Owner requested a literal house glyph for "בית" so the label and icon
  // agree — we were using LayoutDashboard which reads as a grid/widget view.
  const items: Array<{ id: BottomTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "approvals", label: "אישור תורים", icon: <BadgeCheck className="w-5 h-5" />, badge: pendingCount },
    { id: "calendar",  label: "יומן",        icon: <CalendarClock className="w-5 h-5" /> },
    { id: "home",      label: "בית",         icon: <Home className="w-5 h-5" /> },
    { id: "customers", label: "לקוחות",      icon: <UsersRound className="w-5 h-5" /> },
    { id: "menu",      label: "תפריט",       icon: <LayoutGrid className="w-5 h-5" /> },
  ];

  return (
    <nav
      dir="rtl"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)", fontFamily: "'Rubik', sans-serif" }}
      aria-label="תפריט תחתון"
    >
      <div className="grid grid-cols-5 h-16">
        {items.map(item => {
          const isActive = active === item.id;
          const isCentre = item.id === "home";
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {/* Centre "בית" gets a slight visual lift + pill background
                  when active — mimics the "home" anchor convention in
                  many mobile app shells without copying the reference. */}
              <span className={`relative flex items-center justify-center transition-all ${isCentre && isActive ? "-mt-3 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg" : ""}`}>
                {item.icon}
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className="leading-none">{item.label}</span>
              {isActive && !isCentre && (
                <span className="absolute top-0 inset-x-6 h-0.5 bg-primary rounded-b-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
