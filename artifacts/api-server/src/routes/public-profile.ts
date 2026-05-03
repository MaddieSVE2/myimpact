import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, publicProfilesTable, usersTable, impactRecordsTable, journalEntriesTable, recordVerificationsTable } from "@workspace/db";
import { eq, desc, sum as drizzleSum, max as drizzleMax, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { trackServerEvent } from "../lib/analytics.js";

const router: IRouter = Router();

const SDG_NAMES: Record<string, string> = {
  "1": "No Poverty",
  "2": "Zero Hunger",
  "3": "Good Health & Well-being",
  "4": "Quality Education",
  "5": "Gender Equality",
  "6": "Clean Water & Sanitation",
  "7": "Affordable & Clean Energy",
  "8": "Decent Work & Economic Growth",
  "9": "Industry, Innovation & Infrastructure",
  "10": "Reduced Inequalities",
  "11": "Sustainable Cities & Communities",
  "12": "Responsible Consumption & Production",
  "13": "Climate Action",
  "14": "Life Below Water",
  "15": "Life on Land",
  "16": "Peace, Justice & Strong Institutions",
  "17": "Partnerships for the Goals",
};

// Reverse-lookup table: stored SDG values are sometimes descriptive names
// (e.g. "Life on Land", "Sustainable Cities and Communities") rather than the
// numeric goal ID. This map normalises both shapes back to the numeric ID.
const SDG_NAME_TO_NUMBER: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [num, name] of Object.entries(SDG_NAMES)) {
    map[name.toLowerCase()] = num;
  }
  // Common stored variants without typographic ampersands.
  const variants: Array<[string, string]> = [
    ["good health and well-being", "3"],
    ["good health and wellbeing", "3"],
    ["clean water and sanitation", "6"],
    ["affordable and clean energy", "7"],
    ["decent work and economic growth", "8"],
    ["industry, innovation and infrastructure", "9"],
    ["sustainable cities and communities", "11"],
    ["responsible consumption and production", "12"],
    ["peace, justice and strong institutions", "16"],
  ];
  for (const [name, num] of variants) map[name] = num;
  return map;
})();

function resolveSdg(rawSdg: string): { id: string; name: string } {
  const trimmed = rawSdg.trim();
  if (/^\d+$/.test(trimmed)) {
    return { id: trimmed, name: SDG_NAMES[trimmed] ?? `SDG ${trimmed}` };
  }
  const num = SDG_NAME_TO_NUMBER[trimmed.toLowerCase()];
  if (num) return { id: num, name: SDG_NAMES[num] ?? trimmed };
  return { id: "", name: trimmed };
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "dashboard", "help", "login", "logout",
  "profile", "settings", "signup", "register", "support", "terms", "privacy",
  "about", "contact", "www", "mail", "blog", "news", "static", "assets",
  "public", "private", "user", "users", "account", "accounts", "team", "org",
  "organisation", "organization", "impact", "wizard", "history", "journal",
  "milestones", "badges", "feedback", "results", "suggestions", "widget",
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required.";
  if (slug.length < 3) return "Slug must be at least 3 characters.";
  if (slug.length > 30) return "Slug must be at most 30 characters.";
  if (!SLUG_RE.test(slug)) return "Slug may only contain lowercase letters, numbers, and hyphens, and must not start or end with a hyphen.";
  if (RESERVED_SLUGS.has(slug)) return "That slug is reserved. Please choose a different one.";
  return null;
}

function generateDefaultSlug(displayName: string | null | undefined): string {
  const base = displayName
    ? displayName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  const safeName = base.slice(0, 10) || "user";
  const suffix = randomBytes(3).toString("hex");
  return `${safeName}-${suffix}`;
}

// ── Rate limiting for public profile reads (no auth) ──────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  // Use req.ip which respects the "trust proxy" setting in app.ts, preventing header spoofing
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }
  next();
}

// Periodically clean up old entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (v.resetAt < now) rateLimitMap.delete(k);
  }
}, 5 * 60_000);

// ── GET /api/public-profile/me — fetch own public profile settings ────────────
router.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });
  res.json({ profile: existing ?? null });
});

