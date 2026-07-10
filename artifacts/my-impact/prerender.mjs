/**
 * prerender.mjs — lightweight static pre-render for public pages.
 *
 * Reads the Vite-built dist/public/index.html shell, injects per-page
 * metadata (title, description, canonical, robots) and writes each page as
 * dist/public/<path>/index.html so crawlers receive the correct tags
 * without executing JavaScript.
 *
 * No headless browser required — we use string injection because the app
 * already defines all metadata in PageMeta / Helmet component props.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = resolve(__dirname, "dist", "public");
const SITE = "https://myimpact.uk";

// Public pages to pre-render.
// Keep in sync with the sitemap and OrgDemoPage / individual page components.
const PAGES = [
  {
    path: "/",
    title: "My Impact — Calculate the social value of your volunteering and community work",
    description:
      "Free tool to measure, track, and share the social value you create through volunteering, community work, and positive actions. Powered by SROI methodology and Social Value Engine data.",
    canonical: `${SITE}/`,
    robots: "index, follow",
  },
  {
    path: "/about",
    title: "About My Impact — Making the invisible visible",
    description:
      "My Impact is a free tool that converts volunteering, community work, and caring into a defensible monetary figure using SROI methodology and Social Value Engine proxies.",
    canonical: `${SITE}/about`,
    robots: "index, follow",
  },
  {
    path: "/methodology",
    title: "Methodology & Evidence — How My Impact calculates social value",
    description:
      "How My Impact calculates social value: SROI methodology, Social Value Engine proxies, UN SDG mapping, verification approach, and the citations behind every number.",
    canonical: `${SITE}/methodology`,
    robots: "index, follow",
  },
  {
    path: "/whats-new",
    title: "What's New — My Impact",
    description:
      "The latest features, improvements, and updates to My Impact. See what's been shipped for individuals and organisations.",
    canonical: `${SITE}/whats-new`,
    robots: "index, follow",
  },
  {
    path: "/contact",
    title: "Contact Us — My Impact",
    description:
      "Get in touch with the My Impact team. We'll respond within 1–2 working days.",
    canonical: `${SITE}/contact`,
    robots: "index, follow",
  },
  {
    path: "/org/demo",
    title: "Organisation Dashboard Demo — My Impact",
    description:
      "See how My Impact helps schools, charities, local authorities, and universities track aggregated social value across their members. Explore the live demo dashboard.",
    canonical: `${SITE}/org/demo`,
    robots: "index, follow",
  },
  {
    path: "/404",
    title: "Page not found — My Impact",
    description: "The page you're looking for doesn't exist.",
    canonical: null,
    robots: "noindex, follow",
  },
];

function escape(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function injectMeta(html, page) {
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

function writeHtml(pagePath, html) {
  const isRoot = pagePath === "/";
  // Root is already written as dist/public/index.html by Vite; skip the
  // directory-index write for "/" but still patch the root index.html.
  const outDir = isRoot ? DIST : join(DIST, ...pagePath.replace(/^\//, "").split("/"));
  if (!isRoot) mkdirSync(outDir, { recursive: true });
  const outFile = isRoot ? join(DIST, "index.html") : join(outDir, "index.html");
  writeFileSync(outFile, html, "utf-8");
  console.log(`[prerender] wrote ${outFile}`);
}

function main() {
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`[prerender] dist/public/index.html not found — run 'pnpm build' first`);
    process.exit(1);
  }

  const template = readFileSync(indexPath, "utf-8");

  for (const page of PAGES) {
    const html = injectMeta(template, page);
    writeHtml(page.path, html);
  }

  console.log(`[prerender] done — ${PAGES.length} pages written`);
}

main();
