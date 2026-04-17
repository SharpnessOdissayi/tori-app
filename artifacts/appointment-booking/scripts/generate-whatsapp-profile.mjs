// One-off: render public/logo.svg into a WhatsApp-profile-ready PNG.
//
// Run with:  node scripts/generate-whatsapp-profile.mjs
//
// Output:
//   resources/whatsapp-profile.png  640×640, white background, logo fills the canvas
//
// WhatsApp displays profile photos as a circle, so the source image MUST
// be square. The logo.svg has viewBox 841.89×595.28 (landscape) with the
// actual ink occupying only the middle band — a naïve "contain" fit
// leaves 60%+ of the canvas blank, which makes the wordmark tiny in the
// circular crop. Strategy:
//   1. Render the SVG big (density 384) at its native aspect.
//   2. sharp.trim() auto-crops the transparent whitespace around the
//      artwork, so we're working with the tight bbox of the logo only.
//   3. Resize the trimmed logo to fill (width-limited for a wordmark)
//      inside a SAFE-zone inset of the final canvas.
//   4. Composite centered on a white square.

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "public/logo.svg");
const OUT = resolve(ROOT, "resources/whatsapp-profile.png");

const SIZE = 640;
// Owner wants the logo to take ~90% of the canvas width — 5% padding
// on each side. WhatsApp's circular crop still has a small safe zone
// at the very corners, but the logo itself is wide enough that the
// edges it reaches fall inside the circle.
const PAD_RATIO = 0.05;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const inner = Math.round(SIZE * (1 - PAD_RATIO * 2));

const svgBuf = await readFile(SRC);

// Raster the SVG at high density, then trim surrounding transparency
// so the logo is the only thing we're measuring against. threshold: 10
// tolerates anti-aliased edges (sharp compares against the top-left
// corner by default, which here is fully transparent).
const trimmed = await sharp(svgBuf, { density: 384 })
  .png()
  .trim({ threshold: 10 })
  .toBuffer();

const { width: tW, height: tH } = await sharp(trimmed).metadata();

// Fit trimmed logo into the inner box while preserving aspect ratio.
const scale = Math.min(inner / (tW ?? inner), inner / (tH ?? inner));
const fitW = Math.round((tW ?? inner) * scale);
const fitH = Math.round((tH ?? inner) * scale);

const resized = await sharp(trimmed).resize(fitW, fitH).png().toBuffer();

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: WHITE },
})
  .composite([{ input: resized, gravity: "center" }])
  .png()
  .toFile(OUT);

console.log(`✓ ${OUT}  (${SIZE}×${SIZE}, logo ${fitW}×${fitH})`);
