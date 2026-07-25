import { createServer } from "node:http";
import { createReadStream, statSync, readFileSync, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isKnownRoute } from "./valid-routes.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// Allow tests to point the static server at an arbitrary build output
// without mutating the on-disk dist tree. Production deploys leave this
// unset and the default `dist/public` location is used.
const ROOT = process.env.STATIC_ROOT
  ? resolve(process.env.STATIC_ROOT)
  : resolve(__dirname, "dist", "public");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const IMMUTABLE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

function isHashedAsset(pathname) {
  // Vite default: `[name]-[hash].[ext]` under /assets/
  return /^\/assets\/.+[-.][A-Za-z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(pathname);
}

// ── SSR metadata injection for public slug routes ─────────────────────────────
//
// /profile/:slug  and  /org/share/:slug  are dynamically rendered by React, so
// the static SPA shell carries no slug-specific metadata.  Non-JS crawlers and
// social preview bots therefore only see the generic app shell.
//
// At request-time we fetch the slug's data from the API, inject the correct
// <title>, <meta name="description">, robots, canonical, and Open Graph tags
// into the SPA shell HTML, and return the patched HTML.  React then hydrates
// normally on the client.  Callers receive no extra latency on static assets.
//
// Falls back gracefully to the unpatched shell if the API is unreachable.

const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "");
const API_BASE = APP_URL
  ? `${APP_URL}/api`
  : `http://localhost:${process.env.API_PORT ?? 4000}/api`;

