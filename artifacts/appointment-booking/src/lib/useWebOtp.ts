import { useEffect } from "react";

/**
 * Android Chrome WebOTP API hookup.
 *
 * When our SMS body ends with `@kavati.net #123456` (appended server-side
 * in `api-server/src/lib/whatsapp.ts :: sendOtp`), Chrome on Android
 * surfaces the 6-digit code as a keyboard suggestion next to the
 * matching `<input autocomplete="one-time-code">`. Calling
 * `navigator.credentials.get({ otp: { transport: ["sms"] } })` here
 * additionally lets us read the code programmatically and auto-submit
 * the form — so the user doesn't need to tap anything at all.
 *
 * iOS Safari does not implement WebOTP but still surfaces any short
 * numeric code via QuickType above the keyboard. That works off the
 * `autocomplete="one-time-code"` attribute alone — this hook becomes a
 * no-op there (the `OTPCredential` check fails).
 *
 * `enabled` gates when the listener should be live — pass `step === "otp"`
 * or similar so we don't eat an SMS on the phone-entry step. Only one
 * WebOTP request can be active per page, so keep it scoped to the
 * currently-visible OTP input.
 */
export function useWebOtp(enabled: boolean, onCode: (code: string) => void): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials as any)
      .get({ otp: { transport: ["sms"] }, signal: ac.signal })
      .then((otp: any) => {
        if (otp?.code) onCode(otp.code);
      })
      .catch(() => {
        /* User dismissed the prompt, the SMS never arrived within the
           implementation-defined timeout, or another WebOTP request
           aborted us. Nothing to do — the user can still type/paste. */
      });
    return () => ac.abort();
    // onCode intentionally excluded: we want exactly one listener per
    // `enabled` transition; re-creating it on every render would abort
    // the prior request before Chrome had a chance to resolve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