// ── POST /api/public-profile/enable — enable public profile (generates slug) ─
router.post("/enable", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });

  if (existing) {
    const [updated] = await db
      .update(publicProfilesTable)
      .set({ isEnabled: true, updatedAt: new Date() })
      .where(eq(publicProfilesTable.userId, userId))
      .returning();
    res.json({ profile: updated });
    return;
  }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });

  let slug = generateDefaultSlug(user?.displayName);

  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 10) {
    const collision = await db.query.publicProfilesTable.findFirst({
      where: eq(publicProfilesTable.slug, slug),
    });
    if (!collision) break;
    slug = generateDefaultSlug(user?.displayName);
    attempts++;
  }

  const [created] = await db
    .insert(publicProfilesTable)
    .values({ userId, slug, isEnabled: true })
    .returning();

  res.json({ profile: created });
});

// ── PUT /api/public-profile — update settings ─────────────────────────────────
router.put("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;

  const existing = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.userId, userId),
  });

  if (!existing) {
    res.status(404).json({ error: "Public profile not found. Enable it first." });
    return;
  }

  const updates: Partial<typeof publicProfilesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof body.isEnabled === "boolean") updates.isEnabled = body.isEnabled;
  if (typeof body.customMessage === "string") updates.customMessage = body.customMessage.slice(0, 500) || null;
  if (body.customMessage === null) updates.customMessage = null;
  if (typeof body.showHours === "boolean") updates.showHours = body.showHours;
  if (typeof body.showSroi === "boolean") updates.showSroi = body.showSroi;
  if (typeof body.showCategories === "boolean") updates.showCategories = body.showCategories;
  if (typeof body.showJournalHighlights === "boolean") updates.showJournalHighlights = body.showJournalHighlights;

  // Slug update: only allowed once, if not already customised
  if (typeof body.slug === "string") {
    if (existing.slugCustomised) {
      res.status(400).json({ error: "You can only customise your slug once." });
      return;
    }
    const slug = body.slug.trim().toLowerCase();
    const slugError = validateSlug(slug);
    if (slugError) {
      res.status(400).json({ error: slugError });
      return;
    }
    const collision = await db.query.publicProfilesTable.findFirst({
      where: eq(publicProfilesTable.slug, slug),
    });
    if (collision && collision.userId !== userId) {
      res.status(409).json({ error: "That slug is already taken. Please choose a different one." });
      return;
    }
    updates.slug = slug;
    updates.slugCustomised = true;
  }

  const [updated] = await db
    .update(publicProfilesTable)
    .set(updates)
    .where(eq(publicProfilesTable.userId, userId))
    .returning();

  res.json({ profile: updated });
});

// ── GET /api/public-profile/check-slug/:slug — slug availability check ────────
router.get("/check-slug/:slug", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const slug = (req.params.slug ?? "").trim().toLowerCase();
  const error = validateSlug(slug);
  if (error) {
    res.json({ available: false, error });
    return;
  }
  const collision = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });
  const available = !collision || collision.userId === userId;
  res.json({ available, error: available ? null : "That slug is already taken." });
});

// ── Widget helpers ────────────────────────────────────────────────────────────
type WidgetTheme = "light" | "dark";
type WidgetSize = "small" | "medium" | "large";

function normaliseTheme(v: unknown): WidgetTheme {
  return v === "dark" ? "dark" : "light";
}
function normaliseSize(v: unknown): WidgetSize {
  return v === "small" || v === "large" ? v : "medium";
}

interface WidgetActivityBreakdown {
  sdg?: string | number | null;
  sdgColor?: string | null;
  sdgName?: string | null;
  category?: string | null;
  hours?: number | null;
  impactValue?: number | null;
}
interface WidgetResultJson {
  activityBreakdowns?: WidgetActivityBreakdown[];
}

