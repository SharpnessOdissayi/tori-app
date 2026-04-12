import { Link } from "wouter";
import type { ReactNode } from "react";

export default function Navbar({ children }: { children?: ReactNode }) {
  return (
    <header className="px-6 py-4 flex items-center justify-between bg-card border-b sticky top-0 z-50" dir="rtl">
      <Link href="/">
        <div className="flex items-center gap-2 text-primary font-bold text-2xl cursor-pointer select-none">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-base font-bold shadow-sm">
            ק
          </div>
          קבעתי
        </div>
      </Link>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}
