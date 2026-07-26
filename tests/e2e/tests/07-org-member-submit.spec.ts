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
  const evidenceEmail = uniqueEmail("submitter-ev");
  const approvalEmail = uniqueEmail("submitter-ap");
  let orgId: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(somethingElseEmail);
    await api.resetUser(memberEmail);
    await api.resetUser(evidenceEmail);
    await api.resetUser(approvalEmail);
  });

  test.afterAll(async () => {
    await api.resetUser(somethingElseEmail);
    await api.resetUser(memberEmail);
    await api.resetUser(evidenceEmail);
    await api.resetUser(approvalEmail);
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

  test("evidence-required org blocks submission until a photo is attached", async ({ browser }) => {
    const created = await api.createOrg(`E2E Evidence Org ${Date.now()}`, "charity");
    const evOrgId = created.orgId;
    await api.setOrgSettings(evOrgId, { evidencePolicy: "required" });

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, evidenceEmail);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: created.inviteCode, orgId: evOrgId },
      });
      expect(join.ok()).toBe(true);

      // API-level enforcement: submitting without evidence is rejected with
      // a clear, coded error.
      const bare = await page.request.post("/api/org/member-submit", {
        data: {
          name: "No evidence",
          activityDate: "2026-07-01",
          activities: [{ activityId: "tree_planting", quantity: 1, hoursPerYear: 1 }],
        },
      });
      expect(bare.status()).toBe(400);
      const bareBody = (await bare.json()) as { code?: string; error?: string };
      expect(bareBody.code).toBe("evidence_required");
      expect(bareBody.error).toMatch(/evidence/i);

      // UI enforcement: walk the wizard to review; confirm stays disabled and
      // the evidence section explains why.
      await page.goto("/org/submit");
      await expect(page.getByTestId("org-member-submit-root")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("member-submit-activity-tree_planting").click();
      await page.getByTestId("member-submit-next-details").click();
      await page.getByTestId("member-submit-quantity-tree_planting").fill("2");
      await page.getByTestId("member-submit-hours-tree_planting").fill("1");
      await page.getByTestId("member-submit-next-review").click();

      await expect(page.getByTestId("member-submit-evidence")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("member-submit-evidence-needed")).toBeVisible();
      await expect(page.getByTestId("member-submit-confirm")).toBeDisabled();

      // Attach a small PNG through the evidence input — the upload goes
      // upload-url → PUT → register, then the confirm button unlocks.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      await page.getByTestId("member-submit-evidence-input").setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: png,
      });

      await expect(page.getByTestId("member-submit-confirm")).toBeEnabled({ timeout: 20_000 });
      await page.getByTestId("member-submit-confirm").click();
      await expect(page.getByTestId("member-submit-success")).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctx.close();
      await api.deleteOrg(evOrgId);
    }
  });

  test("approval mode toggle controls whether submissions land verified or pending", async ({ browser }) => {
    const created = await api.createOrg(`E2E Approval Org ${Date.now()}`, "charity");
    const apOrgId = created.orgId;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await signInWithMagicLink(page, api, approvalEmail);

      const join = await page.request.post("/api/org/join", {
        data: { inviteCode: created.inviteCode, orgId: apOrgId },
      });
      expect(join.ok()).toBe(true);

      const submit = async (name: string): Promise<number> => {
        const res = await page.request.post("/api/org/member-submit", {
          data: {
            name,
            activityDate: "2026-07-01",
            activities: [{ activityId: "tree_planting", quantity: 1, hoursPerYear: 1 }],
          },
        });
        expect(res.status()).toBe(201);
        const body = (await res.json()) as { record: { id: number } };
        return body.record.id;
      };

      // ── Auto-verify OFF: submission lands as pending manager approval ────
      await api.setOrgSettings(apOrgId, { autoVerifyActivities: false });
      const pendingRecordId = await submit("Pending submission");
      expect(await api.getRecordVerification(pendingRecordId, apOrgId)).toBe("pending");

      // ── Auto-verify ON: submission is verified immediately ───────────────
      await api.setOrgSettings(apOrgId, { autoVerifyActivities: true });
      const verifiedRecordId = await submit("Auto-verified submission");
      expect(await api.getRecordVerification(verifiedRecordId, apOrgId)).toBe("approved");

      // The earlier pending record stays pending — flipping the toggle only
      // affects new submissions, it doesn't retroactively verify old ones.
      expect(await api.getRecordVerification(pendingRecordId, apOrgId)).toBe("pending");
    } finally {
      await ctx.close();
      await api.deleteOrg(apOrgId);
    }
  });
});
