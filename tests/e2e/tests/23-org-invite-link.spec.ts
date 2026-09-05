import { test, expect } from "@playwright/test";

test.describe("Spec 23 — organisation invite links", () => {
  test("a signed-out visitor with a legacy invite link is sent to individual account creation", async ({ page }) => {
    await page.goto("/org?invite=7LTLFV6E");

    await expect(page.getByRole("heading", { name: "You've been invited" })).toBeVisible();
    await expect(
      page.getByText("Log in or create a free account to join your organisation on My Impact."),
    ).toBeVisible();

    const continueLink = page.getByRole("link", { name: "Create account or log in" });
    await expect(continueLink).toHaveAttribute(
      "href",
      /\/login\?next=%2Forg%3Finvite%3D7LTLFV6E$/,
    );

    await continueLink.click();
    await expect(page).toHaveURL(/\/login\?next=%2Forg%3Finvite%3D7LTLFV6E$/);
  });
});