import { motion } from "framer-motion";
import { MessageCircle, Phone, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";

const WHATSAPP_NUMBER = "972504241007";
const DISPLAY_PHONE = "050-4241007";
const OWNER_NAME = "אופק";

export default function Contact() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("היי אופק, אני מעוניין לשמוע עוד על קבעתי 😊")}`;
  const phoneUrl = `tel:+${WHATSAPP_NUMBER}`;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background" dir="rtl">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6 text-center"
        >
          {/* Header */}
          <div className="space-y-2">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <MessageCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-extrabold">יצירת קשר</h1>
            <p className="text-muted-foreground text-lg">
              היי אני <strong className="text-foreground">{OWNER_NAME}</strong>, הבעלים של קבעתי
            </p>
            <p className="text-muted-foreground">
              למכירות או שירות ניתן לפנות אליי
            </p>
            <div className="inline-flex items-center gap-2 text-sm font-medium bg-muted px-4 py-2 rounded-full">
              <Clock className="w-4 h-4 text-primary" />
              זמינות: 08:00 – 22:00
            </div>
          </div>

          {/* WhatsApp button */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-4 w-full p-5 rounded-2xl border-2 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-100"
            style={{
              borderColor: "#25d366",
              backgroundColor: "#25d36612",
            }}
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#25d366" }}>
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <div className="text-right">
              <div className="font-bold text-lg" style={{ color: "#128c7e" }}>שלח הודעת וואטסאפ</div>
              <div className="text-sm text-muted-foreground" dir="ltr">{DISPLAY_PHONE}</div>
            </div>
          </a>

          {/* Phone call button */}
          <a
            href={phoneUrl}
            className="flex items-center justify-center gap-4 w-full p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-100"
          >
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0">
              <Phone className="w-8 h-8 text-white" />
            </div>
            <div className="text-right">
              <div className="font-bold text-lg text-primary">התקשר עכשיו</div>
              <div className="text-sm text-muted-foreground" dir="ltr">{DISPLAY_PHONE}</div>
            </div>
          </a>

        </motion.div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t">
        <p>קבעתי — מערכת ניהול תורים לעסקים ישראליים</p>
      </footer>
    </div>
  );
}
