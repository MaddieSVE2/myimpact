import { test, expect, type Browser, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 41 — Invite links that put people in a group.
 *
 * A manager copies a group's invite link. Someone who joins the organisation
 * with it goes into the group: straight away when new members are approved
 * automatically, otherwise when a manager approves them. A member who is
 * already in the organisation is asked to join the group.
 */
test.describe("Spec 41 — group invite links", () => {
  let api: TestApi;
  const managerEmail = uniqueEmail("mgr41");
  const newcomerEmail = uniqueEmail("new41");
  const waitingEmail = uniqueEmail("wait41");
  const memberEmail = uniqueEmail("mem41");
  const orgIds: string[] = [];

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterAll(async () => {
    for (const id of orgIds) await api.deleteOrg(id);
    for (const email of [managerEmail, newcomerEmail, waitingEmail, memberEmail]) await api.resetUser(email);
    await api.dispose();
  });

  async function signedIn(browser: Browser, email: string): Promise<Page> {
    const context = await browser.newContext({ locale: "en-GB" });
    const page = await context.newPage();
    await signInWithMagicLink(page, api, email);
    return page;
  }

  const joinedGroups = async (p: Page) =>
    ((await (await p.request.get("/api/org/my/groups")).json()) as { groups: { name: string; joined: boolean }[] }).groups
      .filter((g) => g.joined)
      .map((g) => g.name);

  test("a group's invite link puts people who join with it in the group", async ({ browser }) => {
    const org = await api.createOrg("Spec 41 Sports", "charity", managerEmail);
    orgIds.push(org.orgId);
    const invite = { inviteCode: org.inviteCode, orgId: org.orgId };

    const manager = await signedIn(browser, managerEmail);
    expect((await manager.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: true } });
    const created = await manager.request.post("/api/org/groups", { data: { name: "Football club" } });
    expect(created.ok()).toBeTruthy();
    const groupId = ((await created.json()) as { group: { id: string } }).group.id;
    expect((await manager.request.post("/api/org/groups", { data: { name: "Netball" } })).ok()).toBeTruthy();

    // Someone already in the organisation, in no group yet.
    const member = await signedIn(browser, memberEmail);
    expect((await member.request.post("/api/org/join", { data: invite })).ok()).toBeTruthy();

    // ---- The manager picks the group for the invite link ---------------------
    await manager.goto("/org/settings");
    const linkField = manager.getByTestId("text-invite-link");
    await expect(linkField).toHaveValue(new RegExp(`/org\\?invite=${org.inviteCode}$`));
    await manager.getByTestId("select-invite-link-group").selectOption({ label: "Football club" });
    await expect(linkField).toHaveValue(new RegExp(`/org\\?invite=${org.inviteCode}&group=${groupId}$`));
    const groupLink = new URL(await linkField.inputValue());
    const groupPath = `${groupLink.pathname}${groupLink.search}`;

    // The Groups tab offers the same link on the group itself.
    await manager.goto("/org/settings?tab=groups");
    const row = manager.getByTestId("row-org-group").filter({ hasText: "Football club" });
    await expect(row.getByTestId("button-copy-group-invite-link")).toBeVisible();

    // ---- A newcomer joins with the link and is in the group ------------------
    const newcomer = await signedIn(browser, newcomerEmail);
    await newcomer.goto(groupPath);
    await expect(newcomer.getByTestId("notice-invite-group")).toContainText("Football club");
    await newcomer.getByTestId("button-confirm-join").click();
    await expect(newcomer.getByTestId("card-my-groups")).toBeVisible();
    expect(await joinedGroups(newcomer)).toEqual(["Football club"]);

    // ---- An existing member who opens the link is asked to join the group ----
    await member.goto(groupPath);
    await expect(member.getByTestId("notice-group-invite")).toContainText("Football club");
    await member.getByTestId("button-accept-group-invite").click();
    await expect(member.getByTestId("notice-group-invite")).toHaveCount(0);
    expect(await joinedGroups(member)).toEqual(["Football club"]);

    // ---- With approval on, the place waits until a manager approves ----------
    await manager.request.patch("/api/org/my/settings", { data: { autoApproveMembers: false } });
    const waiting = await signedIn(browser, waitingEmail);
    const joined = await waiting.request.post("/api/org/join", { data: { ...invite, groupId } });
    expect(await joined.json()).toMatchObject({ status: "pending", group: { id: groupId, name: "Football club" } });
    expect((await (await manager.request.get("/api/org/groups")).json()).groups.find((g: { id: string }) => g.id === groupId)).toMatchObject({ memberCount: 2 });

    const pending = (await (await manager.request.get("/api/org/my/members?status=pending")).json()) as { members: { userId: string; email: string }[] };
    const waitingMember = pending.members.find((m) => m.email === waitingEmail)!;
    expect((await manager.request.post(`/api/org/my/members/${waitingMember.userId}/approve`)).ok()).toBeTruthy();
    expect(await joinedGroups(waiting)).toEqual(["Football club"]);
  });
});
