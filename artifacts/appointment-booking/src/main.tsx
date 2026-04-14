import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
      setBaseUrl(apiUrl);
    }
  } catch {
    // Running in browser without Capacitor — no action needed
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

bootstrap();

