/**
 * prerender.ts — lightweight static pre-render for public pages.
 *
 * Reads the Vite-built HTML shell and server-rendered public route bundle,
 * then injects both route metadata and the route's React markup. Each public
 * page therefore exposes its headings, copy, navigation, and links before
 * JavaScript runs. Authenticated routes remain client-rendered.
 *
 * Metadata is sourced from src/lib/page-metadata.ts, which is also
 * imported by each page component. Updating copy there automatically
 * keeps both the live app and the pre-rendered HTML in sync.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PRERENDER_PAGES, DEFAULT_OG_IMAGE } from "./src/lib/page-metadata.ts";
import { pathToFileURL } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist", "public");

const SITE_NAME = "My Impact";

function escape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectPage(
  html: string,
  page: (typeof PRERENDER_PAGES)[number],
  body: string,
): string {
  const { title, description, canonical, robots, ogType, ogImage, jsonLd } = page;

  const resolvedOgImage = ogImage ?? DEFAULT_OG_IMAGE;
  const resolvedOgType = ogType ?? "website";

  const escapedTitle = escape(title);
  const escapedDesc = escape(description);
  const escapedOgImage = escape(resolvedOgImage);

  const metaTags = [
    `  <meta name="description" content="${escapedDesc}" />`,
    `  <meta name="robots" content="${robots}" />`,
    canonical ? `  <link rel="canonical" href="${canonical}" />` : null,

    `  <meta property="og:title" content="${escapedTitle}" />`,
    `  <meta property="og:description" content="${escapedDesc}" />`,
    `  <meta property="og:type" content="${resolvedOgType}" />`,
    canonical ? `  <meta property="og:url" content="${canonical}" />` : null,
    `  <meta property="og:image" content="${escapedOgImage}" />`,
    `  <meta property="og:image:width" content="1200" />`,
    `  <meta property="og:image:height" content="630" />`,
    `  <meta property="og:site_name" content="${escape(SITE_NAME)}" />`,
    `  <meta property="og:locale" content="en_GB" />`,

    `  <meta name="twitter:card" content="summary_large_image" />`,
    `  <meta name="twitter:title" content="${escapedTitle}" />`,
    `  <meta name="twitter:description" content="${escapedDesc}" />`,
    `  <meta name="twitter:image" content="${escapedOgImage}" />`,
  ]
    .filter(Boolean)
    .join("\n");

  const jsonLdBlocks = jsonLd && jsonLd.length > 0
    ? jsonLd
        .map(schema => `  <script type="application/ld+json">\n  ${JSON.stringify(schema)}\n  </script>`)
        .join("\n")
    : null;

  // Replace the placeholder title the Vite build puts in index.html
  let result = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`)
    // A repeated prerender may read an already-generated homepage shell.
    // Never carry its schema into a different page (or duplicate it on /).
    .replace(/<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");

  // Remove any pre-existing description / canonical / robots metas that Vite
  // might have copied from index.html, then inject fresh ones after the
  // charset tag (browsers need it within the first 1024 bytes)
  result = result
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "");

  // Pages with PageMeta render their JSON-LD inside the app, and the browser
  // renders it in the same place, so it stays in the body (moving it would
  // stop the markup matching for hydration). Only add it to <head> for a page
  // whose body has none, so it never appears twice.
  const bodyHasJsonLd = /<script type="application\/ld\+json">/.test(body);
  const injected = jsonLdBlocks && !bodyHasJsonLd ? `${metaTags}\n${jsonLdBlocks}` : metaTags;
  result = result.replace(/<meta charset="[^"]*"\s*\/?>/i, (charset) => `${charset}\n${injected}`);
  // data-prerendered tells the client which page this markup is, so it only
  // reuses it on that page (lib/prerender-hydration.ts).
  result = result.replace(
    /<div id="root"><\/div>/,
    `<div id="root" data-prerendered="${escape(page.path)}">${body}</div>`,
  );

  return result;
}
function writeHtml(pagePath: string, html: string): void {
  const isRoot = pagePath === "/";
  // Root is already written as dist/public/index.html by Vite; skip the
  // directory-index write for "/" but still patch the root index.html.
  const outDir = isRoot ? DIST : join(DIST, ...pagePath.replace(/^\//, "").split("/"));
  if (!isRoot) mkdirSync(outDir, { recursive: true });
  const outFile = isRoot ? join(DIST, "index.html") : join(outDir, "index.html");
  writeFileSync(outFile, html, "utf-8");
  console.log(`[prerender] wrote ${outFile}`);
}

function validateSitemap(): void {
  const sitemapPath = join(DIST, "sitemap.xml");
  if (!existsSync(sitemapPath)) {
    throw new Error("[prerender] dist/public/sitemap.xml not found");
  }

  const sitemap = readFileSync(sitemapPath, "utf-8");
  const sitemapUrls = new Set(
    Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]),
  );
  const expectedUrls = new Set(
    PRERENDER_PAGES
      .filter(page => page.canonical && page.robots.split(",")[0]?.trim() === "index")
      .map(page => page.canonical as string),
  );

  const missing = [...expectedUrls].filter(url => !sitemapUrls.has(url));
  const unexpected = [...sitemapUrls].filter(url => !expectedUrls.has(url));

  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : null,
    ].filter(Boolean).join("; ");
    throw new Error(`[prerender] sitemap does not match indexable canonical metadata (${details})`);
  }

  console.log(`[prerender] sitemap validated — ${sitemapUrls.size} indexable URLs`);
}

async function main(): Promise<void> {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`[prerender] dist/public/index.html not found — run 'pnpm build' first`);
    process.exit(1);
  }

  validateSitemap();

  let template = readFileSync(indexPath, "utf-8");

  // Preload the lazily-loaded route/layout chunks that every first paint
  // needs, so the browser fetches them in parallel with the entry bundle
  // instead of discovering them one network round-trip later. This directly
  // improves LCP on the homepage (and any SPA route served from this shell).
  const assetsDir = join(DIST, "assets");
  if (existsSync(assetsDir)) {
    const preloadChunks = readdirSync(assetsDir).filter((f) =>
      /^(Intro|layout|page-metadata)-.*\.js$/.test(f)
    );
    if (preloadChunks.length > 0) {
      const links = preloadChunks
        .map((f) => `  <link rel="modulepreload" crossorigin href="/assets/${f}" />`)
        .join("\n");
      template = template.replace(/<\/head>/, `${links}\n</head>`);
      // Also patch the root shell itself so non-prerendered SPA routes benefit.
      writeFileSync(indexPath, template, "utf-8");
    }
  }

  const serverEntry = join(__dirname, "dist", "server", "entry-server.js");
  if (!existsSync(serverEntry)) {
    console.error("[prerender] dist/server/entry-server.js not found — run the SSR build first");
    process.exit(1);
  }
  const { render } = await import(pathToFileURL(serverEntry).href) as {
    render: (path: string) => Promise<string>;
  };

  for (const page of PRERENDER_PAGES) {
    const body = await render(page.path);
    const html = injectPage(template, page, body);
    writeHtml(page.path, html);
  }

  console.log(`[prerender] done — ${PRERENDER_PAGES.length} pages written`);
}

await main();
