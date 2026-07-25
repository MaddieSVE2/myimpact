/**
 * Lightweight volunteer-recruitment detection.
 *
 * Given a charity's website, fetch the homepage (and, if linked, an obvious
 * volunteering page) and scan the text for clear "we want volunteers"
 * signals. This is deliberately conservative: it returns `true` only when a
 * recruitment phrase is found, and `undefined` in every other case (fetch
 * failed, no website, nothing conclusive) so the UI can simply show nothing
 * when we don't know.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 500_000;

/** Phrases that clearly indicate a charity is actively recruiting volunteers. */
const RECRUITING_PHRASES = [
  "become a volunteer",
  "volunteer with us",
  "volunteer for us",
  "volunteers needed",
  "volunteers wanted",
  "we need volunteers",
  "we are looking for volunteers",
  "we're looking for volunteers",
  "looking for volunteers",
  "join our volunteer",
  "join us as a volunteer",
  "sign up to volunteer",
  "apply to volunteer",
  "volunteer application",
  "volunteering opportunities",
  "volunteer opportunities",
  "volunteer roles",
  "volunteer vacancies",
  "current volunteer",
  "register to volunteer",
  "start volunteering",
  "get involved as a volunteer",
];

/** Fetch a URL with a timeout, returning at most MAX_BODY_BYTES of text, or null on any failure. */
async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "MyImpactBot/1.0 (+https://myimpact.uk; volunteer-info check)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("text")) return null;

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return text.slice(0, MAX_BODY_BYTES);
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
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip tags/scripts and lowercase, so phrase matching works on visible-ish text. */
function htmlToComparableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function containsRecruitingPhrase(text: string): boolean {
  return RECRUITING_PHRASES.some((p) => text.includes(p));
}

/** Find an obvious volunteering-page link in the homepage HTML, resolved absolutely. */
function findVolunteerLink(html: string, baseUrl: string): string | null {
  const hrefs = html.match(/href\s*=\s*["']([^"']+)["']/gi) ?? [];
  for (const raw of hrefs) {
    const m = raw.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = m?.[1];
    if (!href) continue;
    if (!/volunteer/i.test(href)) continue;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
      // Stay on the charity's own site (allow subdomains either way).
      const base = new URL(baseUrl);
      const same =
        resolved.hostname === base.hostname ||
        resolved.hostname.endsWith(`.${base.hostname}`) ||
        base.hostname.endsWith(`.${resolved.hostname}`);
      if (!same) continue;
      return resolved.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Check whether a charity's website shows clear volunteer-recruitment
 * signals. Returns `true` when found, `undefined` when unknown (no website,
 * fetch failure, or nothing conclusive). Never returns `false` — absence of
 * a phrase is not evidence the charity isn't recruiting.
 */
export async function detectVolunteerRecruitment(
  website: string | undefined,
): Promise<true | undefined> {
  if (!website) return undefined;

  const homepageHtml = await fetchPageText(website);
  if (homepageHtml === null) return undefined;

  const homepageText = htmlToComparableText(homepageHtml);
  if (containsRecruitingPhrase(homepageText)) return true;

  const volunteerUrl = findVolunteerLink(homepageHtml, website);
  if (volunteerUrl) {
    const volunteerHtml = await fetchPageText(volunteerUrl);
    if (volunteerHtml !== null) {
      const volunteerText = htmlToComparableText(volunteerHtml);
      // A dedicated volunteering page that talks about opportunities, roles,
      // or applying is a strong recruitment signal even without an exact
      // phrase match on the homepage.
      if (
        containsRecruitingPhrase(volunteerText) ||
        /volunteer/i.test(volunteerText) && /(apply|sign up|register|opportunit|role|join)/i.test(volunteerText)
      ) {
        return true;
      }
    }
  }

  return undefined;
}
