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
    userProfilesTable: tableTag("user_profiles"),
    attachmentsTable: tableTag("attachments"),
    orgInvitesTable: tableTag("org_invites"),
    orgMemberConsentsTable: tableTag("org_member_consents"),
    orgMigrationsTable: tableTag("org_migrations"),
    orgMigratedActivitiesTable: tableTag("org_migrated_activities"),
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
    // Auto-verify on: the approved verification row is written immediately.
    state.organisation = { revokedAt: null, autoVerifyActivities: true };
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
    // Contribution-model fields (see docs/org-visibility-and-verification.md).
    expect(typeof payload.activityDate).toBe("string");
    expect(payload.activityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.kind).toBe("legacy");
    expect(payload.location).toBeNull();
    expect(typeof payload.reportingYear).toBe("number");
    expect(payload.recurrenceSource).toBeNull();
    // Auto-verify is ON in this test, so the record lands approved — never
    // "verified" (that state is reserved for org-API pre-attested records).
    expect(payload.verificationStatus).toBe("approved");

    // Analytics tracked.
    expect(state.tracked.some(t => t.eventName === "org_member_submit_completed")).toBe(true);
  });

  it("without auto-verify: no verification row is written and the webhook reports verificationStatus 'submitted'", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.organisation = { revokedAt: null, autoVerifyActivities: false };
    state.insertedRecordId = 8888;

    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      activities: [{ activityId: "tree_planting", quantity: 2 }],
    });

    expect(res.status).toBe(201);

    // No record_verifications insert — the record awaits manager review.
    const tables = state.inserts.map(i => i.table);
    expect(tables).toEqual(["impact_records", "org_audit_log"]);

    // The record persists a reporting year derived from the activity date.
    const recordValues = state.inserts[0].values as Record<string, unknown>;
    expect(typeof recordValues.reportingYear).toBe("number");

    expect(state.enqueued).toHaveLength(1);
    const payload = state.enqueued[0].payload as Record<string, unknown>;
    expect(payload.verificationStatus).toBe("submitted");
    expect(typeof payload.reportingYear).toBe("number");
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