const PROFILE_RE = /^\/profile\/([^/?#]+)/;
const SHARE_RE   = /^\/org\/share\/([^/?#]+)/;
const OG_IMAGE   = "https://myimpact.uk/opengraph.jpg";

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectSlugMeta(shell, { title, description, canonical, robots }) {
  const tags = [
    `  <meta name="description" content="${escHtml(description)}" />`,
    `  <meta name="robots" content="${escHtml(robots)}" />`,
    canonical ? `  <link rel="canonical" href="${escHtml(canonical)}" />` : null,
    `  <meta property="og:title" content="${escHtml(title)}" />`,
    `  <meta property="og:description" content="${escHtml(description)}" />`,
    canonical ? `  <meta property="og:url" content="${escHtml(canonical)}" />` : null,
    `  <meta property="og:image" content="${escHtml(OG_IMAGE)}" />`,
    `  <meta property="og:image:width" content="1200" />`,
    `  <meta property="og:image:height" content="630" />`,
    `  <meta property="og:site_name" content="My Impact" />`,
    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${escHtml(title)}" />`,
    `  <meta name="twitter:description" content="${escHtml(description)}" />`,
    `  <meta name="twitter:image" content="${escHtml(OG_IMAGE)}" />`,
  ]
    .filter(Boolean)
    .join("\n");

  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/<head>/, `<head>\n${tags}`);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function buildProfileMeta(slug, data) {
  const canonical = `https://myimpact.uk/profile/${encodeURIComponent(slug)}`;
  if (!data) {
    return {
      title: "Volunteer Social Impact Profile — My Impact",
      description:
        "View a volunteer's impact profile on My Impact — hours contributed, estimated social value, and community activities.",
      canonical,
      robots: "noindex, nofollow",
    };
  }
  const name = data.profile?.displayName ?? "Someone";
  const parts = [`${name} has shared their social impact on My Impact.`];
  const hours = data.stats?.totalHours;
  const sroi = data.stats?.totalSroi;
  if (data.profile?.showHours && hours != null) {
    parts.push(`${hours.toLocaleString("en-GB")} volunteering hours.`);
  }
  if (data.profile?.showSroi && sroi != null) {
    const formatted =
      sroi >= 1_000_000
        ? `£${(sroi / 1_000_000).toFixed(1)}m`
        : sroi >= 1_000
        ? `£${(sroi / 1_000).toFixed(0)}k`
        : `£${sroi.toLocaleString("en-GB")}`;
    parts.push(`${formatted} estimated social value.`);
  }
  return {
    title: `${name}'s Social Impact Profile — My Impact`,
    description: parts.join(" "),
    canonical,
    robots: "index, follow",
  };
}

function buildShareMeta(slug, data) {
  if (!data) {
    return {
      title: "Organisation Impact Report — My Impact",
      description:
        "View an organisation's anonymised, aggregated impact data — total social value, volunteer hours, and member activity. Shared via My Impact.",
      canonical: undefined,
      robots: "noindex, nofollow",
    };
  }
  const orgName = data.share?.orgName ?? "Organisation";
  const funderLabel = data.share?.funderLabel ?? null;
  const summary = data.sections?.summary ?? null;
  const parts = [];
  if (funderLabel) parts.push(`Shared with ${funderLabel}.`);
  if (summary) {
    parts.push(
      `${orgName} has generated £${summary.totalSocialValue.toLocaleString("en-GB")} in social value across ${summary.totalMemberCount.toLocaleString("en-GB")} members.`
    );
    if (summary.totalHours) {
      parts.push(`${summary.totalHours.toLocaleString("en-GB")} total volunteering hours.`);
    }
  }
  parts.push("Anonymised aggregate impact data shared via My Impact.");
  return {
    title: `${orgName} — Organisation Impact Report | My Impact`,
    description: parts.join(" "),
    canonical: `https://myimpact.uk/org/share/${encodeURIComponent(slug)}`,
    robots: "noindex, nofollow",
  };
}

async function trySlugSsr(pathname, indexPath) {
  const profileMatch = PROFILE_RE.exec(pathname);
  const shareMatch = !profileMatch ? SHARE_RE.exec(pathname) : null;
  if (!profileMatch && !shareMatch) return null;

  if (!existsSync(indexPath)) return null;
  const shell = readFileSync(indexPath, "utf-8");

  let meta;
  if (profileMatch) {
    const slug = decodeURIComponent(profileMatch[1]);
    const data = await fetchJson(`${API_BASE}/public-profile/${encodeURIComponent(slug)}`);
    meta = buildProfileMeta(slug, data);
  } else {
    const slug = decodeURIComponent(shareMatch[1]);
    const data = await fetchJson(`${API_BASE}/org-share/${encodeURIComponent(slug)}`);
    meta = buildShareMeta(slug, data);
  }

  return injectSlugMeta(shell, meta);
}

function safeJoin(root, pathname) {
  // Strip query string and decode. Reject malformed encodings and anything
  // trying to escape the root.
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const normalized = normalize(decoded).replace(/^([/\\])+/, "");
  const full = join(root, normalized);
  const rel = resolve(full);
  if (rel !== root && !rel.startsWith(root + sep)) return null;
  return rel;
}

async function tryFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) return s;
    if (s.isDirectory()) {
      const indexPath = join(filePath, "index.html");
      const idx = await stat(indexPath);
      if (idx.isFile()) return { path: indexPath, stat: idx };
    }
  } catch {
    return null;
  }
  return null;
}

function applyHeaders(res, pathname, filePath, fileStat) {
  const ext = extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("Content-Length", String(fileStat.size));
  res.setHeader("X-Content-Type-Options", "nosniff");

  const isServiceWorker = pathname.endsWith("/service-worker.js") || pathname === "/service-worker.js";
  const isHtml = ext === ".html" || ext === "";
  if (isServiceWorker || isHtml) {
    for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.setHeader(k, v);
  } else if (isHashedAsset(pathname)) {
    for (const [k, v] of Object.entries(IMMUTABLE_HEADERS)) res.setHeader(k, v);
  } else {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  const pathname = req.url.split("?")[0];

  // ── SSR metadata injection for slug routes ──────────────────────────────────
  // Must run before the static-file check because /profile/:slug and
  // /org/share/:slug have no pre-built static file — they would fall through
  // to the index.html SPA shell which carries only generic metadata.
  const indexPath = join(ROOT, "index.html");
  const ssrHtml = await trySlugSsr(pathname, indexPath);
  if (ssrHtml !== null) {
    for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.setHeader(k, v);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.statusCode = 200;
    if (req.method === "HEAD") { res.end(); return; }
    res.end(ssrHtml);
    return;
  }

  const target = safeJoin(ROOT, pathname);
  if (!target) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  let resolvedPath = target;
  let resolvedStat = await tryFile(target);
  if (resolvedStat && "path" in resolvedStat) {
    resolvedPath = resolvedStat.path;
    resolvedStat = resolvedStat.stat;
  }

  // SPA fallback: any non-file, non-asset request checks for pre-rendered
  // pages first, then falls back to index.html for client-side routing.
  // Don't fall back for hashed asset 404s — those should remain 404 so
  // missing-bundle errors are visible instead of being masked by HTML.
  if (!resolvedStat) {
    if (isHashedAsset(pathname) || /\.[a-zA-Z0-9]+$/.test(pathname)) {
      res.statusCode = 404;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.end("Not Found");
      return;
    }

    // Decide whether this is a known React Router route or a genuine 404.
    // Known routes get index.html with HTTP 200 so the client router handles
    // them; everything else gets the pre-rendered 404 page with HTTP 404.
    const indexPath = join(ROOT, "index.html");

    if (isKnownRoute(pathname)) {
      // Valid SPA route — hand off to the client-side router.
      try {
        resolvedStat = statSync(indexPath);
        resolvedPath = indexPath;
      } catch {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
    } else {
      // Unknown path — serve the pre-rendered 404 page with a real HTTP 404.
      const not404Candidates = [join(ROOT, "404.html"), join(ROOT, "404", "index.html")];
      let not404Path = null;
      let not404Stat = null;
      for (const candidate of not404Candidates) {
        try {
          const s = statSync(candidate);
          if (s.isFile()) { not404Path = candidate; not404Stat = s; break; }
        } catch {}
      }
      if (not404Path && not404Stat) {
        applyHeaders(res, "/404.html", not404Path, not404Stat);
        res.statusCode = 404;
        if (req.method === "HEAD") { res.end(); return; }
        createReadStream(not404Path).pipe(res);
        return;
      }
      // No pre-rendered 404 page yet (dev build) — fall back to index.html
      // so the client router can render the NotFound component.
      try {
        resolvedStat = statSync(indexPath);
        resolvedPath = indexPath;
      } catch {
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
    }
  }

  applyHeaders(res, pathname, resolvedPath, resolvedStat);
  res.statusCode = 200;
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(resolvedPath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[my-impact] static server listening on http://${HOST}:${PORT} (root=${ROOT})`);
});
