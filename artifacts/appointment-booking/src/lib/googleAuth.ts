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
  return webSignIn(clientId);
}

/** Popup-based fallback for when the FedCM / One-Tap prompt is blocked.
 *  Renders Google's official button into an off-screen container and
 *  programmatically dispatches a click. Google's renderButton handler
 *  opens a normal OAuth popup window that's not subject to the same
 *  third-party-cookie restrictions as One-Tap. The button is hidden
 *  visually so users see their own styled button stay in place. */
function popupFallback(
  clientId: string,
  resolve: (v: GoogleSignInResult) => void,
): void {
  const google = (window as any).google?.accounts?.id;
  if (!google) {
    resolve({ ok: false, error: "Google SDK not loaded" });
    return;
  }
  try {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-9999px";
    host.style.top = "0";
    host.style.width = "1px";
    host.style.height = "1px";
    host.style.overflow = "hidden";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    google.renderButton(host, { type: "standard", size: "large", theme: "outline" });
    // Click the button Google rendered. `div[role=button]` is the element
    // Google attaches the popup-trigger handler to.
    requestAnimationFrame(() => {
      const btn = host.querySelector<HTMLElement>("div[role='button']");
      if (!btn) {
        resolve({ ok: false, error: "לא הצלחנו לפתוח את חלון Google. נסה כניסה עם מספר טלפון." });
        return;
      }
      btn.click();
    });
  } catch (err: any) {
    resolve({ ok: false, error: String(err?.message ?? err) || "Google popup failed" });
  }
}

function webSignIn(clientId: string): Promise<GoogleSignInResult> {
  return new Promise<GoogleSignInResult>((resolve) => {
    const google = (window as any).google?.accounts?.id;
    if (!google) {
      resolve({ ok: false, error: "Google SDK not loaded" });
      return;
    }
    // Single-shot resolver so we don't get cross-fired by both the
    // callback and the legacy skip-detection path.
    let resolved = false;
    const safeResolve = (val: GoogleSignInResult) => {
      if (!resolved) { resolved = true; resolve(val); }
    };

    // use_fedcm_for_prompt=true opts into Google's FedCM-backed prompt
    // flow. Without it, recent Chrome/Edge log a GSI_LOGGER deprecation
    // warning and the callback-based skip detection will break when
    // FedCM becomes mandatory. FedCM also sidesteps most third-party-
    // cookie blocking that used to silently kill the prompt.
    google.initialize({
      client_id: clientId,
      callback: (response: { credential?: string }) => {
        if (response?.credential) safeResolve({ ok: true, idToken: response.credential });
        else safeResolve({ ok: false, error: "no credential in GIS response" });
      },
      use_fedcm_for_prompt: true,
    });

    // Primary flow: GIS One-Tap prompt. When it works, our `callback`
    // fires with the credential.
    google.prompt((notification: any) => {
      // Legacy skip-detection — still useful in older Chrome/Edge that
      // haven't switched to FedCM yet. Under FedCM these are no-ops.
      try {
        if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
          // Fallback to a popup-based OAuth flow: renderButton into a
          // hidden container and programmatically click Google's
          // official button. This opens a real popup window and works
          // even when One-Tap is blocked (Safari third-party cookies,
          // restricted browser profiles, ad-blockers). If rendering
          // fails too, surface the Hebrew SMS-fallback toast.
          popupFallback(clientId, safeResolve);
        }
      } catch { /* predicate removed under FedCM — callback handles it */ }
    });

    // Safety net: if neither the callback nor the fallback resolves
    // within 45 seconds, bail out so "מתחבר..." doesn't stay stuck.
    setTimeout(() => {
      safeResolve({ ok: false, error: "לא הצלחנו לפתוח את חלון Google. נסה שוב או השתמש בכניסה עם מספר טלפון." });
    }, 45_000);
  });
}
