import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("Spec 3 — journal entry create, edit, delete", () => {
  let api: TestApi;
  const email = uniqueEmail("journal");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("create, verify, then delete a journal entry", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    await page.goto("/journal");

    // Open the new-entry composer.
    await page.getByRole("button", { name: /^new entry$/i }).click();

    const composer = page.getByPlaceholder(/write freely\. this is just for you/i).first();
    await composer.waitFor({ state: "visible" });
    const entryText = `E2E test reflection ${Date.now()}`;
    await composer.fill(entryText);
    await page.getByRole("button", { name: /^save entry$/i }).click();

    // The new entry appears in the feed as a rendered paragraph. We scope
    // to the paragraph because the open composer textarea also still
    // contains the same text, which would otherwise trip strict mode.
    const renderedEntry = page
      .getByRole("paragraph")
      .filter({ hasText: entryText });
    await expect(renderedEntry).toBeVisible({ timeout: 10_000 });

    // Verify against the API that a single entry exists.
    let listRes = await page.request.get("/api/journal");
    expect(listRes.ok()).toBe(true);
    let listBody = (await listRes.json()) as { entries: Array<{ id: string; text?: string }> };
    expect(listBody.entries).toHaveLength(1);
    expect(listBody.entries[0]?.text).toBe(entryText);

    // Delete the entry — the trash icon is visible on hover (group-hover).
    // The icon-only button has no accessible name, so locate it by
    // structure: it sits inside the entry's outer card (`group` class)
    // alongside the rendered paragraph. Force-click bypasses the
    // opacity-0 visibility gate from the hover-reveal styling.
    const entryCard = page
      .locator("div.group", { has: renderedEntry })
      .first();
    await entryCard.hover();
    await entryCard.locator("button").first().click({ force: true });

    // After deletion the rendered entry should disappear from the page.
    await expect(renderedEntry).toHaveCount(0, { timeout: 10_000 });

    // And the API should report zero entries.
    listRes = await page.request.get("/api/journal");
    listBody = (await listRes.json()) as { entries: Array<{ id: string }> };
    expect(listBody.entries).toHaveLength(0);
  });
});
