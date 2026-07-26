#!/usr/bin/env node
// Bundle-size budget check for artifacts/my-impact.
//
// Measures the gzipped size of every JS chunk in dist/public/assets (all
// build-emitted JS, including workers, lands there) and asserts it against
// artifacts/my-impact/bundle-budgets.json. Fails (exit 1) with a clear table
// of offending chunks when any per-chunk or total budget is exceeded.
//
// Usage: node scripts/check-bundle-size.mjs
// (run `pnpm --filter @workspace/my-impact run build` first, or use `pnpm size`)

import { readdirSync, readFileSync, statSync, existsSync, appendFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "artifacts", "my-impact");
const assetsDir = path.join(appDir, "dist", "public", "assets");
const budgetsPath = path.join(appDir, "bundle-budgets.json");

if (!existsSync(assetsDir)) {
  console.error(`No build output at ${assetsDir}.`);
  console.error("Run: pnpm --filter @workspace/my-impact run build");
  process.exit(2);
}

const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"));
const rules = budgets.chunks
  .filter((c) => c.pattern !== "default")
  .map((c) => ({ ...c, re: new RegExp(c.pattern) }));
const defaultRule = budgets.chunks.find((c) => c.pattern === "default");
if (!defaultRule) {
  console.error("bundle-budgets.json must define a 'default' chunk budget.");
  process.exit(2);
}

// Strip the Vite content hash: "index-DlyEGm3B.js" -> "index".
// Hash length is config-dependent, so drop everything after the last dash
// (leaving something before it). Budget patterns are prefix-anchored, so even
// a hash that itself contains a dash still matches the right rule.
function baseName(file) {
  const name = file.replace(/\.js$/, "");
  const idx = name.lastIndexOf("-");
  return idx > 0 ? name.slice(0, idx) : name;
}

const files = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
if (files.length === 0) {
  console.error(`No JS chunks found in ${assetsDir}; build looks broken.`);
  process.exit(2);
}

const KiB = 1024;
const results = [];
let totalGzip = 0;

for (const file of files.sort()) {
  const full = path.join(assetsDir, file);
  if (!statSync(full).isFile()) continue;
  const gzip = gzipSync(readFileSync(full), { level: 9 }).length;
  totalGzip += gzip;
  const name = baseName(file);
  const rule = rules.find((r) => r.re.test(name)) ?? defaultRule;
  const maxBytes = rule.maxKiB * KiB;
  results.push({
    file,
    gzip,
    maxKiB: rule.maxKiB,
    pattern: rule.pattern,
    over: gzip > maxBytes,
  });
}

const totalMaxBytes = budgets.totalMaxKiB * KiB;
const totalOver = totalGzip > totalMaxBytes;
const offenders = results.filter((r) => r.over);

const fmt = (bytes) => (bytes / KiB).toFixed(1).padStart(8) + " KiB";

console.log(`Bundle size check — ${results.length} JS chunks in artifacts/my-impact`);
console.log("");
const top = [...results].sort((a, b) => b.gzip - a.gzip).slice(0, 10);
console.log("Largest chunks (gzip):");
for (const r of top) {
  const flag = r.over ? "  ❌ OVER" : "";
  console.log(`  ${fmt(r.gzip)}  (budget ${String(r.maxKiB).padStart(4)} KiB)  ${r.file}${flag}`);
}
console.log("");
console.log(
  `Total JS (gzip): ${(totalGzip / KiB).toFixed(1)} KiB / budget ${budgets.totalMaxKiB} KiB` +
    (totalOver ? "  ❌ OVER" : "  ✅"),
);

let summary = "";
if (offenders.length > 0 || totalOver) {
  console.log("");
  console.log("❌ Bundle size budget exceeded:");
  summary += "## ❌ Bundle size budget exceeded\n\n";
  summary += "| Chunk | Gzip size | Budget | Rule |\n|---|---|---|---|\n";
  for (const r of offenders) {
    console.log(
      `  - ${r.file}: ${(r.gzip / KiB).toFixed(1)} KiB gzip > ${r.maxKiB} KiB budget (rule: ${r.pattern})`,
    );
    summary += `| \`${r.file}\` | ${(r.gzip / KiB).toFixed(1)} KiB | ${r.maxKiB} KiB | \`${r.pattern}\` |\n`;
  }
  if (totalOver) {
    console.log(
      `  - TOTAL JS: ${(totalGzip / KiB).toFixed(1)} KiB gzip > ${budgets.totalMaxKiB} KiB budget`,
    );
    summary += `| **TOTAL JS** | ${(totalGzip / KiB).toFixed(1)} KiB | ${budgets.totalMaxKiB} KiB | total |\n`;
  }
  console.log("");
  console.log(
    "Fix by code-splitting / lazy-loading the offending route or dependency, or —",
  );
  console.log(
    "if the growth is deliberate — raise the budget in artifacts/my-impact/bundle-budgets.json",
  );
  console.log("and explain why in the PR description.");
  summary +=
    "\nFix by code-splitting or lazy-loading the offending dependency, or raise the budget in `artifacts/my-impact/bundle-budgets.json` with an explanation in the PR description.\n";
} else {
  console.log("");
  console.log("✅ All bundle size budgets pass.");
  summary = `## ✅ Bundle size budgets pass\n\nTotal JS (gzip): ${(totalGzip / KiB).toFixed(1)} KiB / ${budgets.totalMaxKiB} KiB budget across ${results.length} chunks.\n`;
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

process.exit(offenders.length > 0 || totalOver ? 1 : 0);
