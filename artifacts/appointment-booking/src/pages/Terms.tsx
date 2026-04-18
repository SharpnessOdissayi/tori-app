import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";

export default function Terms() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold mb-2">תנאי שימוש</h1>
          <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

          <section className="space-y-6 text-sm leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold mb-2">1. הסכמה לתנאים</h2>
              <p>
                השימוש בשירות קבעתי ("השירות") מותנה בקבלת תנאי שימוש אלה במלואם.
                המשך השימוש בשירות מהווה הסכמה לתנאים. אם אינך מסכים, אנא הפסק את
                השימוש בשירות.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">2. תיאור השירות</h2>
              <p>
                קבעתי היא פלטפורמת SaaS לניהול תורים המאפשרת לבעלי עסקים להציג
                זמינות ולקבל הזמנות, ולאפשר ללקוחות לקבוע תורים בצורה עצמאית.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">3. הרשמה לשירות</h2>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>ההרשמה מחייבת מסירת פרטים מדויקים ועדכניים</li>
                <li>האחריות לשמירת סיסמת הגישה מוטלת על המשתמש בלבד</li>
                <li>כל חשבון מיועד לשימוש של עסק אחד בלבד</li>
                <li>גיל מינימלי לרישום: 18 שנים</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">4. מנויים ותשלומים</h2>
              <p>
                השירות מוצע בשלוש תוכניות: חינמי, PRO ועסקי. תשלומים מתבצעים מראש ואינם
                ניתנים להחזר, אלא במקרים המפורטים במדיניות ההחזרים. המחירים נתונים
                לשינוי עם הודעה מוקדמת של 30 יום.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">5. מגבלות שליחת הודעות WhatsApp</h2>
              <p className="mb-2">
                כל מנוי כולל מכסה יומית מקסימלית של הודעות WhatsApp יוצאות
                (תזכורות, אישורים, ביטולים, תפוצה ושאר התראות שהמערכת שולחת
                ללקוחות בשם העסק):
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-2">
                <li>מנוי חינמי: שליחת WhatsApp דרך המערכת אינה כלולה</li>
                <li>מנוי PRO: עד 50 הודעות WhatsApp ביום</li>
                <li>מנוי עסקי: עד 100 הודעות WhatsApp ביום</li>
              </ul>
              <p>
                כאשר נעשה שימוש מלא במכסה היומית, שליחת הודעות WhatsApp נוספות
                תיחסם עד למחרת. המכסה מתאפסת אוטומטית בתחילת כל יום (שעון ישראל).
                המגבלה נועדה למנוע עלויות חריגות ולשמור על יציבות השירות לכלל
                המשתמשים. הודעות OTP לאימות זהות אינן נספרות במכסה.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">6. התנהגות מותרת ואסורה</h2>
              <p className="mb-2 font-medium">מותר:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
                <li>שימוש לניהול עסק חוקי</li>
                <li>שיתוף קישור הפרופיל עם לקוחות</li>
              </ul>
              <p className="mb-2 font-medium">אסור:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>שימוש לפעילות בלתי חוקית</li>
                <li>שליחת הודעות ספאם ללקוחות</li>
                <li>העלאת תוכן פוגעני, מטעה או מזיק</li>
                <li>ניסיון לפרוץ או לשבש את המערכת</li>
                <li>יצירת חשבונות מרובים לאותו עסק</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">7. קניין רוחני</h2>
              <p>
                התוכן שיוצרי השירות (לוגו, ממשק, קוד) הינו קניינה הבלעדי של קבעתי.
                המשתמש שומר על בעלות התוכן שהוא מעלה (לוגו, תמונות, תיאורים).
                בהעלאת תוכן, המשתמש מעניק לנו רישיון מוגבל להצגתו במסגרת השירות.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">8. הגבלת אחריות</h2>
              <p>
                השירות מסופק "AS IS". אנו לא אחראים לנזקים עקיפים, אובדן הכנסה,
                או אובדן נתונים הנובעים מתקלות טכניות. אחריותנו המרבית לא תעלה
                על סכום השנה האחרונה ששולמה עבור השירות.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">9. סיום שירות וביטול מנוי</h2>
              <p>
                ניתן לסיים את השירות בכל עת דרך לוח הבקרה. אנו שומרים את הזכות
                להשעות או לסגור חשבונות המפרים תנאים אלה.
              </p>
              <p className="mt-2">
                לקוח המבטל את מנויו במהלך החודש — הביטול ייכנס לתוקף ב-10 לחודש
                העוקב. עד למועד זה תישמר גישה מלאה לשירות.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">10. דין חל וסמכות שיפוט</h2>
              <p>
                תנאים אלה כפופים לדיני מדינת ישראל. כל סכסוך הנובע מהסכם זה או
                מהשימוש בשירות יתברר בבית המשפט המוסמך באשדוד בלבד, וכל צד מוותר
                בזאת על כל טענה לסמכות שיפוט במקום אחר.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">11. יצירת קשר</h2>
              <p>
                לכל שאלה:{" "}
                <a href="mailto:support@kavati.net" className="text-primary underline">
                  support@kavati.net
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
