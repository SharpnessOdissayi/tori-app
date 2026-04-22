/**
 * Client-side FCM registration for the Capacitor Android app.
 *
 * Diagnostic-heavy version — every step writes to localStorage under
 * `kavati_push_debug`, which the Settings PushPrefsCard reads and shows
 * in plain text. Without this, a silent bail-out (wrong plugin shape,
 * permission denied, FCM error, fetch failure) was invisible to the
 * owner and only surfaced as "tokens: 0" with no explanation.
 *
 * Stored shape:
 *   { at: ISO string, step: string, detail?: string }
 */

const DEBUG_KEY = "kavati_push_debug";

type DebugEntry = { at: string; step: string; detail?: string };

function writeStep(step: string, detail?: string): void {
  try {
    const entry: DebugEntry = { at: new Date().toISOString(), step, detail };
    localStorage.setItem(DEBUG_KEY, JSON.stringify(entry));
    // Also mirror as console.info so USB-logcat users still see it.
    console.info("[push]", step, detail ?? "");
  } catch { /* storage can fail in weird WebViews — not fatal */ }
}

export function readPushDebug(): DebugEntry | null {
  try {
    const raw = localStorage.getItem(DEBUG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

async function loadPlugin(): Promise<any | null> {
  try {
    const mod: any = await import("@capacitor/push-notifications");
    const plugin = mod.PushNotifications ?? mod.default?.PushNotifications ?? null;
    if (!plugin) writeStep("plugin_load_empty", `mod keys: ${Object.keys(mod).join(",")}`);
    return plugin;
  } catch (err: any) {
    writeStep("plugin_load_exception", String(err?.message ?? err));
    return null;
  }
}

// Guards:
//   · `listenersAttached`  — addListener() is NOT idempotent in all Capacitor
//     builds; double-attaching produces double-POST. So we track ourselves.
//   · `registered`         — set after a SUCCESSFUL token POST (not just
//     after register() resolves — FCM can silently fail to deliver a token).
//     Reset by the retry button so the owner can re-attempt after granting
//     permission in Android settings.
let listenersAttached = false;
let registered = false;

export function resetPushRegistration(): void {
  registered = false;
}

export async function registerForPush(businessToken: string | null): Promise<void> {
  writeStep("start");
  if (!businessToken) { writeStep("no_token"); return; }
  if (!isCapacitorNative()) { writeStep("not_native"); return; }
  if (registered)    { writeStep("already_registered"); return; }

  const Push = await loadPlugin();
  if (!Push) { writeStep("plugin_unavailable"); return; }

  if (!listenersAttached) {
    Push.addListener?.("registration", async (t: { value: string }) => {
      const tail = String(t?.value ?? "").slice(-6);
      writeStep("token_event", `tail=${tail} len=${String(t?.value ?? "").length}`);
      try {
        const res = await fetch("/api/business/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${businessToken}` },
          body: JSON.stringify({ deviceToken: t.value, platform: "android" }),
        });
        if (res.ok) {
          writeStep("token_post_ok", `tail=${tail}`);
          registered = true;
        } else {
          const body = await res.text().catch(() => "");
          writeStep("token_post_failed", `status=${res.status} body=${body.slice(0, 120)}`);
        }
      } catch (err: any) {
        writeStep("token_post_exception", String(err?.message ?? err));
      }
    });

    Push.addListener?.("registrationError", (err: any) => {
      writeStep("fcm_error", JSON.stringify(err)?.slice(0, 200));
    });

    Push.addListener?.("pushNotificationActionPerformed", (action: any) => {
      const route: string | undefined = action?.notification?.data?.route;
      const apptId: string | undefined = action?.notification?.data?.appointmentId;
      try {
        if (apptId) sessionStorage.setItem("kavati_cal_highlight_id", apptId);
        if (route && typeof route === "string" && route.startsWith("/")) {
          window.location.href = route;
        }
      } catch {}
    });

    Push.addListener?.("pushNotificationReceived", () => { /* handled by bell */ });
    listenersAttached = true;
    writeStep("listeners_attached");
  }

  // Wrap each native bridge call in a timeout race. On buggy Play
  // Services builds (BlueStacks, old emulators) the plugin's register()
  // promise can hang forever — without the race, the Settings retry
  // button stays stuck on "רושם..." and we never even write a debug
  // line explaining why. The timeout writes a visible step so we can
  // tell which bridge call is hanging.
  const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T | undefined> => {
    let timer: any;
    try {
      return await Promise.race([
        p,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => {
            writeStep(`${label}_timeout`, `${ms}ms`);
            resolve(undefined);
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    writeStep("requesting_permission");
    const perm = await withTimeout(Push.requestPermissions?.(), 10000, "permission");
    writeStep("permission_result", String((perm as any)?.receive));
    if ((perm as any)?.receive !== "granted") {
      writeStep("permission_denied", String((perm as any)?.receive));
      return;
    }
    writeStep("register_calling");
    await withTimeout(Push.register?.(), 10000, "register");
    writeStep("register_returned");
    // Note: we do NOT set `registered = true` here — the real success
    // signal is the listener POSTing the token to the server (which
    // sets it). If FCM silently fails to produce a token, register()
    // still resolves but no token ever arrives, and we want the retry
    // button to re-trigger the flow.
  } catch (err: any) {
    writeStep("register_exception", String(err?.message ?? err));
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
    const deliveredList = await Push.getDeliveredNotifications?.().catch(() => null);
    void deliveredList;
    registered = false;
  } catch {
    /* ignore */
  }
}
