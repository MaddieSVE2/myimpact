import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Hoisted mock state shared across vi.mock factories and tests ─────────────
const state = vi.hoisted(() => ({
  // Authenticate middleware behaviour.
  authUser: null as { id: string; email: string } | null,
  // db.query.orgMembersTable.findFirst() result.
  membership: null as { orgId: string; userId: string; role: string } | null,
  // Records inserted via db.insert(table).values(...). Each entry is
  // { table: "impact_records" | "record_verifications" | "org_audit_log", values }.
  inserts: [] as Array<{ table: string; values: unknown }>,
  // Canned id returned from db.insert(impactRecordsTable).values(...).returning().
  insertedRecordId: 4242 as number,
  // Queue of canned select() results. Each entry is the rows for one
  // db.select(...).from(...).where(...)... chain.
  selectQueue: [] as unknown[][],
  // Recorded enqueueOrgEvent / trackServerEvent calls.
  enqueued: [] as Array<{ orgId: string; eventType: string; payload: unknown }>,
  tracked: [] as Array<{ eventName: string; userId?: string }>,
  // db.query.impactRecordsTable.findFirst() result (for DELETE/PATCH routes).
  impactRecord: null as Record<string, unknown> | null,
  // db.query.organisationsTable.findFirst() result (revocation check in
  // requireOrgManager). Defaults to an active (non-revoked) organisation.
  organisation: { revokedAt: null } as Record<string, unknown> | null,
  // Recorded db.update(table).set(values) calls.
  updates: [] as Array<{ table: string; values: unknown }>,
  // Recorded db.delete(table) calls.
  deletes: [] as string[],
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

  function insertFor(table: { __tableName: string }) {
    return {
      values(vals: unknown) {
        state.inserts.push({ table: table.__tableName, values: vals });
        const ret = {
          returning: async () => {
            if (table.__tableName === "impact_records") {
              return [{ id: state.insertedRecordId }];
            }
            return [{}];
          },
          // Awaiting the values() chain directly resolves with no payload.
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve, reject),
          catch: (reject: (e: unknown) => unknown) => Promise.resolve(undefined).catch(reject),
          finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
        };
        return ret;
      },
    };
  }

  const db = {
    query: {
      orgMembersTable: {
        findFirst: vi.fn(async () => state.membership),
      },
      impactRecordsTable: {
        findFirst: vi.fn(async () => state.impactRecord),
      },
      organisationsTable: {
        findFirst: vi.fn(async () => state.organisation),
      },
    },
    insert: (table: { __tableName: string }) => insertFor(table),
    select: (_cols?: unknown) =>
      builderFor(() => state.selectQueue.shift() ?? []),
    update: (table: { __tableName: string }) => ({
      set: (values: unknown) => {
        state.updates.push({ table: table.__tableName, values });
        return {
          where: () => {
            const chain = {
              returning: async () => [{}],
              then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
            return chain;
          },
        };
      },
    }),
    delete: (table: { __tableName: string }) => ({
      where: () => {
        state.deletes.push(table.__tableName);
        return Promise.resolve(undefined);
      },
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
  };
});

// ── Authenticate middleware: read user from header set by the test ──────────
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
  enqueueOrgEvent: vi.fn(async (e: { orgId: string; eventType: string; payload: unknown }) => {
    state.enqueued.push(e);
  }),
}));
vi.mock("../src/lib/analytics.js", () => ({
  trackServerEvent: vi.fn((opts: { eventName: string; userId?: string }) => {
    state.tracked.push(opts);
  }),
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

beforeEach(() => {
  state.authUser = null;
  state.membership = null;
  state.inserts.length = 0;
  state.selectQueue.length = 0;
  state.enqueued.length = 0;
  state.tracked.length = 0;
  state.insertedRecordId = 4242;
  state.impactRecord = null;
  state.organisation = { revokedAt: null };
  state.updates.length = 0;
  state.deletes.length = 0;
});

describe("POST /api/org/member-submit", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "tree_planting", quantity: 5 }],
    });
    expect(res.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects users who are not members of any organisation with 403", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = null;
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "tree_planting", quantity: 5 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/member of an organisation/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects unknown activity ids with 400", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "not_a_real_activity", quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown activity/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects zero-value rows (positive quantity/hours required)", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();

    // tree_planting is a unit-based activity, so quantity must be > 0.
    const res1 = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "tree_planting", quantity: 0 }],
    });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/positive quantity or hours/i);

    // community_garden is hour-based, so hoursPerYear must be > 0.
    const res2 = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "community_garden", hoursPerYear: 0 }],
    });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/positive quantity or hours/i);

    expect(state.inserts).toHaveLength(0);
  });

  it("requires at least one activity in the payload", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({ activities: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one activity/i);
  });

  it("on success: inserts impact_record + auto-approved verification + audit log, fires webhook event, returns the new record", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.insertedRecordId = 9999;

    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      name: "April submission",
      periodLabel: "April 2026",
      activities: [
        { activityId: "tree_planting", quantity: 4, title: "Earth day", detail: "Local park" },
        { activityId: "community_garden", hoursPerYear: 10 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.record.id).toBe(9999);
    expect(res.body.record.activityCount).toBe(2);
    expect(res.body.record.submittedToOrgId).toBe("org-1");
    expect(typeof res.body.record.submittedToOrgAt).toBe("string");
    expect(res.body.record.totalValue).toBeGreaterThan(0);

    // Three writes, in order: impact_records, record_verifications, org_audit_log.
    const tables = state.inserts.map(i => i.table);
    expect(tables).toEqual(["impact_records", "record_verifications", "org_audit_log"]);

    const recordValues = state.inserts[0].values as Record<string, unknown>;
    expect(recordValues.userId).toBe("user-1");
    expect(recordValues.name).toBe("April submission");
    expect(recordValues.periodLabel).toBe("April 2026");
    expect(recordValues.source).toBe("member-submitted");
    expect(recordValues.submittedToOrgId).toBe("org-1");
    expect(Array.isArray(recordValues.activitiesJson)).toBe(true);
    expect((recordValues.activitiesJson as unknown[]).length).toBe(2);

    const verificationValues = state.inserts[1].values as Record<string, unknown>;
    expect(verificationValues.recordId).toBe(9999);
    expect(verificationValues.orgId).toBe("org-1");
    expect(verificationValues.status).toBe("approved");
    expect(verificationValues.verifiedBy).toBe("user-1");
    expect(verificationValues.reason).toBe("member-submitted");

    const auditValues = state.inserts[2].values as Record<string, unknown>;
    expect(auditValues.orgId).toBe("org-1");
    expect(auditValues.actorUserId).toBe("user-1");
    expect(auditValues.action).toBe("member.submit");
    expect(auditValues.targetType).toBe("impact_record");
    expect(auditValues.targetId).toBe("9999");

    // Webhook event fired with hours.logged shape.
    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0].orgId).toBe("org-1");
    expect(state.enqueued[0].eventType).toBe("hours.logged");
    const payload = state.enqueued[0].payload as Record<string, unknown>;
    expect(payload.recordId).toBe("9999");
    expect(payload.source).toBe("member-submitted");
    expect(payload.activityCount).toBe(2);
    expect(payload.attested).toBe(true);

    // Analytics tracked.
    expect(state.tracked.some(t => t.eventName === "org_member_submit_completed")).toBe(true);
  });

  it("saveToPersonal: links the personal copy to its org submission via resultJson.orgRecordId", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.insertedRecordId = 7777;

    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      name: "May submission",
      saveToPersonal: true,
      activities: [{ activityId: "tree_planting", quantity: 3 }],
    });

    expect(res.status).toBe(201);

    // Writes in order: org record, verification, personal record, audit log.
    const impactInserts = state.inserts.filter(i => i.table === "impact_records");
    expect(impactInserts).toHaveLength(2);

    const orgValues = impactInserts[0].values as Record<string, unknown>;
    expect(orgValues.source).toBe("member-submitted");
    expect(orgValues.submittedToOrgId).toBe("org-1");

    const personalValues = impactInserts[1].values as Record<string, unknown>;
    expect(personalValues.source).toBe("user");
    expect(personalValues.submittedToOrgId).toBeUndefined();
    // The dedupe link: the personal twin must carry the org record's id so
    // org-facing views can exclude it (see notOrgTwinCondition).
    const personalResult = personalValues.resultJson as Record<string, unknown>;
    expect(personalResult.orgRecordId).toBe(7777);
  });

  it("rejects sneaky wizard fields like donations or actions", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "tree_planting", quantity: 5 }],
      donationsGBP: 50,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/donationsGBP/);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a 'something_else' activity with no title with 400", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();

    const resNoTitle = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "something_else", hoursPerYear: 2 }],
    });
    expect(resNoTitle.status).toBe(400);
    expect(resNoTitle.body.error).toMatch(/description/i);
    expect(state.inserts).toHaveLength(0);

    const resEmptyTitle = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "something_else", hoursPerYear: 2, title: "   " }],
    });
    expect(resEmptyTitle.status).toBe(400);
    expect(resEmptyTitle.body.error).toMatch(/description/i);
    expect(state.inserts).toHaveLength(0);
  });
});

