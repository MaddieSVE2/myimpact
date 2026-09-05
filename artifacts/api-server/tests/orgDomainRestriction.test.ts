import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock state shared across vi.mock factories and tests ─────────────
const state = vi.hoisted(() => ({
  // Authenticate middleware behaviour.
  authUser: null as { id: string; email: string } | null,
  // Queue of db.query.orgMembersTable.findFirst() results — the join route
  // calls it twice (existing membership in this org, then any membership in
  // another org) and the settings route calls it once.
  membershipQueue: [] as Array<Record<string, unknown> | null>,
  // db.query.organisationsTable.findFirst() result (the org being joined).
  organisation: null as Record<string, unknown> | null,
  // db.query.orgRegistrationsTable.findFirst() result.
  registration: null as Record<string, unknown> | null,
  // Records inserted via db.insert(table).values(...).
  inserts: [] as Array<{ table: string; values: unknown }>,
  // Recorded db.update(table).set(values) calls.
  updates: [] as Array<{ table: string; values: unknown }>,
  // Rows returned from db.update(...).returning().
  updateReturning: [] as unknown[],
  // Queue of canned select() results.
  selectQueue: [] as unknown[][],
}));

// ── @workspace/db mock ───────────────────────────────────────────────────────
vi.mock("@workspace/db", () => {
  const tableTag = (name: string) => ({ __tableName: name });

  function builderFor(rows: () => unknown[]) {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain;
    b.where = chain;
    b.orderBy = chain;
    b.limit = chain;
    b.groupBy = chain;
    b.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject);
    b.catch = (reject: (e: unknown) => unknown) => Promise.resolve(rows()).catch(reject);
    b.finally = (cb: () => void) => Promise.resolve(rows()).finally(cb);
    return b;
  }

  const db = {
    query: {
      orgMembersTable: {
        findFirst: vi.fn(async () => state.membershipQueue.shift() ?? null),
      },
      organisationsTable: {
        findFirst: vi.fn(async () => state.organisation),
      },
      orgRegistrationsTable: {
        findFirst: vi.fn(async () => state.registration),
      },
      impactRecordsTable: {
        findFirst: vi.fn(async () => null),
      },
    },
    insert: (table: { __tableName: string }) => ({
      values(vals: unknown) {
        state.inserts.push({ table: table.__tableName, values: vals });
        return {
          returning: async () => [{ id: 1 }],
          onConflictDoUpdate: () => Promise.resolve(undefined),
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
          catch: (reject: (e: unknown) => unknown) => Promise.resolve(undefined).catch(reject),
          finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
        };
      },
    }),
    select: (_cols?: unknown) => builderFor(() => state.selectQueue.shift() ?? []),
    update: (table: { __tableName: string }) => ({
      set: (values: unknown) => {
        state.updates.push({ table: table.__tableName, values });
        return {
          where: () => ({
            returning: async () => state.updateReturning,
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve, reject),
          }),
        };
      },
    }),
    delete: (_table: { __tableName: string }) => ({
      where: () => Promise.resolve(undefined),
    }),
    transaction: async (cb: (tx: unknown) => unknown) => cb({}),
  };

  return {
    db,
    organisationsTable: tableTag("organisations"),
    orgMembersTable: tableTag("org_members"),
    impactRecordsTable: tableTag("impact_records"),
    orgRegistrationsTable: tableTag("org_registrations"),
    orgMatchRatesTable: tableTag("org_match_rates"),
    orgShareLinksTable: tableTag("org_share_links"),
    orgSsoConfigsTable: tableTag("org_sso_configs"),
    recordVerificationsTable: tableTag("record_verifications"),
    orgAuditLogTable: tableTag("org_audit_log"),
    usersTable: tableTag("users"),
    orgApiKeysTable: tableTag("org_api_keys"),
    userProfilesTable: tableTag("user_profiles"),
    attachmentsTable: tableTag("attachments"),
    orgInvitesTable: tableTag("org_invites"),
    orgMemberConsentsTable: tableTag("org_member_consents"),
    orgMigrationsTable: tableTag("org_migrations"),
    orgMigratedActivitiesTable: tableTag("org_migrated_activities"),
  };
});

// ── Authenticate middleware: read user from hoisted state ───────────────────
vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

