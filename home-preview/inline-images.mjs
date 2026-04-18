// Rewrite home-preview/index.html so every local image reference becomes an
// inline `data:` URI. Fixes the blank-screen phones that happen when the user
// opens index.html via file:// — OneDrive placeholders + browser file://
// security both love to drop local image requests on the floor. The inlined
// HTML has zero external file dependencies (except fonts + Tailwind CDN).
//
// Run from the project root:
//   node home-preview/inline-images.mjs

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = resolve(__dirname, "index.html");

const MIME = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
};

async function toDataUri(assetPath) {
  const buf = await readFile(assetPath);
  const ext = extname(assetPath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  if (ext === ".svg") {
    // SVGs can stay as text and are more compact URL-encoded.
    const svgText = buf.toString("utf8");
    return `data:${mime};utf8,${encodeURIComponent(svgText)}`;
  }
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const html = await readFile(HTML_PATH, "utf8");

// Match src="..." or href="..." that points at a local (relative) path.
// Only rewrites paths ending in a known image extension.
const ATTR_RE = /\b(src|href)="((?:\.\/|\.\.\/)[^"]+\.(?:png|jpg|jpeg|svg|webp))"/gi;

const cache = new Map();
const rewritten = await replaceAsync(html, ATTR_RE, async (_, attr, relPath) => {
  const abs = resolve(__dirname, relPath);
  if (!cache.has(abs)) cache.set(abs, await toDataUri(abs));
  return `${attr}="${cache.get(abs)}"`;
});

const OUT = resolve(__dirname, "index.html");
await writeFile(OUT, rewritten, "utf8");
console.log(`✓ Inlined ${cache.size} asset(s) → ${OUT}`);

async function replaceAsync(str, re, asyncReplacer) {
  const parts = [];
  let lastIndex = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(lastIndex, m.index));
    parts.push(await asyncReplacer(m[0], ...m.slice(1)));
    lastIndex = m.index + m[0].length;
  }
  parts.push(str.slice(lastIndex));
  return parts.join("");
}
