import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { MessageCircle, Mail } from "lucide-react";

const WHATSAPP_NUMBER = "972504241007";
const DISPLAY_PHONE = "050-4241007";
const SUPPORT_EMAIL = "kavati.net@gmail.com";

export default function DeleteAccount() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "שלום, אני מבקש/ת למחוק את החשבון שלי בקבעתי ואת כל הנתונים המשויכים אליו. שם העסק / אימייל לזיהוי:"
  )}`;
  const mailUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "בקשה למחיקת חשבון ונתונים — קבעתי"
  )}&body=${encodeURIComponent(
    "שלום,\n\nאני מבקש/ת למחוק את החשבון שלי בקבעתי ואת כל הנתונים המשויכים אליו.\n\nשם העסק: \nאימייל מחובר לחשבון: \nמספר טלפון: \n\nתודה."
  )}`;

  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold mb-2">מחיקת חשבון ונתונים</h1>
          <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

          <section className="space-y-6 text-sm leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold mb-2">1. הזכות שלך</h2>
              <p>
                בהתאם לחוק הגנת הפרטיות, תקנות GDPR ומדיניות Google Play, יש לך זכות
                לבקש בכל עת את מחיקת החשבון שלך בקבעתי ואת הנתונים האישיים המשויכים אליו.
                הבקשה תטופל תוך 30 יום ממועד קבלתה.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">2. איך מגישים בקשה</h2>
              <p>ניתן לבחור אחת מהדרכים הבאות:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
                <li>
                  אימייל לכתובת{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  הודעת WhatsApp למספר{" "}
                  <span dir="ltr" className="font-medium">{DISPLAY_PHONE}</span>
                </li>
                <li>לחיצה על אחד הכפתורים בהמשך העמוד</li>
              </ul>
              <p className="mt-3">
                בבקשה יש לציין את שם העסק, האימייל המחובר לחשבון ומספר הטלפון, כדי שנוכל
                לאמת את זהותך לפני ביצוע המחיקה.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">3. מה נמחק</h2>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>פרטי החשבון שלך (שם בעל/ת העסק, אימייל, טלפון, סיסמה מוצפנת)</li>
                <li>פרטי העסק (שם, כתובת, לוגו, קישורים לרשתות חברתיות)</li>
                <li>שעות פעילות, שירותים וצוות העובדים המוגדרים בחשבון</li>
                <li>תורים עתידיים ותורים שבוטלו על ידך</li>
                <li>פרטי קשר של לקוחות שנאספו דרך טפסי קביעת התור</li>
                <li>היסטוריית התחברויות ונתוני שימוש אישיים</li>
                <li>העדפות התראות ותבניות הודעות מותאמות</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">4. מה עשוי להישמר</h2>
              <p>
                בהתאם לחובות חוקיות ורגולטוריות, ייתכן שנשמור מידע מסוים גם לאחר המחיקה:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
                <li>
                  מסמכי חיוב וחשבוניות — נשמרים לשבע (7) שנים כנדרש על פי
                  פקודת מס הכנסה וחוק מע"מ בישראל
                </li>
                <li>
                  לוגים טכניים מצומצמים (ללא פרטים מזהים) — עד 90 יום, לצרכי אבטחה
                  וחקירת אירועים
                </li>
                <li>
                  גיבויים מוצפנים — מועברים למחיקה תוך 30 יום נוספים ממועד מחיקת
                  החשבון בפועל
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">5. אי-הפיכות</h2>
              <p>
                מחיקת חשבון היא פעולה סופית ואינה ניתנת לשחזור. לאחר אישור הבקשה,
                לא ניתן יהיה לשחזר את התורים, רשימות הלקוחות או הנתונים ההיסטוריים.
                אם ברצונך רק להפסיק להשתמש בשירות באופן זמני, תוכל/י לפנות אלינו
                ולבקש השעיית חשבון במקום מחיקה.
              </p>
            </div>
          </section>

          {/* CTAs */}
          <div className="mt-10 space-y-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-4 w-full p-5 rounded-2xl border-2 transition-all hover:shadow-lg hover:scale-[1.01] active:scale-100"
              style={{ borderColor: "#25d366", backgroundColor: "#25d36612" }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#25d366" }}
              >
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <div className="text-right">
                <div className="font-bold text-base" style={{ color: "#128c7e" }}>
                  שליחת בקשה ב-WhatsApp
                </div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {DISPLAY_PHONE}
                </div>
              </div>
            </a>

            <a
              href={mailUrl}
              className="flex items-center justify-center gap-4 w-full p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 transition-all hover:shadow-lg hover:scale-[1.01] active:scale-100"
            >
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div className="text-right">
                <div className="font-bold text-base text-primary">שליחת בקשה באימייל</div>
                <div className="text-xs text-muted-foreground" dir="ltr">
                  {SUPPORT_EMAIL}
                </div>
              </div>
            </a>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
