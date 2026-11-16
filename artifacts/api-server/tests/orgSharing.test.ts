import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

// Use the real drizzle table schema but stub out the live db connection so
// importing orgSharing.ts never opens a pool.
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../lib/db/src/schema/index.js");
  return { ...schema, db: {}, pool: {} };
});

const {
  currentContributorCount,
  sharedRecordsCondition,
  notOrgTwinCondition,
  orgVisibleMemberRecordsCondition,
  recordInSharedWindow,
} = await import("../src/lib/orgSharing.js");
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
    formerMembers: new Map(),
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

  it("consented mode: makes activity logged on the consent day visible even when consent was granted later that day", () => {
    const consentedAt = new Date("2026-08-20T14:29:51.108Z");
    const ctx = makeCtx({
      shareFromByUser: new Map([["user-1", consentedAt]]),
    });

    expect(recordInSharedWindow(ctx, "user-1", new Date("2026-08-20T00:00:00.000Z"))).toBe(true);
    expect(recordInSharedWindow(ctx, "user-1", new Date("2026-08-19T23:59:59.999Z"))).toBe(false);

    const q = render(sharedRecordsCondition(ctx)!);
    expect(q.params).toContain("2026-08-20T00:00:00.000Z");
    expect(q.params).not.toContain(consentedAt.toISOString());
  });

  it("consented mode: members without a shareFrom are excluded entirely", () => {
    const cond = sharedRecordsCondition(makeCtx({ memberIds: ["user-1", "user-2"] }));
    const q = render(cond!);
    expect(q.params).toContain("user-1");
    expect(q.params).not.toContain("user-2");
  });

  it("consented mode: members sharing from the same day are matched with one IN list", () => {
    // Different times on the same day are the same share window.
    const ctx = makeCtx({
      memberIds: ["user-1", "user-2", "user-3"],
      shareFromByUser: new Map([
        ["user-1", new Date("2025-09-01T00:00:00Z")],
        ["user-2", new Date("2025-09-01T16:45:00Z")],
        ["user-3", new Date("2025-09-01T09:00:00Z")],
      ]),
    });
    const q = render(sharedRecordsCondition(ctx)!);
    expect(q.sql).toContain(`"user_id" in (`);
    expect(q.sql).not.toContain(`"user_id" = `);
    expect(q.sql.match(/"entry_date" >= /g)).toHaveLength(1);
    expect(q.params).toEqual(expect.arrayContaining(["user-1", "user-2", "user-3", "2025-09-01T00:00:00.000Z"]));
  });

  it("consented mode: members sharing from different days keep their own window", () => {
    const ctx = makeCtx({
      memberIds: ["user-1", "user-2", "user-3"],
      shareFromByUser: new Map([
        ["user-1", new Date("2025-09-01T00:00:00Z")],
        ["user-2", new Date("2025-09-01T00:00:00Z")],
        ["user-3", new Date("2026-02-10T00:00:00Z")],
      ]),
    });
    const q = render(sharedRecordsCondition(ctx)!);
    // user-1 and user-2 together from 1 September; user-3 alone from 10 February.
    expect(q.sql).toMatch(/"user_id" in \(\$\d+, \$\d+\) and [^)]*"entry_date" >= \$\d+/);
    expect(q.sql).toMatch(/"user_id" = \$\d+ and [^)]*"entry_date" >= \$\d+/);
    const user3 = q.params.indexOf("user-3");
    expect(q.params[user3 + 1]).toBe("2026-02-10T00:00:00.000Z");
    const user2 = q.params.indexOf("user-2");
    expect(q.params[user2 + 1]).toBe("2025-09-01T00:00:00.000Z");
  });

  it("consented mode: a deactivated member is not folded into a same-day group", () => {
    const deactivatedAt = new Date("2026-06-01T12:00:00.000Z");
    const shareFrom = new Date("2025-09-01T00:00:00Z");
    const ctx = makeCtx({
      memberIds: ["user-1", "user-2"],
      shareFromByUser: new Map([["user-1", shareFrom], ["user-2", shareFrom], ["former-1", shareFrom]]),
      formerMembers: new Map([["former-1", deactivatedAt]]),
    });
    const q = render(sharedRecordsCondition(ctx)!);
    // The cut-off sits directly after the former member's own id and window.
    const former = q.params.indexOf("former-1");
    expect(q.params.slice(former, former + 3)).toEqual(["former-1", "2025-09-01T00:00:00.000Z", deactivatedAt.toISOString()]);
    expect(q.sql.match(/"created_at" <= /g)).toHaveLength(1);
    expect(q.sql).toMatch(/"user_id" in \(\$\d+, \$\d+\)/);
  });

  it("explicit mode: keeps legacy member filter but still excludes twins", () => {
    const cond = sharedRecordsCondition(makeCtx({ mode: "explicit_submission", shareFromByUser: new Map() }));
    const q = render(cond!);
    expect(q.sql).toContain(`"user_id" in (`);
    expect(q.sql).toContain("org_twin");
    expect(q.params).toContain("user-1");
    expect(q.params).toContain("org-1");
  });

  it("explicit mode: a deactivated member counts only for what they logged before being deactivated", () => {
    const deactivatedAt = new Date("2026-06-01T12:00:00.000Z");
    const cond = sharedRecordsCondition(makeCtx({
      mode: "explicit_submission",
      memberIds: [],
      shareFromByUser: new Map(),
      formerMembers: new Map([["former-1", deactivatedAt]]),
    }));
    const q = render(cond!);
    expect(q.sql).toContain(`"created_at" <= `);
    expect(q.params).toContain("former-1");
    expect(q.params).toContain(deactivatedAt.toISOString());
  });

  it("consented mode: a deactivated member keeps their share window and gains the same cut-off", () => {
    const deactivatedAt = new Date("2026-06-01T12:00:00.000Z");
    const cond = sharedRecordsCondition(makeCtx({
      memberIds: [],
      shareFromByUser: new Map([["former-1", new Date("2026-01-01T00:00:00Z")]]),
      formerMembers: new Map([["former-1", deactivatedAt]]),
    }));
    const q = render(cond!);
    expect(q.sql).toContain(`"entry_date" >= `);
    expect(q.sql).toContain(`"created_at" <= `);
    expect(q.params).toContain(deactivatedAt.toISOString());
  });

  it("the cut-off applies only to deactivated members", () => {
    const q = render(sharedRecordsCondition(makeCtx({ mode: "explicit_submission", shareFromByUser: new Map() }))!);
    expect(q.sql).not.toContain(`"created_at" <= `);
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

describe("currentContributorCount", () => {
  it("leaves out deactivated members whose hours still count", () => {
    const ctx = makeCtx({ formerMembers: new Map([["former-1", new Date("2026-01-01")]]) });
    const records = [{ userId: "a" }, { userId: "a" }, { userId: "b" }, { userId: "former-1" }];
    expect(currentContributorCount(ctx, records)).toBe(2);
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
