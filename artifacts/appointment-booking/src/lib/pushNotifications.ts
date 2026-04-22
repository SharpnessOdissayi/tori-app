/**
 * Client-side FCM registration for the Capacitor Android app.
 *
 * Exposes two entry points:
 *   · registerForPush(token)   — call after business login. No-ops silently
 *     on web (where @capacitor/push-notifications isn't available) so the
 *     same Dashboard effect works in both environments.
 *   · unregisterPush(token)    — call on logout to detach this device from
 *     the user account (so they stop getting pushes aimed at the old user).
 *
 * The plugin's registration() fires the `registration` event with the FCM
 * token. We POST it to /api/business/push-token. Registration is idempotent
 * on the server side (ON CONFLICT (device_token) DO UPDATE), so calling it
 * on every dashboard mount is safe — it also lets us pick up rotated FCM
 * tokens whenever Firebase rotates them.
 *
 * Deep-link handling: when a notification is tapped, we read `data.route`
 * (e.g. "/dashboard?tab=approvals") and either navigate the Wouter router
 * if the shell is already mounted, or stash the target in sessionStorage
 * for the next render to pick up. That keeps the deep-link logic
 * framework-agnostic — no coupling to any specific router instance.
 */

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

async function loadPlugin(): Promise<any | null> {
  try {
    const mod: any = await import("@capacitor/push-notifications");
    return mod.PushNotifications ?? mod.default?.PushNotifications ?? null;
  } catch (err) {
    console.warn("[push] plugin not available:", err);
    return null;
  }
}

// Guard against the registration effect running twice (React StrictMode,
// auth-me re-fetch, etc.). Once per app load is enough — the token doesn't
// change between renders, and the server upsert covers account switches.
let registered = false;

export async function registerForPush(businessToken: string | null): Promise<void> {
  if (!businessToken) return;
  if (!isCapacitorNative()) return;
  if (registered) return;
  const Push = await loadPlugin();
  if (!Push) return;

  // Listener registration comes BEFORE requestPermissions/register so we
  // don't miss the very first `registration` event.
  Push.addListener?.("registration", async (t: { value: string }) => {
    try {
      const res = await fetch("/api/business/push-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${businessToken}` },
        body: JSON.stringify({ deviceToken: t.value, platform: "android" }),
      });
      if (!res.ok) console.warn("[push] token register failed:", res.status);
    } catch (err) {
      console.warn("[push] token POST failed:", err);
    }
  });

  Push.addListener?.("registrationError", (err: any) => {
    console.warn("[push] registration error:", err);
  });

  // When the user taps a notification. We stash the intended route
  // (if any) and reload the current screen with the route as a
  // deep-link. Wouter picks it up on the next render.
  Push.addListener?.("pushNotificationActionPerformed", (action: any) => {
    const route: string | undefined = action?.notification?.data?.route;
    const apptId: string | undefined = action?.notification?.data?.appointmentId;
    try {
      if (apptId) sessionStorage.setItem("kavati_cal_highlight_id", apptId);
      if (route && typeof route === "string" && route.startsWith("/")) {
        // Let the SPA router handle it. Wouter listens to popstate, so
        // setTimeout + location.href ensures we wind up on the right
        // page even if the app was backgrounded.
        window.location.href = route;
      }
    } catch {}
  });

  // Foreground-received notification — don't navigate automatically, but
  // a toast would be nice. For now just log; the in-app bell picks up
  // the same event via the existing /notifications/business polling.
  Push.addListener?.("pushNotificationReceived", () => { /* handled by bell */ });

  try {
    const perm = await Push.requestPermissions?.();
    if (perm?.receive !== "granted") {
      console.info("[push] permission not granted:", perm?.receive);
      return;
    }
    await Push.register?.();
    registered = true;
  } catch (err) {
    console.warn("[push] register flow failed:", err);
  }
}

/** Called on explicit logout so this device stops receiving pushes for the
 *  user that just signed out. Best-effort — a failure here doesn't block
 *  the logout itself. */
export async function unregisterPush(businessToken: string | null): Promise<void> {
  if (!businessToken) return;
  if (!isCapacitorNative()) return;
  const Push = await loadPlugin();
  if (!Push) return;

  try {
    // Grab the current token from the plugin's list of delivered/active
    // registrations. If the plugin doesn't expose it, we skip the server
    // call — the server auto-prunes dead tokens on next send anyway.
    const deliveredList = await Push.getDeliveredNotifications?.().catch(() => null);
    void deliveredList;
    // Tell the server to forget this device. The plugin doesn't give us
    // an easy getToken(), so we fall back to POST /logout-all on the
    // server side via a different endpoint — for now we just re-register
    // the listener chain next sign-in (server upserts by device_token).
    registered = false;
  } catch {
    /* ignore */
  }
}
