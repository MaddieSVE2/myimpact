import { describe, it, expect } from "vitest";
import { decideScope } from "../src/lib/orgReportScope.js";
import { computeOrgBreakdown, type BreakdownRecord } from "../src/lib/orgBreakdown.js";

const orgGroups = ["g1", "g2", "g3"];
const manager = { orgId: "o", isManager: true, ledGroupIds: [] as string[] };
const lead = { orgId: "o", isManager: false, ledGroupIds: ["g1", "g2"] };
const member = { orgId: "o", isManager: false, ledGroupIds: [] as string[] };

describe("decideScope", () => {
  it("gives managers the whole organisation by default", () => {
    expect(decideScope(manager, undefined, orgGroups)).toEqual({
      ok: true,
      scope: { orgId: "o", isManager: true, groupIds: null, ungroupedOnly: false },
    });
  });

  it("lets managers report one group, or the activities in no group", () => {
    expect(decideScope(manager, "g3", orgGroups)).toMatchObject({ ok: true, scope: { groupIds: ["g3"] } });
    expect(decideScope(manager, "none", orgGroups)).toMatchObject({ ok: true, scope: { groupIds: null, ungroupedOnly: true } });
  });

  it("refuses a group from another organisation", () => {
    expect(decideScope(manager, "elsewhere", orgGroups)).toEqual({ ok: false, status: 404, error: "Group not found." });
  });

  it("limits leads to the groups they lead", () => {
    expect(decideScope(lead, undefined, orgGroups)).toMatchObject({ ok: true, scope: { isManager: false, groupIds: ["g1", "g2"] } });
    expect(decideScope(lead, "g2", orgGroups)).toMatchObject({ ok: true, scope: { groupIds: ["g2"] } });
    expect(decideScope(lead, "g3", orgGroups)).toMatchObject({ ok: false, status: 403 });
  });

  it("never gives leads the whole organisation or the ungrouped activities", () => {
    expect(decideScope(lead, "none", orgGroups)).toMatchObject({ ok: false, status: 403 });
    const all = decideScope(lead, "", orgGroups);
    expect(all.ok && all.scope.groupIds).toEqual(["g1", "g2"]);
  });

  it("refuses members who are neither managers nor leads", () => {
    expect(decideScope(member, undefined, orgGroups)).toMatchObject({ ok: false, status: 403 });
  });
});

describe("group breakdown", () => {
  const rec = (userId: string, orgGroupId: string | null, totalHours: number, totalValue: number): BreakdownRecord =>
    ({ userId, entryDate: new Date("2026-05-01"), region: null, outwardCode: null, locationJson: null, resultJson: { totalHours, totalValue }, orgGroupId });

  it("puts each activity in its group, and the rest under No group, adding up to the total", () => {
    const records = [rec("a", "g1", 2, 30), rec("b", "g1", 1, 10), rec("a", "g2", 3, 45), rec("c", null, 1, 5)];
    const rows = computeOrgBreakdown(records, "group", { groupNames: new Map([["g1", "Football"], ["g2", "Allotment"]]) });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.g1).toMatchObject({ label: "Football", records: 2, members: 2, hours: 3, valueGBP: 40 });
    expect(byKey.g2).toMatchObject({ label: "Allotment", records: 1, members: 1 });
    expect(byKey.none).toMatchObject({ label: "No group", records: 1 });
    expect(rows.reduce((s, r) => s + r.valueGBP, 0)).toBe(90);
    expect(rows.reduce((s, r) => s + r.hours, 0)).toBe(7);
  });
});
