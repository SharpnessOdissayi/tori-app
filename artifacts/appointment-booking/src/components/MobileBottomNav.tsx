import { Home, CalendarDays, ThumbsUp, Users, Menu } from "lucide-react";

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
  const items: Array<{ id: BottomTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: "menu", label: "תפריט", icon: <Menu className="w-5 h-5" /> },
    { id: "customers", label: "לקוחות", icon: <Users className="w-5 h-5" /> },
    { id: "approvals", label: "אישור תורים", icon: <ThumbsUp className="w-5 h-5" />, badge: pendingCount },
    { id: "calendar", label: "יומן", icon: <CalendarDays className="w-5 h-5" /> },
    { id: "home", label: "בית", icon: <Home className="w-5 h-5" /> },
  ];

  return (
    <nav
      dir="rtl"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="תפריט תחתון"
    >
      <div className="grid grid-cols-5 h-16">
        {items.map(item => {
          const isActive = active === item.id;
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
              <span className="relative">
                {item.icon}
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>
              <span className="leading-none">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 inset-x-6 h-0.5 bg-primary rounded-b-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
