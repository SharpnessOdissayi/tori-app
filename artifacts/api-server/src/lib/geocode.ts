/**
 * One-shot Israeli address geocoder.
 *
 * Uses OpenStreetMap's Nominatim endpoint — free, no API key, just
 * needs a sensible User-Agent and ≤1 req/sec. We only call this when
 * an owner changes their address/city in Settings (or on signup), so
 * the rate limit is a non-issue.
 *
 * Returns null on any failure — callers should fall back to the
 * text-based Waze query when coordinates aren't available.
 */

import { logger } from "./logger";

export interface GeocodeResult {
  latitude: string;
  longitude: string;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "KavatiApp/1.0 (kavati.net; kavati.net@gmail.com)";

export async function geocodeAddress(
  address: string | null | undefined,
  city: string | null | undefined,
): Promise<GeocodeResult | null> {
  const parts = [address, city].map(v => String(v ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return null;

  // Comma-separated query with country hint — Nominatim handles
  // Hebrew well and the countrycodes=il filter pins results to Israel
  // even when the street name also exists abroad (e.g. Herzl St.).
  const q = parts.join(", ");
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&countrycodes=il&limit=1&accept-language=he`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    });
    if (!res.ok) {
      logger.warn({ q, status: res.status }, "[geocode] nominatim non-ok");
      return null;
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      logger.info({ q }, "[geocode] no match");
      return null;
    }
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    return { latitude: hit.lat, longitude: hit.lon };
  } catch (e) {
    logger.error({ err: e, q }, "[geocode] nominatim threw");
    return null;
  }
}