// ── Stub out heavy / unrelated modules pulled in at org.ts load time ────────
vi.mock("../src/lib/resend.js", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: vi.fn(async () => ({ id: "stub" })) } },
    fromEmail: "test@example.com",
  })),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: vi.fn(async () => Buffer.from("")) }));
vi.mock("../src/lib/orgPdf.js", () => ({ buildOrgDocument: vi.fn(() => null) }));
vi.mock("../src/lib/rateLimiter.js", () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../src/lib/orgMatch.js", () => ({ computeMatchesForRecords: vi.fn(() => []) }));
vi.mock("../src/lib/webhookDispatcher.js", () => ({
  enqueueOrgEvent: vi.fn(async () => undefined),
}));
vi.mock("../src/lib/analytics.js", () => ({
  trackServerEvent: vi.fn(),
  ANALYTICS_EVENTS: [],
}));
vi.mock("../src/lib/featureFlags.js", () => ({
  featureCap: vi.fn(async () => Number.POSITIVE_INFINITY),
}));
vi.mock("../src/lib/oidc.js", () => ({
  configuredProviders: () => [],
  isProviderConfigured: () => false,
  normalizeDomain: (d: string) => d,
}));
vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAttachmentsForRecord: vi.fn(async () => 0),
}));
vi.mock("../src/lib/objectStorage.js", () => ({
  generateOrgLogoKey: () => "stub",
  getUploadURL: vi.fn(async () => "https://stub"),
  getDownloadURL: vi.fn(async () => "https://stub"),
  deleteAttachment: vi.fn(async () => undefined),
  getObjectMetadata: vi.fn(async () => null),
  readObjectBuffer: vi.fn(async () => null),
}));

// Now we can safely import the router.
const { default: orgRouter } = await import("../src/routes/org.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/org", orgRouter);
  return app;
}

const baseOrg = {
  id: "org-1",
  name: "Acme Volunteers",
  type: "charity",
  inviteCode: "ACME1234",
  revokedAt: null,
  contactEmail: "owner@acme.org",
  dataSharingMode: "explicit_submission",
  allowedDomain: null as string | null,
};

const fullOrgRow = {
  ...baseOrg,
  aiSidekickEnabled: true,
  challengeLeaderboardEnabled: false,
  sroiCostPerVolunteer: null,
  sroiCostRecruitment: null,
  sroiCostOnboarding: null,
  sroiCostSupport: null,
  sroiCostAdmin: null,
  summaryYearStart: "01-01",
  autoVerifyActivities: false,
  evidencePolicy: "optional",
};

beforeEach(() => {
  state.authUser = null;
  state.membershipQueue.length = 0;
  state.organisation = null;
  state.registration = null;
  state.inserts.length = 0;
  state.updates.length = 0;
  state.updateReturning = [];
  state.selectQueue.length = 0;
});

describe("POST /api/org/validate-invite — direct invite links", () => {
  it("resolves an invite code to its organisation when the link does not include an org id", async () => {
    state.authUser = { id: "new-user", email: "new@example.com" };
    state.organisation = baseOrg;
    state.membershipQueue.push(null);

    const res = await request(makeApp())
      .post("/api/org/validate-invite")
      .send({ inviteCode: "acme1234" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      orgId: "org-1",
      orgName: "Acme Volunteers",
    });
  });
});

