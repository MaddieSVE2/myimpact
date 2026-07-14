import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("Spec 7 — org member submits activities via /org/submit", () => {
  let api: TestApi;
  // Each test signs in once with its own email: the magic-link endpoint
  // rate-limits repeat requests per address, so sharing one email across
  // tests makes the second sign-in flake.
  const somethingElseEmail = uniqueEmail("submitter-se");
  const memberEmail = uniqueEmail("submitter");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(somethingElseEmail);
    await api.resetUser(memberEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(somethingElseEmail);
    await api.resetUser(memberEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("'Something else' validation — error shown when description is empty, clears when filled", async ({ browser }) => {
    const created = await api.createOrg(`E2E Something Else Org ${Date.now()}`, "charity");
    const seOrgId = created.orgId;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, somethingElseEmail);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: created.inviteCode, orgId: seOrgId },
      });
      expect(join.ok()).toBe(true);

      // ── Step 1: pick 'Something else' without filling the inline title ────
      await page.goto("/org/submit");
      await expect(page.getByTestId("org-member-submit-root")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("member-submit-activity-something-else").click();
      // Deliberately leave the inline title empty and advance to step 2
      await page.getByTestId("member-submit-next-details").click();

      // ── Step 2: fill hours so the button is enabled, then click Review ────
      await page.getByTestId("member-submit-hours-something_else").fill("2");

      // First click — validation fires; error should now be visible
      await page.getByTestId("member-submit-next-review").click();
      await expect(page.getByTestId("member-submit-something-else-error")).toBeVisible();

      // ── Fix the description — error should clear and Review should succeed ─
      await page.getByTestId("member-submit-detail-something_else").fill("Picked up litter along the river path");
      await expect(page.getByTestId("member-submit-something-else-error")).not.toBeVisible();

      await page.getByTestId("member-submit-next-review").click();

      // Reaching step 3 (review) confirms the guard was satisfied
      await expect(page.getByTestId("member-submit-confirm")).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
      await api.deleteOrg(seOrgId);
    }
  });

  test("logged-in member walks /org/submit and sees the success state", async ({ browser }) => {
    // Direct-create an org so this spec is independent of the registration
    // approval flow already covered by spec 4.
    const created = await api.createOrg(`E2E Submit Org ${Date.now()}`, "charity");
    orgId = created.orgId;

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInWithMagicLink(page, api, memberEmail);

    // Member joins the org via the API — the join UI is covered by spec 4.
    const join = await page.request.post("/api/org/join", {
      data: { inviteCode: created.inviteCode, orgId: created.orgId },
    });
    expect(join.ok()).toBe(true);

    // ── Step 1: pick activities ──────────────────────────────────────────
    await page.goto("/org/submit");
    await expect(page.getByTestId("org-member-submit-root")).toBeVisible({ timeout: 15_000 });

    // tree_planting is a stable, well-known unit-based activity that the
    // catalogue ships with — selecting it ensures we exercise the
    // quantity-based path through the wizard.
    const treePlantingTile = page.getByTestId("member-submit-activity-tree_planting");
    await expect(treePlantingTile).toBeVisible({ timeout: 10_000 });
    await treePlantingTile.click();

    await page.getByTestId("member-submit-next-details").click();

    // ── Step 2: fill details ─────────────────────────────────────────────
    // The date-of-activity input defaults to today, which is fine here —
    // the old free-text "period label" field no longer exists.
    await expect(page.getByTestId("member-submit-activity-date")).toBeVisible({ timeout: 15_000 });
    const quantityInput = page.getByTestId("member-submit-quantity-tree_planting");
    await expect(quantityInput).toBeVisible();
    await quantityInput.fill("3");
    // Hours must be non-zero or the Next button stays disabled.
    await page.getByTestId("member-submit-hours-tree_planting").fill("2");
    await page.getByTestId("member-submit-title-tree_planting").fill("Earth day planting");
    await page.getByTestId("member-submit-detail-tree_planting").fill("Local park weekend session");

    await page.getByTestId("member-submit-next-review").click();

    // ── Step 3: review + submit ──────────────────────────────────────────
    await page.getByTestId("member-submit-confirm").click();

    // Success state appears, and the record now shows up in the manager
    // listing for that org.
    await expect(page.getByTestId("member-submit-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/sent to/i)).toBeVisible();
    // The org name appears in several places (header, success copy, etc.)
    // so assert on the first match to avoid strict-mode violations.
    await expect(page.getByText(created.orgName).first()).toBeVisible();

    await ctx.close();
  });
});
