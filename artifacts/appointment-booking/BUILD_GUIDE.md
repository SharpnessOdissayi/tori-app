# מדריך בנייה ופרסום — קבעתי

## סביבות

| סביבה | App ID | שם | API |
|--------|--------|----|-----|
| **Staging** | `net.kavati.app.beta` | קבעתי Beta | staging.kavati.net |
| **Production** | `net.kavati.app` | קבעתי | kavati.net |

---

## 1. בנייה ראשונית (חד-פעמי)

```bash
cd artifacts/appointment-booking
pnpm install
```

---

## 2. בנייה ל-Android

### Staging (לבדיקות)
```bash
CAPACITOR_ENV=staging pnpm build
npx cap add android          # רק פעם ראשונה
pnpm icons                   # אייקוני PWA מ-public/icon.svg → public/*.png
npx cap assets:android       # אייקונים + splash נטיביים מ-resources/*.png
npx cap sync
npx cap open android
```

### Production
```bash
pnpm build
pnpm icons                   # רק אם icon.svg השתנה
npx cap assets:android       # רק אם resources/icon.png או splash.png השתנו
npx cap sync
npx cap open android
```

> **הערה על הגנרציה:** `android/` מוחרג ב-gitignore, אז אחרי `cap add android` תמיד צריך לרוץ `cap assets:android` כדי למלא את ה-`mipmap-*` + `drawable-*` עם האייקונים של קבעתי. בלי זה תקבל את אייקון ברירת המחדל של Capacitor (ריבוע אפור).

### ב-Android Studio:
1. המתן לסיום ה-Gradle sync
2. **Build → Generate Signed Bundle / APK**
3. בחר **Android App Bundle (.aab)**
4. צור/השתמש ב-Keystore (שמור אותו בצורה מאובטחת!)
5. הזן passwords
6. בחר **release** build variant
7. לחץ Finish

### הגדרות ב-build.gradle (app):
```gradle
android {
    compileSdkVersion 34
    defaultConfig {
        minSdkVersion 26          // Android 8+
        targetSdkVersion 34       // Google Play דורש 33+ מאוג 2024
        versionCode 1
        versionName "1.0.0"
    }
}
```

---

## 3. בנייה ל-iOS (דורש Mac + Xcode)

### הכנה (חד-פעמי):
```bash
pnpm build
npx cap add ios
npx cap sync
```

### העתק PrivacyInfo.xcprivacy:
```bash
cp ios-config/PrivacyInfo.xcprivacy ios/App/App/PrivacyInfo.xcprivacy
```

### פתח ב-Xcode:
```bash
npx cap open ios
```

### הגדרות ב-Xcode:
1. **TARGETS → App → General:**
   - Bundle Identifier: `net.kavati.app`
   - Version: `1.0.0`
   - Build: `1`
   - Deployment Target: `14.0`

2. **Signing & Capabilities:**
   - Team: [Apple Developer Account שלך]
   - Signing Certificate: Distribution

3. **הוסף PrivacyInfo.xcprivacy לטרגט:**
   - File → Add Files to "App"
   - בחר `ios/App/App/PrivacyInfo.xcprivacy`
   - וודא שמסומן "Add to targets: App"

4. **בנייה לפרסום:**
   - Product → Archive
   - Distribute App → App Store Connect

---

## 4. דרישות App Store

### Google Play:
- [x] Target SDK 34
- [x] HTTPS only (androidScheme: https)
- [ ] Privacy Policy URL: `https://kavati.net/privacy`
- [ ] Content rating questionnaire (ב-Play Console)
- [ ] Screenshots: 2-8 תמונות, 1080×1920 מינימום
- [ ] App icon: 512×512 PNG

### Apple App Store:
- [x] Bundle ID: `net.kavati.app` (reverse DNS)
- [x] PrivacyInfo.xcprivacy מוכן ב-ios-config/
- [ ] Apple Developer Account ($99/year)
- [ ] Privacy Policy URL: `https://kavati.net/privacy`
- [ ] Screenshots: iPhone 6.7" + 5.5" (חובה)
- [ ] App icon 1024×1024 PNG (ללא שקיפות, ללא עיגול)
- [ ] Deployment Target: 14.0+

---

## 5. אייקונים נדרשים

צור את כל הגדלים מקובץ SVG/PNG של הלוגו (1024×1024):

### Android (res/mipmap-*):
- 48×48 (mdpi)
- 72×72 (hdpi)
- 96×96 (xhdpi)
- 144×144 (xxhdpi)
- 192×192 (xxxhdpi)
- 512×512 (Play Store)

### iOS (Assets.xcassets/AppIcon):
- 20×20, 40×40, 58×58, 60×60, 80×80
- 87×87, 120×120, 180×180
- 1024×1024 (App Store — ללא alpha)

**כלי מומלץ:** [makeappicon.com](https://makeappicon.com) — מעלים 1024×1024 ומורידים הכל.

---

## 6. פרסום ב-Google Play Console

1. כנס ל-[play.google.com/console](https://play.google.com/console)
2. Create app → Android → Free → Hebrew
3. Fill store listing (Hebrew + English)
4. Upload AAB to Internal Testing first
5. Add testers → test on real device
6. After testing: promote to Production

---

## 7. פרסום ב-App Store Connect

1. כנס ל-[appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. + New App → iOS → "קבעתי"
3. Fill metadata in Hebrew
4. Upload via Xcode or Transporter app
5. Submit for Review (usually 1-3 business days)

---

## URLs חשובים שחייבים להיות חיים לפני פרסום:
- `https://kavati.net/privacy` — מדיניות פרטיות ✅
- `https://kavati.net/terms` — תנאי שימוש ✅

(שני הדפים כבר קיימים באפליקציה)
