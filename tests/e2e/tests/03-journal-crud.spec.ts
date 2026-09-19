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

  test("create with context, edit safely, browse by date, then delete", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    await page.goto("/journal");

    // Open the new-entry composer.
    await page.getByRole("button", { name: /^new entry$/i }).click();

    const chosenPrompt = "What small moment from today do you want to remember?";
    await page.getByRole("button", { name: chosenPrompt }).click();
    const composer = page.getByPlaceholder(/write freely\. this is just for you/i).first();
    await composer.waitFor({ state: "visible" });
    const entryText = `E2E test reflection ${Date.now()}`;
    await composer.fill(entryText);
    await page.getByRole("button", { name: /^tag$/i }).click();
    await page.getByPlaceholder("Add context…").fill("Community Work");
    await page.getByPlaceholder("Add context…").press("Enter");

    const photoInput = page.locator('input[type="file"]').first();
    await photoInput.setInputFiles({
      name: "journal-preview.png",
      mimeType: "image/png",
      buffer: Buffer.from("staged-photo-preview"),
    });
    await expect(page.getByAltText("Selected journal photo preview")).toBeVisible();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByAltText("Selected journal photo preview")).toHaveCount(0);

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
    let listBody = (await listRes.json()) as { entries: Array<{ id: string; text?: string; prompt?: string; tags?: string[] }> };
    expect(listBody.entries).toHaveLength(1);
    expect(listBody.entries[0]?.text).toBe(entryText);
    expect(listBody.entries[0]?.prompt).toBe(chosenPrompt);
    expect(listBody.entries[0]?.tags).toEqual(["community-work"]);

    const entryCard = page.locator("div.group", { has: renderedEntry }).first();
    await entryCard.getByRole("button", { name: /^tag$/i }).click();
    await entryCard.getByPlaceholder("Add tag…").fill("After Save");
    await entryCard.getByPlaceholder("Add tag…").press("Enter");
    await expect(entryCard.getByText("#after-save")).toBeVisible();

    await entryCard.getByRole("button", { name: "Edit journal entry" }).click();
    const editBox = entryCard.getByLabel("Journal entry");
    await editBox.fill("This edit should be cancelled");
    await entryCard.getByRole("button", { name: "Cancel" }).click();
    await expect(renderedEntry).toBeVisible();

    await entryCard.getByRole("button", { name: "Edit journal entry" }).click();
    const editedText = `${entryText} — edited`;
    await entryCard.getByLabel("Journal entry").fill(editedText);
    await entryCard.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(editedText, { exact: true })).toBeVisible();
    listRes = await page.request.get("/api/journal");
    listBody = (await listRes.json()) as { entries: Array<{ id: string; text?: string; prompt?: string; tags?: string[] }> };
    expect(listBody.entries[0]?.tags).toEqual(["community-work", "after-save"]);

    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByText("Dates with a dot contain journal entries.")).toBeVisible();
    const today = new Date();
    await page.locator(`[data-day="${today.toLocaleDateString()}"]`).click();
    await expect(page.getByText(editedText, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Delete journal entry" }).click();

    // After deletion the rendered entry should disappear from the page.
    await expect(page.getByText(editedText, { exact: true })).toHaveCount(0, { timeout: 10_000 });

    // And the API should report zero entries.
    listRes = await page.request.get("/api/journal");
    listBody = (await listRes.json()) as { entries: Array<{ id: string }> };
    expect(listBody.entries).toHaveLength(0);
  });

  test("attachment counts endpoint returns 200 with empty journals object for entries with no photos", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // Create two journal entries with no photos attached.
    const createRes1 = await page.request.post("/api/journal", {
      data: { text: `Attachment count test A ${Date.now()}` },
    });
    expect(createRes1.ok()).toBe(true);
    const entry1 = (await createRes1.json()) as { id: number };

    const createRes2 = await page.request.post("/api/journal", {
      data: { text: `Attachment count test B ${Date.now()}` },
    });
    expect(createRes2.ok()).toBe(true);
    const entry2 = (await createRes2.json()) as { id: number };

    // Query the bulk counts endpoint for both journal IDs.
    const countsRes = await page.request.get(
      `/api/attachments/counts?journalIds=${entry1.id},${entry2.id}`
    );
    expect(countsRes.status()).toBe(200);

    const countsBody = (await countsRes.json()) as {
      records: Record<string, number>;
      journals: Record<string, number>;
    };

    // Neither entry has photos, so journals must be an empty object.
    expect(countsBody.journals).toEqual({});

    // Clean up the entries created in this test.
    await page.request.delete(`/api/journal/${entry1.id}`);
    await page.request.delete(`/api/journal/${entry2.id}`);
  });
});
