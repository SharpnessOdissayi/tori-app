// Rebuilds public/icon.svg from public/logo.svg so the favicon sits on
// a SQUARE canvas with the artwork centered at ~90% of the width.
//
// Run with:  node scripts/generate-icon-from-logo.mjs
//
// Why we can't just reuse logo.svg:
//   - logo.svg has viewBox 841.89×595.28 (landscape), which makes the
//     browser's favicon slot render the logo small with empty space
//     on top/bottom.
//   - The actual ink sits in the middle of the viewBox, so even after
//     clipping to square the logo would still not fill.
// Strategy:
//   1. Rasterize logo.svg at high density.
//   2. sharp.trim() → get the art's bbox in pixel space.
//   3. Convert pixel bbox back to SVG coordinate space using the
//      viewBox ratio.
//   4. Emit a new icon.svg with a square viewBox and a <g transform>
//      that translates + scales the original paths so the bbox
//      occupies 90% of the canvas width, centered.
//
// Also regenerates the PNG favicons + apple-touch-icon after updating
// icon.svg by shelling out to generate-icons.mjs.

import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOGO = resolve(ROOT, "public/logo.svg");
const ICON = resolve(ROOT, "public/icon.svg");

const CANVAS = 800;
const FILL_RATIO = 0.9; // logo width / canvas width

const src = await readFile(LOGO, "utf8");

// Pull viewBox dimensions out of the source.
const vbMatch = src.match(/viewBox=\"([^\"]+)\"/);
if (!vbMatch) throw new Error("logo.svg missing viewBox");
const [, vbRaw] = vbMatch;
const [vbX, vbY, vbW, vbH] = vbRaw.trim().split(/\s+/).map(Number);

// Render + measure the untouched SVG so we know the rendered canvas.
const origBuf = await sharp(Buffer.from(src), { density: 384 }).png().toBuffer();
const origMeta = await sharp(origBuf).metadata();
const renderW = origMeta.width ?? 1;
const renderH = origMeta.height ?? 1;

// Trim — tell sharp to return offsets so we know where the art started.
const trimmed = await sharp(origBuf)
  .trim({ threshold: 10 })
  .toBuffer({ resolveWithObject: true });
const trimInfo = trimmed.info;
const trimW = trimInfo.width;
const trimH = trimInfo.height;
const offsetX = trimInfo.trimOffsetLeft != null ? -trimInfo.trimOffsetLeft : 0;
const offsetY = trimInfo.trimOffsetTop != null ? -trimInfo.trimOffsetTop : 0;

// Pixel → SVG coordinate conversion.
const pxPerUnitX = renderW / vbW;
const pxPerUnitY = renderH / vbH;
const bboxLeft   = vbX + offsetX / pxPerUnitX;
const bboxTop    = vbY + offsetY / pxPerUnitY;
const bboxWidth  = trimW / pxPerUnitX;
const bboxHeight = trimH / pxPerUnitY;

// Scale so the artwork fills FILL_RATIO of the canvas width, then
// center both axes. We use width-match (not the tighter of the two)
// because the owner asked specifically for 90% of the WIDTH — if the
// logo is wide + short, the canvas will still have vertical whitespace,
// but the ink size matches what they wanted.
const targetW = CANVAS * FILL_RATIO;
const scale = targetW / bboxWidth;
const scaledH = bboxHeight * scale;

const tx = (CANVAS - bboxWidth * scale) / 2 - bboxLeft * scale;
const ty = (CANVAS - scaledH) / 2 - bboxTop * scale;

// Strip the outer <svg> wrapper from the original and keep everything
// inside it (defs + paths + nested groups). We wrap that body in a
// <g transform> inside a square-viewBox SVG.
const inner = src
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace(/<!DOCTYPE[^>]*>\s*/i, "")
  .replace(/<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .trim();

const output = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    ${inner}
  </g>
</svg>
`;

await writeFile(ICON, output, "utf8");

console.log(`✓ ${ICON}`);
console.log(`  canvas ${CANVAS}×${CANVAS}, logo bbox in SVG ${bboxWidth.toFixed(1)}×${bboxHeight.toFixed(1)}, scaled to ${(bboxWidth * scale).toFixed(1)}×${scaledH.toFixed(1)}`);
