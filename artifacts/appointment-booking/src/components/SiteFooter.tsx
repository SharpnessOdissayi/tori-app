import { Link } from "wouter";

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="border-t bg-muted/30 py-8 px-4 text-sm text-muted-foreground">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
        {/* Brand — centred + larger (2x the previous size). Links back
            to the marketing homepage and acts as the Kavati wordmark. */}
        <Link href="/" aria-label="חזרה לעמוד הראשי של קבעתי" className="transition-opacity hover:opacity-80">
          <img src="/logo.svg" alt="קבעתי" className="h-16 object-contain" />
        </Link>

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
          <Link href="/delete-account" className="hover:text-foreground transition-colors">
            מחיקת חשבון
          </Link>
        </nav>

        {/* Copyright */}
        <span className="text-xs">© {new Date().getFullYear()} קבעתי — כל הזכויות שמורות</span>
      </div>
    </footer>
  );
}
