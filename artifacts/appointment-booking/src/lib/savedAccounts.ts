// Facebook-style multi-account switcher for the business dashboard.
//
// Every successful login/auth-me resolve adds an entry to this list.
// Clicking a saved entry (from the hamburger menu or the login page)
// swaps `biz_token` and hard-reloads, which resets all React Query
// caches so the new session paints cleanly.
//
// Logout removes the active biz_token but keeps the saved list —
// re-login is then a single tap from the same device.
//
// Storage: localStorage (persists across tabs/restarts). Capped at 5
// entries; oldest silently drops out when a 6th is added. Keyed by
// JWT so switching back to the same account refreshes the row rather
// than duplicating it.

export type SavedBizAccount = {
  token: string;
  businessName: string;
  // The staff's name for staff sessions, else the business's ownerName.
  // Used as the primary display label in the switcher list.
  displayName: string;
  // "owner" or "staff" — drives the little pill next to the name.
  role: "owner" | "staff";
  // Optional contact/image for the avatar circle and the tooltip.
  phone: string | null;
  avatarUrl: string | null;
  savedAt: number;
};

const KEY = "kavati_saved_biz_accounts";
const MAX_SAVED = 5;

function safeRead(): SavedBizAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => x && typeof x.token === "string" && typeof x.displayName === "string"
    );
  } catch {
    return [];
  }
}

function safeWrite(list: SavedBizAccount[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function listSavedAccounts(): SavedBizAccount[] {
  return safeRead();
}

// Upsert: if a row with the same token already exists, update it in place
// (so the displayName/avatar refreshes as the business profile changes).
// Otherwise push to the front so the most-recently-used account is at
// the top of the switcher list.
export function saveAccount(account: SavedBizAccount): void {
  const list = safeRead();
  const withoutDup = list.filter((a) => a.token !== account.token);
  withoutDup.unshift(account);
  safeWrite(withoutDup.slice(0, MAX_SAVED));
}

export function removeSavedAccount(token: string): void {
  safeWrite(safeRead().filter((a) => a.token !== token));
}

// Apply a saved account: copy its token into localStorage.biz_token
// and hard-reload so every in-memory query cache resets. We prefer
// localStorage (persistent) over sessionStorage because account
// switching implies the user wants to keep this session around — they
// can always "sign out" to clear it.
export function switchToSavedAccount(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("biz_token", token);
    sessionStorage.removeItem("biz_token");
  } catch {}
  // Also wipe the per-session staff filter — it's repopulated from
  // /auth/me on the next boot, but leaving the old staff's filter in
  // place during the reload causes a flicker in BusinessCalendar.
  try {
    sessionStorage.removeItem("kavati_staff_filter_id");
    sessionStorage.removeItem("kavati_staff_filter_name");
  } catch {}
  window.location.reload();
}
