import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "net.kavati.app",
  appName: "קבעתי",
  webDir: "dist",
  server: {
    androidScheme: "https",
    // Allow cleartext for development; remove for production
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "Default",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