describe("GET /api/org/member-submissions", () => {
  it("rejects unauthenticated callers with 401", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/org/member-submissions");
    expect(res.status).toBe(401);
  });

  it("rejects non-managers (members) with 403", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const app = makeApp();
    const res = await request(app).get("/api/org/member-submissions");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/manager/i);
  });

  it("rejects callers with no org membership with 404", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = null;
    const app = makeApp();
    const res = await request(app).get("/api/org/member-submissions");
    expect(res.status).toBe(404);
  });

  it("returns the expected shape for managers", async () => {
    state.authUser = { id: "manager-1", email: "manager@example.com" };
    state.membership = { orgId: "org-1", userId: "manager-1", role: "manager" };

    const submittedAt = new Date("2026-04-15T10:00:00Z");
    // Three select() chains in order:
    //   1) org api keys for this org
    //   2) impact records for this org
    //   3) users for the userIds in those records
    state.selectQueue.push([]); // no api keys
    state.selectQueue.push([
      {
        id: 7,
        userId: "user-99",
        name: "April submission",
        periodLabel: "April 2026",
        totalHours: 10,
        totalValue: "1234.5",
        submittedToOrgAt: submittedAt,
        attestedAt: null,
        createdAt: submittedAt,
        source: "member-submitted",
        activitiesJson: [
          { activityId: "tree_planting", title: "Earth day", detail: "Park", hoursPerYear: 0, quantity: 4 },
        ],
      },
    ]);
    state.selectQueue.push([
      { id: "user-99", displayName: "Maddie", email: "maddie@example.com" },
    ]);

    const app = makeApp();
    const res = await request(app).get("/api/org/member-submissions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.submissions).toHaveLength(1);

    const s = res.body.submissions[0];
    expect(s.recordId).toBe(7);
    expect(s.memberName).toBe("Maddie");
    expect(s.memberEmail).toBe("maddie@example.com");
    expect(s.name).toBe("April submission");
    expect(s.period).toBe("April 2026");
    expect(s.totalHours).toBe(10);
    expect(s.totalValue).toBe(1234.5);
    expect(s.source).toBe("member-submitted");
    expect(s.activityCount).toBe(1);
    expect(s.submittedAt).toBe(submittedAt.toISOString());
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].activityName).toBe("Tree planting and green space projects");
    expect(s.lines[0].category).toBe("Environment");
    expect(s.lines[0].title).toBe("Earth day");
    expect(s.lines[0].quantity).toBe(4);
  });
});