async function buildWidgetPayload(slug: string) {
  const profile = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });

  if (!profile || !profile.isEnabled) return null;

  // Select only columns actually used by the widget — avoids selecting
  // unrelated columns that may not yet exist in the deployed DB schema
  // (e.g. `voice_enabled`).
  const [user] = await db
    .select({ displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, profile.userId))
    .limit(1);
  if (!user) return null;

  // Lifetime totals + freshness marker via a single aggregate query.
  // We always pull max(createdAt) so the widget ETag changes when the user
  // logs new impact records, even if their public-profile settings haven't
  // been touched.
  let totalHours: number | null = null;
  let totalSroi: number | null = null;
  let impactMaxCreatedAt: Date | null = null;
  // Raw aggregate sum, captured regardless of privacy toggles, used as a
  // cheap "did anything in the impact records change?" detector for the
  // version hash. (impact_records has no updatedAt, so summing total_value
  // gives us edit-detection without an extra column.)
  let impactSumTotalRaw = "0";
  {
    const [agg] = await db
      .select({
        sumHours: drizzleSum(impactRecordsTable.totalHours),
        sumSroi: drizzleSum(sql`${impactRecordsTable.totalValue}::numeric`),
        maxCreatedAt: drizzleMax(impactRecordsTable.createdAt),
      })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    if (profile.showHours) totalHours = parseInt(agg?.sumHours ?? "0", 10) || 0;
    if (profile.showSroi) totalSroi = parseFloat((agg?.sumSroi as string) ?? "0") || 0;
    impactMaxCreatedAt = (agg?.maxCreatedAt as Date | null) ?? null;
    impactSumTotalRaw = (agg?.sumSroi as string | null) ?? "0";
  }

  // Top SDG and top category — read resultJson activityBreakdowns once
  let topSdg: { id: string; name: string; color: string } | null = null;
  let topCategory: { name: string; hours: number } | null = null;

  if (profile.showCategories) {
    const records = await db
      .select({ resultJson: impactRecordsTable.resultJson })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    const sdgMap = new Map<string, { id: string; name: string; color: string; value: number }>();
    const categoryHoursMap = new Map<string, number>();

    for (const record of records) {
      const result = record.resultJson as WidgetResultJson;
      const breakdowns = Array.isArray(result?.activityBreakdowns) ? result.activityBreakdowns : [];
      for (const b of breakdowns) {
        if (b.sdg !== undefined && b.sdg !== null && b.sdg !== "") {
          const raw = String(b.sdg);
          const resolved = resolveSdg(raw);
          // Key on the resolved numeric ID when available, otherwise the raw
          // value, so that "Life on Land" and "15" merge into the same bucket.
          const key = resolved.id || raw;
          const displayName = b.sdgName || resolved.name;
          const value = typeof b.impactValue === "number" ? b.impactValue : 0;
          const cur = sdgMap.get(key);
          if (cur) {
            cur.value += value;
          } else {
            sdgMap.set(key, {
              id: resolved.id,
              name: displayName,
              color: b.sdgColor || "#7E8FAD",
              value,
            });
          }
        }

        // Category aggregates live in activityBreakdowns; the raw
        // activitiesJson is keyed by activityId and doesn't carry category.
        if (b.category && typeof b.hours === "number") {
          categoryHoursMap.set(b.category, (categoryHoursMap.get(b.category) ?? 0) + b.hours);
        }
      }
    }

    const topSdgEntry = [...sdgMap.values()].sort((a, b) => b.value - a.value)[0];
    if (topSdgEntry) {
      topSdg = { id: topSdgEntry.id, name: topSdgEntry.name, color: topSdgEntry.color };
    }

    const topCatEntry = [...categoryHoursMap.entries()].sort(([, a], [, b]) => b - a)[0];
    if (topCatEntry) {
      topCategory = { name: topCatEntry[0], hours: Math.round(topCatEntry[1]) };
    }
  }

  // Optional journal highlight (most recent non-empty) + freshness marker.
  let journalHighlight: string | null = null;
  let journalMaxUpdatedAt: Date | null = null;
  if (profile.showJournalHighlights) {
    const [jagg] = await db
      .select({ maxUpdatedAt: drizzleMax(journalEntriesTable.updatedAt) })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.userId, profile.userId));
    journalMaxUpdatedAt = (jagg?.maxUpdatedAt as Date | null) ?? null;

    const entries = await db
      .select({ text: journalEntriesTable.text })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.userId, profile.userId))
      .orderBy(desc(journalEntriesTable.createdAt))
      .limit(10);

    const picked = entries.find((e) => e.text && e.text.trim().length > 0);
    if (picked?.text) {
      const trimmed = picked.text.trim();
      journalHighlight = trimmed.length > 140 ? trimmed.slice(0, 137).trimEnd() + "…" : trimmed;
    }
  }

  // Build a short version hash from every signal that affects what the
  // widget renders. Must stay in sync with `buildWidgetStatus` so that
  // status.version === payload.version for the same data.
  const versionInput = [
    profile.updatedAt.toISOString(),
    user.displayName ?? "",
    impactMaxCreatedAt?.toISOString() ?? "0",
    impactSumTotalRaw,
    journalMaxUpdatedAt?.toISOString() ?? "0",
    profile.isEnabled ? "1" : "0",
    profile.showHours ? "h" : "-",
    profile.showSroi ? "s" : "-",
    profile.showCategories ? "c" : "-",
    profile.showJournalHighlights ? "j" : "-",
  ].join("|");
  const version = createHash("sha1").update(versionInput).digest("hex").slice(0, 16);

  return {
    slug: profile.slug,
    displayName: user.displayName || "Someone",
    showHours: profile.showHours,
    showSroi: profile.showSroi,
    showCategories: profile.showCategories,
    showJournalHighlights: profile.showJournalHighlights,
    totalHours: profile.showHours ? totalHours : null,
    totalSroi: profile.showSroi ? totalSroi : null,
    topSdg: profile.showCategories ? topSdg : null,
    topCategory: profile.showCategories ? topCategory : null,
    journalHighlight,
    updatedAt: profile.updatedAt.toISOString(),
    version,
  };
}

