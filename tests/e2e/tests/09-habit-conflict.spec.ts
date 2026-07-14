import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 9 — Habit-conflict 409 path through the QuickLog / wizard UI.
 *
 * Backend coverage already exists in `impactCalendarYear.test.ts`; this spec
 * exercises the corresponding *frontend* surfaces:
 *
 *   1. Tick a habit (create + confirm a recurring template) so the user has
 *      habit-generated entries for the current calendar month.
 *   2. Drive the wizard (actions → activities → contributions → results)
 *      with the SAME activity selected, so /api/impact/save returns 409
 *      `habit_entry_conflict`.
 *   3. Assert the conflict prompt dialog appears with its three options.
 *   4. Click "Update the existing entry" and assert it resolves cleanly:
 *        - the post-save "Saved!" CTA appears, and
 *        - the user's record count is unchanged (no silent double-count).
 *
 * A regression here would silently double-count or strand the user, so this
 * is treated as a high-value flow alongside the 02-history spec.
 */
test.describe("Spec 9 — habit-conflict 409 surfaces in QuickLog/wizard UI", () => {
  let api: TestApi;
  const email = uniqueEmail("habit-conflict");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("conflict dialog appears and 'edit existing' resolves without duplicating", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    // ---- 1. Seed a habit + confirm it ------------------------------------
    // Use the real authenticated session via page.request so cookies are
    // sent. We deliberately drive these through the API rather than the
    // settings UI so the test stays focused on the conflict surface.
    const ACTIVITY = { activityId: "recycling", quantity: 26, hoursPerYear: 12 };

    const tplRes = await page.request.post("/api/impact/templates", {
      data: {
        label: "Weekly recycling",
        cadence: "weekly",
        dayOfPeriod: 1,
        defaultActivities: [ACTIVITY],
        defaultDonationsGBP: 0,
      },
    });
    expect(tplRes.ok(), `create template failed: ${await tplRes.text()}`).toBe(true);
    const template = (await tplRes.json()) as { id: number | string };

    const confirmRes = await page.request.post(`/api/impact/templates/${template.id}/confirm`);
    expect(confirmRes.ok(), `confirm template failed: ${await confirmRes.text()}`).toBe(true);
    const confirmBody = (await confirmRes.json()) as { entriesCreated: number };
    expect(confirmBody.entriesCreated).toBeGreaterThan(0);

    // Snapshot record count BEFORE the conflict flow so we can assert that
    // the "edit existing" path doesn't create a new row.
    const baselineRes = await page.request.get("/api/impact/history");
    expect(baselineRes.ok()).toBe(true);
    const baseline = (await baselineRes.json()) as { records: Array<{ id: string }> };
    const baselineCount = baseline.records.length;
    expect(baselineCount).toBeGreaterThan(0);

    // ---- 2. Drive the wizard with the SAME activity ---------------------
    await page.goto("/wizard/actions");
    if (page.url().includes("/profile/setup")) {
      const skip = page.getByRole("link", { name: /skip|maybe later|do this later/i });
      if (await skip.count()) await skip.first().click();
      await page.goto("/wizard/actions");
    }

    // Step 1: postcode is enough to satisfy canProceed.
    const postcodeInput = page.getByPlaceholder(/manchester|postcode|m1/i).first();
    await postcodeInput.waitFor({ state: "visible" });
    await postcodeInput.fill("M1");
    await page.getByRole("button", { name: /next:\s*add activities/i }).click();

    // Step 2: pick the recycling activity by searching for it.
    await page.waitForURL(/\/wizard\/activities/);
    // The activities step defaults to "pick" mode. Use the search box so
    // the test doesn't depend on category ordering / preferred-interest
    // promotion in the catalogue.
    const search = page.getByPlaceholder(/search activities/i);
    await search.waitFor({ state: "visible" });
    await search.fill("recycling");
    // Click the first matching card. The catalogue has a single
    // "Recycling at home" entry (id: recycling).
    await page.getByRole("button", { name: /recycling at home/i }).first().click();
    // Move into the per-activity quantify step.
    await page.getByRole("button", { name: /next:\s*1 selected/i }).click();
    // Quantify: defaults are fine; finish the loop.
    await page.getByRole("button", { name: /^done$/i }).click();

    // Step 3: contributions — accept defaults and reveal.
    await page.waitForURL(/\/wizard\/contributions/);
    await page.getByRole("button", { name: /reveal my impact/i }).click();

    // Land on /results. Use the Save Progress CTA as the readiness signal —
    // the page renders heavy charts asynchronously, but the action button
    // appears as soon as the impact result is available.
    await page.waitForURL(/\/results/, { timeout: 30_000 });
    const saveProgress = page.getByRole("button", { name: /^save progress$/i });
    await expect(saveProgress).toBeVisible({ timeout: 15_000 });

    // ---- 3. Trigger the conflict ----------------------------------------
    await saveProgress.click();
    // Period dialog → Save record → server returns 409.
    await expect(page.getByText(/what period does this cover\?/i)).toBeVisible();
    await page.getByRole("button", { name: /^save record$/i }).click();

    // Conflict dialog appears with the three documented options.
    const conflictDialog = page.getByTestId("habit-conflict-dialog");
    await expect(conflictDialog).toBeVisible({ timeout: 10_000 });
    await expect(conflictDialog.getByText(/already covered/i)).toBeVisible();
    await expect(page.getByTestId("conflict-replace")).toBeVisible();
    await expect(page.getByTestId("conflict-open-history")).toBeVisible();
    await expect(page.getByTestId("conflict-force")).toBeVisible();

    // ---- 4. Resolve via the "edit existing" path ------------------------
    await page.getByTestId("conflict-replace").click();

    // The Save CTA flips to "Updated!" once the targetRecordId update
    // succeeds — that's our signal the conflict was resolved cleanly.
    // (In-place updates read "Updated!" rather than "Saved!" so users can
    // tell an edit apart from a fresh save.)
    await expect(page.getByRole("button", { name: /^updated!$/i })).toBeVisible({
      timeout: 15_000,
    });

    // And the dialog itself is gone.
    await expect(conflictDialog).toHaveCount(0);

    // Most importantly: no new row was created. The "edit existing" path
    // is supposed to *update* the conflicting habit-generated entry in
    // place, never insert alongside it.
    const afterRes = await page.request.get("/api/impact/history");
    expect(afterRes.ok()).toBe(true);
    const after = (await afterRes.json()) as { records: Array<{ id: string }> };
    expect(
      after.records.length,
      `record count should be unchanged after 'edit existing' (was ${baselineCount}, now ${after.records.length})`,
    ).toBe(baselineCount);
  });
});