// ── Shared fixture for DELETE / PATCH tests ──────────────────────────────────
function memberRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const submittedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
  return {
    id: 7,
    userId: "user-1",
    name: "April submission",
    periodLabel: "April 2026",
    totalHours: 10,
    totalValue: "1234.5",
    source: "member-submitted",
    submittedToOrgId: "org-1",
    submittedToOrgAt: submittedAt,
    createdAt: submittedAt,
    activitiesJson: [{ activityId: "tree_planting", quantity: 4, hoursPerYear: 0, title: null, detail: null }],
    resultJson: {},
    ...overrides,
  };
}

describe("DELETE /api/org/member-submissions/:recordId", () => {
  it("lets the submitting member withdraw within the 24h window and fires hours.withdrawn", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.impactRecord = memberRecord();

    const app = makeApp();
    const res = await request(app)
      .delete("/api/org/member-submissions/7")
      .send({ reason: "Sent by mistake" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(state.deletes).toContain("impact_records");

    // Audit log written with reason.
    const audit = state.inserts.find(i => i.table === "org_audit_log");
    expect(audit).toBeTruthy();
    const auditValues = audit!.values as Record<string, unknown>;
    expect(auditValues.action).toBe("member.submit.withdraw");
    const meta = auditValues.metadata as Record<string, unknown>;
    expect(meta.actorRole).toBe("member");
    expect(meta.reason).toBe("Sent by mistake");

    // Webhook re-fired.
    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0].eventType).toBe("hours.withdrawn");
    const payload = state.enqueued[0].payload as Record<string, unknown>;
    expect(payload.recordId).toBe("7");
    expect(payload.reason).toBe("Sent by mistake");
  });

  it("blocks the member after the 24h window with 403", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    state.impactRecord = memberRecord({ submittedToOrgAt: old, createdAt: old });

    const app = makeApp();
    const res = await request(app).delete("/api/org/member-submissions/7").send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/24 hours/i);
    expect(state.deletes).toHaveLength(0);
    expect(state.enqueued).toHaveLength(0);
  });

  it("lets a manager withdraw any time, even after the window", async () => {
    state.authUser = { id: "manager-1", email: "manager@example.com" };
    state.membership = { orgId: "org-1", userId: "manager-1", role: "manager" };
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    state.impactRecord = memberRecord({ submittedToOrgAt: old, createdAt: old });

    const app = makeApp();
    const res = await request(app)
      .delete("/api/org/member-submissions/7")
      .send({ reason: "Duplicate entry" });

    expect(res.status).toBe(200);
    expect(state.deletes).toContain("impact_records");
    expect(state.enqueued[0].eventType).toBe("hours.withdrawn");
    const payload = state.enqueued[0].payload as Record<string, unknown>;
    expect((payload.withdrawnBy as Record<string, unknown>).role).toBe("manager");
  });

  it("rejects an unrelated user (not owner, not manager) with 403", async () => {
    state.authUser = { id: "user-2", email: "user2@example.com" };
    state.membership = { orgId: "org-1", userId: "user-2", role: "member" };
    state.impactRecord = memberRecord(); // owned by user-1

    const app = makeApp();
    const res = await request(app).delete("/api/org/member-submissions/7").send({});

    expect(res.status).toBe(403);
    expect(state.deletes).toHaveLength(0);
  });
});

