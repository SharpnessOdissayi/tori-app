export default function Privacy() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">מדיניות פרטיות</h1>
        <p className="text-muted-foreground text-sm mb-8">עדכון אחרון: ינואר 2025</p>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold mb-2">1. כללי</h2>
            <p>
              קבעתי ("השירות", "אנחנו") מפעילה פלטפורמה לניהול תורים המאפשרת לעסקים לנהל
              זמינות ולאפשר ללקוחות לקבוע תורים. מדיניות פרטיות זו מסבירה כיצד אנו אוספים,
              משתמשים ומגנים על מידע אישי.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">2. מידע שאנו אוספים</h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>שם מלא ומספר טלפון — לצורך קביעת תורים ויצירת קשר</li>
              <li>פרטי עסק (שם, לוגו, כתובת) — לצורך הצגת פרופיל העסק</li>
              <li>היסטוריית תורים — לצורך ניהול ומעקב</li>
              <li>כתובת IP ומידע טכני בסיסי — לצורך אבטחה ושיפור השירות</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">3. שימוש במידע</h2>
            <p>אנו משתמשים במידע אך ורק לצורך:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
              <li>אישור ותזכורות לתורים שנקבעו</li>
              <li>שליחת הודעות WhatsApp לתזכורות (עם הסכמתך)</li>
              <li>שיפור חוויית השימוש בשירות</li>
              <li>יצירת קשר במקרה הצורך</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">4. שיתוף מידע</h2>
            <p>
              אנו לא מוכרים, מעבירים או משתפים מידע אישי עם צדדים שלישיים,
              למעט ספקי שירות הנדרשים לתפעול (כגון שרתי אחסון) תחת הסכמי סודיות מחמירים.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">5. אבטחת מידע</h2>
            <p>
              כל הנתונים מוצפנים בטרנזיט (HTTPS/TLS) ובאחסון. אנו מיישמים את תקני האבטחה
              המקובלים כולל הרשאות גישה מינימליות וגיבויים סדירים.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">6. שמירת מידע</h2>
            <p>
              מידע על תורים נשמר למשך שנה מתאריך התור. ניתן לבקש מחיקת מידע בכל עת
              על ידי פנייה אלינו.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">7. זכויות המשתמש</h2>
            <p>בהתאם לחוק הגנת הפרטיות הישראלי, יש לך הזכות:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground mt-2">
              <li>לעיין במידע שנאסף עליך</li>
              <li>לתקן מידע שגוי</li>
              <li>לבקש מחיקת המידע שלך</li>
              <li>להתנגד לעיבוד מידע מסוים</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">8. עוגיות (Cookies)</h2>
            <p>
              האפליקציה משתמשת ב-localStorage ו-sessionStorage לצורך שמירת העדפות
              ומצב כניסה. לא נעשה שימוש בעוגיות צד שלישי למטרות פרסום.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">9. יצירת קשר</h2>
            <p>
              לכל שאלה הנוגעת לפרטיות, ניתן לפנות אלינו:{" "}
              <a href="mailto:privacy@kavati.net" className="text-primary underline">
                privacy@kavati.net
              </a>
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">10. עדכונים למדיניות</h2>
            <p>
              אנו עשויים לעדכן מדיניות זו מעת לעת. עדכון מהותי יפורסם בדף זה
              ויישלח הודעה לבעלי עסקים רשומים.
            </p>
          </div>
        </section>

        <div className="mt-10 pt-6 border-t text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} קבעתי — כל הזכויות שמורות
        </div>
      </div>
    </div>
  );
}
