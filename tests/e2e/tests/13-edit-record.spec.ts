import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 13 — In-place record editing from History.
 *
 * Flow under test:
 *   1. Create a record through the wizard (activity + donations + extra hours).
 *   2. Open History, expand the record, click "Edit activities".
 *   3. The wizard re-opens pre-filled: the activity is already selected and
 *      the contributions step shows the original donation/extra-hours values.
 *   4. Change the donation, reveal, and click "Update entry" on Results.
 *   5. The SAME record is updated in place: no new row, the period label is
 *      preserved, and the total value reflects the new donation.
 */
test.describe("Spec 13 — edit a saved record in place from History", () => {
  let api: TestApi;
  const email = uniqueEmail("edit-record");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("editing pre-fills the wizard and saving updates the same record", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // ---- 1. Create a record through the wizard --------------------------
    await page.goto("/wizard/actions");
    if (page.url().includes("/profile/setup")) {
      const skip = page.getByRole("link", { name: /skip|maybe later|do this later/i });
      if (await skip.count()) await skip.first().click();
      await page.goto("/wizard/actions");
    }

    const postcodeInput = page.getByPlaceholder(/manchester|postcode|m1/i).first();
    await postcodeInput.waitFor({ state: "visible" });
    await postcodeInput.fill("M1");
    await page.getByRole("button", { name: /next:\s*add activities/i }).click();

    await page.waitForURL(/\/wizard\/activities/);
    const search = page.getByPlaceholder(/search activities/i);
    await search.waitFor({ state: "visible" });
    await search.fill("recycling");
    await page.getByRole("button", { name: /recycling at home/i }).first().click();
    await page.getByRole("button", { name: /next:\s*1 selected/i }).click();
    await page.getByRole("button", { name: /^done$/i }).click();

    await page.waitForURL(/\/wizard\/contributions/);
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.first().fill("50");
    await numberInputs.nth(1).fill("5");
    await page.getByRole("button", { name: /reveal my impact/i }).click();

    await page.waitForURL(/\/results/, { timeout: 30_000 });
    const saveProgress = page.getByRole("button", { name: /^save progress$/i });
    await expect(saveProgress).toBeVisible({ timeout: 15_000 });
    await saveProgress.click();
    await expect(page.getByText(/what period does this cover\?/i)).toBeVisible();
    await page.getByRole("button", { name: /^save record$/i }).click();
    await expect(page.getByRole("button", { name: /^saved!$/i })).toBeVisible({
      timeout: 15_000,
    });

    // Snapshot the created record.
    const beforeRes = await page.request.get("/api/impact/history");
    expect(beforeRes.ok()).toBe(true);
    const before = (await beforeRes.json()) as {
      records: Array<{ id: string; period: string | null; impactResult: { totalValue: number; donationsValue: number } }>;
    };
    expect(before.records.length).toBe(1);
    const original = before.records[0]!;
    expect(original.impactResult.donationsValue).toBe(50);

    // ---- 2. Open History and start the edit ------------------------------
    await page.goto("/history");
    // Expand the record so its detail (and the Edit activities button) shows.
    await page.getByRole("button", { name: /^expand$/i }).first().click();
    const editBtn = page.getByTestId(`button-edit-activities-${original.id}`);
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // ---- 3. Wizard re-opens pre-filled ------------------------------------
    await page.waitForURL(/\/wizard\/activities/);
    // The saved activity is pre-selected.
    const nextSelected = page.getByRole("button", { name: /next:\s*1 selected/i });
    await expect(nextSelected).toBeVisible();
    await nextSelected.click();
    await page.getByRole("button", { name: /^done$/i }).click();

    await page.waitForURL(/\/wizard\/contributions/);
    const editInputs = page.locator('input[type="number"]');
    // Donations and extra volunteer hours restored from the saved record.
    await expect(editInputs.first()).toHaveValue("50");
    await expect(editInputs.nth(1)).toHaveValue("5");

    // ---- 4. Change the donation and update --------------------------------
    await editInputs.first().fill("75");
    await page.getByRole("button", { name: /reveal my impact/i }).click();

    await page.waitForURL(/\/results/, { timeout: 30_000 });
    // Edit mode: the CTA reads "Update entry" and skips the period dialog.
    const updateBtn = page.getByRole("button", { name: /^update entry$/i });
    await expect(updateBtn).toBeVisible({ timeout: 15_000 });
    await updateBtn.click();
    await expect(page.getByRole("button", { name: /^updated!$/i })).toBeVisible({
      timeout: 15_000,
    });

    // ---- 5. Same record updated in place ----------------------------------
    const afterRes = await page.request.get("/api/impact/history");
    expect(afterRes.ok()).toBe(true);
    const after = (await afterRes.json()) as {
      records: Array<{ id: string; period: string | null; impactResult: { totalValue: number; donationsValue: number } }>;
    };
    expect(after.records.length, "no duplicate record should be created").toBe(1);
    const updated = after.records[0]!;
    expect(String(updated.id)).toBe(String(original.id));
    expect(updated.period).toBe(original.period);
    expect(updated.impactResult.donationsValue).toBe(75);
    expect(updated.impactResult.totalValue).not.toBe(original.impactResult.totalValue);
  });
});

