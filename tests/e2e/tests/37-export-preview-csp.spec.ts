import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 37 — The organisation export preview works under the live site's
 * Content-Security-Policy.
 *
 * The dev server sends no policy, so pages here get the one from serve.mjs,
 * which the published site uses. The preview broke once already because the
 * policy blocked what the PDF viewer loaded.
 */
function productionPolicy(): string {
  const serve = readFileSync(new URL("../../../artifacts/my-impact/serve.mjs", import.meta.url), "utf8");
  const block = serve.match(/const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join\("; "\);/);
  if (!block?.[1]) throw new Error("CONTENT_SECURITY_POLICY not found in serve.mjs");
  return [...block[1].matchAll(/^\s*"([^"]+)",?\s*$/gm)].map((m) => m[1]).join("; ");
}

test.describe("Spec 37 — export preview under the live policy", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("exp37");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    if (orgId) await api.deleteOrg(orgId);
    await api.resetUser(managerEmail);
    await api.dispose();
  });

  test("the live preview shows the report", async ({ browser }) => {
    const org = await api.createOrg("Spec 37 College", "charity", managerEmail, "consented_logging");
    orgId = org.orgId;

    // Pages the service worker serves would skip the route below.
    const context = await browser.newContext({ locale: "en-GB", serviceWorkers: "block" });
    const policy = productionPolicy();
    const blocked: string[] = [];
    await context.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
    });

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (/Content Security Policy/i.test(msg.text())) blocked.push(msg.text());
    });
    await signInWithMagicLink(page, api, managerEmail);
    const join = await page.request.post("/api/org/join", {
      data: { inviteCode: org.inviteCode, orgId: org.orgId, consentScope: "historic", consentHistoricFrom: "2020-01-01" },
    });
    expect(join.ok(), await join.text()).toBeTruthy();
    const saved = await page.request.post("/api/impact/save", {
      data: { userId: "", name: "My Impact Record", activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: 12 }], donationsGBP: 0, additionalVolunteerHours: 0, force: true },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    await page.goto("/org/export");
    const card = page.getByTestId("export-preview-card");
    await expect(card.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/could not (load|build) preview/i)).toHaveCount(0);
    expect(blocked.filter((m) => /connect-src|worker-src/.test(m))).toEqual([]);
  });
});
