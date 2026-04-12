import { Link } from "wouter";
import type { ReactNode } from "react";

export default function Navbar({ children }: { children?: ReactNode }) {
  return (
    <header className="px-6 py-4 flex items-center justify-between bg-card border-b sticky top-0 z-50" dir="rtl">
      <Link href="/">
        <div className="flex items-center cursor-pointer select-none">
          <img src="/logo.png" alt="קבעתי" className="h-14 w-14 rounded-xl object-cover" />
        </div>
      </Link>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}
