import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SIDEKICK_TEMPLATES,
  applyTemplateOverrides,
} from "../../my-impact/src/lib/sidekick-templates";

const readWorkspaceFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("application-writing safety", () => {
  it("keeps the results warning and does not recommend pasting the summary into applications", () => {
    const results = readWorkspaceFile("artifacts/my-impact/src/pages/Results.tsx");

    expect(results).toContain("UCAS prohibits submitting AI-written personal-statement text");
    expect(results).toContain("employers may have their own AI policies");
    expect(results).toContain("Write and verify any application in your own words");
    expect(results).not.toContain(
      "Use this in your UCAS personal statement, CV, or job application",
    );
  });

  it("uses application templates for evidence and planning, not finished copy", () => {
    const applicationCategories = new Set(["ucas", "cv", "cover_letter"]);
    const templates = SIDEKICK_TEMPLATES.filter((template) =>
      applicationCategories.has(template.category),
    );

    expect(templates).toHaveLength(3);
    for (const template of templates) {
      const promptText = Object.values(template.personaPrompts).join(" ");
      expect(promptText).toMatch(/evidence|facts|factual/i);
      expect(promptText).toMatch(/own words|write.*myself|final wording/i);
      expect(promptText).not.toMatch(/please draft|please write \d|drop into/i);
    }
  });

  it("does not let stored overrides restore unsafe application prompts", () => {
    const overridden = applyTemplateOverrides(SIDEKICK_TEMPLATES, [
      {
        templateId: "ucas_paragraph",
        label: "Paste-ready UCAS paragraph",
        description: "Finished application copy",
        personaPrompts: { default: "Write my full personal statement for me." },
      },
    ]);
    const ucas = overridden.find((template) => template.id === "ucas_paragraph");

    expect(ucas?.label).toBe("Evidence for my UCAS statement");
    expect(ucas?.personaPrompts.default).toContain("Do not write the statement for me");
    expect(ucas?.personaPrompts.default).not.toContain("Write my full personal statement");
  });

  it("instructs Sidekick to warn and redirect application-writing requests", () => {
    const route = readWorkspaceFile("artifacts/api-server/src/routes/sidekick.ts");

    expect(route).toContain("APPLICATION-WRITING SAFETY");
    expect(route).toContain(
      "UCAS prohibits submitting AI-generated personal-statement text and treats it as cheating",
    );
    expect(route).toContain("Do not produce finished or submission-ready application wording");
    expect(route).toContain("Give feedback on text the user has written");
    expect(route).not.toContain("ready-to-paste paragraph");
    expect(route).not.toContain("draft the actual language they could use");
  });
});