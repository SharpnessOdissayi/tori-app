/**
 * Canonical public origin for user-facing share URLs.
 *
 * Inside the Capacitor WebView, `window.location.origin` is
 * `https://localhost` / `capacitor://localhost` — which is useless for
 * anything the owner copies and sends to a customer ("open this" →
 * customer's browser can't reach the WebView's origin). Mirrors the
 * fetch-rewrite decision in main.tsx: if we're not on the real
 * production host, return the production URL instead.
 *
 * Share links, QR codes, WhatsApp "book here" messages — all should
 * route through this helper so they render a URL the RECIPIENT can
 * actually open.
 */

export function publicOrigin(): string {
  if (typeof window === "undefined") return "https://www.kavati.net";
  const { protocol, hostname, port } = window.location;
  // Production web origins — return as-is so dev overrides still work.
  if (hostname === "kavati.net" || hostname === "www.kavati.net") {
    return `${protocol}//${hostname}`;
  }
  // Vite dev server (localhost + port). Keep local-dev URLs local so
  // the developer testing on their machine doesn't see kavati.net in
  // their share banner.
  if (hostname === "localhost" && port) {
    return `${protocol}//${hostname}:${port}`;
  }
  // Capacitor, file://, unknown hosts → fall back to production.
  return "https://www.kavati.net";
}