/**
 * Regression guard: a record that contains a CUSTOM activity plus non-zero
 * additional volunteer hours must round-trip through the edit flow without
 * its value drifting. The dangerous failure mode is double-counting: custom
 * activity hours are part of the stored totalHours, so if the edit preload
 * derived "extra hours" as totalHours − predefined hours only, the custom
 * hours would be re-counted as extra hours AND re-sent as a custom activity,
 * inflating the recalculated value on every edit-save.
 */
test.describe("Spec 13b — editing a record with custom activities preserves its value", () => {
  let api: TestApi;
  const email = uniqueEmail("edit-custom");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("custom hours are not double-counted as extra hours on edit", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // ---- 1. Seed a record with predefined + custom activity + extra hours.
    // 12h predefined + 8h custom + 6h extra = 26 total hours.
    const seedRes = await page.request.post("/api/impact/save", {
      data: {
        userId: "",
        name: "My Impact Record",
        period: "2026",
        activities: [{ activityId: "recycling", quantity: 26, hoursPerYear: 12 }],
        customActivities: [
          {
            activityId: "custom_e2e_1",
            name: "Beach clean-up",
            quantity: 4,
            hoursPerYear: 8,
            valuePerUnit: 10,
            unit: "hour",
            proxy: "Test proxy",
            proxyYear: "2024",
            sdg: "Life Below Water",
            sdgColor: "#0A97D9",
          },
        ],
        donationsGBP: 20,
        additionalVolunteerHours: 6,
      },
    });
    expect(seedRes.ok(), `seed save failed: ${await seedRes.text()}`).toBe(true);

    const beforeRes = await page.request.get("/api/impact/history");
    expect(beforeRes.ok()).toBe(true);
    const before = (await beforeRes.json()) as {
      records: Array<{
        id: string;
        period: string | null;
        impactResult: {
          totalValue: number;
          donationsValue: number;
          totalHours: number;
          activityBreakdowns: Array<{ category: string; hours: number; impactValue: number }>;
        };
      }>;
    };
    expect(before.records.length).toBe(1);
    const original = before.records[0]!;
    expect(original.impactResult.totalHours).toBe(26);
    const originalCustom = original.impactResult.activityBreakdowns.filter(b => b.category === "Custom");
    expect(originalCustom.length).toBe(1);

    // ---- 2. Edit from History ---------------------------------------------
    await page.goto("/history");
    await page.getByRole("button", { name: /^expand$/i }).first().click();
    const editBtn = page.getByTestId(`button-edit-activities-${original.id}`);
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    await page.waitForURL(/\/wizard\/activities/);
    // The Next label counts predefined + custom activities, so the restored
    // custom activity shows up here as the second selection.
    await page.getByRole("button", { name: /next:\s*2 selected/i }).click();
    await page.getByRole("button", { name: /^done$/i }).click();

    // ---- 3. Contributions restored WITHOUT double-counting custom hours ---
    await page.waitForURL(/\/wizard\/contributions/);
    const inputs = page.locator('input[type="number"]');
    await expect(inputs.first()).toHaveValue("20");
    // Extra hours must be 6 (26 total − 12 predefined − 8 custom), NOT 14.
    await expect(inputs.nth(1)).toHaveValue("6");

    // ---- 4. Save without changing anything --------------------------------
    await page.getByRole("button", { name: /reveal my impact/i }).click();
    await page.waitForURL(/\/results/, { timeout: 30_000 });
    const updateBtn = page.getByRole("button", { name: /^update entry$/i });
    await expect(updateBtn).toBeVisible({ timeout: 15_000 });
    await updateBtn.click();
    await expect(page.getByRole("button", { name: /^updated!$/i })).toBeVisible({
      timeout: 15_000,
    });

    // ---- 5. Value round-trips exactly --------------------------------------
    const afterRes = await page.request.get("/api/impact/history");
    expect(afterRes.ok()).toBe(true);
    const after = (await afterRes.json()) as typeof before;
    expect(after.records.length, "no duplicate record should be created").toBe(1);
    const updated = after.records[0]!;
    expect(String(updated.id)).toBe(String(original.id));
    expect(updated.period).toBe(original.period);
    expect(updated.impactResult.totalHours, "total hours must not inflate on edit").toBe(26);
    expect(updated.impactResult.donationsValue).toBe(20);
    expect(updated.impactResult.totalValue, "total value must round-trip unchanged").toBe(
      original.impactResult.totalValue,
    );
    // The custom activity survived the edit.
    const updatedCustom = updated.impactResult.activityBreakdowns.filter(b => b.category === "Custom");
    expect(updatedCustom.length).toBe(1);
    expect(updatedCustom[0]!.impactValue).toBe(originalCustom[0]!.impactValue);
  });
});
