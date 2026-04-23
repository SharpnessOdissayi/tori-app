/**
 * Unified Google Sign-In for web + native.
 *
 * Web path (browser → kavati.net):
 *   Uses Google Identity Services (GIS) — the window.google.accounts.id
 *   script loaded on demand. This is what's been working for owners
 *   signing in through Chrome on kavati.net.
 *
 * Native path (Capacitor Android/iOS):
 *   The GIS JavaScript library silently no-ops inside a Capacitor WebView
 *   (can't access accounts.google.com cookies, popups blocked). We route
 *   to the @codetrix-studio/capacitor-google-auth plugin, which calls
 *   the native Android Google Sign-In SDK and returns the same shape of
 *   Google ID token the server already knows how to validate.
 *
 * Both paths return a Google ID token — the server's /auth/business/
 * google-auth endpoint validates it against GOOGLE_CLIENT_ID via
 * tokeninfo and mints our own business JWT.
 *
 * IMPORTANT — Google Cloud setup for the native path:
 *   - The WEB Client ID passed in here is what the plugin uses for
 *     serverClientId (so the returned ID token's `aud` matches the
 *     same value the server validates against).
 *   - Google also demands an ANDROID OAuth Client in the same project
 *     with the package name `net.kavati.app` and the SHA-1 fingerprint
 *     of the signing key. Without that row, the native signin fails
 *     with DEVELOPER_ERROR at runtime.
 */

export type GoogleSignInResult =
  | { ok: true; idToken: string }
  | { ok: false; error: string; cancelled?: boolean };

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

/** One-time init — safe to call multiple times (web GIS is idempotent,
 *  native plugin's initialize() too). Call once at app boot. */
export async function initGoogleAuth(clientId: string): Promise<void> {
  if (!clientId) return;

  if (isCapacitorNative()) {
    try {
      const mod: any = await import("@codetrix-studio/capacitor-google-auth");
      const GoogleAuth = mod.GoogleAuth ?? mod.default?.GoogleAuth;
      if (GoogleAuth?.initialize) {
        await GoogleAuth.initialize({
          clientId,                  // web client id for serverClientId
          scopes: ["email", "profile"],
          grantOfflineAccess: false,
        });
      }
    } catch (err) {
      console.warn("[GoogleAuth] native plugin init failed:", err);
    }
    return;
  }

  // Web: preload the GIS script so the first signin click is instant.
  if (typeof document === "undefined") return;
  if ((window as any).google?.accounts?.id) return;
  if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/** Prompt the user to sign in with Google. Returns a fresh ID token on
 *  success, a typed error on failure. */
export async function signInWithGoogle(clientId: string): Promise<GoogleSignInResult> {
  if (!clientId) return { ok: false, error: "Google Client ID not configured" };

  if (isCapacitorNative()) {
    try {
      const mod: any = await import("@codetrix-studio/capacitor-google-auth");
      const GoogleAuth = mod.GoogleAuth ?? mod.default?.GoogleAuth;
      if (!GoogleAuth?.signIn) return { ok: false, error: "native plugin not loaded" };
      // Force the Android account picker to show every time. Without the
      // signOut(), the Google SDK silently re-uses the last-selected
      // account on the device — which is almost always NOT the one the
      // business owner registered with, producing an immediate
      // "לא נמצא חשבון" error before the user ever sees a picker.
      try { await GoogleAuth.signOut(); } catch { /* no prior session — fine */ }
      const user = await GoogleAuth.signIn();
      const idToken: string | undefined =
        user?.authentication?.idToken ?? user?.idToken ?? user?.serverAuthCode;
      if (!idToken) return { ok: false, error: "no idToken from plugin" };
      return { ok: true, idToken };
    } catch (err: any) {
      // User-cancelled sign-in — we don't want to toast an error for that.
      const msg = String(err?.message ?? err);
      const cancelled = /cancel|dismiss|user.*(cancel|dismiss)/i.test(msg);
      return { ok: false, error: msg || "native sign-in failed", cancelled };
    }
  }

  // Web: GIS flow. Initialize if needed, then prompt + await the callback.
  return new Promise<GoogleSignInResult>((resolve) => {
    const google = (window as any).google?.accounts?.id;
    if (!google) {
      resolve({ ok: false, error: "Google SDK not loaded" });
      return;
    }
    google.initialize({
      client_id: clientId,
      callback: (response: { credential?: string }) => {
        if (response?.credential) resolve({ ok: true, idToken: response.credential });
        else resolve({ ok: false, error: "no credential in GIS response" });
      },
    });
    google.prompt((notification: any) => {
      // GIS's "prompt" will auto-skip itself silently when the user's
      // browser has opted out or FedCM detects no eligible account. In
      // those cases notification.isNotDisplayed() returns true and our
      // callback never fires — resolve so the caller isn't stuck.
      //
      // Common triggers: third-party cookies blocked (Safari default,
      // some Chrome configs), FedCM disabled, ad-blockers blocking
      // accounts.google.com, or the user dismissed the prompt 3+ times
      // which puts them in a Google-imposed cool-down. Direct the user
      // to SMS login — it always works and doesn't require third-party
      // cookies.
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        resolve({ ok: false, error: "לא הצלחנו לפתוח את חלון Google בדפדפן הזה. נסה כניסה עם מספר טלפון במקום." });
      }
    });
  });
}
