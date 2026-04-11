// Static file server with API proxy for production deployment
import { createServer } from "http";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "dist");
const PORT = process.env.PORT || 8080;
const API_URL = process.env.API_URL || process.env.VITE_API_BASE_URL || "";

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function proxyToApi(req, res) {
  // Strip /api prefix and call the real API server
  const rawBase = API_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
  if (!rawBase) {
    res.writeHead(502);
    res.end("API_URL not configured");
    return;
  }

  const target = new URL(rawBase);
  const isHttps = target.protocol === "https:";
  const reqFn = isHttps ? httpsRequest : httpRequest;

  const options = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
  };

  const proxy = reqFn(options, (apiRes) => {
    res.writeHead(apiRes.statusCode, apiRes.headers);
    apiRes.pipe(res);
  });

  proxy.on("error", () => { res.writeHead(502); res.end("Bad Gateway"); });
  req.pipe(proxy);
}

createServer(async (req, res) => {
  // Proxy all /api/* requests to the API server
  if (req.url.startsWith("/api/") || req.url === "/api") {
    proxyToApi(req, res);
    return;
  }

  let filePath = join(DIST, req.url === "/" ? "/index.html" : req.url);
  const ext = extname(filePath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    // SPA fallback
    try {
      const data = await readFile(join(DIST, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
}).listen(PORT, () => console.log(`Frontend serving on port ${PORT}, proxying /api/* to ${API_URL}`));
