import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";
import { completeWizardWithExtraHours } from "../helpers/wizard";

test.describe("earned milestone fireworks", () => {
  let api: TestApi;
  const email = uniqueEmail("milestone-fireworks");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test.afterAll(async () => {
    await api.resetUser(email);
    await api.dispose();
  });

  test("celebrates earned cards once per interaction, but not locked cards or reduced motion", async ({ page }) => {
    await signInWithMagicLink(page, api, email);
    await completeWizardWithExtraHours(page, { donationsGBP: 25, hours: 5 });
    await page.goto("/milestones");

    const earned = page.locator('[data-testid^="card-earned-milestone-"]').first();
    const locked = page.locator('[data-testid^="card-locked-milestone-"]').first();
    await expect(earned).toBeVisible();

    await earned.hover();
    await expect(earned.locator('[data-testid^="fireworks-"]')).toHaveCount(1);
    await earned.dispatchEvent("pointerenter", { pointerType: "mouse" });
    await expect(earned.locator('[data-testid^="fireworks-"]')).toHaveCount(1);

    await earned.focus();
    await expect(earned.locator('[data-testid^="fireworks-"]')).toHaveCount(1);

    if (await locked.count()) {
      await locked.hover();
      await expect(locked.locator('[data-testid^="fireworks-"]')).toHaveCount(0);
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    await earned.blur();
    await page.waitForTimeout(900);
    await earned.focus();
    await expect(earned.locator('[data-testid^="fireworks-"]')).toHaveCount(0);
  });
});