// ── Report shares ("Review & share" from a saved Full Impact Report) ────────
describe("POST /api/org/member-submit with sourceReportId", () => {
  const REPORT = {
    id: 777,
    userId: "user-1",
    source: "user",
    submittedToOrgId: null,
    attestedAt: null,
    name: "My 2026 report",
    periodLabel: "2026",
    kind: "annual_estimate",
    entryDate: new Date("2026-06-30T00:00:00Z"),
    createdAt: new Date("2026-07-01T00:00:00Z"),
    reportingYear: 2026,
    reportStartDate: new Date("2026-01-01T00:00:00Z"),
    reportEndDate: new Date("2026-12-31T00:00:00Z"),
    reportPeriodType: "calendar",
    locationJson: { mode: "single", townCity: "Leeds", postcode: "LS1 4AP" },
    activitiesJson: [
      { activityId: "tree_planting", quantity: 12, hoursPerYear: 6 },
      { activityId: "community_garden", quantity: 0, hoursPerYear: 20, detail: "Weekly sessions" },
    ],
  };

  function setupMemberWithReport() {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.organisation = { revokedAt: null, autoVerifyActivities: false };
    state.impactRecord = { ...REPORT };
    // Duplicate-share check → no existing share.
    state.selectQueue.push([]);
  }

  it("copies quantities, period fields, kind and location from the report; the member sends only activity ids", async () => {
    setupMemberWithReport();
    state.insertedRecordId = 8888;
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [
        { activityId: "tree_planting" },
        { activityId: "community_garden", detail: "For the org" },
      ],
      note: "All with the Riverside branch",
    });

    expect(res.status).toBe(201);
    expect(res.body.record.sourceReportId).toBe(777);
    expect(res.body.record.activityCount).toBe(2);

    const rec = state.inserts.find(i => i.table === "impact_records")!.values as Record<string, unknown>;
    expect(rec.sourceReportId).toBe(777);
    expect(rec.kind).toBe("annual_estimate");
    expect(rec.reportStartDate).toEqual(REPORT.reportStartDate);
    expect(rec.reportEndDate).toEqual(REPORT.reportEndDate);
    expect(rec.reportPeriodType).toBe("calendar");
    expect(rec.entryDate).toEqual(REPORT.entryDate);
    expect(rec.reportingYear).toBe(2026);
    expect(rec.locationJson).toEqual(REPORT.locationJson);
    // Quantities come from the report, not the request.
    const lines = rec.activitiesJson as Array<Record<string, unknown>>;
    expect(lines.find(l => l.activityId === "tree_planting")).toMatchObject({ quantity: 12, hoursPerYear: 6 });
    expect(lines.find(l => l.activityId === "community_garden")).toMatchObject({ hoursPerYear: 20, detail: "For the org" });
    const rj = rec.resultJson as Record<string, unknown>;
    expect(rj.sourceReportId).toBe(777);
    expect(rj.orgNote).toBe("All with the Riverside branch");

    // Webhook is period-level: no invented single activity date.
    const evt = state.enqueued.find(e => e.eventType === "hours.logged")!;
    const payload = evt.payload as Record<string, unknown>;
    expect(payload.activityDate).toBeNull();
    expect(payload.reportPeriod).toEqual({ start: "2026-01-01", end: "2026-12-31", type: "calendar" });
    expect(payload.sourceReportId).toBe(777);
    expect(payload.kind).toBe("annual_estimate");
    // Location is redacted for the org (town + outward code only).
    expect(payload.location).toMatchObject({ townCity: "Leeds", postcodeArea: "LS" });
    expect(payload.verificationStatus).toBe("submitted");
    // No auto-verify → no verification row: lands in the pending queue.
    expect(state.inserts.some(i => i.table === "record_verifications")).toBe(false);
  });

  it("ignores client-supplied quantities — the report is authoritative", async () => {
    setupMemberWithReport();
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting", quantity: 9999, hoursPerYear: 9999 }],
    });
    expect(res.status).toBe(201);
    const rec = state.inserts.find(i => i.table === "impact_records")!.values as Record<string, unknown>;
    const lines = rec.activitiesJson as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({ activityId: "tree_planting", quantity: 12, hoursPerYear: 6 });
  });

  it("rejects a single activityDate alongside sourceReportId (period-level only)", async () => {
    setupMemberWithReport();
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activityDate: "2026-06-01",
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/period/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects saveToPersonal alongside sourceReportId (the report IS the personal copy)", async () => {
    setupMemberWithReport();
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      saveToPersonal: true,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/personal/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects report shares for consented-logging orgs (report is already automatically visible)", async () => {
    setupMemberWithReport();
    state.organisation = { revokedAt: null, dataSharingMode: "consented_logging" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/automatically/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a legacy personal copy of an ad-hoc submission (resultJson.orgRecordId) as a share source", async () => {
    setupMemberWithReport();
    state.impactRecord = {
      ...REPORT,
      kind: "legacy",
      resultJson: { ...(REPORT.resultJson as Record<string, unknown>), orgRecordId: 555 },
    };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't a report/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a legacy recurring-template occurrence as a share source", async () => {
    setupMemberWithReport();
    state.impactRecord = { ...REPORT, kind: "legacy", habitTemplateId: 42 };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't a report/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("accepts a quick log as a DATED share: entry date copied, no period fields", async () => {
    setupMemberWithReport();
    state.impactRecord = { ...REPORT, kind: "quick_log" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(201);
    const recordInserts = state.inserts.filter(i => i.table === "impact_records");
    expect(recordInserts).toHaveLength(1);
    const rec = recordInserts[0].values as Record<string, unknown>;
    expect(rec.kind).toBe("quick_log");
    expect(rec.sourceReportId).toBe(777);
    expect(rec.source).toBe("member-submitted");
    // Dated share carries the record's own entry date, never a period.
    expect(rec.entryDate).toEqual(REPORT.entryDate);
    expect(rec.reportStartDate).toBeUndefined();
    expect(rec.reportEndDate).toBeUndefined();
    expect(rec.reportPeriodType).toBeUndefined();
  });

  it("rejects other non-report kinds (e.g. a recurring occurrence) as share sources", async () => {
    setupMemberWithReport();
    state.impactRecord = { ...REPORT, kind: "recurring_occurrence" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't a report/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a plain legacy dated record (no stored report period) as a share source", async () => {
    // Pre-kind quick logs and other dated personal rows are kind='legacy'
    // with no authoritative report period — they must never become
    // period-level shares. Ambiguous legacy rows are rejected, not guessed.
    setupMemberWithReport();
    state.impactRecord = {
      ...REPORT,
      kind: "legacy",
      reportStartDate: null,
      reportEndDate: null,
      reportPeriodType: null,
    };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't a report/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("accepts a legacy report that has an authoritative stored period", async () => {
    setupMemberWithReport();
    state.impactRecord = {
      ...REPORT,
      kind: "legacy",
      reportStartDate: new Date(Date.UTC(2025, 0, 1)),
      reportEndDate: new Date(Date.UTC(2025, 11, 31)),
      reportPeriodType: "calendar",
    };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(201);
    const rec = state.inserts.find(i => i.table === "impact_records")!.values as Record<string, unknown>;
    expect((rec.reportStartDate as Date).toISOString().slice(0, 10)).toBe("2025-01-01");
  });

  it("derives a calendar-year period for reports without stored period fields", async () => {
    setupMemberWithReport();
    state.impactRecord = {
      ...REPORT,
      kind: "annual_estimate",
      reportStartDate: null,
      reportEndDate: null,
      reportPeriodType: null,
      reportingYear: 2025,
    };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(201);
    const rec = state.inserts.find(i => i.table === "impact_records")!.values as Record<string, unknown>;
    expect((rec.reportStartDate as Date).toISOString().slice(0, 10)).toBe("2025-01-01");
    expect((rec.reportEndDate as Date).toISOString().slice(0, 10)).toBe("2025-12-31");
    expect(rec.reportPeriodType).toBe("calendar");
    const evt = state.enqueued.find(e => e.eventType === "hours.logged")!;
    const payload = evt.payload as Record<string, unknown>;
    expect(payload.activityDate).toBeNull();
    expect(payload.reportPeriod).toEqual({ start: "2025-01-01", end: "2025-12-31", type: "calendar" });
  });

  it("404s when the report doesn't exist or belongs to someone else", async () => {
    setupMemberWithReport();
    state.impactRecord = null;
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(404);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects sharing a record that is itself an org submission", async () => {
    setupMemberWithReport();
    state.impactRecord = { ...REPORT, source: "member-submitted", submittedToOrgId: "org-1" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("409s when the report was already shared with this org", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.membership = { orgId: "org-1", userId: "user-1", role: "member" };
    state.organisation = { revokedAt: null };
    state.impactRecord = { ...REPORT };
    state.selectQueue.push([{ id: 5555 }]); // existing share found
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("already_shared");
    expect(res.body.recordId).toBe(5555);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects activities that are not part of the report", async () => {
    setupMemberWithReport();
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "beach_clean" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not part of this report/i);
    expect(state.inserts).toHaveLength(0);
  });

  it("enforces the org's evidence-required policy on report shares too", async () => {
    setupMemberWithReport();
    state.organisation = { revokedAt: null, evidencePolicy: "required" };
    const app = makeApp();
    const res = await request(app).post("/api/org/member-submit").send({
      sourceReportId: 777,
      activities: [{ activityId: "tree_planting" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/evidence/i);
    expect(state.inserts).toHaveLength(0);
  });
});

describe("PATCH /api/org/member-submissions/:recordId for report shares", () => {
  it("rejects direct edits to a report share (withdraw and re-share instead)", async () => {
    state.authUser = { id: "user-1", email: "user1@example.com" };
    state.impactRecord = {
      id: 8888,
      userId: "user-1",
      source: "member-submitted",
      submittedToOrgId: "org-1",
      sourceReportId: 777,
      submittedToOrgAt: new Date(),
      createdAt: new Date(),
      totalHours: 10,
      totalValue: "100",
    };
    const app = makeApp();
    const res = await request(app).patch("/api/org/member-submissions/8888").send({
      activities: [{ activityId: "tree_planting", quantity: 5 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/shared from an impact report/i);
    expect(state.updates).toHaveLength(0);
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
