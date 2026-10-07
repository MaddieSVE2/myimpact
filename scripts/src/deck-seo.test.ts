import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { ensureDeckSocialMetadata, ensureDeckSummary } from "./deck-seo.js";

const root = resolve(import.meta.dirname, "../..");

for (const slug of ["pitch-deck", "pitch-deck-orgs"]) {
  test(`${slug} share metadata points to its hosted image`, () => {
    const deckDir = resolve(root, "artifacts", slug);
    const html = readFileSync(resolve(deckDir, "dist/public/index.html"), "utf8");
    const imageUrl = `https://myimpact.uk/${slug}/social-preview.jpg`;
    assert.ok(html.includes(`property="og:image" content="${imageUrl}"`));
    assert.ok(html.includes(`name="twitter:image" content="${imageUrl}"`));
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.ok(html.includes(`property="og:url" content="https://myimpact.uk/${slug}/"`));
    assert.doesNotMatch(html, /replit\.com\/public\/images\/opengraph|@replit|built with React and Tailwind CSS/);
    const image = readFileSync(resolve(deckDir, "dist/public/social-preview.jpg"));
    assert.ok(image.length > 10_000);
    assert.equal(image[0], 0xff);
    assert.equal(image[1], 0xd8);
  });

  test(`${slug} replaces old social tags in an untracked deck shell`, () => {
    const original = '<head><meta property="og:image" content="https://replit.com/public/images/opengraph.png" /><meta name="twitter:site" content="@replit" /></head>';
    const result = ensureDeckSocialMetadata(original, slug);
    assert.doesNotMatch(result, /@replit|replit\.com/);
    assert.match(result, new RegExp(`https://myimpact.uk/${slug}/social-preview.jpg`));
    assert.equal((result.match(/property="og:image"/g) ?? []).length, 1);
    assert.equal((result.match(/name="twitter:card"/g) ?? []).length, 1);
    assert.equal((ensureDeckSocialMetadata(result, slug).match(/property="og:image"/g) ?? []).length, 1);
  });

  test(`${slug} has a crawlable summary without JavaScript`, () => {
    const slides = JSON.parse(readFileSync(resolve(root, "artifacts", slug, "src/data/slides-manifest.json"), "utf8"));
    const shell = '<html><head><title>My Impact</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
    const html = ensureDeckSummary(shell, slug, slides);
    assert.match(html, /<h1>My Impact<\/h1>/);
    assert.match(html, /<section aria-label="Presentation summary">/);
    assert.match(html, /href="\/organisations"/);
    for (const slide of slides) {
      assert.ok(html.includes(`href="/${slug}/slide${slide.position}"`));
      if (slide.position !== 1) {
        const escaped = slide.description.replace(/[&<>"']/g, (character: string) => ({
          "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        })[character as "&" | "<" | ">" | '"' | "'"]!);
        assert.ok(html.includes(escaped));
      }
    }
    assert.equal(ensureDeckSummary(html, slug, slides), html);
  });

  test(`${slug} production HTML contains its overview and every slide link`, () => {
    const deckDir = resolve(root, "artifacts", slug);
    const slides = JSON.parse(readFileSync(resolve(deckDir, "src/data/slides-manifest.json"), "utf8"));
    const html = readFileSync(resolve(deckDir, "dist/public/index.html"), "utf8");
    assert.match(html, /<main id="presentation-summary"/);
    assert.match(html, /<h1(?:\s[^>]*)?>[^<]+<\/h1>/);
    assert.match(html, /href="\/organisations"/);
    assert.match(html, /<h2/);
    for (const slide of slides) assert.ok(html.includes(`href="/${slug}/slide${slide.position}"`));
  });
}