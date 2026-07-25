/**
 * Auto-verification for community charity corrections and suggestions.
 *
 * A submission auto-applies only when it passes checks against the official
 * charity registers (Charity Commission for England & Wales, OSCR for
 * Scotland) and, for websites, a sanity check that the submitted URL is
 * reachable and plausibly belongs to the named charity. Anything uncertain
 * is classified needs-review instead of being silently dropped.
 */

import { verifyCharityName } from "./charity-commission.js";
import { verifyOSCRCharityName } from "./oscr.js";
import { normalizeCharityName } from "./charity-name.js";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 300_000;

function isScottish(country: string): boolean {
  return country.trim().toLowerCase() === "scotland";
}

/** Look the charity up in the correct official register for its country. */
export async function verifyAgainstRegister(
  name: string,
  country: string,
): Promise<{ registrationNumber: string } | null> {
  try {
    if (isScottish(country)) {
      return await verifyOSCRCharityName(name, process.env.OSCR_API_KEY);
    }
    const ccApiKey = process.env.CHARITY_COMMISSION_API_KEY;
    if (!ccApiKey) return null;
    return await verifyCharityName(name, ccApiKey);
  } catch {
    return null;
  }
}

/** Normalise a submitted URL to https://… form, or null when not a valid web URL. */
export function normalizeSubmittedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<{ reachable: boolean; text: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "MyImpactBot/1.0 (+https://myimpact.uk; charity-website check)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    // Any HTTP response means the host exists and is serving — bot-protected
    // sites often return 403 to automated fetches, which must not count as
    // "unreachable".
    if (!res.ok) return { reachable: true, text: null };
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text")) {
      return { reachable: true, text: null };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { reachable: true, text: text.slice(0, MAX_BODY_BYTES) };
    }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let out = "";
    let bytes = 0;
    while (bytes < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return { reachable: true, text: out };
  } catch {
    return { reachable: false, text: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sanity-check that a submitted website URL is reachable and plausibly
 * belongs to the named charity: at least one substantive word of the
 * charity's name must appear in the page text or the hostname.
 */
export async function verifyWebsiteForCharity(
  charityName: string,
  url: string,
): Promise<{ ok: boolean; reason: string }> {
  const normalized = normalizeSubmittedUrl(url);
  if (!normalized) return { ok: false, reason: "Submitted URL is not a valid web address" };

  const { reachable, text } = await fetchPage(normalized);
  if (!reachable) return { ok: false, reason: "Submitted URL was not reachable" };

  const hostname = new URL(normalized).hostname.toLowerCase();
  const words = normalizeCharityName(charityName)
    .split(/\s+/)
    .filter((w) => w.length > 3);
  // Also match initials (e.g. "fva" for Fife Voluntary Action) in the hostname.
  const initials = normalizeCharityName(charityName)
    .split(/\s+/)
    .map((w) => w[0])
    .join("");
  const hostnamePlausible =
    words.some((w) => hostname.includes(w)) ||
    (initials.length >= 3 && hostname.includes(initials));

  if (text !== null) {
    const haystack = (text + " " + hostname).toLowerCase();
    const plausible = words.some((w) => haystack.includes(w)) || hostnamePlausible;
    if (!plausible) {
      return { ok: false, reason: "Page content does not appear to match the charity name" };
    }
    return { ok: true, reason: "URL reachable and matches charity name" };
  }

  // Page couldn't be read (bot protection or non-HTML) — fall back to a
  // hostname plausibility check so protected but legitimate sites still pass.
  if (!hostnamePlausible) {
    return { ok: false, reason: "Could not read the page and the domain does not match the charity name" };
  }
  return { ok: true, reason: "URL reachable; domain matches charity name (page fetch blocked)" };
}
