import { test, expect, type Browser, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 40 — Adding people to groups from a list, and challenges and surveys
 * for chosen groups.
 *
 * A manager pastes a list: members go into their groups, a new group is
 * made, and someone who isn't a member yet is invited and goes into their
 * group when they join. A challenge and a survey for one group reach its
 * members only, including people who join the group later. Managers can
 * also tick several people to add to a group at once.
 */
test.describe("Spec 40 — group lists and group audiences", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("mgr40");
  const footballEmail = uniqueEmail("fb40");
  const netballEmail = uniqueEmail("nb40");
  const newEmail = uniqueEmail("new40");
  const orgIds: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    for (const id of orgIds) await api.deleteOrg(id);
    for (const email of [managerEmail, footballEmail, netballEmail, newEmail]) await api.resetUser(email);
    await api.dispose();
  });

  async function signedIn(browser: Browser, email: string): Promise<Page> {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await signInWithMagicLink(page, api, email);
    return page;
  }

  type OrgChallenge = { id: string; name: string; isEnrolled: boolean };
  const orgChallenges = async (p: Page) =>
    ((await (await p.request.get("/api/challenges/org")).json()) as { challenges: OrgChallenge[] }).challenges;
  const activeSurveys = async (p: Page) =>
    ((await (await p.request.get("/api/org/surveys/active")).json()) as { surveys: { id: string }[] }).surveys.map((s) => s.id);
  type Group = { id: string; name: string; memberCount: number; leadCount: number };
  const groupsOf = async (manager: Page) =>
    ((await (await manager.request.get("/api/org/groups")).json()) as { groups: Group[] }).groups;
  const invitesOf = async (manager: Page) => JSON.stringify(await (await manager.request.get("/api/org/my/invites")).json());

  test("a list fills groups and invites newcomers, and group challenges and surveys reach their groups", async ({ browser }) => {
    const org = await api.createOrg("Spec 40 Sports", "charity", managerEmail);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };

    const manager = await signedIn(browser, managerEmail);
    expect((await manager.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });
    expect((await manager.request.post("/api/org/groups", { data: { name: "Football club" } })).ok()).toBeTruthy();

    const football = await signedIn(browser, footballEmail);
    const netball = await signedIn(browser, netballEmail);
    for (const p of [football, netball]) {
      expect((await p.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    }

    // ---- Paste a list, check it, then add it -------------------------------
    await manager.goto("/org/settings?tab=groups");
    const upload = manager.getByTestId("group-list-upload");
    await upload.getByLabel("Or paste rows").fill(
      [
        "Email\tGroup\tRole",
        `${footballEmail}\tfootball club\t`,
        `${netballEmail}\tNetball\tlead`,
        `${newEmail}\tNetball\t`,
        "not-an-email\tNetball\t",
      ].join("\n"),
    );
    await upload.getByRole("button", { name: "Check list" }).click();
    await expect(upload.getByTestId("plan-add")).toContainText("2 members go into groups");
    await expect(upload.getByTestId("plan-add")).toContainText("→ Netball, as lead");
    await expect(upload.getByTestId("plan-new-groups")).toContainText("Netball");
    await expect(upload.getByTestId("plan-invite")).toContainText(newEmail);
    await expect(upload.getByTestId("plan-problems")).toContainText("Line 5, not-an-email: Not an email address");
    // Checking a list changes nothing.
    expect((await groupsOf(manager)).map((g) => g.name)).toEqual(["Football club"]);

    await upload.getByTestId("button-confirm-group-list").click();
    await expect(upload.getByTestId("group-list-result")).toContainText("1 invite is on the way");
    const groups = await groupsOf(manager);
    const footballGroup = groups.find((g) => g.name === "Football club")!;
    const netballGroup = groups.find((g) => g.name === "Netball")!;
    expect(footballGroup).toMatchObject({ memberCount: 1, leadCount: 0 });
    expect(netballGroup).toMatchObject({ memberCount: 1, leadCount: 1 });
    await expect.poll(() => invitesOf(manager)).toContain(newEmail);

    // ---- A challenge for Netball, chosen in the form -------------------------
    await manager.goto("/org/challenges");
    await manager.getByTestId("button-new-org-challenge").click();
    await manager.getByTestId("input-challenge-name").fill("Netball hours");
    const audience = manager.getByTestId("challenge-audience");
    await audience.getByLabel("Chosen groups").check();
    await expect(manager.getByTestId("button-create-challenge")).toBeDisabled();
    await audience.getByRole("checkbox", { name: /Netball/ }).check();
    await manager.getByTestId("button-create-challenge").click();
    await expect(
      manager.getByTestId("list-org-challenges").locator('[data-testid^="org-challenge-"]', { hasText: "Netball hours" }),
    ).toContainText("For Netball");
    const challengeId = (await orgChallenges(manager)).find((c) => c.name === "Netball hours")!.id;

    // ---- A survey for Football club ------------------------------------------
    const created = await manager.request.post("/api/org/surveys", {
      data: { template: "meaningfulness", schedule: "monthly", groupIds: [footballGroup.id] },
    });
    expect(created.status()).toBe(201);
    const surveyId = ((await created.json()) as { id: string }).id;
    const badGroup = await manager.request.post("/api/org/surveys", {
      data: { template: "meaningfulness", schedule: "monthly", groupIds: ["not-a-group"] },
    });
    expect(badGroup.status()).toBe(400);

    // ---- Each member gets what's for their groups ----------------------------
    expect(await orgChallenges(netball)).toEqual([expect.objectContaining({ name: "Netball hours", isEnrolled: true })]);
    expect(await orgChallenges(football)).toEqual([]);
    expect((await football.request.get(`/api/challenges/${challengeId}`)).status()).toBe(403);
    expect(await activeSurveys(football)).toEqual([surveyId]);
    expect(await activeSurveys(netball)).toEqual([]);
    expect((await netball.request.post(`/api/org/surveys/${surveyId}/respond`, { data: { rating: 4 } })).status()).toBe(404);
    expect((await football.request.post(`/api/org/surveys/${surveyId}/respond`, { data: { rating: 4 } })).ok()).toBeTruthy();

    // ---- Joining the group later brings its challenge ------------------------
    expect((await football.request.post(`/api/org/my/groups/${netballGroup.id}/join`)).ok()).toBeTruthy();
    expect(await orgChallenges(football)).toEqual([expect.objectContaining({ name: "Netball hours", isEnrolled: true })]);

    // ---- The invited person goes into Netball when they join -----------------
    const newcomer = await signedIn(browser, newEmail);
    expect((await newcomer.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    const theirGroups = ((await (await newcomer.request.get("/api/org/my/groups")).json()) as { groups: { name: string; joined: boolean }[] }).groups;
    expect(theirGroups.filter((g) => g.joined).map((g) => g.name)).toEqual(["Netball"]);
    expect(await orgChallenges(newcomer)).toEqual([expect.objectContaining({ name: "Netball hours", isEnrolled: true })]);
    expect(await invitesOf(manager)).not.toContain(newEmail);

    // ---- Tick everyone not in Football club and add them at once -------------
    await manager.goto("/org/settings?tab=groups");
    const row = manager.getByTestId("row-org-group").filter({ hasText: "Football club" });
    await row.getByRole("button", { name: "Members" }).click();
    await row.getByLabel(/Select everyone not in this group \(3\)/).check();
    await row.getByRole("button", { name: "Add 3 people" }).click();
    await expect(row.getByText("Everyone in your organisation is in this group.")).toBeVisible();
    expect((await groupsOf(manager)).find((g) => g.name === "Football club")).toMatchObject({ memberCount: 4 });
  });
});
