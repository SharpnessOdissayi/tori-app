import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell for the business-owner app.
 *
 * Architecture decision: the app is a thin native wrapper around the
 * existing kavati.net dashboard. No separate codebase to maintain —
 * every feature and bug-fix that lands on the web automatically
 * reaches the apps with zero re-deploy. The "app" gains:
 *   - App Store / Play Store presence (trust signal for business owners)
 *   - Push notifications
 *   - Biometric-gated keep-me-signed-in (iOS/Android native)
 *   - Native haptic feedback, keyboard, status bar
 *
 * The mobile `www/` folder only contains a loader HTML that redirects
 * to the live dashboard — it exists because Apple requires an offline
 * fallback page in the bundle. Capacitor's `server.url` is what the
 * app actually loads at runtime.
 */

const config: CapacitorConfig = {
  // Reverse DNS — use a domain you own. Match across iOS/Android.
  appId: "net.kavati.owner",
  appName: "קבעתי לעסקים",

  // Bundle contents — contains the offline fallback and app icons. Do not
  // rename; iOS/Android toolchains expect this exact folder.
  webDir: "www",

  // Live web target. The app loads this URL on every launch, so any
  // dashboard change you push shows up immediately on both platforms
  // with no App Store re-submission.
  server: {
    url: "https://www.kavati.net/dashboard",
    cleartext: false,
    // iOS requires HTTPS by default; this is enforced.
    allowNavigation: [
      "www.kavati.net",
      "kavati.net",
      "*.kavati.net",
      "api.tranzila.com",
      "direct.tranzila.com",
      "directng.tranzila.com",
      "pay.tranzila.com",
    ],
  },

  ios: {
    contentInset: "automatic",
    // Prevents white-flash between splash and web content.
    backgroundColor: "#7c3aed",
  },

  android: {
    backgroundColor: "#7c3aed",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration:        1500,
      backgroundColor:           "#7c3aed",
      androidSplashResourceName: "splash",
      showSpinner:               false,
      splashFullScreen:          true,
      splashImmersive:           true,
    },
    StatusBar: {
      style:              "DARK",
      backgroundColor:    "#7c3aed",
      overlaysWebView:    false,
    },
    Keyboard: {
      resize: "body",
      style:  "dark",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
