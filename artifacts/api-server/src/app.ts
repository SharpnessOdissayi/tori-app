import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { db, businessesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const app: Express = express();

// Railway fronts the app with a single proxy layer. Without this,
// req.ip reports the proxy's loopback address, so per-IP rate limits
// collapse to "one IP for the whole internet". Trust exactly one hop.
app.set("trust proxy", 1);

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

// NOTE: the broadcast-unsubscribe `/api/u/:token` route lives in
// routes/public.ts (mounted under `/api` by the line above). It can't live
// at the app level at `/u/:token` because Railway's edge splits traffic by
// path prefix — only `/api/*` hits this server; every other URL is served
// from the SPA's static bucket, so a top-level handler here would never
// get invoked.

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
