import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("custom care interests", () => {
  const email = uniqueEmail("custom-interests");
  let api: TestApi;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(email);
  });

  test("adds, restores, edits, uses, and persists custom interests", async ({ page }) => {
    await signInWithMagicLink(page, api, email);

    const initialSave = await page.request.put("/api/profile", {
      data: {
        situation: [],
        interests: [],
        customInterests: ["  Refugee   support  ", "refugee support", "   "],
        postcode: null,
      },
    });
    expect(initialSave.ok()).toBe(true);
    const initialBody = await initialSave.json();
    expect(initialBody.profile.interests).toEqual([]);
    expect(initialBody.profile.customInterests).toEqual(["Refugee support"]);

    await page.goto("/wizard/actions");
    const environmentInterest = page.getByRole("button", { name: /the environment/i });
    await expect(environmentInterest).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("custom-interest-list")).toContainText("Refugee support");
    await environmentInterest.click();
    await expect(environmentInterest).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /something else.*add your own/i }).click();
    const input = page.getByPlaceholder(/refugee support/i);
    await input.fill("   ");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByRole("alert")).toContainText(/unique interest/i);

    await input.fill("REFUGEE SUPPORT");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByRole("alert")).toContainText(/unique interest/i);

    await input.fill("Prison reform");
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByTestId("custom-interest-list")).toContainText("Prison reform");

    await page.getByRole("button", { name: /edit prison reform/i }).click();
    await input.fill("Justice reform");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByTestId("custom-interest-list")).toContainText("Justice reform");
    await expect(page.getByTestId("custom-interest-list")).not.toContainText("Prison reform");

    await page.reload();
    await expect(page.getByTestId("custom-interest-list")).toContainText("Refugee support");
    await expect(page.getByTestId("custom-interest-list")).toContainText("Justice reform");

    await page.getByRole("button", { name: /next:\s*add activities/i }).click();
    await page.waitForURL(/\/wizard\/activities/);
    await expect(page.getByTestId("custom-interest-context")).toContainText("Refugee support");
    await expect(page.getByTestId("custom-interest-context")).toContainText("Justice reform");
    await expect(page.getByTestId("custom-interest-context")).toContainText(/prioritise community activities/i);

    await page.goto("/profile");
    await expect(page.getByTestId("profile-custom-interests")).toContainText("Refugee support");
    await expect(page.getByTestId("profile-custom-interests")).toContainText("Justice reform");
    await page.getByRole("button", { name: /remove refugee support/i }).click();
    await page.getByPlaceholder("Add another interest").fill("Youth justice");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("button", { name: /saved!/i })).toBeVisible();

    const restored = await page.request.get("/api/profile");
    expect(restored.ok()).toBe(true);
    const restoredBody = await restored.json();
    expect(restoredBody.profile.interests).toEqual(["environment"]);
    expect(restoredBody.profile.customInterests).toEqual(["Justice reform", "Youth justice"]);
  });
});