describe("PATCH /api/org/my/settings — allowedDomain", () => {
  function asManager() {
    state.authUser = { id: "mgr-1", email: "owner@acme.org" };
    state.membershipQueue.push({ orgId: "org-1", userId: "mgr-1", role: "manager", status: "active" });
  }

  it("normalizes '@Acme.ORG' to 'acme.org' before storing", async () => {
    asManager();
    state.updateReturning = [{ ...fullOrgRow, allowedDomain: "acme.org" }];
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: "@Acme.ORG" });
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect((state.updates[0].values as { allowedDomain?: string }).allowedDomain).toBe("acme.org");
    expect(res.body.org.allowedDomain).toBe("acme.org");
  });

  it("trims surrounding whitespace during normalization", async () => {
    asManager();
    state.updateReturning = [{ ...fullOrgRow, allowedDomain: "acme.org" }];
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: "  acme.org  " });
    expect(res.status).toBe(200);
    expect((state.updates[0].values as { allowedDomain?: string }).allowedDomain).toBe("acme.org");
  });

  it("clears the restriction when allowedDomain is null", async () => {
    asManager();
    state.updateReturning = [{ ...fullOrgRow, allowedDomain: null }];
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: null });
    expect(res.status).toBe(200);
    expect((state.updates[0].values as { allowedDomain?: string | null }).allowedDomain).toBeNull();
    expect(res.body.org.allowedDomain).toBeNull();
  });

  it("clears the restriction when allowedDomain is an empty string", async () => {
    asManager();
    state.updateReturning = [{ ...fullOrgRow, allowedDomain: null }];
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: "" });
    expect(res.status).toBe(200);
    expect((state.updates[0].values as { allowedDomain?: string | null }).allowedDomain).toBeNull();
  });

  it.each(["not a domain", "acme", "acme..org", "-acme.org", "acme.org-", "acme .org"])(
    "rejects invalid domain %j with 400 and writes nothing",
    async (bad) => {
      asManager();
      const res = await request(makeApp())
        .patch("/api/org/my/settings")
        .send({ allowedDomain: bad });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid domain/i);
      expect(state.updates).toHaveLength(0);
    },
  );

  it("rejects non-string, non-null allowedDomain with 400", async () => {
    asManager();
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: 42 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/domain string or null/i);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects non-managers with 403", async () => {
    state.authUser = { id: "member-1", email: "someone@acme.org" };
    state.membershipQueue.push({ orgId: "org-1", userId: "member-1", role: "member", status: "active" });
    const res = await request(makeApp())
      .patch("/api/org/my/settings")
      .send({ allowedDomain: "acme.org" });
    expect(res.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });
});

describe("POST /api/org/join — allowedDomain enforcement", () => {
  const joinBody = { inviteCode: "ACME1234", orgId: "org-1" };

  it("rejects an email whose domain does not match with 403 and does not create a membership", async () => {
    state.authUser = { id: "user-1", email: "intruder@evil.com" };
    state.organisation = { ...baseOrg, allowedDomain: "acme.org" };
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/@acme\.org/i);
    expect(state.inserts.filter((i) => i.table === "org_members")).toHaveLength(0);
  });

  it("rejects a lookalike subdomain (e.g. acme.org.evil.com) with 403", async () => {
    state.authUser = { id: "user-1", email: "sneaky@acme.org.evil.com" };
    state.organisation = { ...baseOrg, allowedDomain: "acme.org" };
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(403);
    expect(state.inserts.filter((i) => i.table === "org_members")).toHaveLength(0);
  });

  it("accepts a matching email, comparing domains case-insensitively", async () => {
    state.authUser = { id: "user-1", email: "Volunteer@ACME.org" };
    state.organisation = { ...baseOrg, allowedDomain: "acme.org" };
    // existing-membership check, then other-org membership check.
    state.membershipQueue.push(null, null);
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const memberInserts = state.inserts.filter((i) => i.table === "org_members");
    expect(memberInserts).toHaveLength(1);
    expect(memberInserts[0].values).toMatchObject({ orgId: "org-1", userId: "user-1", role: "member" });
  });

  it("still enforces the check when allowedDomain was stored with mixed case", async () => {
    state.authUser = { id: "user-1", email: "intruder@evil.com" };
    state.organisation = { ...baseOrg, allowedDomain: "Acme.Org" };
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(403);
    expect(state.inserts.filter((i) => i.table === "org_members")).toHaveLength(0);
  });

  it("allows any email domain when the org has no allowedDomain", async () => {
    state.authUser = { id: "user-1", email: "anyone@anywhere.net" };
    state.organisation = { ...baseOrg, allowedDomain: null };
    state.membershipQueue.push(null, null);
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(200);
    expect(state.inserts.filter((i) => i.table === "org_members")).toHaveLength(1);
  });

  it("rejects an email with no domain part when a restriction is set", async () => {
    state.authUser = { id: "user-1", email: "no-at-sign" };
    state.organisation = { ...baseOrg, allowedDomain: "acme.org" };
    const res = await request(makeApp()).post("/api/org/join").send(joinBody);
    expect(res.status).toBe(403);
    expect(state.inserts.filter((i) => i.table === "org_members")).toHaveLength(0);
  });
});
