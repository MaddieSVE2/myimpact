import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Spec 11 — guard against "volunteer" wording creeping back into org-facing copy.
 *
 * Org-facing copy was normalised from "volunteer(s)" to "member(s)"/"hours".
 * This static spec fails when the noun "volunteer"/"volunteers" (en) or
 * "gwirfoddolwr"/"gwirfoddolwyr" (cy) reappears in:
 *   - the orgDashboard / metricHelp sections of the en/cy locale files
 *   - the org-facing page components (dashboard, demo dashboard, settings,
 *     portal, share page)
 *
 * Deliberately allowed:
 *   - activity-type names / the gerund "volunteering" ("Food bank volunteering",
 *     Welsh "gwirfoddoli")
 *   - internal identifiers and template placeholders such as
 *     sroiCostPerVolunteer, {{costPerVolunteer}}, volunteerProgression,
 *     data-testid="cost-per-volunteer"
 *
 * It needs no browser or running server — it runs on file contents only.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const APP = path.join(ROOT, "artifacts/my-impact/src");

const ORG_PAGE_FILES = [
  "pages/OrgDashboard.tsx",
  "pages/OrgDemoDashboard.tsx",
  "pages/OrgSharePage.tsx",
  "pages/OrgSettings.tsx",
  "pages/OrgPortal.tsx",
];

const LOCALE_FILES = ["i18n/locales/en.ts", "i18n/locales/cy.ts"];

/** Only these top-level locale sections are org-facing. */
const ORG_LOCALE_SECTIONS = ["orgDashboard", "metricHelp"];

// A "token" is the word plus any identifier-ish neighbours, so that
// sroiCostPerVolunteer / cost-per-volunteer / volunteerProgression are seen
// as one token and can be allowed, while the bare noun is flagged.
const TOKEN_RE = /[A-Za-z_$-]*(?:volunteer|gwirfoddol)[A-Za-z_$-]*/gi;

function isForbiddenToken(token: string): boolean {
  const t = token.toLowerCase();
  // English: flag only the standalone noun.
  if (t === "volunteer" || t === "volunteers") return true;
  // Welsh: flag the person-nouns (gwirfoddolwr / gwirfoddolwyr / mutations),
  // and the bare adjective, but allow the gerund "gwirfoddoli...".
  if (t.startsWith("gwirfoddolw")) return true;
  if (t === "gwirfoddol" || t === "gwirfoddolion") return true;
  return false;
}

function findViolations(source: string, file: string): string[] {
  const violations: string[] = [];
  // Template placeholders like {{costPerVolunteer}} are internal identifiers.
  const cleaned = source.replace(/\{\{[^}]*\}\}/g, "");
  const lines = cleaned.split("\n");
  lines.forEach((line, i) => {
    for (const match of line.matchAll(TOKEN_RE)) {
      if (isForbiddenToken(match[0])) {
        violations.push(`${file}:${i + 1}: "${match[0]}" in: ${line.trim()}`);
      }
    }
  });
  return violations;
}

/** Extract the source text of one top-level `section: { ... }` block. */
function extractSection(source: string, section: string): string {
  const start = source.indexOf(`\n  ${section}: {`);
  expect(start, `locale section "${section}" should exist`).toBeGreaterThan(-1);
  // Sections end at the next top-level `},` at two-space indentation.
  const end = source.indexOf("\n  },", start);
  expect(end, `locale section "${section}" should be well-formed`).toBeGreaterThan(start);
  return source.slice(start, end);
}

test.describe("Spec 11 — org copy must not reintroduce 'volunteer' wording", () => {
  test("en/cy orgDashboard + metricHelp locale sections stay volunteer-free", () => {
    const violations: string[] = [];
    for (const rel of LOCALE_FILES) {
      const source = fs.readFileSync(path.join(APP, rel), "utf8");
      for (const section of ORG_LOCALE_SECTIONS) {
        const block = extractSection(source, section);
        violations.push(...findViolations(block, `${rel} (${section})`));
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  test("org page components stay volunteer-free", () => {
    const violations: string[] = [];
    for (const rel of ORG_PAGE_FILES) {
      const source = fs.readFileSync(path.join(APP, rel), "utf8");
      violations.push(...findViolations(source, rel));
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
