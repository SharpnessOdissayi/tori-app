/**
 * Root-path dispatcher.
 *
 * Default behaviour: show the marketing Home page.
 *
 * White-label behaviour: when the current hostname isn't kavati.net (and
 * isn't a localhost dev host), we ask the backend "which business owns
 * this hostname?". If one is found, we render <Book> directly — no slug in
 * the URL, no redirect, no flash of the marketing page. The owner's
 * customers see only book.theirsalon.co.il, exactly as if it were their
 * own site.
 *
 * If the backend returns 404 (unknown domain pointed at us), fall through
 * to the marketing page — this handles the case of a misconfigured CNAME
 * on a random domain.
 */

import { useEffect, useState } from "react";
import Home from "./Home";
import Book from "./Book";

const KAVATI_HOSTS = new Set([
  "kavati.net",
  "www.kavati.net",
  "localhost",
  "127.0.0.1",
]);

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim()) || "/api";

export default function HomeOrBook() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isCustom = hostname && !KAVATI_HOSTS.has(hostname);

  const [resolved, setResolved] = useState<"pending" | "custom" | "marketing">(
    isCustom ? "pending" : "marketing",
  );
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!isCustom) return;
    fetch(`${API_BASE}/public/resolve-host/${encodeURIComponent(hostname)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.slug) {
          setSlug(data.slug);
          setResolved("custom");
        } else {
          setResolved("marketing");
        }
      })
      .catch(() => setResolved("marketing"));
  }, [isCustom, hostname]);

  if (resolved === "pending") {
    // Blank screen while we figure out which business owns the host. Very
    // short (single API call) so no spinner needed.
    return <div style={{ minHeight: "100dvh", background: "#ffffff" }} />;
  }

  if (resolved === "custom" && slug) {
    // Render Book directly with the resolved slug, bypassing wouter params.
    return <Book slugOverride={slug} />;
  }

  return <Home />;
}
