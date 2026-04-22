import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { capturePromptEvent, registerServiceWorker } from "./lib/pwa";

// When running as a native Android/iOS app via Capacitor,
// all API calls must be absolute (pointing to the Railway server).
// In the browser, relative paths work fine as-is.
async function bootstrap() {
  try {
    // @vite-ignore: Capacitor is only installed when building the mobile app locally.
    // In the web/Railway build, this import gracefully fails and is caught below.
    const [{ Capacitor }, { setBaseUrl }] = await Promise.all([
      import(/* @vite-ignore */ "@capacitor/core"),
      import("@workspace/api-client-react"),
    ]);
    if (Capacitor.isNativePlatform()) {
      const apiUrl = (import.meta as any).env?.VITE_API_URL ?? "https://kavati.net";
      // 1) api-client-react generated hooks (Orval) — retarget their base URL
      setBaseUrl(apiUrl);
      // 2) Everything that calls fetch("/api/...") directly — there are ~70
      //    of these across the login, OTP, billing, and dashboard flows.
      //    Without this patch, those requests resolve to
      //    capacitor://localhost/api/... — the webview's own origin, which
      //    has no server listening, so every login/SMS/OTP/fetch-business
      //    call silently fails. Patch window.fetch once at boot so every
      //    relative /api path transparently hits Railway.
      const originalFetch = window.fetch.bind(window);
      window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        // URL objects + Request objects + strings all need handling
        if (typeof input === "string") {
          if (input.startsWith("/api/") || input.startsWith("/storage/")) {
            return originalFetch(apiUrl + input, init);
          }
          return originalFetch(input, init);
        }
        if (input instanceof URL) {
          if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/storage/")) {
            return originalFetch(apiUrl + input.pathname + input.search + input.hash, init);
          }
          return originalFetch(input, init);
        }
        // Request — rebuild URL if relative+api
        try {
          const u = new URL(input.url);
          if ((u.origin === window.location.origin) &&
              (u.pathname.startsWith("/api/") || u.pathname.startsWith("/storage/"))) {
            const newReq = new Request(apiUrl + u.pathname + u.search + u.hash, input);
            return originalFetch(newReq, init);
          }
        } catch { /* URL parse failed — fall through */ }
        return originalFetch(input, init);
      }) as typeof fetch;
    }
  } catch {
    // Running in browser without Capacitor — no action needed
  }

  // PWA: capture the install prompt early so the InstallApp page can
  // trigger it on demand, and register the service worker for offline
  // + instant launch from the home-screen icon (production builds only).
  capturePromptEvent();
  registerServiceWorker();

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();