// ── GET /api/public-profile/:slug/widget.json — widget data (cached) ──────────
router.get("/:slug/widget.json", publicRateLimit, async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").trim().toLowerCase();
  const payload = await buildWidgetPayload(slug);

  // Allow cross-origin reads from third-party host pages (the iframe loads
  // this endpoint same-origin, but we want it usable directly too).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Vary", "Origin, If-None-Match");

  if (!payload) {
    // Disabled / missing profiles must never be cached at the edge — otherwise
    // a user who toggles their profile off would still see the widget for up
    // to the cache TTL. `no-store` ensures every request hits origin.
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  // Edge cache for ~3 minutes with stale-while-revalidate so embeds don't
  // hammer origin, plus must-revalidate so shared caches issue conditional
  // GETs once the freshness window expires. The version hash below covers
  // profile settings, latest impact-record timestamp and (when shown) latest
  // journal-entry timestamp, so any data change invalidates the cache via
  // cheap 304/200 revalidation. Disabled profiles return 404 with no-store
  // (see above) so once a profile is disabled, the disabled response is
  // never cached — the only stale window is for already-cached enabled
  // responses, bounded by s-maxage.
  const etag = `"v2-${payload.version}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=180, stale-while-revalidate=300, must-revalidate");

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.json(payload);
});

// Lightweight liveness + version probe used by the bootstrap script.
// Deliberately avoids the full payload build so the per-impression no-store
// call is cheap: one profile lookup, one user lookup (display name only),
// one impact aggregate, and an optional journal aggregate.
//
// The version hash is derived from every signal that affects what the
// widget renders:
// - profile.updatedAt + privacy toggles → settings changes
// - displayName                          → rename without settings change
// - max(impact.created_at) + total_value sum → new records OR edits to
//   existing records (impact_records has no updatedAt column, so summing
//   total_value gives us a cheap edit-detector)
// - max(journal.updated_at)              → journal additions/edits
async function buildWidgetStatus(
  slug: string,
): Promise<{ enabled: boolean; version: string } | null> {
  const profile = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });
  if (!profile || !profile.isEnabled) return null;

  const [user] = await db
    .select({ displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, profile.userId))
    .limit(1);
  if (!user) return null;

  const [impactAgg] = await db
    .select({
      maxCreatedAt: drizzleMax(impactRecordsTable.createdAt),
      sumTotal: drizzleSum(sql`${impactRecordsTable.totalValue}::numeric`),
    })
    .from(impactRecordsTable)
    .where(eq(impactRecordsTable.userId, profile.userId));
  const impactMax = (impactAgg?.maxCreatedAt as Date | null) ?? null;
  const impactSum = (impactAgg?.sumTotal as string | null) ?? "0";

  let journalMax: Date | null = null;
  if (profile.showJournalHighlights) {
    const [journalAgg] = await db
      .select({ maxUpdatedAt: drizzleMax(journalEntriesTable.updatedAt) })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.userId, profile.userId));
    journalMax = (journalAgg?.maxUpdatedAt as Date | null) ?? null;
  }

  const version = createHash("sha1")
    .update(
      [
        profile.updatedAt.toISOString(),
        user.displayName ?? "",
        impactMax?.toISOString() ?? "0",
        impactSum,
        journalMax?.toISOString() ?? "0",
        profile.isEnabled ? "1" : "0",
        profile.showHours ? "h" : "-",
        profile.showSroi ? "s" : "-",
        profile.showCategories ? "c" : "-",
        profile.showJournalHighlights ? "j" : "-",
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);

  return { enabled: true, version };
}

router.get("/:slug/widget.status", publicRateLimit, async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").trim().toLowerCase();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const status = await buildWidgetStatus(slug);
  if (!status) {
    res.status(404).json({ enabled: false });
    return;
  }
  res.json(status);
});

// ── GET /api/public-profile/widget.js — bootstrap script ──────────────────────
// A tiny script the user drops into their site as <script src=…></script>.
// It locates itself, reads data-* attributes, hits the no-store status probe
// to confirm the profile is still enabled, and only then inserts an iframe
// pointing at a version-keyed URL.
const WIDGET_JS = `(function(){
  try {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/public-profile\\/widget\\.js/.test(all[i].src)) { s = all[i]; break; }
      }
    }
    if (!s) return;
    var slug = (s.getAttribute('data-slug') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) return;
    var theme = s.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var size = s.getAttribute('data-size');
    if (size !== 'small' && size !== 'large') size = 'medium';
    var origin = s.src.split('/api/')[0];
    var statusUrl = origin + '/api/public-profile/' + encodeURIComponent(slug) + '/widget.status';
    var parent = s.parentNode;
    if (!parent || typeof window.fetch !== 'function') return;
    fetch(statusUrl, { cache: 'no-store', credentials: 'omit' }).then(function(r){
      if (!r || !r.ok) return null;
      return r.json();
    }).then(function(status){
      if (!status || status.enabled !== true) return;
      var version = typeof status.version === 'string' ? status.version : '';
      var src = origin + '/api/public-profile/widget?slug=' + encodeURIComponent(slug)
        + '&theme=' + theme + '&size=' + size
        + (version ? '&v=' + encodeURIComponent(version) : '');
      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'My Impact widget';
      iframe.loading = 'lazy';
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('scrolling', 'no');
      iframe.setAttribute('allowtransparency', 'true');
      var widths = { small: 260, medium: 320, large: 400 };
      iframe.style.cssText = 'width:100%;max-width:' + widths[size] + 'px;height:160px;border:0;display:block;background:transparent;';
      parent.insertBefore(iframe, s);
      window.addEventListener('message', function(ev) {
        if (!ev.data || ev.data.__myImpactWidget !== true) return;
        if (ev.source !== iframe.contentWindow) return;
        if (typeof ev.data.height === 'number' && ev.data.height > 0) {
          iframe.style.height = Math.ceil(ev.data.height) + 'px';
        }
      });
    }).catch(function(){ /* fail silently */ });
  } catch (e) { /* fail silently */ }
})();`;

router.get("/widget.js", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // The bootstrap is static and tiny. Aggressive caching is safe because all
  // dynamic decisions (enabled? version?) happen via the no-store status
  // probe at runtime.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(WIDGET_JS);
});

// ── GET /api/public-profile/widget — iframe HTML page ─────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return "£" + (value / 1_000_000).toFixed(1) + "m";
  if (value >= 1_000) return "£" + Math.round(value / 1_000) + "k";
  return "£" + value.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

router.get("/widget", publicRateLimit, async (req: Request, res: Response) => {
  const slug = String(req.query.slug ?? "").trim().toLowerCase();
  const theme = normaliseTheme(req.query.theme);
  const size = normaliseSize(req.query.size);
  const versionParam = typeof req.query.v === "string" ? req.query.v : "";

  // The host page URL — used for the "powered by" backlink target.
  // We default to the API host's parent app, but the embed page itself is
  // public regardless.
  const profileBase = (process.env.APP_URL ?? "").replace(/\/$/, "") || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Allow embedding in any iframe; remove any default X-Frame-Options.
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.setHeader("Vary", "If-None-Match");

  const payload = slug ? await buildWidgetPayload(slug) : null;

  if (!payload) {
    // Don't let edge caches keep serving the "profile not available" page
    // (or a previously-cached enabled response) once a profile is disabled.
    res.setHeader("Cache-Control", "no-store");
    res.status(404).send(renderWidgetErrorHtml(theme));
    return;
  }

  // Cache strategy depends on whether a version is in the URL:
  // - With `?v=…` (bootstrap-driven): URL is version-keyed, so a different
  //   version automatically misses cache. Safe to cache aggressively.
  // - Without `?v=…` (plain-iframe embeds): no version key, so we must
  //   revalidate against origin every time to honour immediate-disable.
  const etag = `"v2-${payload.version}-${theme}-${size}"`;
  res.setHeader("ETag", etag);
  if (versionParam) {
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=600, must-revalidate",
    );
  } else {
    res.setHeader("Cache-Control", "no-store");
  }

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.send(renderWidgetHtml(payload, theme, size, profileBase));
});

function renderWidgetErrorHtml(theme: WidgetTheme): string {
  const bg = theme === "dark" ? "#0f172a" : "#ffffff";
  const fg = theme === "dark" ? "#cbd5e1" : "#475569";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:${bg};color:${fg};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px}.box{padding:14px;text-align:center}</style></head><body><div class="box">My Impact profile not available.</div><script>parent.postMessage({__myImpactWidget:true,height:document.body.scrollHeight},'*')</script></body></html>`;
}

