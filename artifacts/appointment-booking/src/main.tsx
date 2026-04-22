import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { capturePromptEvent, registerServiceWorker } from "./lib/pwa";

// ─── Native-app API URL rewrites (Capacitor) ───────────────────────────────
// When the app runs inside a Capacitor WebView (Android / iOS) the window's
// origin is something like https://localhost or capacitor://localhost — NOT
// https://kavati.net. So every fetch("/api/...") call silently goes to the
// WebView's own origin (which is serving the APK's index.html as an SPA
// fallback → returns 200 OK with HTML → our code reads res.ok=true and shows
// "SMS sent" even though no request ever hit the server). Previous version
// of this patch was gated behind an async import of @capacitor/core inside
// Promise.all(), which didn't always resolve in time (or at all, if the
// workspace dep failed to load) — leaving window.fetch un-patched and every
// API call dead on arrival. This rewrite runs SYNCHRONOUSLY at module load
// using a protocol+hostname check, so the patch is guaranteed to be in
// place before any React code renders.
// IMPORTANT: use www. here. The bare kavati.net host 301-redirects to
// www.kavati.net on the edge, and Capacitor's WebView doesn't transparently
// follow POST-redirects — the request just dies with a generic "network
// error", which is the exact symptom owners reported on 1.0.4/1.0.5.
const API_URL = (import.meta as any).env?.VITE_API_URL ?? "https://www.kavati.net";

// Whenever we're NOT on the production web origin (kavati.net / www.kavati.net)
// and NOT on a Vite dev server (hostname localhost with a non-empty port),
// rewrite /api/* + /storage/* fetches to the absolute API URL. This
// covers Capacitor (Android: https://localhost no port, iOS: capacitor://),
// file:// previews, and any other weird WebView origin. Previous
// detection logic relied on window.Capacitor being present, which was
// flaky on boot; the hostname check is synchronous and doesn't depend on
// any plugin having initialised.
function shouldRewriteApiFetches(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, port } = window.location;
  if (hostname === "kavati.net" || hostname === "www.kavati.net") return false;
  if (hostname === "localhost" && port) return false; // Vite dev server
  return true;
}

if (shouldRewriteApiFetches()) {
  console.info("[Kavati] Non-production origin detected — routing /api/* → " + API_URL);
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === "string") {
      if (input.startsWith("/api/") || input.startsWith("/storage/")) {
        return originalFetch(API_URL + input, init);
      }
      return originalFetch(input, init);
    }
    if (input instanceof URL) {
      if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/storage/")) {
        return originalFetch(API_URL + input.pathname + input.search + input.hash, init);
      }
      return originalFetch(input, init);
    }
    // Request object — rebuild with absolute URL when the path is relative
    try {
      const u = new URL(input.url);
      if ((u.origin === window.location.origin) &&
          (u.pathname.startsWith("/api/") || u.pathname.startsWith("/storage/"))) {
        return originalFetch(new Request(API_URL + u.pathname + u.search + u.hash, input), init);
      }
    } catch { /* fall through */ }
    return originalFetch(input, init);
  }) as typeof fetch;

  // Separately, point the Orval-generated api-client hooks at the same URL.
  // Isolated in its own IIFE so a failure here can't stop the fetch patch
  // above from being applied.
  (async () => {
    try {
      const { setBaseUrl } = await import("@workspace/api-client-react");
      setBaseUrl(API_URL);
    } catch (err) {
      console.warn("[Kavati] api-client-react setBaseUrl skipped:", err);
    }
  })();
}

// PWA: capture the install prompt early so the InstallApp page can
// trigger it on demand, and register the service worker for offline
// + instant launch from the home-screen icon (production builds only).
capturePromptEvent();
registerServiceWorker();

// Google Sign-In: one-time init on boot. The web path preloads the GIS
// script; the native path initialises the Capacitor plugin with the
// serverClientId so the returned id_token audience matches what our
// server validates against. Non-blocking — failures are logged inside
// the helper and fall back gracefully.
(async () => {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ?? "";
  if (!clientId) return;
  try {
    const { initGoogleAuth } = await import("./lib/googleAuth");
    await initGoogleAuth(clientId);
  } catch (err) {
    console.warn("[Kavati] Google auth init failed:", err);
  }
})();

createRoot(document.getElementById("root")!).render(<App />);

