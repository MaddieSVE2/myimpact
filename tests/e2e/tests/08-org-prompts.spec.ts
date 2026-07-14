import { test, expect } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 8 — "For your organisation" prompts on Home.
 *
 * Locks in:
 *  - An org member sees the full prompts section on Home with both a
 *    pulse-survey card and an org-challenge card visible. Snoozing a
 *    challenge hides it and the snooze persists across reloads (stored
 *    for the day in localStorage) while the survey card remains visible.
 *    Clicking "Contribute" deep-links to /wizard/actions?challenge=<id>
 *    with the challenge-context-banner showing the challenge name.
 *  - A manager of the same org does NOT see the section.
 *  - A logged-in user who is NOT in any org does NOT see the section.
 *
 * Note: the app renders the full section on Home only; the compact strip
 * exists solely on the post-wizard Results page (covered indirectly by the
 * wizard specs). The old /challenges and /journal strips no longer exist.
 *
 * The three behaviours are split into separate tests so a failure in one
 * doesn't mask the others.
 *
 * Survey + challenge rows are seeded via test-only HTTP endpoints (only
 * mounted when E2E_TEST_MODE=1) because the production "create challenge"
 * and "create survey" routes require a manager session, and we need the
 * rows to exist before the member loads any page.
 */
test.describe.configure({ mode: "serial" });

test.describe("Spec 8 — org prompts", () => {
  let api: TestApi;
  const memberEmail = uniqueEmail("op-member");
  const managerEmail = uniqueEmail("op-manager");
  const guestEmail = uniqueEmail("op-guest");
  let orgId: string | undefined;
  let orgName: string | undefined;
  let inviteCode: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(memberEmail);
    await api.resetUser(managerEmail);
    await api.resetUser(guestEmail);

    const created = await api.createOrg(`E2E Prompts Org ${Date.now()}`, "charity");
    orgId = created.orgId;
    orgName = created.orgName;
    inviteCode = created.inviteCode;
  });

  test.afterAll(async () => {
    await api.resetUser(memberEmail);
    await api.resetUser(managerEmail);
    await api.resetUser(guestEmail);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  test("member sees prompts on Home; snooze persists; Contribute deep-links to wizard", async ({ browser }) => {
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await signInWithMagicLink(memberPage, api, memberEmail);

    const join = await memberPage.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(join.ok()).toBe(true);

    const myJson = (await (await memberPage.request.get("/api/org/my")).json()) as {
      org: { role: string } | null;
    };
    expect(myJson.org?.role).toBe("member");

    // Seed a pulse survey + an active org challenge the member is in.
    await api.seedOrgSurvey(orgId!);
    const challengeId = await api.seedOrgChallenge(orgId!, "E2E Org Challenge");

    // ── Home: full section with both cards ──────────────────────────────
    await memberPage.goto("/");
    await expect(memberPage.getByTestId("org-prompts-full")).toBeVisible({ timeout: 15_000 });
    await expect(memberPage.getByTestId("org-prompt-survey").first()).toBeVisible();
    await expect(memberPage.getByTestId("org-prompt-challenge").first()).toBeVisible();
    await expect(memberPage.getByTestId(`button-contribute-${challengeId}`)).toBeVisible();

    // ── Snooze the challenge from Home ──────────────────────────────────
    await memberPage.getByTestId(`button-snooze-challenge-${challengeId}`).click();
    await expect(memberPage.getByTestId("org-prompt-challenge")).toHaveCount(0);
    await expect(memberPage.getByTestId("org-prompt-survey").first()).toBeVisible();

    // ── Snooze persists across reloads in the same context ──────────────
    await memberPage.goto("/");
    await expect(memberPage.getByTestId("org-prompts-full")).toBeVisible({ timeout: 15_000 });
    await expect(memberPage.getByTestId(`button-contribute-${challengeId}`)).toHaveCount(0);

    // ── Contribute → wizard with the challenge banner ───────────────────
    const challenge2Id = await api.seedOrgChallenge(orgId!, "E2E Org Challenge Two");
    await memberPage.goto("/");
    const contribute2 = memberPage.getByTestId(`button-contribute-${challenge2Id}`);
    await expect(contribute2).toBeVisible({ timeout: 15_000 });
    await contribute2.click();

    await memberPage.waitForURL(new RegExp(`/wizard/actions\\?challenge=${challenge2Id}`));
    await expect(memberPage.getByTestId("challenge-context-banner")).toBeVisible({ timeout: 15_000 });
    await expect(memberPage.getByTestId("challenge-context-banner")).toContainText(/E2E Org Challenge Two/);

    await memberCtx.close();
  });

  test("manager of the same org does NOT see the prompts section", async ({ browser }) => {
    // Promote the manager by inserting an approved registration row whose
    // contact_email matches their address — /api/org/join then promotes
    // them to manager on join.
    await api.seedApprovedRegistration({
      orgName: orgName!,
      contactEmail: managerEmail,
      inviteCode: inviteCode!,
    });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInWithMagicLink(page, api, managerEmail);

    const mJoin = await page.request.post("/api/org/join", {
      data: { inviteCode, orgId },
    });
    expect(mJoin.ok()).toBe(true);

    const mMyJson = (await (await page.request.get("/api/org/my")).json()) as {
      org: { role: string } | null;
    };
    expect(mMyJson.org?.role).toBe("manager");

    await page.goto("/");
    // Managers get their own Home hero (ManagerHome) instead of the member
    // welcome hero — wait for it, then assert the prompts are absent.
    await expect(page.getByTestId("manager-home")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("org-prompts-full")).toHaveCount(0);

    await ctx.close();
  });

  test("logged-in user with no org does NOT see the prompts section", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInWithMagicLink(page, api, guestEmail);

    // Confirm precondition: not in any org.
    const myJson = (await (await page.request.get("/api/org/my")).json()) as {
      org: { id: string } | null;
    };
    expect(myJson.org).toBeNull();

    await page.goto("/");
    // Same rationale as above: wait for the hero, not networkidle.
    await expect(page.getByTestId("welcome-home")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("org-prompts-full")).toHaveCount(0);

    await ctx.close();
  });
});
