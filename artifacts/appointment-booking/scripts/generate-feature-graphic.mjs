// Generate the Google Play Store feature graphic (1024×500) for Kavati.
//
// Run with:  node scripts/generate-feature-graphic.mjs
// Output:    resources/feature-graphic.png
//
// Design layers (bottom to top):
//  1. Diagonal brand gradient (#3c92f0 → #1e6fcf)
//  2. Subtle ambient glow + decorative diagonal light ray
//  3. Dot-grid texture (very low alpha) for depth
//  4. Floating UI widgets on the right — a stylized schedule card and a
//     clock-tick grid — hinting at the app's function without literal
//     screenshots (Play Store rejects feature graphics that look like
//     device screenshots, and they look dated fast).
//  5. The brand logo.svg (recolored white) on the left, on a soft
//     rounded-square backdrop for definition against the gradient.
//  6. Hebrew tagline + domain tag, right-aligned RTL.
//
// Why not use logo.svg directly? Its fills are CSS classes (#95dbf4,
// #3c92f0). We replace both with white so the wordmark pops on the
// blue background without us needing to re-author the artwork.

import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const W = 1024;
const H = 500;

async function whiteLogoSvg() {
  const raw = await readFile(resolve(ROOT, "public/logo.svg"), "utf8");
  return raw
    .replace(/fill:\s*#95dbf4/gi, "fill: #ffffff")
    .replace(/fill:\s*#3c92f0/gi, "fill: #ffffff");
}

async function renderLogo(targetWidth) {
  const svg = await whiteLogoSvg();
  return sharp(Buffer.from(svg), { density: 600 })
    .resize(targetWidth, null, { fit: "inside" })
    .png()
    .toBuffer();
}

function backgroundSvg() {
  // Diagonal brand gradient, soft ambient glows, dot pattern, plus the
  // stylized schedule widget + clock-tick grid on the right.
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4aa0f7"/>
      <stop offset="55%" stop-color="#3c92f0"/>
      <stop offset="100%" stop-color="#1b66c4"/>
    </linearGradient>
    <radialGradient id="glowA" cx="22%" cy="38%" r="45%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="glowB" cx="85%" cy="82%" r="50%">
      <stop offset="0%" stop-color="rgba(10,60,140,0.55)"/>
      <stop offset="100%" stop-color="rgba(10,60,140,0)"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255,255,255,0.07)"/>
    </pattern>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
  </defs>

  <!-- Gradient + glows + pattern -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glowA)"/>
  <rect width="${W}" height="${H}" fill="url(#glowB)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>

  <!-- Sweeping light ray -->
  <polygon points="-50,0 380,0 120,520 -150,520"
           fill="rgba(255,255,255,0.05)" transform="rotate(-6 512 250)"/>

  <!-- RIGHT-SIDE VIGNETTE: floating calendar widget -->
  <g transform="translate(720 88)" filter="url(#soft)">
    <!-- Card -->
    <rect x="0" y="0" width="260" height="170" rx="22" ry="22"
          fill="rgba(255,255,255,0.95)"/>
    <rect x="0" y="0" width="260" height="42" rx="22" ry="22"
          fill="#1e6fcf"/>
    <rect x="0" y="28" width="260" height="14" fill="#1e6fcf"/>

    <!-- "Month" label on header -->
    <text x="130" y="27" fill="#ffffff"
          font-family="Rubik, Assistant, Arial, sans-serif"
          font-size="15" font-weight="700"
          text-anchor="middle">אפריל 2026</text>

    <!-- Day-number grid 7 × 4 -->
    ${Array.from({ length: 28 }, (_, i) => {
      const row = Math.floor(i / 7);
      const col = i % 7;
      const x = 22 + col * 32;
      const y = 72 + row * 24;
      const day = i + 1;
      const isBooked = [3, 6, 8, 11, 14, 17, 19, 22, 25].includes(day);
      return `<text x="${x}" y="${y}" fill="${isBooked ? "#3c92f0" : "#334155"}"
               font-family="Rubik, Arial, sans-serif" font-size="13"
               font-weight="${isBooked ? 700 : 500}"
               text-anchor="middle">${day}</text>${
        isBooked
          ? `<circle cx="${x}" cy="${y - 4}" r="11" fill="none" stroke="#3c92f0" stroke-width="1.5" opacity="0.35"/>`
          : ""
      }`;
    }).join("\n    ")}
  </g>

  <!-- RIGHT-SIDE VIGNETTE: floating time-slot card below the calendar -->
  <g transform="translate(700 288)" filter="url(#soft)">
    <rect x="0" y="0" width="300" height="140" rx="18" ry="18"
          fill="rgba(255,255,255,0.95)"/>
    <text x="280" y="32" fill="#1e293b"
          font-family="Rubik, Assistant, Arial, sans-serif"
          font-size="15" font-weight="700"
          text-anchor="end">זמנים פנויים להיום</text>

    ${[["09:00", true], ["10:30", false], ["12:00", true], ["14:30", true], ["16:00", false], ["17:30", true]]
      .map(([time, taken], i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = 20 + col * 90;
        const y = 58 + row * 40;
        return `<rect x="${x}" y="${y}" width="80" height="30" rx="8" ry="8"
                 fill="${taken ? "rgba(60,146,240,0.12)" : "#3c92f0"}"
                 stroke="${taken ? "#3c92f0" : "none"}" stroke-width="${taken ? 1 : 0}" stroke-opacity="0.35"/>
                <text x="${x + 40}" y="${y + 19}" fill="${taken ? "#1e6fcf" : "#ffffff"}"
                 font-family="Rubik, monospace" font-size="14" font-weight="700"
                 text-anchor="middle">${time}</text>`;
      }).join("\n    ")}
  </g>
</svg>
  `;
}

function foregroundSvg(logoWidth) {
  // Logo backdrop + tagline, composed over the rendered background.
  const plateW = logoWidth + 90;
  const plateH = 230;
  const plateX = 60;
  const plateY = (H - plateH) / 2 - 40;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="plate" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <!-- Soft plate behind the logo so it pops off the gradient -->
  <rect x="${plateX - 6}" y="${plateY - 6}" width="${plateW + 12}" height="${plateH + 12}"
        rx="36" ry="36" fill="rgba(255,255,255,0.08)" filter="url(#plate)"/>
  <rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}"
        rx="30" ry="30" fill="rgba(255,255,255,0.12)"
        stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>

  <!-- Hebrew brand name + tagline under the plate -->
  <text x="${plateX + plateW / 2}" y="${plateY + plateH + 56}"
        fill="#ffffff" font-family="Rubik, Assistant, Arial, sans-serif"
        font-size="34" font-weight="900" text-anchor="middle">קבעתי</text>
  <text x="${plateX + plateW / 2}" y="${plateY + plateH + 92}"
        fill="rgba(255,255,255,0.88)" font-family="Rubik, Assistant, Arial, sans-serif"
        font-size="20" font-weight="500" text-anchor="middle">זימון תורים חכם לעסקים</text>

  <!-- Bottom-left domain tag so the bottom-right stays empty (Play may
       overlay a play button there if a promo video is attached). -->
  <text x="28" y="${H - 22}" fill="rgba(255,255,255,0.7)"
        font-family="Rubik, Arial, sans-serif" font-size="16"
        font-weight="500" letter-spacing="2" direction="ltr">kavati.net</text>
</svg>
  `;
}

// ── Render ───────────────────────────────────────────────────────────────

const logoWidth = 440;
const logoBuf = await renderLogo(logoWidth);
const logoMeta = await sharp(logoBuf).metadata();

const bgBuf = await sharp(Buffer.from(backgroundSvg())).png().toBuffer();
const fgBuf = await sharp(Buffer.from(foregroundSvg(logoWidth))).png().toBuffer();

// Logo position — center of the left plate
const plateW = logoWidth + 90;
const plateH = 230;
const plateX = 60;
const plateY = (H - plateH) / 2 - 40;
const logoX = Math.round(plateX + (plateW - logoMeta.width) / 2);
const logoY = Math.round(plateY + (plateH - logoMeta.height) / 2);

const OUT = resolve(ROOT, "resources/feature-graphic.png");

await sharp(bgBuf)
  .composite([
    { input: fgBuf, top: 0, left: 0 },
    { input: logoBuf, top: logoY, left: logoX },
  ])
  .png()
  .toFile(OUT);

console.log(`✓ ${OUT}`);
