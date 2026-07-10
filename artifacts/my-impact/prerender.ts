/**
 * prerender.ts — lightweight static pre-render for public pages.
 *
 * Reads the Vite-built dist/public/index.html shell, injects per-page
 * metadata (title, description, canonical, robots) and writes each page as
 * dist/public/<path>/index.html so crawlers receive the correct tags
 * without executing JavaScript.
 *
 * No headless browser required — we use string injection because the app
 * already defines all metadata in PageMeta / Helmet component props.
 *
 * Metadata is sourced from src/lib/page-metadata.ts, which is also
 * imported by each page component. Updating copy there automatically
 * keeps both the live app and the pre-rendered HTML in sync.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PRERENDER_PAGES } from "./src/lib/page-metadata.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist", "public");

function escape(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectMeta(html: string, page: (typeof PRERENDER_PAGES)[number]): string {
  const { title, description, canonical, robots } = page;

  const escapedTitle = escape(title);
  const escapedDesc = escape(description);

  const metaTags = [
    `  <meta name="description" content="${escapedDesc}" />`,
    `  <meta name="robots" content="${robots}" />`,
    canonical ? `  <link rel="canonical" href="${canonical}" />` : null,
    `  <meta property="og:title" content="${escapedTitle}" />`,
    `  <meta property="og:description" content="${escapedDesc}" />`,
    canonical ? `  <meta property="og:url" content="${canonical}" />` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Replace the placeholder title the Vite build puts in index.html
  let result = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`);

  // Remove any pre-existing description / canonical / robots metas that Vite
  // might have copied from index.html, then inject fresh ones after <head>
  result = result
    .replace(/<meta\s+name="description"[^>]*>/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "");

  result = result.replace(/<head>/, `<head>\n${metaTags}`);

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

function main(): void {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`[prerender] dist/public/index.html not found — run 'pnpm build' first`);
    process.exit(1);
  }

  const template = readFileSync(indexPath, "utf-8");

  for (const page of PRERENDER_PAGES) {
    const html = injectMeta(template, page);
    writeHtml(page.path, html);
  }

  console.log(`[prerender] done — ${PRERENDER_PAGES.length} pages written`);
}

main();
