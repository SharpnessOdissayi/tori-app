import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Floating "share my booking link" button for the business owner.
// Renders fixed at the bottom-right corner; lifted above the mobile
// bottom nav so it doesn't overlap. Always shares the /api/s/<slug>
// URL (not /book/<slug>) so WhatsApp/FB previews pick up the
// business-specific OG meta tags.
export function ShareLinkFab({ slug }: { slug?: string | null }) {
  const { toast } = useToast();
  const [justCopied, setJustCopied] = useState(false);

  if (!slug) return null;

  const url = `${window.location.origin}/api/s/${slug}`;

  const onClick = async () => {
    // Native share sheet when available (mobile). Falls back to
    // clipboard + toast on desktop / browsers without navigator.share.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "קבעו תור אצלי",
          text: "אפשר לקבוע תור דרך הלינק הבא:",
          url,
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      toast({ title: "הלינק הועתק — מוכן להדבקה" });
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast({ title: "שגיאה בהעתקת הלינק", variant: "destructive" });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="שתף לינק לקביעת תור"
      title="שתף לינק לקביעת תור"
      // Hidden on mobile? No — keep it visible for quick access.
      // Bottom-right on desktop; lifted above the mobile bottom-nav
      // on phones (which sits ~64px + safe-area at the bottom).
      // Stack order (bottom → top on the right edge):
      //   mobile bottom-nav (0 – 4rem)
      //   AccessibilityFab  (5rem)
      //   ThemeToggleFab    (8.5rem)
      //   ShareLinkFab      (13rem)  ← this one, above dark-mode FAB
      className="fixed z-[57] right-4 md:right-6 flex items-center justify-center w-14 h-14 rounded-full shadow-lg text-white transition-all hover:scale-105 active:scale-95"
      style={{
        background: "linear-gradient(135deg, #3c92f0 0%, #1e6fcf 100%)",
        bottom: "calc(13rem + env(safe-area-inset-bottom))",
      }}
    >
      {justCopied ? <Check className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
    </button>
  );
}
