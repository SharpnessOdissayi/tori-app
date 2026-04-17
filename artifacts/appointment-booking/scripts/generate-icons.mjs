// Regenerate PWA + Capacitor icons from /public/icon.svg.
//
// Run with:  node scripts/generate-icons.mjs
//
// Outputs:
//   public/icon-192.png          192×192, transparent bg  (manifest "any")
//   public/icon-512.png          512×512, transparent bg  (manifest "any" + Play Store upload)
//   public/icon-512-maskable.png 512×512, white bg + 10% safe-zone padding (manifest "maskable")
//   public/apple-touch-icon.png  180×180, white bg        (iOS home screen, no transparency)
//   resources/icon.png           1024×1024, transparent bg (source for @capacitor/assets)
//   resources/splash.png         2732×2732, white bg + centered logo (splash screens)
//
// The SVG viewBox is 841.89×595.28 (landscape); sharp's fit:"contain" centers
// it inside a square and preserves aspect ratio, so the icon never stretches.

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "public/icon.svg");

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function renderSquare({ size, background, padRatio = 0 }) {
  const svgBuf = await readFile(SRC);
  const inner = Math.round(size * (1 - padRatio * 2));
  // Render the SVG large enough for the target density, then fit it
  // into a square canvas with the requested background.
  const iconBuf = await sharp(svgBuf, { density: 384 })
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: iconBuf, gravity: "center" }])
    .png()
    .toBuffer();
}

async function write(path, buf) {
  await sharp(buf).toFile(resolve(ROOT, path));
  console.log(`  ✓ ${path}`);
}

const targets = [
  { out: "public/icon-192.png",          size: 192,  background: TRANSPARENT, padRatio: 0 },
  { out: "public/icon-512.png",          size: 512,  background: TRANSPARENT, padRatio: 0 },
  { out: "public/icon-512-maskable.png", size: 512,  background: WHITE,       padRatio: 0.10 },
  { out: "public/apple-touch-icon.png",  size: 180,  background: WHITE,       padRatio: 0 },
  { out: "resources/icon.png",           size: 1024, background: TRANSPARENT, padRatio: 0 },
  // Splash is 2732 with the icon taking ~25% of the canvas so Capacitor's
  // splash plugin renders a calm centered logo rather than a stretched hero.
  { out: "resources/splash.png",         size: 2732, background: WHITE,       padRatio: 0.375 },
];

console.log(`Generating icons from ${SRC}`);
for (const t of targets) {
  const buf = await renderSquare(t);
  await write(t.out, buf);
}
console.log("Done.");
