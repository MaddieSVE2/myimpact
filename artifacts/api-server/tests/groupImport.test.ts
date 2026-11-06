import { describe, it, expect } from "vitest";
import { planGroupImport, type ImportContext } from "../src/lib/groupImport.js";

function context(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    groups: [
      { id: "g-football", name: "Football club", archived: false },
      { id: "g-old", name: "Old club", archived: true },
    ],
    people: new Map([
      ["sam@example.org", { userId: "u-sam", name: "Sam", status: "active" as const }],
      ["lee@example.org", { userId: "u-lee", name: "Lee", status: "active" as const }],
      ["pat@example.org", { userId: "u-pat", name: "Pat", status: "pending" as const }],
      ["kim@example.org", { userId: "u-kim", name: "Kim", status: "deactivated" as const }],
      ["ola@other.org", { userId: "u-ola", name: "Ola", status: null }],
    ]),
    memberships: new Map([["g-football:u-lee", "member" as const]]),
    pendingInvites: new Set(["ivy@example.org"]),
    allowedDomains: [],
    ...overrides,
  };
}

describe("planGroupImport", () => {
  it("adds active members, matching group names whatever their case", () => {
    const plan = planGroupImport([{ email: " Sam@Example.org ", group: "football CLUB" }], context());
    expect(plan.add).toEqual([
      { email: "sam@example.org", groupId: "g-football", group: "Football club", role: "member", userId: "u-sam", name: "Sam" },
    ]);
    expect(plan.newGroups).toEqual([]);
  });

  it("creates groups that don't exist yet, once each", () => {
    const plan = planGroupImport(
      [
        { email: "sam@example.org", group: "Netball" },
        { email: "lee@example.org", group: "netball" },
      ],
      context(),
    );
    expect(plan.newGroups).toEqual(["Netball"]);
    expect(plan.add.map((a) => [a.email, a.groupId, a.group])).toEqual([
      ["sam@example.org", null, "Netball"],
      ["lee@example.org", null, "Netball"],
    ]);
  });

  it("counts rows already done, and makes a member a lead", () => {
    const plan = planGroupImport(
      [
        { email: "lee@example.org", group: "Football club" },
        { email: "lee@example.org", group: "Football club", role: "Lead" },
      ],
      context(),
    );
    expect(plan.add).toEqual([expect.objectContaining({ email: "lee@example.org", role: "lead" })]);
    expect(plan.alreadyDone).toBe(0);
    expect(planGroupImport([{ email: "lee@example.org", group: "Football club" }], context()).alreadyDone).toBe(1);
  });

  it("invites people who aren't members, once each, and saves their groups", () => {
    const plan = planGroupImport(
      [
        { email: "new@example.org", group: "Football club" },
        { email: "new@example.org", group: "Netball", role: "lead" },
        { email: "ola@other.org", group: "Football club" },
      ],
      context(),
    );
    expect(plan.invite).toEqual(["new@example.org", "ola@other.org"]);
    expect(plan.save.map((s) => [s.email, s.group, s.role, s.reason])).toEqual([
      ["new@example.org", "Football club", "member", "invite"],
      ["new@example.org", "Netball", "lead", "invite"],
      ["ola@other.org", "Football club", "member", "invite"],
    ]);
  });

  it("saves groups for people already invited or waiting for approval, without inviting them again", () => {
    const plan = planGroupImport(
      [
        { email: "ivy@example.org", group: "Football club" },
        { email: "pat@example.org", group: "Football club" },
      ],
      context(),
    );
    expect(plan.invite).toEqual([]);
    expect(plan.save.map((s) => [s.email, s.reason])).toEqual([
      ["ivy@example.org", "invited"],
      ["pat@example.org", "waiting"],
    ]);
  });

  it("explains rows it can't use", () => {
    const plan = planGroupImport(
      [
        { email: "not-an-email", group: "Football club" },
        { email: "", group: "Football club" },
        { email: "sam@example.org", group: " " },
        { email: "sam@example.org", group: "x".repeat(81) },
        { email: "sam@example.org", group: "Football club", role: "captain" },
        { email: "sam@example.org", group: "Old club" },
        { email: "kim@example.org", group: "Football club" },
      ],
      context(),
    );
    expect(plan.problems).toEqual([
      { row: 1, email: "not-an-email", problem: "Not an email address" },
      { row: 2, email: "", problem: "No email address" },
      { row: 3, email: "sam@example.org", problem: "No group" },
      { row: 4, email: "sam@example.org", problem: "Group name is longer than 80 characters" },
      { row: 5, email: "sam@example.org", problem: "Role must be lead, member or left empty" },
      { row: 6, email: "sam@example.org", problem: "Old club is archived. Restore it first." },
      { row: 7, email: "kim@example.org", problem: "Deactivated. Reactivate them from Members first." },
    ]);
    expect(plan.add).toEqual([]);
  });

  it("only invites addresses on the organisation's email domains", () => {
    const ctx = context({ allowedDomains: ["example.org"] });
    const plan = planGroupImport(
      [
        { email: "new@example.org", group: "Football club" },
        { email: "ola@other.org", group: "Football club" },
        { email: "sam@example.org", group: "Football club" },
      ],
      ctx,
    );
    expect(plan.invite).toEqual(["new@example.org"]);
    expect(plan.problems).toEqual([{ row: 2, email: "ola@other.org", problem: "Not one of your organisation's email domains" }]);
    expect(plan.add.map((a) => a.email)).toEqual(["sam@example.org"]);
  });
});
