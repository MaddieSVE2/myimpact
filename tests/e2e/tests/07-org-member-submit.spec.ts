import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

test.describe("Spec 7 — org member submits activities via /org/submit", () => {
  let api: TestApi;
  const memberEmail = uniqueEmail("submitter");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(memberEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(memberEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
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
    await page.getByTestId("member-submit-period-label").fill("E2E April 2026");
    const quantityInput = page.getByTestId("member-submit-quantity-tree_planting");
    await expect(quantityInput).toBeVisible();
    await quantityInput.fill("3");
    await page.getByTestId("member-submit-title-tree_planting").fill("Earth day planting");
    await page.getByTestId("member-submit-detail-tree_planting").fill("Local park weekend session");

    await page.getByTestId("member-submit-next-review").click();

    // ── Step 3: review + submit ──────────────────────────────────────────
    await page.getByTestId("member-submit-confirm").click();

    // Success state appears, and the record now shows up in the manager
    // listing for that org.
    await expect(page.getByTestId("member-submit-success")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/sent to/i)).toBeVisible();
    await expect(page.getByText(created.orgName)).toBeVisible();

    await ctx.close();
  });
});
