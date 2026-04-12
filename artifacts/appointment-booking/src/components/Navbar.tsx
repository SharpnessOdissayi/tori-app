import { Link } from "wouter";
import type { ReactNode } from "react";

export default function Navbar({ children }: { children?: ReactNode }) {
  return (
    <header className="px-6 py-4 flex items-center justify-between bg-card border-b sticky top-0 z-50" dir="rtl">
      <Link href="/">
        <div className="flex items-center gap-2 cursor-pointer select-none">
          <img src="/logo.png" alt="קבעתי" className="h-12 w-12 rounded-xl object-contain bg-black" />
          <span className="text-primary font-bold text-2xl">קבעתי</span>
        </div>
      </Link>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </header>
  );
}
