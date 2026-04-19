import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { db, businessesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { verifyUnsubscribeToken } from "./lib/unsubscribeToken";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Custom-domain rewrite ──────────────────────────────────────────────────
// Mounted BEFORE the /api router so that after we rewrite req.url the
// api-server's /api/s/:slug handler picks it up.
//
// When a Pro business connects their own domain (e.g. book.mybusiness.co.il)
// we want every hit on that host to land on the share page /api/s/<slug>
// — the HTML any scraper (WhatsApp/FB) sees will have that business's
// og:image + og:title + og:description, and human visitors bounce through
// to the booking page with a logo-branded splash.
//
// customDomain → slug cache refreshes every 2 minutes. An in-memory
// map is plenty: each Pro business has at most one custom domain, and
// we're talking about hundreds of rows, not millions.
let customDomainCache: Map<string, string> = new Map();
let customDomainCacheAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000;

async function refreshCustomDomainCache() {
  try {
    const rows = await db
      .select({ domain: businessesTable.customDomain, slug: businessesTable.slug })
      .from(businessesTable)
      .where(eq(businessesTable.customDomainVerified, true));
    const next = new Map<string, string>();
    for (const r of rows) {
      const d = (r.domain ?? "").trim().toLowerCase();
      if (d) next.set(d, r.slug);
    }
    customDomainCache = next;
    customDomainCacheAt = Date.now();
  } catch (e) {
    logger.error({ err: e }, "customDomain cache refresh failed");
  }
}

// Hostnames that should NOT be treated as a custom domain — Kavati's
// own primary domain + any Railway internal host + localhost.
const CANONICAL_HOSTS = new Set([
  "kavati.net",
  "www.kavati.net",
  "localhost",
]);
function isCanonicalHost(host: string): boolean {
  const h = host.toLowerCase().split(":")[0];
  return CANONICAL_HOSTS.has(h)
    || h.endsWith(".up.railway.app")
    || h.endsWith(".railway.app");
}

app.use(async (req: Request, _res: Response, next: NextFunction) => {
  const host = (req.headers.host || "").toLowerCase().split(":")[0];
  if (!host || isCanonicalHost(host)) return next();
  // Don't intercept /api/* on a custom domain — a business might still
  // want to hit its own host's API routes programmatically.
  if (req.path.startsWith("/api/")) return next();

  if (Date.now() - customDomainCacheAt > CACHE_TTL_MS) await refreshCustomDomainCache();
  const slug = customDomainCache.get(host);
  if (!slug) return next();

  // Rewrite the URL path so the downstream /api/s/:slug handler picks
  // this up. We DON'T redirect (302) — keeping the owner's brand host
  // in the address bar makes for a cleaner "your link" feel.
  req.url = `/api/s/${encodeURIComponent(slug)}`;
  return next();
});

app.use("/api", router);

// ─── Broadcast unsubscribe link ─────────────────────────────────────────────
// Each bulk SMS includes a "להסרה <short-url>" footer pointing at
// https://<host>/u/<token>. The token encodes (businessId, phone) so the
// handler below can drop the right subscriber without asking any follow-up
// questions — one tap and they're out, as תיקון 40 requires.
//
// Kept at the app level (not inside /api/public) so the URL is as short
// as possible; every extra character is SMS credit the owner pays for.
//
// The handler is idempotent: clicking the link multiple times will keep
// showing the "הוסרת בהצלחה" page even after the subscriber row was
// already deleted on the first click.
app.get("/u/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "");
  const decoded = verifyUnsubscribeToken(token);

  // Brand colours mirror the SPA's --primary (#3c92f0) so the page feels
  // like part of Kavati, not a random server error wall.
  const pageShell = (title: string, body: string, accent = "#3c92f0") => `<!doctype html>
<html lang="he" dir="rtl"><head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>${title} — קבעתי</title>
  <style>
    body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Rubik,Arial,sans-serif;
         display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;padding:24px;}
    .card{background:#fff;border-radius:20px;box-shadow:0 10px 30px rgba(15,23,42,.08);
          padding:32px 28px;max-width:420px;width:100%;text-align:center;}
    .icon{width:64px;height:64px;border-radius:50%;display:inline-flex;align-items:center;
          justify-content:center;margin-bottom:16px;background:${accent}15;color:${accent};font-size:30px;}
    h1{font-size:20px;margin:8px 0 12px;font-weight:700;}
    p{font-size:15px;line-height:1.55;color:#475569;margin:6px 0;}
    .brand{margin-top:24px;font-size:12px;color:#94a3b8;}
    a{color:${accent};text-decoration:none;font-weight:600;}
  </style>
</head><body><div class="card">${body}<div class="brand">נוהל הסרה מרשימת תפוצה · <a href="https://www.kavati.net">קבעתי</a></div></div></body></html>`;

  if (!decoded) {
    res.status(400).set("Content-Type", "text/html; charset=utf-8").send(pageShell(
      "קישור לא תקין",
      `<div class="icon" style="background:#fee2e2;color:#dc2626">✕</div>
       <h1>הקישור לא תקין</h1>
       <p>ייתכן שהקישור נפגם בהעתקה. אם ההודעה הגיעה אליך ב-SMS,
          לחצ/י על הקישור ישירות מתוך ההודעה במקום להעתיקו.</p>`,
    "#dc2626"));
    return;
  }

  try {
    // Insert the audit row first so even if the DELETE below fails the
    // opt-out intent is recorded; send filters already check this table.
    await db.execute(sql`
      INSERT INTO broadcast_unsubscribes (business_id, phone_number, source)
      VALUES (${decoded.businessId}, ${decoded.phone}, 'unsub_link')
      ON CONFLICT (business_id, phone_number) DO NOTHING
    `);
    await db.execute(sql`
      DELETE FROM broadcast_subscribers
      WHERE business_id = ${decoded.businessId} AND phone_number = ${decoded.phone}
    `);
  } catch (e: any) {
    logger.error({ err: e?.message ?? e, businessId: decoded.businessId }, "[/u] opt-out write failed");
    res.status(500).set("Content-Type", "text/html; charset=utf-8").send(pageShell(
      "אירעה שגיאה",
      `<div class="icon" style="background:#fee2e2;color:#dc2626">!</div>
       <h1>אירעה שגיאה זמנית</h1>
       <p>לא הצלחנו להסיר אותך ברגע זה. נסה שוב בעוד דקה או השב/י הסר ל-SMS המקורי.</p>`,
      "#dc2626"));
    return;
  }

  const [biz] = await db
    .select({ name: businessesTable.name })
    .from(businessesTable)
    .where(eq(businessesTable.id, decoded.businessId));
  const bizName = biz?.name ?? "העסק";

  res.status(200).set("Content-Type", "text/html; charset=utf-8").send(pageShell(
    "הוסרת מרשימת התפוצה",
    `<div class="icon">✓</div>
     <h1>הוסרת בהצלחה</h1>
     <p>לא תקבל/י יותר הודעות תפוצה מ-<strong>${escapeHtml(bizName)}</strong>.</p>
     <p style="margin-top:14px;font-size:13px;color:#64748b;">
       זה משפיע רק על העסק הזה — שאר העסקים שאת/ה לקוח/ה שלהם ימשיכו לשלוח כרגיל.
     </p>`,
  ));
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── SPA static serving + client-side routing fallback ──────────────────────
// When Railway routes everything (not just /api) to this server, we need to
// return the built SPA's index.html for any path the client-side router owns
// (/, /book/:slug, /portal, /register, /dashboard, …). Otherwise Express
// returns a default 404 ("Cannot GET /book/lilash") for routes it doesn't
// know about, breaking every shared profile link.
//
// Runtime path resolution:
// - esbuild bundles the api-server into artifacts/api-server/dist/index.mjs
// - the SPA build lives at artifacts/appointment-booking/dist
// - relative from the compiled api-server entry: ../../appointment-booking/dist
//
// We also check a couple of alternate locations so this keeps working if the
// deploy layout changes (e.g. Railway copies the SPA into api-server/public).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const spaCandidates = [
  path.resolve(__dirname, "../../appointment-booking/dist"),
  path.resolve(__dirname, "../appointment-booking/dist"),
  path.resolve(__dirname, "./public"),
  path.resolve(process.cwd(), "artifacts/appointment-booking/dist"),
  path.resolve(process.cwd(), "dist"),
];
const spaDist = spaCandidates.find(p => fs.existsSync(path.join(p, "index.html")));

if (spaDist) {
  logger.info({ spaDist }, "SPA dist found — serving static files + SPA fallback");
  app.use(express.static(spaDist, { index: false, maxAge: "1h" }));
  // SPA fallback for any non-/api GET. Request with a file extension (.js,
  // .css, .png, …) that wasn't matched by express.static returns a real 404,
  // which is what we want — helps catch missing assets instead of masking
  // them behind index.html.
  app.get(/^\/(?!api\/).*/, (req, res, next) => {
    if (/\.[a-zA-Z0-9]{2,5}$/.test(req.path)) return next();
    res.sendFile(path.join(spaDist, "index.html"));
  });
} else {
  logger.warn({ spaCandidates }, "SPA dist not found — /book/:slug and other client routes will 404 from this server");
}

export default app;
