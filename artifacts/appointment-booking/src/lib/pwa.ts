// PWA helpers — platform detection, install-prompt capture, SW registration.
//
// Wired into main.tsx so the deferred install prompt is captured the moment
// Chrome fires `beforeinstallprompt` (there's ONE chance per page load; if
// we don't call preventDefault() before a user gesture, the browser fires
// its own banner and ours disappears). The InstallApp page reads the
// captured prompt via `getInstallPrompt()` and shows the big blue button.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_EVENT = "kavati:install-state";

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;

export function capturePromptEvent() {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  });

  // Detect "already running standalone" — user opened the app from the
  // home-screen icon, so there's nothing to install.
  //
  // Also treat Capacitor native webviews (the Android / iOS app from the
  // Play Store / App Store) as "already installed" — inviting an app user
  // to install an app is nonsense. Detection: window.Capacitor global
  // exposed by the native runtime, OR a hostname that isn't the public
  // web origin. The latter is the robust fallback for edge cases where
  // the global isn't populated yet when this runs.
  const loc = window.location;
  const capNative = !!((window as any).Capacitor?.isNativePlatform?.());
  const nonWebOrigin =
    loc.hostname !== "kavati.net" &&
    loc.hostname !== "www.kavati.net" &&
    !(loc.hostname === "localhost" && loc.port); // keep the Vite dev banner
  if (
    capNative ||
    nonWebOrigin ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  ) {
    installed = true;
  }
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return deferredPrompt;
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export function isInstalled(): boolean {
  return installed;
}

export function onInstallStateChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(INSTALL_EVENT, cb);
  return () => window.removeEventListener(INSTALL_EVENT, cb);
}

export async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent(INSTALL_EVENT));
  return choice.outcome;
}

// ── Platform detection ──────────────────────────────────────────────────────

export type DeviceKind = "ios" | "android" | "desktop" | "unknown";
export type BrowserKind = "chrome" | "safari" | "firefox" | "edge" | "samsung" | "other";

export function getDeviceKind(): DeviceKind {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  // iPadOS 13+ reports as Mac with touch support — treat as iOS so the
  // Safari "Add to Home Screen" flow is shown.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

export function getBrowserKind(): BrowserKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg\//i.test(ua)) return "edge";
  if (/Firefox/i.test(ua)) return "firefox";
  // Chrome check must come after Edge — Edge's UA string contains "Chrome".
  if (/Chrome/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

// ── Service worker registration ────────────────────────────────────────────

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  // In dev Vite already has HMR + its own fetch pipeline — a SW on top
  // breaks reloads.
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] Service worker registration failed:", err);
    });
  });
}
