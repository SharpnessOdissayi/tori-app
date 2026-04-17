import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

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

app.use("/api", router);

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