describe("PATCH /api/org/member-submissions/:recordId", () => {
  it("lets the submitting member edit within the window, updates the record, and fires hours.updated", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.impactRecord = memberRecord();

    const app = makeApp();
    const res = await request(app)
      .patch("/api/org/member-submissions/7")
      .send({
        reason: "Wrong number of trees",
        activities: [{ activityId: "tree_planting", quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.record.id).toBe(7);
    expect(res.body.record.activityCount).toBe(1);

    // Record updated in place.
    const update = state.updates.find(u => u.table === "impact_records");
    expect(update).toBeTruthy();
    const values = update!.values as Record<string, unknown>;
    expect(Array.isArray(values.activitiesJson)).toBe(true);
    expect((values.activitiesJson as unknown[]).length).toBe(1);

    // Audit log written with before/after figures and reason.
    const audit = state.inserts.find(i => i.table === "org_audit_log");
    expect(audit).toBeTruthy();
    const auditValues = audit!.values as Record<string, unknown>;
    expect(auditValues.action).toBe("member.submit.edit");
    const meta = auditValues.metadata as Record<string, unknown>;
    expect(meta.previousTotalHours).toBe(10);
    expect(meta.reason).toBe("Wrong number of trees");

    // Webhook fired with old + new figures.
    expect(state.enqueued).toHaveLength(1);
    expect(state.enqueued[0].eventType).toBe("hours.updated");
    const payload = state.enqueued[0].payload as Record<string, unknown>;
    expect(payload.recordId).toBe("7");
    expect(payload.previousHours).toBe(10);
  });

  it("blocks edits after the 24h window with 403", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    state.impactRecord = memberRecord({ submittedToOrgAt: old, createdAt: old });

    const app = makeApp();
    const res = await request(app)
      .patch("/api/org/member-submissions/7")
      .send({ activities: [{ activityId: "tree_planting", quantity: 2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/24 hours/i);
    expect(state.updates).toHaveLength(0);
    expect(state.enqueued).toHaveLength(0);
  });

  it("rejects edits by anyone other than the submitting member (including managers) with 403", async () => {
    state.authUser = { id: "manager-1", email: "manager@example.com" };
    state.membership = { orgId: "org-1", userId: "manager-1", role: "manager" };
    state.impactRecord = memberRecord(); // owned by user-1

    const app = makeApp();
    const res = await request(app)
      .patch("/api/org/member-submissions/7")
      .send({ activities: [{ activityId: "tree_planting", quantity: 2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/your own/i);
    expect(state.updates).toHaveLength(0);
  });

  it("validates the replacement activities like a fresh submission", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.impactRecord = memberRecord();

    const app = makeApp();
    const res = await request(app)
      .patch("/api/org/member-submissions/7")
      .send({ activities: [{ activityId: "not_real", quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown activity/i);
    expect(state.updates).toHaveLength(0);
  });
});
