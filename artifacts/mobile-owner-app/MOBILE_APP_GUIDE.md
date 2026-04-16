# 📱 Kavati Owner App — Full Setup Guide

This guide takes you from zero → live apps on both App Store (iOS)
and Google Play (Android). Read it top-to-bottom at least once before
you start; some steps must be done in order.

> Approach: **Capacitor** — a native shell that loads
> `https://www.kavati.net/dashboard` at runtime. Every web change
> you push to Railway instantly reaches installed apps with **no**
> app-store resubmission. The bundle itself only contains a splash
> screen + offline fallback.

---

## Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node.js 22+** | Needed by Capacitor CLI | already installed |
| **pnpm 10+** | Workspace package manager | already installed |
| **Xcode 15+** | Build iOS app (Mac only!) | Mac App Store |
| **Android Studio Iguana+** | Build Android app | [developer.android.com](https://developer.android.com/studio) |
| **Apple Developer account** | Publish to App Store — $99/yr | [developer.apple.com](https://developer.apple.com) |
| **Google Play Developer account** | Publish to Play Store — one-time $25 | [play.google.com/console](https://play.google.com/console) |

> **No Mac?** You can build & publish the Android app on Windows today.
> iOS requires a Mac — either borrow one for 1-2 days, or rent via
> [macincloud.com](https://macincloud.com) ~$30 for a few hours.

---

## Phase 1 — Local setup (10 min, anywhere)

All commands run from the repo root unless noted.

### 1.1 Install dependencies

```bash
cd artifacts/mobile-owner-app
pnpm install
```

### 1.2 Add the native platforms

```bash
pnpm cap:add:ios
pnpm cap:add:android
```

This creates two folders you should never edit by hand:
- `artifacts/mobile-owner-app/ios/`
- `artifacts/mobile-owner-app/android/`

Both are checked into git (they're small).

### 1.3 Sync the web config

Every time `capacitor.config.ts` or `www/` changes:

```bash
pnpm cap:sync
```

---

## Phase 2 — Android build & publish (1-2 hrs first time)

You can do the whole Android side on Windows or Linux.

### 2.1 Open Android Studio

```bash
pnpm android:build
```

This runs `cap sync android && cap open android` — Android Studio opens
with the project ready.

### 2.2 Customize app identity

Open `android/app/src/main/res/values/strings.xml` and make sure:

```xml
<string name="app_name">קבעתי לעסקים</string>
<string name="title_activity_main">קבעתי לעסקים</string>
```

App icons go in `android/app/src/main/res/mipmap-*/ic_launcher.png`.
Easiest way to generate all sizes at once: upload a 512×512 PNG to
[icon.kitchen](https://icon.kitchen) → download the "Android" zip →
drop the `res/` folder into `android/app/src/main/`.

### 2.3 Generate signing key (one time)

In the project folder root:

```bash
cd android
keytool -genkey -v -keystore kavati-release.keystore -alias kavati \
  -keyalg RSA -keysize 2048 -validity 10000
```

It'll ask for:
- Keystore password (write it down, you cannot recover it!)
- Your name, org, city, country
- Confirm

**Back up `kavati-release.keystore`** somewhere safe (iCloud Drive, 1Password,
whatever). If you lose it you can **never again update the app**.

### 2.4 Wire the key into Gradle

Create `android/key.properties`:

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=kavati
storeFile=../kavati-release.keystore
```

Add `key.properties` to `.gitignore` (already is, but verify). Then in
`android/app/build.gradle` add (before `android {`):

```groovy
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

And inside `android { ... }`:

```groovy
signingConfigs {
    release {
        keyAlias     keystoreProperties['keyAlias']
        keyPassword  keystoreProperties['keyPassword']
        storeFile    file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

### 2.5 Build the release AAB

In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.
Pick `release`. The output is at:
`android/app/release/app-release.aab` (~5 MB).

### 2.6 Create Play Console listing

1. [play.google.com/console](https://play.google.com/console) → **Create app**
2. App name: **קבעתי לעסקים**
3. Default language: **Hebrew (he-IL)**
4. App or game: **App**
5. Free or paid: **Free**
6. Declarations: all checked.

Then fill in:
- **Store listing** → app description (short + full), screenshots (you'll
  need at least 2 — take them from your phone running the dev build:
  Android Studio → Run → Screenshot button in the emulator/device)
- **Content rating** — answer the questionnaire honestly. Business app with
  no violence/gambling → expect **Everyone**.
- **Data safety** — declare what you collect (name, phone, card via Tranzila,
  location? no).

### 2.7 Upload AAB to Production

**Release → Production → Create new release** → Upload `app-release.aab`
→ Release name auto-fills → Rollout to 100%.

Google review: 2-4 hours normally, max 7 days.

---

## Phase 3 — iOS build & publish (2-3 hrs first time, Mac required)

### 3.1 Install Xcode

From the Mac App Store. ~8 GB download. Sign in with your Apple ID in
Xcode → Preferences → Accounts → **+** → Apple ID.

### 3.2 Enroll in Apple Developer Program

[developer.apple.com/programs](https://developer.apple.com/programs)
→ **Enroll**. $99/yr. Takes 24-48 hrs to approve the first time.

### 3.3 Create App ID + Provisioning

Xcode does this automatically the first time you Run on a real device.
Easier route:

```bash
pnpm ios:build
```

Xcode opens with the project.

In Xcode **Signing & Capabilities**:
- Team: **your Apple Developer team**
- Bundle Identifier: `net.kavati.owner` (must match `capacitor.config.ts`
  and be unique across Apple — if taken, pick `net.kavati.owner.app`
  or similar)
- Automatically manage signing: ✅

### 3.4 Set app display name + icon

- App display name: `General → Display Name` → **קבעתי**
- App icon: Replace `App/App/Assets.xcassets/AppIcon.appiconset/` contents.
  icon.kitchen works here too — download the "iOS" zip → drag into Xcode.

### 3.5 Enable push notifications (optional for v1)

In Xcode **Signing & Capabilities**:
- Click **+ Capability** → **Push Notifications**
- Click **+ Capability** → **Background Modes** → check "Remote notifications"

You'll also need to set up APNs keys in Apple Developer console — see
Phase 5.

### 3.6 Archive + upload to App Store Connect

In Xcode:
1. Top device picker → **Any iOS Device**
2. **Product → Archive** (10-20 min first time)
3. Organizer window opens → **Distribute App** → **App Store Connect**
4. Upload

In parallel, open [appstoreconnect.apple.com](https://appstoreconnect.apple.com):
1. **My Apps → + → New App**
2. Platform: iOS. Name: **קבעתי**. Language: Hebrew.
3. Bundle ID: pick the one Xcode registered.
4. SKU: `kavati-owner-v1`

### 3.7 Fill in metadata

Back on App Store Connect:
- App Information → Privacy Policy URL → `https://www.kavati.net/privacy`
- Pricing → Free
- App Privacy → declare what you collect (same as Play Store)
- Screenshots — **required sizes**:
  - 6.7" (iPhone 15 Pro Max) — 1290 × 2796
  - 6.5" (iPhone 11 Pro Max) — 1242 × 2688
  Use Xcode Simulator → Command+S to screenshot.

### 3.8 Submit for review

Once your uploaded build shows up (can take 15 min), select it, fill in
"What to test" for reviewers, and **Submit for Review**.

**Apple review: 24-48 hrs on average.** First submissions sometimes get
rejected for silly reasons (missing demo account, unclear metadata) —
reply to the reject reason and resubmit, usually approved within
another 24 hrs.

> **Demo account for reviewers**: create a test business owner account
> with a fake email and write the login into the "Review Notes" section.
> Otherwise Apple rejects because they can't see what the app actually
> does.

---

## Phase 4 — Dev loop (after initial publish)

### Day-to-day: web-only changes
**No app update needed.** Push to Railway, done. Existing app users
see the change on next open.

### Occasional: native changes (new plugin, new icon, ...)
```bash
pnpm cap:sync
pnpm ios:build          # or pnpm android:build
# build + upload in Xcode or Android Studio
```

Bump version before every release:
- iOS: Xcode → General → Version (e.g. 1.0.1), Build (increment)
- Android: `android/app/build.gradle` → `versionName "1.0.1"`, bump `versionCode`

---

## Phase 5 — Push notifications (later)

This is a separate track — skip for v1 launch, add after you're live.
Summary of what it takes:

### Backend work
- Install `firebase-admin` on api-server.
- Add `device_tokens` table (userId / business_id → fcm/apns token).
- New endpoint `POST /api/push/register` called by the app on login.
- Wire an `await sendPush(userId, { title, body })` call into the
  reminder cron and new-appointment handler.

### iOS setup
- Apple Developer → Keys → **+ APNs Auth Key** → download .p8 file
- Firebase Console → Project Settings → Cloud Messaging → iOS → upload .p8

### Android setup
- Firebase Console → add an Android app with package `net.kavati.owner`
- Download `google-services.json` → drop into `android/app/`
- Add Firebase Gradle plugin lines per Firebase's own guide.

### App side
- `@capacitor/push-notifications` is already in `package.json`
- Request permission on login, register token, send to backend.

Rough ETA: 1 full day of work when we get there.

---

## Troubleshooting

**App shows white screen on launch (Android)**
- Check `allowNavigation` in `capacitor.config.ts` includes `*.kavati.net`
- Check Android emulator has network (some corporate VPNs break it)

**App shows white screen (iOS)**
- Xcode → Product → Clean Build Folder → Run again
- Check App Transport Security: HTTPS is enforced, HTTP won't work

**"Bundle ID already in use" on App Store Connect**
- Use a different suffix: `net.kavati.owner.app` or `net.kavati.biz`
- Update `capacitor.config.ts` → `appId` AND Xcode Bundle ID

**Android build "Gradle version mismatch"**
- Android Studio → File → Invalidate Caches and Restart
- Update `android/gradle/wrapper/gradle-wrapper.properties` to the
  latest stable if prompted

**Can't see business dashboard in the app (shows login page instead)**
- That's expected — the app is the dashboard. Sign in with the
  business email + password, exactly like the website.

---

## Cost summary

| Item | Cost | Frequency |
|---|---|---|
| Apple Developer | $99 | yearly |
| Google Play Developer | $25 | one-time |
| Code signing certs (iOS) | free | Apple provides |
| Android keystore | free | self-generated |
| Push infra (Firebase) | free | up to millions of sends/mo |
| App updates | free | unlimited |
| **Total to launch both stores** | ~$124 first year, $99/yr after | |

---

## Timeline summary

| Phase | Time | Who |
|---|---|---|
| Local setup + sync | 10 min | dev |
| Android build + keystore | 1 hr | dev (Win/Mac/Linux) |
| Android submission | 30 min | dev |
| Google review | 2-4 hrs | Google |
| iOS Xcode setup | 45 min | dev (Mac) |
| iOS build + archive | 30 min | dev (Mac) |
| iOS submission | 30 min | dev (Mac) |
| Apple review | 24-48 hrs | Apple |
| **End-to-end to live on both stores** | **~3-4 days** | |
