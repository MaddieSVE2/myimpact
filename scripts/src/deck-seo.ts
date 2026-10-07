import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Slide = { position: number; title: string; description: string };

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);

export function ensureDeckSocialMetadata(html: string, slug: string): string {
  if (!/^pitch-deck(?:-orgs)?$/.test(slug)) throw new Error(`Unsupported deck: ${slug}`);
  const organisations = slug === "pitch-deck-orgs";
  const title = organisations ? "My Impact — For Organisations Pitch Deck" : "My Impact — Pitch Deck";
  const description = organisations
    ? "See how organisations can measure, celebrate and report the social value their people create with My Impact."
    : "See how My Impact helps people measure the social value of their community contributions.";
  const image = `https://myimpact.uk/${slug}/social-preview.jpg`;
  const alt = organisations
    ? "My Impact for organisations: make the social value your people create visible."
    : "My Impact pitch deck: You already make a difference. Now see what it's worth.";
  if (!html.includes("</head>")) throw new Error(`${slug}: missing HTML head`);

  // Deck sources are intentionally Git-ignored; remove any old social tags from
  // the local Vite shell before injecting the canonical production share card.
  const cleaned = html.replace(/<meta\b[^>]*>/g, (tag) =>
    /\b(?:name|property)="(?:og:[^"]+|twitter:[^"]+)"/.test(tag) ? "" : tag);
  return cleaned.replace("</head>", `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://myimpact.uk/${slug}/" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${escapeHtml(alt)}" />
  </head>`);
}

/**
 * The decks themselves are deliberately excluded from Git. This build step
 * reads their local manifests and makes the static deployment indexable even
 * when a slide artifact still has the default empty Vite shell.
 */
export function ensureDeckSummary(html: string, slug: string, slides: Slide[]): string {
  if (!/^pitch-deck(?:-orgs)?$/.test(slug)) throw new Error(`Unsupported deck: ${slug}`);
  if (!slides.length || slides.some((slide) => !Number.isInteger(slide.position) || !slide.title || !slide.description)) {
    throw new Error(`${slug}: slide manifest needs positions, titles and descriptions`);
  }
  if (!html.includes('<div id="root"></div>')) throw new Error(`${slug}: missing Vite root`);

  // Hand-authored summaries take precedence, but must still cover every slide.
  if (html.includes('id="presentation-summary"')) {
    if (!slides.every((slide) => html.includes(`href="/${slug}/slide${slide.position}"`))) {
      throw new Error(`${slug}: the HTML summary is missing slide links`);
    }
    return html;
  }

  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title) throw new Error(`${slug}: missing page title`);
  const summary = `<main id="presentation-summary" style="background:#f7f5ef;color:#213547;font:16px/1.65 system-ui,sans-serif;padding:clamp(24px,5vw,72px)">
    <div style="max-width:800px;margin:auto">
      <h1>${title}</h1>
      <p>${escapeHtml(slides.find((slide) => slide.position !== 1)?.description ?? slides[0].description)}</p>
      <nav aria-label="Presentation contents"><h2>Explore the presentation</h2><ol>
        ${slides.map((slide) => `<li><a href="/${slug}/slide${slide.position}">${escapeHtml(slide.title)}</a></li>`).join("\n")}
      </ol></nav>
      <section aria-label="Presentation summary">
        ${slides.filter((slide) => slide.position !== 1).map((slide) => `<section><h2>${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.description)}</p></section>`).join("\n")}
      </section>
      <p>Learn more at <a href="/organisations">My Impact for organisations</a> or <a href="/">My Impact</a>.</p>
    </div>
  </main>`;
  return html.replace('<div id="root"></div>', `<div id="root"></div>\n${summary}`);
}

export function renderDeckBuild(slug: string, workspaceRoot: string): void {
  if (!/^pitch-deck(?:-orgs)?$/.test(slug)) throw new Error(`Unsupported deck: ${slug}`);
  const deckDir = resolve(workspaceRoot, "artifacts", slug);
  const manifest = JSON.parse(readFileSync(resolve(deckDir, "src/data/slides-manifest.json"), "utf8")) as Slide[];
  const indexPath = resolve(deckDir, "dist/public/index.html");
  const html = ensureDeckSummary(
    ensureDeckSocialMetadata(readFileSync(indexPath, "utf8"), slug), slug, manifest);
  if (!html.includes("<h1") || !html.includes('href="/organisations"') ||
    !manifest.every((slide) => html.includes(`href="/${slug}/slide${slide.position}"`))) {
    throw new Error(`${slug}: built HTML is missing crawlable content`);
  }
  writeFileSync(indexPath, html);
  copyFileSync(
    resolve(workspaceRoot, "scripts/assets", `${slug}-social-preview.jpg`),
    resolve(deckDir, "dist/public/social-preview.jpg"),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage: pnpm --filter @workspace/scripts prerender:deck <deck-slug>");
  renderDeckBuild(slug, resolve(import.meta.dirname, "../.."));
}