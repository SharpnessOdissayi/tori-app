import type { CapacitorConfig } from "@capacitor/cli";

// Detect build variant via environment variable:
//   CAPACITOR_ENV=staging  → staging build (net.kavati.app.beta)
//   CAPACITOR_ENV=prod     → production build (net.kavati.app)  [default]
const env = process.env.CAPACITOR_ENV ?? "prod";
const isStaging = env === "staging";

const config: CapacitorConfig = {
  appId: isStaging ? "net.kavati.app.beta" : "net.kavati.app",
  appName: isStaging ? "קבעתי Beta" : "קבעתי",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    // Target SDK 34 (Android 14) as required by Google Play from Aug 2024
    // Set in build.gradle: targetSdkVersion 34, compileSdkVersion 34
    minWebViewVersion: 80,
    // Prevent screenshot capture in recent apps (privacy)
    allowMixedContent: false,
  },
  ios: {
    // Minimum iOS 14 — covers 97%+ of active iOS devices
    // Set in Xcode: Deployment Target = 14.0
    contentInset: "automatic",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      iosSplashResourceName: "Splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "Default",
      backgroundColor: "#ffffff",
      // Don't let the WebView extend UNDER the status bar — owners were
      // reporting "the app is a bit up" because content was being clipped
      // by the notch / status area. This reserves vertical space for the
      // native status bar instead of overlaying it.
      overlaysWebView: false,
    },
    // Keyboard: push content up when keyboard opens
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
    // Push notifications — foreground presentation options for iOS.
    // Android reads the default channel from AndroidManifest meta-data
    // (default_notification_channel_id → @string/kavati-default) and the
    // client registers the channel at runtime via Push.createChannel().
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