function renderWidgetHtml(
  data: NonNullable<Awaited<ReturnType<typeof buildWidgetPayload>>>,
  theme: WidgetTheme,
  size: WidgetSize,
  profileBase: string,
): string {
  const isDark = theme === "dark";
  const bg = isDark ? "#0f172a" : "#ffffff";
  const fg = isDark ? "#f1f5f9" : "#0f172a";
  const muted = isDark ? "#94a3b8" : "#64748b";
  const border = isDark ? "#1e293b" : "#e2e8f0";
  const accent = "#F06127";
  const sdgColor = data.topSdg?.color || accent;
  const sdgInitial = data.topSdg?.id
    ? data.topSdg.id
    : data.topSdg?.name
      ? data.topSdg.name.trim().charAt(0).toUpperCase()
      : "";

  const padding = size === "small" ? 12 : size === "large" ? 20 : 16;
  const titleSize = size === "small" ? 13 : size === "large" ? 16 : 14;
  const valueSize = size === "small" ? 18 : size === "large" ? 26 : 22;
  const sdgBadgeSize = size === "small" ? 32 : size === "large" ? 48 : 40;
  const showJournal = !!(data.journalHighlight && data.showJournalHighlights && size !== "small");

  const profileUrl = profileBase ? `${profileBase}/profile/${encodeURIComponent(data.slug)}` : `/profile/${encodeURIComponent(data.slug)}`;

  const sroiLine = data.showSroi && data.totalSroi != null
    ? `<div class="hero">
        <div class="hero-value">${escapeHtml(formatCurrency(data.totalSroi))}</div>
        <div class="hero-label">of social value created</div>
      </div>`
    : "";

  const hoursLine = data.showHours && data.totalHours != null
    ? `<div class="stat"><span class="stat-value">${data.totalHours.toLocaleString("en-GB")}</span><span class="stat-label">hours volunteered</span></div>`
    : "";

  const categoryLine = data.showCategories && data.topCategory
    ? `<div class="stat"><span class="stat-value">${escapeHtml(data.topCategory.name)}</span><span class="stat-label">top focus area</span></div>`
    : "";

  const sdgBadge = data.topSdg
    ? `<div class="sdg" title="${escapeHtml(`SDG ${data.topSdg.id}: ${data.topSdg.name}`)}" aria-label="${escapeHtml(`UN Sustainable Development Goal ${data.topSdg.id}: ${data.topSdg.name}`)}">
        <div class="sdg-num" style="background:${escapeHtml(sdgColor)}">${escapeHtml(sdgInitial)}</div>
        <div class="sdg-text">
          <div class="sdg-eyebrow">Top SDG</div>
          <div class="sdg-name">${escapeHtml(data.topSdg.name)}</div>
        </div>
      </div>`
    : "";

  const journalBlock = showJournal
    ? `<div class="journal">&ldquo;${escapeHtml(data.journalHighlight!)}&rdquo;</div>`
    : "";

  // If absolutely nothing is shareable, render a minimal "active on My Impact" card.
  const hasAnyContent = sroiLine || hoursLine || categoryLine || sdgBadge;
  const fallback = !hasAnyContent
    ? `<div class="hero"><div class="hero-label">Tracking my social impact on My Impact.</div></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My Impact widget</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${fg};-webkit-font-smoothing:antialiased}
  .card{background:${bg};border:1px solid ${border};border-radius:14px;padding:${padding}px;display:flex;flex-direction:column;gap:${padding * 0.6}px;overflow:hidden}
  .header{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .title{font-size:${titleSize}px;font-weight:600;color:${fg};margin:0;line-height:1.2}
  .subtitle{font-size:11px;color:${muted};margin:0;line-height:1.2;margin-top:2px}
  .hero{display:flex;flex-direction:column;gap:2px}
  .hero-value{font-size:${valueSize}px;font-weight:700;color:${accent};line-height:1.05;letter-spacing:-0.01em}
  .hero-label{font-size:11px;color:${muted}}
  .stats{display:flex;gap:${padding * 0.75}px;flex-wrap:wrap}
  .stat{display:flex;flex-direction:column;gap:1px;min-width:0}
  .stat-value{font-size:${titleSize}px;font-weight:600;color:${fg};line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}
  .stat-label{font-size:10px;color:${muted};text-transform:uppercase;letter-spacing:0.04em}
  .sdg{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:${isDark ? "#1e293b" : "#f8fafc"};border:1px solid ${border}}
  .sdg-num{width:${sdgBadgeSize}px;height:${sdgBadgeSize}px;border-radius:8px;color:#ffffff;font-weight:700;font-size:${Math.round(sdgBadgeSize * 0.45)}px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;line-height:1}
  .sdg-text{min-width:0;display:flex;flex-direction:column}
  .sdg-eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:${muted}}
  .sdg-name{font-size:12px;font-weight:600;color:${fg};line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .journal{font-size:11px;color:${muted};font-style:italic;line-height:1.4;border-left:2px solid ${accent};padding-left:8px}
  .footer{display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:${padding * 0.5}px;border-top:1px dashed ${border}}
  .footer a{font-size:10px;color:${muted};text-decoration:none}
  .footer a:hover{color:${accent}}
  .brand{display:flex;align-items:center;gap:5px}
  .brand-dot{width:8px;height:8px;border-radius:2px;background:${accent}}
  .brand-name{font-weight:600;color:${fg};font-size:10px}
  .powered{font-size:9px;color:${muted}}
</style>
</head>
<body>
  <a class="card" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;cursor:pointer">
    <div class="header">
      <div>
        <div class="title">${escapeHtml(data.displayName)}</div>
        <div class="subtitle">My social impact</div>
      </div>
      <div class="brand">
        <div class="brand-dot"></div>
        <div class="brand-name">My Impact</div>
      </div>
    </div>
    ${sroiLine}
    ${(hoursLine || categoryLine) ? `<div class="stats">${hoursLine}${categoryLine}</div>` : ""}
    ${sdgBadge}
    ${journalBlock}
    ${fallback}
    <div class="footer">
      <span class="powered">Powered by My Impact</span>
      <span class="powered">View profile →</span>
    </div>
  </a>
<script>
  function reportHeight(){
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    parent.postMessage({__myImpactWidget:true,height:h},'*');
  }
  reportHeight();
  window.addEventListener('load', reportHeight);
  if (window.ResizeObserver) {
    new ResizeObserver(reportHeight).observe(document.body);
  } else {
    window.addEventListener('resize', reportHeight);
  }
</script>
</body>
</html>`;
}

