import { Link } from "wouter";

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="border-t bg-muted/30 py-6 px-4 text-sm text-muted-foreground">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Brand */}
        <span className="font-semibold text-foreground">קבעתי</span>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <Link href="/" className="hover:text-foreground transition-colors">
            דף הבית
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            יצירת קשר
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            מדיניות פרטיות
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            תנאי שימוש
          </Link>
        </nav>

        {/* Copyright */}
        <span className="text-xs">© {new Date().getFullYear()} קבעתי — כל הזכויות שמורות</span>
      </div>
    </footer>
  );
}
