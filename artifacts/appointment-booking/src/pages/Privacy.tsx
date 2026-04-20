import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";

export default function Privacy() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <h1 className="text-3xl font-bold mb-2">מדיניות פרטיות</h1>
          <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: אפריל 2026</p>

          <section className="space-y-6 text-sm leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold mb-2">1. כללי</h2>
              <p>
                קבעתי ("השירות", "אנחנו") מפעילה פלטפורמת SaaS לניהול תורים — גם כאתר
                אינטרנט (kavati.net) וגם כאפליקציית Android שזמינה ב-Google Play.
                השירות מאפשר לעסקים לנהל זמינות ולקבל הזמנות, ולאפשר ללקוחות לקבוע
                תורים בצורה עצמאית. מדיניות זו מסבירה אילו נתונים אנחנו אוספים, איך
                אנחנו משתמשים בהם, עם מי אנחנו חולקים אותם, ומה הזכויות שלך לגביהם.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">2. מי אנחנו + יצירת קשר</h2>
              <p>
                המפעילה: קבעתי — בעל השירות ישראלי. לכל שאלה בנוגע לפרטיות, בקשת עיון,
                תיקון או מחיקה של נתונים, ניתן לפנות אלינו בכתובת{" "}
                <a href="mailto:privacy@kavati.net" className="text-primary underline">
                  privacy@kavati.net
                </a>
                . נשתדל להשיב תוך 14 ימי עסקים.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">3. סוגי המשתמשים</h2>
              <p className="mb-2">במערכת שלוש קטגוריות משתמשים, וכל אחת אוספת נתונים שונים:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>בעל/ת עסק</strong> — רושם/ת עסק במערכת כדי לנהל תורים</li>
                <li><strong>איש/אשת צוות</strong> — עובד/ת בעסק של מישהו אחר, נוסף/ה ע"י הבעלים</li>
                <li><strong>לקוח/ה</strong> — מתחבר/ת לפורטל הלקוחות כדי לקבוע/לנהל תורים</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">4. מידע שאנו אוספים</h2>
              <p className="mb-2"><strong>בעל עסק / איש צוות:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
                <li>שם מלא, מספר טלפון, כתובת אימייל</li>
                <li>פרטי עסק: שם, כתובת, עיר, סוג עסק, לוגו, באנר, טלפון עסק, קישורי אתר / Instagram</li>
                <li>פרטי חשבונית (ח.פ. / ע.מ., שם משפטי, כתובת לחיוב) — רק אם הופעל מודול קבלות</li>
                <li>שעות עבודה, שירותים, מחירים, אילוצים / ימי חופש</li>
                <li>סיסמה מוצפנת (bcrypt) אם נבחרה התחברות בסיסמה</li>
                <li>מזהה Google (sub + email) אם נבחרה התחברות עם Google</li>
              </ul>
              <p className="mb-2"><strong>לקוח/ה שמתחבר/ת לפורטל:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
                <li>שם מלא + לפחות אחד מהשניים: מספר טלפון <em>או</em> כתובת אימייל</li>
                <li>מין (זכר/נקבה) לצורך התאמת פנייה בלשון נכונה</li>
                <li>העדפות: קבלת התראות מעסקים</li>
                <li>מזהה Google / Facebook (אם נבחרה התחברות OAuth)</li>
                <li>היסטוריית תורים בכל העסקים שהלקוח ביקר בהם</li>
              </ul>
              <p className="mb-2"><strong>מידע שנוצר אוטומטית:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>כתובת IP, User-Agent ומידע דפדפן בסיסי — לצורך אבטחה</li>
                <li>לוגי שימוש: מתי התחברת, איזה תור קבעת, איזו הודעה נשלחה</li>
                <li>נתוני תשלום <em>לא</em> נשמרים אצלנו — רק טוקן מסולק מ-Tranzila</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">5. למה אנחנו משתמשים בנתונים</h2>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>אימות זהות והתחברות (SMS OTP, Email OTP, Google OAuth, סיסמה)</li>
                <li>שליחת אישורים, תזכורות והודעות ביטול לתורים דרך WhatsApp או SMS</li>
                <li>שליחת הודעות תפוצה שיווקיות (רק אם הלקוח הצטרף לרשימת התפוצה)</li>
                <li>הנפקת קבלות / חשבוניות (רק אם בעל העסק הפעיל את המודול)</li>
                <li>חיוב דמי מנוי חודשיים דרך Tranzila (רק למנויי פרו/עסקי)</li>
                <li>גיבויים יומיים ותחזוקת המערכת</li>
                <li>מענה לפניות תמיכה</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">6. שיתוף נתונים עם צדדים שלישיים</h2>
              <p className="mb-2">
                אנחנו <strong>לא מוכרים</strong> נתונים אישיים לאף אחד. שיתוף מוגבל
                מתרחש רק עם ספקי שירות שנדרשים לתפעול, תחת הסכמי DPA:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Railway</strong> (ארה"ב) — אחסון שרתי ה-backend + DB</li>
                <li><strong>Inforu</strong> (ישראל) — שליחת SMS: OTP להתחברות, תזכורות, תפוצה</li>
                <li><strong>Meta / WhatsApp Business</strong> (ארה"ב/אירלנד) — הודעות WhatsApp (אישור תור, תזכורות)</li>
                <li><strong>Resend</strong> (ארה"ב) — שליחת מיילי אימות + התראות מערכת</li>
                <li><strong>Google</strong> (ארה"ב) — רק אם המשתמש בחר להתחבר עם Google Sign-In</li>
                <li><strong>Tranzila</strong> (ישראל) — עיבוד תשלומים; מספרי כרטיס לא עוברים דרכנו (iframe + tokenization)</li>
                <li><strong>Cloudinary</strong> (ארה"ב) — אחסון תמונות (לוגו, באנר, אווטאר צוות)</li>
              </ul>
              <p className="mt-2">
                חלק מהספקים האלה שרתים מחוץ לישראל. המשמעות: חלק מהנתונים עוברים את גבולות
                המדינה. כל הספקים מחויבים להסכמי פרטיות והגנת מידע.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">7. שליחת SMS ותפוצה שיווקית</h2>
              <p>
                הודעות <em>תפעוליות</em> (אישור תור, תזכורת, ביטול) נשלחות כחלק משירות
                קביעת התורים. הודעות <em>שיווקיות</em> (תפוצה לכלל רשימת הלקוחות) נשלחות
                <strong> רק בהסכמה מפורשת</strong> של הלקוח, בהתאם לתיקון 40 לחוק התקשורת.
                כל הודעת תפוצה כוללת קישור "הסרה" בתוך ההודעה; לחיצה עליו מסירה את המספר
                מרשימת התפוצה של העסק לצמיתות.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">8. תשלומים + אבטחת כרטיסי אשראי</h2>
              <p>
                תשלומים עבור מנויים ורכישת חבילות SMS נוספות מבוצעים דרך{" "}
                <strong>Tranzila</strong>, מפעילת שער תשלומים מאושרת בישראל. פרטי הכרטיס
                מוזנים ב-iframe של Tranzila ולא עוברים דרך שרתי קבעתי. אנחנו שומרים
                רק טוקן מסולק (Tranzila Token) שמאפשר חיוב חוזר לצורך המנוי החודשי —
                לא מספר כרטיס, לא CVV, לא כל מידע רגיש אחר. Tranzila מאושרת PCI-DSS.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">9. אבטחת מידע</h2>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>כל התעבורה מוצפנת ב-HTTPS/TLS 1.2+</li>
                <li>סיסמאות נשמרות רק כ-bcrypt hash — לעולם לא בטקסט גלוי</li>
                <li>JWT מאומתים עם סוד ייחודי; פוקעים תוך 30 יום</li>
                <li>גישת עובדים ל-DB מוגבלת למינימום ההכרחי, עם לוגים</li>
                <li>גיבויים יומיים של ה-DB (Railway)</li>
                <li>הרשאות גישה מפורטות: בעל עסק, איש צוות, מנהל-על — כל אחד רואה רק את מה שמותר לו</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">10. מחיקת חשבון ונתונים</h2>
              <p className="mb-2">
                <strong>מחיקה עצמית מתוך המערכת:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
                <li><strong>בעל עסק</strong> — דשבורד → הגדרות → מחיקת חשבון. מוחקת את כל
                  נתוני העסק: תורים, לקוחות, שירותים, אנשי צוות, רשימות תפוצה, קבלות, SMS וכל היתר.</li>
                <li><strong>איש צוות</strong> — דשבורד → הגדרות → מחיקת חשבון. מוחקת את הפרופיל האישי
                  שלך; העסק עצמו נשאר פעיל.</li>
                <li><strong>לקוח</strong> — פורטל לקוחות → הגדרות → מחיקת חשבון. מוחקת את הפרופיל,
                  התורים, ההיסטוריה ורישום ברשימות התפוצה.</li>
              </ul>
              <p>
                <strong>מחיקה לפי בקשה:</strong> ניתן לשלוח לנו בקשה בכתב ל-
                <a href="mailto:privacy@kavati.net" className="text-primary underline">
                  privacy@kavati.net
                </a>
                . נאשר את זהותך ונבצע את המחיקה תוך 30 יום.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">11. שמירת מידע</h2>
              <p>
                נתוני תורים נשמרים עד למחיקת החשבון או עד שנתיים לאחר התור האחרון, לפי
                המוקדם. חיובים ותיעוד חשבונאי נשמרים 7 שנים כנדרש על פי חוק ישראלי.
                לוגי שרת (גישה, שגיאות) נשמרים עד 90 יום.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">12. זכויות המשתמש</h2>
              <p>בהתאם לחוק הגנת הפרטיות התשמ"א-1981 ולתקנות המקבילות, יש לך הזכות:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
                <li>לעיין במידע שנאסף עליך</li>
                <li>לתקן מידע שגוי (ניתן ישירות מההגדרות)</li>
                <li>לבקש את מחיקת המידע שלך</li>
                <li>להסיר את עצמך מרשימת התפוצה השיווקית (קישור ההסרה בכל הודעה)</li>
                <li>להגיש תלונה לרשם מאגרי המידע במשרד המשפטים</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">13. עוגיות ואחסון מקומי</h2>
              <p>
                האפליקציה משתמשת ב-localStorage ו-sessionStorage של הדפדפן לצורך שמירת
                מצב ההתחברות, העדפות (ערכת נושא, שפה), וטוקן ה-JWT. לא נעשה שימוש בעוגיות
                צד שלישי למטרות פרסום. בדפי העסק הציבוריים נטען Google Fonts ומפות הורדה
                בסיסיות לצרכי רינדור בלבד.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">14. גיל מינימום</h2>
              <p>
                השירות מיועד לבגירים (18+). אנחנו לא אוספים ביודעין מידע על קטינים. אם
                נודע לנו שחשבון נפתח ע"י קטין, נמחק אותו ואת כל הנתונים המשויכים אליו.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">15. עדכונים למדיניות</h2>
              <p>
                אנו עשויים לעדכן מדיניות זו מעת לעת. שינוי מהותי יפורסם בדף זה וגם
                יישלח בהודעה לבעלי עסקים פעילים. המשך השימוש לאחר העדכון מהווה הסכמה
                לגרסה המעודכנת.
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
