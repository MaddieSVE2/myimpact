import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Use the real drizzle table schema but stub out the live db connection so
// importing orgSharing.ts never opens a pool.
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../lib/db/src/schema/index.js");
  return { ...schema, db: {}, pool: {} };
});

const { sharedRecordsCondition, notOrgTwinCondition, orgVisibleMemberRecordsCondition } = await import("../src/lib/orgSharing.js");
import type { OrgSharingContext } from "../src/lib/orgSharing.js";

const dialect = new PgDialect();
function render(cond: SQL) {
  return dialect.sqlToQuery(cond);
}

function makeCtx(overrides: Partial<OrgSharingContext> = {}): OrgSharingContext {
  return {
    orgId: "org-1",
    mode: "consented_logging",
    revoked: false,
    sections: {
      locationMap: true,
      categories: true,
      sroi: true,
      valuePerMember: true,
      topActivities: true,
      pulseSummary: true,
    },
    memberIds: ["user-1"],
    shareFromByUser: new Map([["user-1", new Date("2026-01-01T00:00:00Z")]]),
    ...overrides,
  };
}

describe("notOrgTwinCondition", () => {
  it("excludes personal twins via the explicit orgRecordId link, the report-share reverse link, or the legacy fallback match", () => {
    const q = render(notOrgTwinCondition("org-1"));
    // Only applies to personal records (wizard saves may also land as
    // 'retrospective' when dated to a prior year)...
    expect(q.sql).toContain(`"source" IN ('user', 'retrospective')`);
    // ...that have a member-submitted counterpart for THIS org.
    expect(q.sql).toContain("org_twin.source = 'member-submitted'");
    expect(q.sql).toContain("org_twin.submitted_to_org_id = $1");
    expect(q.params).toContain("org-1");
    // Explicit link path: resultJson.orgRecordId → org record id.
    expect(q.sql).toContain("'orgRecordId'");
    expect(q.sql).toMatch(/org_twin\.id = \(.*->> 'orgRecordId'\)::int/s);
    // Report-share reverse link: the org copy points back at the personal
    // report via source_report_id, so the report is excluded org-side.
    expect(q.sql).toMatch(/org_twin\.source_report_id = /);
    // Legacy fallback path: same entry date + identical activities json.
    expect(q.sql).toMatch(/org_twin\.entry_date = /);
    expect(q.sql).toMatch(/org_twin\.activities_json = /);
    // Whole thing is negated so twins are filtered OUT.
    expect(q.sql.trim().startsWith("NOT")).toBe(true);
  });
});

describe("sharedRecordsCondition", () => {
  it("returns undefined when no members share anything", () => {
    expect(sharedRecordsCondition(makeCtx({ memberIds: [], shareFromByUser: new Map() }))).toBeUndefined();
  });

  it("consented mode: combines per-member share windows with the twin exclusion", () => {
    const cond = sharedRecordsCondition(makeCtx());
    expect(cond).toBeDefined();
    const q = render(cond!);
    expect(q.sql).toContain(`"user_id" = `);
    expect(q.sql).toContain(`"entry_date" >= `);
    expect(q.sql).toContain("org_twin");
    expect(q.params).toContain("user-1");
    expect(q.params).toContain("org-1");
  });

  it("consented mode: members without a shareFrom are excluded entirely", () => {
    const cond = sharedRecordsCondition(makeCtx({ memberIds: ["user-1", "user-2"] }));
    const q = render(cond!);
    expect(q.params).toContain("user-1");
    expect(q.params).not.toContain("user-2");
  });

  it("explicit mode: keeps legacy member filter but still excludes twins", () => {
    const cond = sharedRecordsCondition(makeCtx({ mode: "explicit_submission", shareFromByUser: new Map() }));
    const q = render(cond!);
    expect(q.sql).toContain(`"user_id" in (`);
    expect(q.sql).toContain("org_twin");
    expect(q.params).toContain("user-1");
    expect(q.params).toContain("org-1");
  });

  it("both modes scope org submissions to THIS org (no cross-org leakage for multi-org members)", () => {
    // A member of Org A and Org B: records submitted to Org A (member
    // submissions, report shares, attested rows — submitted_to_org_id set)
    // must never appear in Org B's aggregates/surfaces.
    for (const mode of ["explicit_submission", "consented_logging"] as const) {
      const cond = sharedRecordsCondition(makeCtx({
        mode,
        ...(mode === "explicit_submission" ? { shareFromByUser: new Map() } : {}),
      }));
      const q = render(cond!);
      expect(q.sql).toMatch(/"submitted_to_org_id" IS NULL/i);
      expect(q.sql).toMatch(/"submitted_to_org_id" = /);
      // The scoping param is the requesting org's id.
      expect(q.params.filter(p => p === "org-1").length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("orgVisibleMemberRecordsCondition", () => {
  it("combines member filter, this-org submission scoping, and twin exclusion (public share links etc.)", () => {
    const cond = orgVisibleMemberRecordsCondition("org-1", ["user-1", "user-2"]);
    expect(cond).toBeDefined();
    const q = render(cond!);
    // Member filter.
    expect(q.sql).toContain(`"user_id" in (`);
    // Submissions to other orgs are invisible here.
    expect(q.sql).toMatch(/"submitted_to_org_id" IS NULL/i);
    expect(q.sql).toMatch(/"submitted_to_org_id" = /);
    // Personal twins of this org's submissions (incl. report shares via
    // source_report_id) are excluded, so timelines never sum a report and
    // its share twice.
    expect(q.sql).toContain("org_twin");
    expect(q.sql).toContain("source_report_id");
    expect(q.params).toContain("user-1");
    expect(q.params).toContain("user-2");
    expect(q.params).toContain("org-1");
  });

  it("returns undefined with no members", () => {
    expect(orgVisibleMemberRecordsCondition("org-1", [])).toBeUndefined();
  });
});