// ── GET /api/public-profile/:slug — public page data (no auth, rate limited) ──
router.get("/:slug", publicRateLimit, async (req: Request, res: Response) => {
  const slug = (req.params.slug ?? "").trim().toLowerCase();

  const profile = await db.query.publicProfilesTable.findFirst({
    where: eq(publicProfilesTable.slug, slug),
  });

  if (!profile || !profile.isEnabled) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, profile.userId),
  });

  if (!user) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  // Track the public profile view. We log the slug (an opaque public
  // identifier the user chose) but never the viewer's identity — public
  // profiles are anonymous reads.
  trackServerEvent({
    eventName: "public_profile_view",
    userId: profile.userId,
    surface: "member",
    props: { slug },
  });

  // Compute totals via DB aggregates so all records are included (no arbitrary cap)
  let totalHours: number | null = null;
  let totalSroi: number | null = null;
  let verifiedHours: number | null = null;
  if (profile.showHours || profile.showSroi || profile.showCategories) {
    const [agg] = await db
      .select({
        sumHours: drizzleSum(impactRecordsTable.totalHours),
        sumSroi: drizzleSum(sql`${impactRecordsTable.totalValue}::numeric`),
      })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    if (profile.showHours) totalHours = parseInt(agg?.sumHours ?? "0", 10) || 0;
    if (profile.showSroi) totalSroi = parseFloat(agg?.sumSroi as string ?? "0") || 0;

    if (profile.showHours) {
      const [vAgg] = await db
        .select({ sumHours: drizzleSum(impactRecordsTable.totalHours) })
        .from(recordVerificationsTable)
        .innerJoin(impactRecordsTable, eq(impactRecordsTable.id, recordVerificationsTable.recordId))
        .where(sql`${recordVerificationsTable.status} = 'approved' AND ${impactRecordsTable.userId} = ${profile.userId}`);
      verifiedHours = parseInt(vAgg?.sumHours ?? "0", 10) || 0;
    }
  }

  // Aggregate category hours — load all records for the user (no limit)
  const categoryHours: Record<string, number> = {};
  if (profile.showCategories) {
    const records = await db
      .select({ activitiesJson: impactRecordsTable.activitiesJson })
      .from(impactRecordsTable)
      .where(eq(impactRecordsTable.userId, profile.userId));

    for (const record of records) {
      const activities = record.activitiesJson as Array<{ category?: string; hours?: number }>;
      if (Array.isArray(activities)) {
        for (const act of activities) {
          if (act.category && typeof act.hours === "number") {
            categoryHours[act.category] = (categoryHours[act.category] ?? 0) + act.hours;
          }
        }
      }
    }
  }

  // Journal highlights (most recent 3 journal entries with text)
  let journalHighlights: Array<{ text: string; createdAt: string }> = [];
  if (profile.showJournalHighlights) {
    const entries = await db
      .select({
        text: journalEntriesTable.text,
        createdAt: journalEntriesTable.createdAt,
      })
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.userId, profile.userId))
      .orderBy(desc(journalEntriesTable.createdAt))
      .limit(10);

    journalHighlights = entries
      .filter((e) => e.text && e.text.trim().length > 0)
      .slice(0, 3)
      .map((e) => ({ text: e.text!, createdAt: e.createdAt.toISOString() }));
  }

  res.json({
    profile: {
      slug: profile.slug,
      displayName: user.displayName,
      customMessage: profile.customMessage,
      showHours: profile.showHours,
      showSroi: profile.showSroi,
      showCategories: profile.showCategories,
      showJournalHighlights: profile.showJournalHighlights,
    },
    stats: {
      totalHours: profile.showHours ? totalHours : null,
      verifiedHours: profile.showHours ? verifiedHours : null,
      totalSroi: profile.showSroi ? totalSroi : null,
      categoryHours: profile.showCategories ? categoryHours : null,
    },
    journalHighlights: profile.showJournalHighlights ? journalHighlights : [],
  });
});

export default router;
