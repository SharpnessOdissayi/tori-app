/**
 * Firebase Cloud Messaging — server-side push sender.
 *
 * We don't install the Firebase app at module import time: the
 * `FIREBASE_SERVICE_ACCOUNT_JSON` env var is loaded lazily so a
 * missing/invalid config doesn't crash the whole api-server on boot.
 * If the env var isn't set, `sendPushToBusiness()` becomes a no-op
 * with a single warn log — useful during the rollout period before
 * the Firebase project is fully configured on Railway.
 *
 * Supported notification kinds (keep the strings in sync with the
 * corresponding `push_prefs` keys the frontend toggles):
 *   new_booking, pending_approval, cancellation, reschedule,
 *   waitlist_join, new_review, system
 *
 * `data.route` is a relative SPA path the mobile app deep-links to
 * when the notification is tapped (e.g. /dashboard?tab=approvals).
 */

import { db, pushTokensTable, businessesTable, staffMembersTable } from "@workspace/db";
import { eq, and, inArray, or, isNull } from "drizzle-orm";
import { logger } from "./logger";

let adminPromise: Promise<any> | null = null;

async function getAdmin(): Promise<any | null> {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) return null;

  if (!adminPromise) {
    adminPromise = (async () => {
      try {
        const admin = await import("firebase-admin");
        if (admin.apps.length > 0) return admin;
        const credential = JSON.parse(raw);
        admin.initializeApp({
          credential: admin.credential.cert(credential),
        });
        return admin;
      } catch (err) {
        logger.error({ err }, "[push] Firebase admin init failed — pushes disabled");
        return null;
      }
    })();
  }
  return adminPromise;
}

export type PushKind =
  | "new_booking"
  | "pending_approval"
  | "cancellation"
  | "reschedule"
  | "waitlist_join"
  | "new_review"
  | "system";

export type PushPayload = {
  kind:  PushKind;
  title: string;
  body:  string;
  // Deep-link the app opens when the notification is tapped. SPA route,
  // not a full URL. e.g. /dashboard?tab=appointments&highlight=123
  route?: string;
  // Optional extra metadata (appointmentId, customerPhone, etc.) —
  // delivered to the app as a plain object of strings.
  data?: Record<string, string>;
};

/**
 * Dispatch a push to every device registered for this notification's
 * audience. Routing rules:
 *   · staffMemberId omitted → send to the business OWNER only (rows
 *     with push_tokens.staff_member_id IS NULL).
 *   · staffMemberId provided → send to that staff's devices AND the
 *     owner's devices (owner always sees everything).
 *
 * Each recipient's per-kind opt-out is honoured individually — one
 * send call fan-outs only to recipients who haven't disabled this
 * notification type in Settings.
 */
export async function sendPushToBusiness(args: {
  businessId:      number;
  staffMemberId?:  number | null;
  payload:         PushPayload;
  // When true and staffMemberId is set, push ONLY to the staff's devices,
  // not also to the owner. Use this for owner-initiated actions where
  // the owner already knows (e.g. owner schedules a job for staff X —
  // staff X needs to see it, but the owner just pressed the button).
  skipOwner?:      boolean;
}): Promise<void> {
  const { businessId, staffMemberId, payload, skipOwner } = args;

  const admin = await getAdmin();
  if (!admin) return; // Firebase not configured — silent no-op

  // Fetch tokens for the right audience.
  const recipientFilter = staffMemberId
    ? (skipOwner
        ? eq(pushTokensTable.staffMemberId, staffMemberId) // staff only
        : or(
            isNull(pushTokensTable.staffMemberId),            // owner's devices
            eq(pushTokensTable.staffMemberId, staffMemberId), // this specific staff
          ))
    : isNull(pushTokensTable.staffMemberId);              // owner only

  const tokens = await db
    .select()
    .from(pushTokensTable)
    .where(and(
      eq(pushTokensTable.businessId, businessId),
      recipientFilter!,
    ));

  if (tokens.length === 0) return;

  // Apply per-user opt-in. For each token, look up the owning account's
  // push_prefs and drop the row if this kind is explicitly disabled.
  const ownerTokens = tokens.filter(t => t.staffMemberId == null);
  const staffTokens = tokens.filter(t => t.staffMemberId != null);

  let ownerAllowed = true;
  if (ownerTokens.length > 0) {
    const [biz] = await db
      .select({ prefs: businessesTable.pushPrefs })
      .from(businessesTable)
      .where(eq(businessesTable.id, businessId));
    ownerAllowed = kindEnabled(biz?.prefs, payload.kind);
  }

  const staffAllowedMap = new Map<number, boolean>();
  if (staffTokens.length > 0) {
    const staffIds = Array.from(new Set(staffTokens.map(t => t.staffMemberId as number)));
    const staffRows = await db
      .select({ id: staffMembersTable.id, prefs: staffMembersTable.pushPrefs })
      .from(staffMembersTable)
      .where(inArray(staffMembersTable.id, staffIds));
    for (const s of staffRows) staffAllowedMap.set(s.id, kindEnabled(s.prefs, payload.kind));
  }

  const deliverable = tokens.filter(t =>
    t.staffMemberId == null ? ownerAllowed : (staffAllowedMap.get(t.staffMemberId) ?? true)
  );
  if (deliverable.length === 0) return;

  // Build the FCM payload. Android auto-renders a notification from
  // the `notification` block; `data` is delivered regardless and is
  // where we stash the deep-link route. Collapse via tag=kind so
  // repeat notifications of the same type replace rather than stack.
  const message: any = {
    notification: {
      title: payload.title,
      body:  payload.body,
    },
    android: {
      priority: "high" as const,
      notification: {
        tag:            payload.kind,
        channelId:      "kavati-default",
        defaultSound:   true,
        defaultVibrateTimings: true,
      },
    },
    data: {
      kind:  payload.kind,
      route: payload.route ?? "/dashboard",
      ...(payload.data ?? {}),
    },
  };

  // sendEachForMulticast: one HTTP request, per-token results back.
  try {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: deliverable.map(t => t.deviceToken),
      ...message,
    });

    logger.info(
      { businessId, staffMemberId, kind: payload.kind, sent: res.successCount, failed: res.failureCount },
      "[push] sent",
    );

    // Prune unregistered/invalid tokens so the DB doesn't accumulate
    // garbage. Firebase sends these specific error codes when a token
    // is stale (app uninstalled, user signed out on that device).
    const deadTokens: string[] = [];
    res.responses.forEach((r: any, i: number) => {
      if (r.success) return;
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        deadTokens.push(deliverable[i].deviceToken);
      }
    });
    if (deadTokens.length) {
      await db.delete(pushTokensTable).where(inArray(pushTokensTable.deviceToken, deadTokens));
      logger.info({ count: deadTokens.length }, "[push] pruned dead tokens");
    }
  } catch (err) {
    logger.error({ err, businessId, kind: payload.kind }, "[push] send failed");
  }
}

function kindEnabled(prefs: any, kind: PushKind): boolean {
  // null / undefined → all kinds default-on
  if (!prefs || typeof prefs !== "object") return true;
  return prefs[kind] !== false;
}
