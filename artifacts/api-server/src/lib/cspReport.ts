/**
 * Content-Security-Policy violation reports, sent by browsers to
 * /api/csp-report while the web app's policy is report-only
 * (artifacts/my-impact/serve.mjs). Pure, so it can be tested directly.
 */

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

/**
 * Origin and path only: query strings and fragments can carry tokens or
 * personal details, and the logs don't need them.
 */
export function withoutQuery(uri: unknown): string {
  if (typeof uri !== "string" || !uri) return "";
  // "inline", "eval", "data", "blob" and the like are keywords, not URLs.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) return uri.slice(0, 40);
  try {
    const u = new URL(uri);
    return `${u.origin}${u.pathname}`.slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Reads both report shapes: the older `{"csp-report": {...}}` (report-uri)
 * and the Reporting API's `[{ type: "csp-violation", body: {...} }]`.
 */
export function readCspReports(body: unknown): CspViolation[] {
  const raw: Record<string, unknown>[] = [];
  if (Array.isArray(body)) {
    for (const r of body) {
      if (r && typeof r === "object" && (r as { type?: unknown }).type === "csp-violation") {
        const inner = (r as { body?: unknown }).body;
        if (inner && typeof inner === "object") raw.push(inner as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === "object") {
    const inner = (body as Record<string, unknown>)["csp-report"];
    if (inner && typeof inner === "object") raw.push(inner as Record<string, unknown>);
  }
  return raw.slice(0, 20).map((r) => ({
    directive: String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "").slice(0, 60),
    blocked: withoutQuery(r["blocked-uri"] ?? r.blockedURL),
    page: withoutQuery(r["document-uri"] ?? r.documentURL),
  }));
}
