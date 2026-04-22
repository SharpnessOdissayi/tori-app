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

const DEBUG_KEY = "kavati_push_debug";        // legacy — last entry only
const DEBUG_LIST_KEY = "kavati_push_debug_list"; // full sequence

type DebugEntry = { at: string; step: string; detail?: string };

function writeStep(step: string, detail?: string): void {
  try {
    const entry: DebugEntry = { at: new Date().toISOString(), step, detail };
    // Keep the last-entry key for backwards compatibility.
    localStorage.setItem(DEBUG_KEY, JSON.stringify(entry));
    // Append to the list — bounded to 40 entries so it doesn't grow forever.
    try {
      const raw = localStorage.getItem(DEBUG_LIST_KEY);
      const list: DebugEntry[] = raw ? JSON.parse(raw) : [];
      list.push(entry);
      if (list.length > 40) list.splice(0, list.length - 40);
      localStorage.setItem(DEBUG_LIST_KEY, JSON.stringify(list));
    } catch { /* ignore quota / parse failures */ }
    console.info("[push]", step, detail ?? "");
  } catch { /* storage can fail in weird WebViews — not fatal */ }
}

export function readPushDebug(): DebugEntry | null {
  try {
    const raw = localStorage.getItem(DEBUG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function readPushDebugList(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearPushDebug(): void {
  try {
    localStorage.removeItem(DEBUG_KEY);
    localStorage.removeItem(DEBUG_LIST_KEY);
  } catch {}
}

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

// Wrap the plugin in a plain object before returning from an async
// function. Capacitor 6 plugin proxies auto-respond to ANY property
// access — including `.then` — which makes JavaScript treat them as
// thenables when returned from an async function. The engine then
// "awaits" the proxy's .then, which calls a native method that
// doesn't exist and the promise hangs forever. Wrapping in `{ plugin }`
// (a plain object with no .then) prevents the thenable-unwrap.
async function loadPlugin(): Promise<{ plugin: any } | null> {
  writeStep("plugin_import_starting");
  try {
    const mod: any = await Promise.race([
      import("@capacitor/push-notifications"),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (mod === null) {
      writeStep("plugin_import_timeout", "8s");
      return null;
    }
    writeStep("plugin_import_done", `keys: ${Object.keys(mod).join(",")}`);
    const plugin = mod.PushNotifications ?? mod.default?.PushNotifications ?? null;
    if (!plugin) {
      writeStep("plugin_load_empty", `mod keys: ${Object.keys(mod).join(",")}`);
      return null;
    }
    writeStep("plugin_ready");
    return { plugin };
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

// Bump this when rebuilding, so the Settings diagnostic strip shows
// at a glance whether the installed APK is on the latest debug code.
const PUSH_BUILD = "v5";

export async function registerForPush(businessToken: string | null): Promise<void> {
  writeStep(`start_${PUSH_BUILD}`);
  if (!businessToken) { writeStep("no_token"); return; }
  writeStep("token_present");
  if (!isCapacitorNative()) { writeStep("not_native"); return; }
  writeStep("is_native");
  if (registered)    { writeStep("already_registered"); return; }
  writeStep("not_registered_yet");

  // Give Capacitor's native bridge a tick to finish bootstrapping before
  // we dynamically import the plugin. Empirically this prevents the
  // first-launch hang where import() resolves only after the bridge is
  // ready — on some devices that takes longer than the retry button's
  // patience, leaving the UI stuck at "start".
  await new Promise((r) => setTimeout(r, 500));

  const wrapped = await loadPlugin();
  writeStep("back_from_loadPlugin", wrapped ? "ok" : "null");
  if (!wrapped) { writeStep("plugin_unavailable"); return; }
  const Push = wrapped.plugin;
  writeStep("unwrapped_plugin");

  writeStep("before_listeners", `already_attached=${listenersAttached}`);
  if (!listenersAttached) {
    try {
      writeStep("attaching_registration");
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
      writeStep("attaching_registration_error");
      Push.addListener?.("registrationError", (err: any) => {
        writeStep("fcm_error", JSON.stringify(err)?.slice(0, 200));
      });
      writeStep("attaching_action_performed");
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
      writeStep("attaching_received");
      Push.addListener?.("pushNotificationReceived", () => { /* handled by bell */ });
      listenersAttached = true;
      writeStep("listeners_attached");
    } catch (err: any) {
      writeStep("listener_exception", String(err?.message ?? err));
    }
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

  // Register the notification channel the server sends with
  // (android.notification.channelId = "kavati-default"). Android 8+
  // silently drops incoming FCM messages whose channel isn't known.
  // createChannel is idempotent — calling it every launch is safe.
  try {
    writeStep("creating_channel");
    await Push.createChannel?.({
      id: "kavati-default",
      name: "קבעתי — התראות",
      description: "תורים חדשים, ביטולים ועדכוני מערכת",
      importance: 4, // HIGH — shows as a heads-up notification
      visibility: 1, // PUBLIC — show on lock screen
      sound: "default",
      vibration: true,
    });
    writeStep("channel_created");
  } catch (err: any) {
    writeStep("channel_exception", String(err?.message ?? err));
  }

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
