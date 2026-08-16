import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// ── Endpoint-level regression tests for the contribution data model ─────────
//
// These prove the estimate-vs-actual reconciliation on the API surfaces
// themselves (not just the helper):
//   * /save persists kind / location / reportingYear, and echoes them back;
//     edits preserve the original kind when the client sends none.
//   * /history round-trips kind + structured location on legacy AND new rows.
//   * /recap/:year: a mixed estimate+quick-log year counts the activity once
//     and exposes estimateVsLogged; an all-legacy year is byte-identical to
//     the raw sums (zero adjustment).
//   * /yoy applies the same rule to yearly totals.
//   * /year-rollover reconciles the prior-year headline totals.
//
// Same in-memory drizzle mock approach as impactCalendarYear.test.ts.

interface Col { __col: string }
type Pred = (row: Record<string, unknown>) => boolean;
interface SqlMarker { __sql: true; chunks: unknown[] }
interface SortDescriptor { __sort: "asc" | "desc"; col: string | undefined }

const state = vi.hoisted(() => {
  const impactRecords: Record<string, unknown>[] = [];
  const recurringTemplates: Record<string, unknown>[] = [];
  const recordVerifications: Record<string, unknown>[] = [];
  const userProfiles: Record<string, unknown>[] = [];
  const orgMembers: Record<string, unknown>[] = [];
  const organisations: Record<string, unknown>[] = [];
  const orgMemberConsents: Record<string, unknown>[] = [];
  const publicProfiles: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [];
  const ids = { impact: 1, template: 1 };
  return {
    impactRecords, recurringTemplates, recordVerifications, userProfiles, orgMembers,
    organisations, orgMemberConsents,
    publicProfiles, users,
    ids,
    authUser: null as { id: string; email: string } | null,
  };
});

function isCol(v: unknown): v is Col {
  return !!v && typeof v === "object" && "__col" in (v as object);
}
function isSql(v: unknown): v is SqlMarker {
  return !!v && typeof v === "object" && (v as SqlMarker).__sql === true;
}
function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}

vi.mock("drizzle-orm", () => {
  const eq = (col: Col, val: unknown): Pred => (row) => {
    const v = row[col.__col];
    // Column-to-column equality (join conditions).
    if (isCol(val)) return v === row[val.__col];
    if (v instanceof Date && val instanceof Date) return v.getTime() === val.getTime();
    return v === val;
  };
  const gte = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) >= 0;
  const lte = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) <= 0;
  const lt = (col: Col, val: unknown): Pred => (row) => compare(row[col.__col], val) < 0;
  // Raw sql`` markers (e.g. notOrgTwinCondition) are not evaluable in the
  // mock — treat them as pass-through TRUE inside and()/or().
  const and = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.every((p) => !p || typeof p !== "function" || p(row));
  const or = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.some((p) => (typeof p === "function" ? p(row) : Boolean(p)));
  const inArray = (col: Col, vals: unknown[]): Pred => (row) => vals.includes(row[col.__col]);
  const isNotNull = (col: Col): Pred => (row) => row[col.__col] != null;
  const ilike = (col: Col, val: string): Pred => {
    const needle = String(val).replace(/%/g, "").toLowerCase();
    return (row) => String(row[col.__col] ?? "").toLowerCase().includes(needle);
  };
  const desc = (col: Col): SortDescriptor => ({ __sort: "desc", col: col?.__col });
  const asc = (col: Col): SortDescriptor => ({ __sort: "asc", col: col?.__col });
  function sql(strings: TemplateStringsArray, ...values: unknown[]): SqlMarker {
    const chunks: unknown[] = [];
    (strings as unknown as string[]).forEach((s, i) => {
      chunks.push(s);
      if (i < values.length) chunks.push(values[i]);
    });
    return { __sql: true, chunks };
  }
  sql.raw = (s: string): SqlMarker => ({ __sql: true, chunks: [s] });
  sql.join = (...args: unknown[]): SqlMarker => ({ __sql: true, chunks: args });
  const sum = (target: unknown) => ({ __agg: "sum", target });
  const max = (target: unknown) => ({ __agg: "max", target });
  return { eq, gte, lte, lt, and, or, inArray, isNotNull, ilike, desc, asc, sql, sum, max };
});

function tableTag(name: string, columns: string[]) {
  const t: Record<string, unknown> = { __tableName: name };
  for (const c of columns) t[c] = { __col: c } as Col;
  return t as { __tableName: string } & Record<string, Col>;
}

vi.mock("@workspace/db", () => {
  const impactRecordsTable = tableTag("impact_records", [
    "id", "userId", "name", "periodLabel", "totalValue", "impactValue",
    "contributionValue", "donationsValue", "personalDevelopmentValue",
    "totalHours", "activitiesJson", "resultJson", "region", "outwardCode",
    "lat", "lng", "attestedByApiKeyId", "attestedAt", "submittedToOrgId",
    "submittedToOrgAt", "source", "tags", "entryDate", "habitTemplateId",
    "createdAt", "kind", "locationJson", "reportingYear",
    "reportStartDate", "reportEndDate", "reportPeriodType", "sourceReportId",
  ]);
  const recurringTemplatesTable = tableTag("recurring_templates", [
    "id", "userId", "label", "cadence", "dayOfPeriod", "anchorDate",
    "defaultActivities", "defaultDonationsGBP", "lastConfirmedAt", "createdAt",
  ]);
  const orgMembersTable = tableTag("org_members", ["id", "orgId", "userId", "role", "status"]);
  const organisationsTable = tableTag("organisations", ["id", "name", "dataSharingMode", "revokedAt", "dashboardSections", "autoVerifyActivities"]);
  const orgMemberConsentsTable = tableTag("org_member_consents", ["id", "orgId", "userId", "status", "shareFrom"]);
  const orgMatchRatesTable = tableTag("org_match_rates", ["id", "orgId", "effectiveFrom"]);
  const journalEntriesTable = tableTag("journal_entries", ["id", "userId"]);
  const userProfilesTable = tableTag("user_profiles", ["id", "userId", "lastAckedStreakMilestone"]);
  const recordVerificationsTable = tableTag("record_verifications", [
    "id", "recordId", "orgId", "status", "reason", "decidedAt",
  ]);
  const publicProfilesTable = tableTag("public_profiles", [
    "id", "userId", "slug", "isEnabled", "slugCustomised", "customMessage",
    "showHours", "showSroi", "showCategories", "showJournalHighlights", "updatedAt",
  ]);
  const usersTable = tableTag("users", ["id", "displayName", "email"]);

  function tableStore(name: string): Record<string, unknown>[] {
    switch (name) {
      case "impact_records": return state.impactRecords;
      case "recurring_templates": return state.recurringTemplates;
      case "record_verifications": return state.recordVerifications;
      case "user_profiles": return state.userProfiles;
      case "org_members": return state.orgMembers;
      case "organisations": return state.organisations;
      case "public_profiles": return state.publicProfiles;
      case "users": return state.users;
      default: return [];
    }
  }

  function applySort(rows: Record<string, unknown>[], sorters: SortDescriptor[]) {
    if (sorters.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const s of sorters) {
        if (!s?.col) continue;
        const c = compare(a[s.col], b[s.col]);
        if (c !== 0) return s.__sort === "desc" ? -c : c;
      }
      return 0;
    });
  }

  function projectCols(
    rows: Record<string, unknown>[],
    cols: Record<string, unknown> | undefined,
  ): Record<string, unknown>[] {
    if (!cols) return rows;
    const isAgg = (v: unknown): v is { __agg: string; target: unknown } =>
      !!v && typeof v === "object" && "__agg" in (v as object);
    // Resolve the column an aggregate targets (either a Col or a sql`` wrapper
    // containing one, e.g. sum(sql`${table.totalValue}::numeric`)).
    const aggCol = (target: unknown): string | null => {
      if (isCol(target)) return target.__col;
      if (isSql(target)) {
        const c = (target as SqlMarker).chunks.find((ch) => isCol(ch));
        return c ? (c as Col).__col : null;
      }
      return null;
    };
    const hasAgg = Object.values(cols).some((v) => isAgg(v) || isSql(v));
    if (hasAgg) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cols)) {
        if (isAgg(v)) {
          const col = aggCol(v.target);
          const vals = col ? rows.map((r) => r[col]) : [];
          if (v.__agg === "sum") {
            out[k] = rows.length === 0 ? null : String(vals.reduce((s: number, x) => s + (Number(x) || 0), 0));
          } else {
            out[k] = vals.reduce<unknown>((m, x) => (m === null || compare(x, m) > 0 ? x : m), null);
          }
        } else if (isSql(v)) {
          out[k] = rows.length;
        } else if (isCol(v)) {
          out[k] = rows.length > 0 ? rows[0][v.__col] : null;
        }
      }
      return [out];
    }
    return rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cols)) {
        if (isCol(v)) o[k] = r[v.__col];
      }
      return o;
    });
  }

  function makeBuilder(cols: Record<string, unknown> | undefined) {
    let table: string | null = null;
    let predicate: Pred | null = null;
    const sorters: SortDescriptor[] = [];
    let limit: number | null = null;
    const joins: Array<{ table: string; on: Pred }> = [];

    function resolve(): Record<string, unknown>[] {
      if (!table) return [];
      // sql`` where-clauses (markers, not functions) are treated as pass-all;
      // tests using them must pre-filter via their fixtures.
      let rows = tableStore(table).filter((r) =>
        typeof predicate === "function" ? predicate(r) : true,
      );
      for (const j of joins) {
        const other = tableStore(j.table);
        if (other.length === 0 || rows.length === 0) { rows = []; break; }
        const merged: Record<string, unknown>[] = [];
        for (const r of rows) {
          for (const o of other) {
            const combined = { ...r, ...o };
            if (j.on(combined)) { merged.push(combined); break; }
          }
        }
        rows = merged;
      }
      rows = applySort(rows, sorters);
      if (limit != null) rows = rows.slice(0, limit);
      return projectCols(rows, cols);
    }

    const b: Record<string, unknown> = {};
    b.from = (t: { __tableName: string }) => { table = t.__tableName; return b; };
    b.innerJoin = (t: { __tableName: string }, on: Pred) => { joins.push({ table: t.__tableName, on }); return b; };
    b.leftJoin = b.innerJoin;
    b.where = (p: Pred) => { predicate = p; return b; };
    b.orderBy = (...args: SortDescriptor[]) => { sorters.push(...args); return b; };
    b.groupBy = () => b;
    b.limit = (n: number) => { limit = n; return b; };
    b.then = (r2: (v: unknown[]) => unknown, rj?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(r2, rj);
    b.catch = (rj: (e: unknown) => unknown) => Promise.resolve(resolve()).catch(rj);
    b.finally = (cb: () => void) => Promise.resolve(resolve()).finally(cb);
    return b;
  }

  function insertBuilder(table: { __tableName: string }) {
    return {
      values(rawVals: unknown) {
        const arr = Array.isArray(rawVals) ? rawVals : [rawVals];
        const inserted: Record<string, unknown>[] = [];
        for (const v of arr) {
          const row = { ...(v as Record<string, unknown>) };
          if (table.__tableName === "impact_records") {
            if (row.id == null) row.id = state.ids.impact++;
            if (row.createdAt == null) row.createdAt = new Date();
            if (row.tags == null) row.tags = [];
            if (row.source == null) row.source = "user";
            if (row.kind == null) row.kind = "legacy";
          } else if (table.__tableName === "recurring_templates") {
            if (row.id == null) row.id = state.ids.template++;
            if (row.createdAt == null) row.createdAt = new Date();
          }
          tableStore(table.__tableName).push(row);
          inserted.push(row);
        }
        return {
          returning: async () => inserted,
          then: (r: (v: unknown) => unknown, rj?: (e: unknown) => unknown) =>
            Promise.resolve(undefined).then(r, rj),
          catch: (rj: (e: unknown) => unknown) => Promise.resolve(undefined).catch(rj),
          finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
        };
      },
    };
  }

  function updateBuilder(table: { __tableName: string }) {
    let setVals: Record<string, unknown> = {};
    let predicate: Pred | null = null;
    const b: Record<string, unknown> = {};
    b.set = (vals: Record<string, unknown>) => { setVals = vals; return b; };
    b.where = (p: Pred) => { predicate = p; return b; };
    b.returning = async () => {
      const store = tableStore(table.__tableName);
      const updated: Record<string, unknown>[] = [];
      for (const r of store) {
        if (!predicate || predicate(r)) { Object.assign(r, setVals); updated.push(r); }
      }
      return updated;
    };
    return b;
  }

  function deleteBuilder(table: { __tableName: string }) {
    let predicate: Pred | null = null;
    const b: Record<string, unknown> = {};
    b.where = (p: Pred) => { predicate = p; return b; };
    b.returning = async () => {
      const store = tableStore(table.__tableName);
      const removed: Record<string, unknown>[] = [];
      for (let i = store.length - 1; i >= 0; i--) {
        if (!predicate || predicate(store[i])) { removed.unshift(store[i]); store.splice(i, 1); }
      }
      return removed;
    };
    (b as { then?: unknown }).then = (resolveCb: (v: unknown) => unknown) => {
      const store = tableStore(table.__tableName);
      for (let i = store.length - 1; i >= 0; i--) {
        if (!predicate || predicate(store[i])) store.splice(i, 1);
      }
      return Promise.resolve(undefined).then(resolveCb);
    };
    return b;
  }

  const db = {
    select: (cols?: Record<string, unknown>) => makeBuilder(cols),
    insert: (table: { __tableName: string }) => insertBuilder(table),
    update: (table: { __tableName: string }) => updateBuilder(table),
    delete: (table: { __tableName: string }) => deleteBuilder(table),
    transaction: async (cb: (tx: unknown) => unknown) => cb({}),
    query: {
      orgMembersTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.orgMembers.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
        findMany: vi.fn(async (opts?: { where?: Pred }) =>
          state.orgMembers.filter((r) => (opts?.where ? opts.where(r) : true))),
      },
      userProfilesTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.userProfiles.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
      },
      publicProfilesTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.publicProfiles.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
      },
      usersTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.users.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
      },
      organisationsTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.organisations.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
      },
      orgMemberConsentsTable: {
        findMany: vi.fn(async (opts?: { where?: Pred }) =>
          state.orgMemberConsents.filter((r) => (opts?.where ? opts.where(r) : true))),
      },
      recordVerificationsTable: {
        findFirst: vi.fn(async (opts?: { where?: Pred }) =>
          state.recordVerifications.filter((r) => (opts?.where ? opts.where(r) : true))[0] ?? null),
      },
      orgMatchRatesTable: { findMany: vi.fn(async () => []) },
    },
  };

  return {
    db, impactRecordsTable, recurringTemplatesTable, orgMembersTable,
    organisationsTable, orgMemberConsentsTable, orgMatchRatesTable, journalEntriesTable,
    userProfilesTable, recordVerificationsTable, publicProfilesTable, usersTable,
  };
});

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) { res.status(401).json({ error: "Not authenticated" }); return; }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("")),
  Font: { register: vi.fn() },
  Document: () => null, Page: () => null, Text: () => null, View: () => null,
  Image: () => null, StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("../src/lib/impactPdf.js", () => ({
  buildImpactDocument: vi.fn(() => null),
  parsePdfData: vi.fn(() => ({})),
}));
vi.mock("../src/lib/evidencePackPdf.js", () => ({ buildEvidencePackDocument: vi.fn(() => null) }));
vi.mock("../src/lib/orgMatch.js", () => ({ computeMatchesForRecords: vi.fn(() => []) }));
vi.mock("../src/lib/webhookDispatcher.js", () => ({ enqueueOrgEvent: vi.fn(async () => undefined) }));
vi.mock("../src/lib/analytics.js", () => ({ trackServerEvent: vi.fn(), ANALYTICS_EVENTS: [] }));
vi.mock("../src/lib/auditLog.js", () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAttachmentsForRecord: vi.fn(async () => undefined),
  deleteAllAttachmentsForUser: vi.fn(async () => undefined),
}));
vi.mock("./org.js", () => ({ getVerifiedTotalsForOrg: vi.fn(async () => ({})) }));

const { default: impactRouter } = await import("../src/routes/impact.js");
const { default: publicProfileRouter } = await import("../src/routes/public-profile.js");
const { buildMonthlyDigest } = await import("../src/lib/digestData.js");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/impact", impactRouter);
  app.use("/api/public-profile", publicProfileRouter);
  // Surface unexpected 500s in test output instead of swallowing them.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[test] unhandled route error:", err);
    res.status(500).json({ error: String(err) });
  });
  return app;
}

const USER = { id: "user_1", email: "u1@example.com" };
const NLW = 12.21;
const PD = 15;

function resetAll() {
  state.impactRecords.length = 0;
  state.recurringTemplates.length = 0;
  state.recordVerifications.length = 0;
  state.userProfiles.length = 0;
  state.orgMembers.length = 0;
  state.organisations.length = 0;
  state.orgMemberConsents.length = 0;
  state.publicProfiles.length = 0;
  state.users.length = 0;
  state.ids.impact = 1;
  state.ids.template = 1;
  state.authUser = USER;
}

beforeEach(() => resetAll());

/** Build a stored impact record whose resultJson matches calculateImpact's shape. */
function makeRecord(opts: {
  id?: number;
  kind?: string;
  entryDate: Date;
  activityId?: string;
  impactValue?: number;
  hours?: number;
  donations?: number;
  name?: string;
  locationJson?: unknown;
  reportingYear?: number | null;
  reportStartDate?: Date | null;
  reportEndDate?: Date | null;
  reportPeriodType?: string | null;
  sourceReportId?: number | null;
  source?: string;
  submittedToOrgId?: string | null;
}): Record<string, unknown> {
  const impactValue = opts.impactValue ?? 0;
  const hours = opts.hours ?? 0;
  const donations = opts.donations ?? 0;
  const totalValue = impactValue + donations + hours * (NLW + PD);
  const activityId = opts.activityId ?? "community_garden";
  return {
    id: opts.id ?? state.ids.impact++,
    userId: USER.id,
    name: opts.name ?? "test",
    periodLabel: null,
    totalValue: String(totalValue),
    impactValue: String(impactValue),
    contributionValue: String(hours * NLW),
    donationsValue: String(donations),
    personalDevelopmentValue: String(hours * PD),
    totalHours: hours,
    activitiesJson: [{ activityId, quantity: hours || 1, hoursPerYear: hours, category: "Environment", hours }],
    resultJson: {
      totalValue,
      impactValue,
      contributionValue: hours * NLW,
      donationsValue: donations,
      personalDevelopmentValue: hours * PD,
      totalHours: hours,
      activityBreakdowns: impactValue > 0 || hours > 0 ? [{
        activityId,
        activityName: "Community gardening",
        category: "Environment",
        sdg: "Climate Action",
        sdgColor: "#3F7E44",
        impactValue,
        hours,
      }] : [],
      sdgBreakdowns: impactValue > 0 ? [{ sdg: "Climate Action", sdgColor: "#3F7E44", value: impactValue }] : [],
    },
    region: null, outwardCode: null, lat: null, lng: null,
    source: opts.source ?? "user", tags: [],
    submittedToOrgId: opts.submittedToOrgId ?? null,
    sourceReportId: opts.sourceReportId ?? null,
    entryDate: opts.entryDate,
    habitTemplateId: null,
    createdAt: opts.entryDate,
    kind: opts.kind ?? "legacy",
    locationJson: opts.locationJson ?? null,
    reportingYear: opts.reportingYear !== undefined ? opts.reportingYear : opts.entryDate.getUTCFullYear(),
    reportStartDate: opts.reportStartDate ?? null,
    reportEndDate: opts.reportEndDate ?? null,
    reportPeriodType: opts.reportPeriodType ?? null,
  };
}

const LOCATION = {
  mode: "in_person",
  label: "Sunnybank Garden",
  postcode: "LS6 3HN",
  townCity: "Leeds",
  lat: 53.8195,
  lng: -1.5694,
  localAuthority: "Leeds",
  region: "Yorkshire and the Humber",
  country: "England",
};

const savePayload = (overrides: Record<string, unknown> = {}) => ({
  userId: USER.id,
  name: "Gardening",
  donationsGBP: 0,
  additionalVolunteerHours: 0,
  activities: [{ activityId: "community_garden", quantity: 2, hoursPerYear: 2 }],
  ...overrides,
});

describe("/save — kind, location, reportingYear", () => {
  it("persists and echoes kind + structured location + derived reportingYear (activityDate alias)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "quick_log", activityDate: "2026-05-03", location: LOCATION }))
      .expect(200);

    expect(res.body.kind).toBe("quick_log");
    expect(res.body.reportingYear).toBe(2026);
    expect(res.body.location).toEqual(LOCATION);
    expect(res.body.entryDate).toBe("2026-05-03");

    const stored = state.impactRecords[0];
    expect(stored.kind).toBe("quick_log");
    expect(stored.reportingYear).toBe(2026);
    expect(stored.locationJson).toEqual(LOCATION);
  });

  it("defaults to kind='legacy' when the client sends no kind (existing clients unchanged)", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/impact/save").send(savePayload()).expect(200);
    expect(res.body.kind).toBe("legacy");
    expect(state.impactRecords[0].kind).toBe("legacy");
  });

  it("editing via targetRecordId preserves the original kind when none is sent", async () => {
    const app = makeApp();
    state.impactRecords.push(makeRecord({
      id: 500, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 28.86, hours: 2,
    }));

    await request(app)
      .post("/api/impact/save")
      .send(savePayload({ name: "edited", targetRecordId: "500", entryDate: "2026-05-03" }))
      .expect(200);

    expect(state.impactRecords).toHaveLength(1);
    expect(state.impactRecords[0].name).toBe("edited");
    expect(state.impactRecords[0].kind).toBe("quick_log");
  });
});

describe("/save — authoritative report period", () => {
  const PERIOD_2026 = { type: "calendar", startDate: "2026-01-01", endDate: "2026-12-31" };

  it("persists and echoes the report period; derives entryDate inside it and defaults the label", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: PERIOD_2026 }))
      .expect(200);

    expect(res.body.reportStartDate).toBe("2026-01-01");
    expect(res.body.reportEndDate).toBe("2026-12-31");
    expect(res.body.reportPeriodType).toBe("calendar");
    // No explicit entryDate → derived by clamping today into the period, so
    // reportingYear is keyed off the report's period.
    expect(res.body.reportingYear).toBe(2026);
    const stored = state.impactRecords[0];
    expect(stored.reportStartDate).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(stored.reportEndDate).toEqual(new Date("2026-12-31T00:00:00Z"));
    expect((stored.entryDate as Date) >= new Date("2026-01-01T00:00:00Z")).toBe(true);
    expect((stored.entryDate as Date) <= new Date("2026-12-31T23:59:59Z")).toBe(true);
    // Display-only default name derived from the period.
    expect(stored.periodLabel).toBe("My Impact 2026");
  });

  it("clamps the derived entryDate into a past period (never invents out-of-period dates)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: { type: "calendar", startDate: "2024-01-01", endDate: "2024-12-31" } }))
      .expect(200);
    expect(res.body.entryDate).toBe("2024-12-31");
    expect(res.body.reportingYear).toBe(2024);
    // Prior-year entry → marked retrospective, exactly like a dated legacy save.
    expect(state.impactRecords[0].source).toBe("retrospective");
  });

  it("uses a cross-year default name for academic periods and respects an explicit name", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: { type: "academic", startDate: "2026-09-01", endDate: "2027-08-31" } }))
      .expect(200);
    expect(state.impactRecords[0].periodLabel).toBe("My Impact 2026/27");

    await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: PERIOD_2026, period: "My custom name" }))
      .expect(200);
    expect(state.impactRecords[1].periodLabel).toBe("My custom name");
  });

  it("absent reportPeriod falls back to legacy behaviour (no period stored)", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ entryDate: "2026-05-03" }))
      .expect(200);
    expect(res.body.reportStartDate).toBeNull();
    expect(res.body.reportEndDate).toBeNull();
    expect(res.body.reportPeriodType).toBeNull();
    expect(res.body.entryDate).toBe("2026-05-03");
    expect(res.body.reportingYear).toBe(2026);
  });

  it("a supplied-but-invalid reportPeriod is rejected with 400 (never silently dropped)", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/impact/save")
      .send(savePayload({ entryDate: "2026-05-03", reportPeriod: { type: "calendar", startDate: "2026-12-31", endDate: "2026-01-01" } }))
      .expect(400);
    expect(state.impactRecords).toHaveLength(0);
  });

  it("PATCH date edits are clamped into a stored report period and keep reportingYear in sync", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        id: 7, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 2, 15)),
        hours: 10,
        reportStartDate: new Date(Date.UTC(2026, 0, 1)),
        reportEndDate: new Date(Date.UTC(2026, 11, 31)),
        reportPeriodType: "calendar",
      }),
    );
    // Attempt to move the report outside its own period → clamped to the edge.
    const res = await request(app).patch("/api/impact/7").send({ entryDate: "2030-06-01" }).expect(200);
    expect(res.body.entryDate).toBe("2026-12-31");
    expect(state.impactRecords[0].reportingYear).toBe(2026);

    // An in-period edit is honoured, and reportingYear stays consistent.
    const ok = await request(app).patch("/api/impact/7").send({ entryDate: "2026-04-20" }).expect(200);
    expect(ok.body.entryDate).toBe("2026-04-20");
    expect(state.impactRecords[0].reportingYear).toBe(2026);
  });

  it("targetRecordId saves without a new period clamp entryDate into the stored period", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        id: 9, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 2, 15)), hours: 10,
        reportStartDate: new Date(Date.UTC(2026, 0, 1)),
        reportEndDate: new Date(Date.UTC(2026, 11, 31)),
        reportPeriodType: "calendar",
      }),
    );
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ targetRecordId: "9", entryDate: "2030-06-01" }))
      .expect(200);
    // The stored period survives the edit AND remains authoritative.
    expect(res.body.entryDate).toBe("2026-12-31");
    expect(res.body.reportingYear).toBe(2026);
    expect(res.body.reportStartDate).toBe("2026-01-01");
    expect(state.impactRecords[0].reportingYear).toBe(2026);
  });

  it("PATCH date edits on legacy period-less records update reportingYear from the new date", async () => {
    const app = makeApp();
    state.impactRecords.push(makeRecord({ id: 8, kind: "legacy", entryDate: new Date(Date.UTC(2025, 5, 1)), hours: 5 }));
    const res = await request(app).patch("/api/impact/8").send({ entryDate: "2026-02-10" }).expect(200);
    expect(res.body.entryDate).toBe("2026-02-10");
    expect(state.impactRecords[0].reportingYear).toBe(2026);
  });

  it("malformed reportPeriod shapes get 400 (not a schema 500); explicit null means absent", async () => {
    const app = makeApp();
    const cases: unknown[] = [
      { type: "quarterly", startDate: "2026-01-01", endDate: "2026-03-31" }, // unknown enum
      { type: "calendar" }, // missing dates
      "2026", // non-object
      { startDate: "2026-01-01", endDate: "2026-12-31" }, // missing type
    ];
    for (const reportPeriod of cases) {
      await request(app)
        .post("/api/impact/save")
        .send(savePayload({ kind: "annual_estimate", reportPeriod }))
        .expect(400);
    }
    expect(state.impactRecords).toHaveLength(0);

    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ entryDate: "2026-05-03", reportPeriod: null }))
      .expect(200);
    expect(res.body.reportStartDate).toBeNull();
    expect(res.body.reportPeriodType).toBeNull();
  });

  it("rejects semantically impossible ISO dates in a supplied period (no JS date normalization)", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/impact/save")
      .send(savePayload({
        kind: "annual_estimate",
        reportPeriod: { type: "calendar", startDate: "2026-02-30", endDate: "2026-12-31" },
      }))
      .expect(400);
    expect(state.impactRecords).toHaveLength(0);
  });

  it("clamps an explicit entryDate that falls OUTSIDE the supplied period into it", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: PERIOD_2026, entryDate: "2030-06-01" }))
      .expect(200);
    // The period is authoritative: bucketing can never diverge from it.
    expect(res.body.entryDate).toBe("2026-12-31");
    expect(res.body.reportingYear).toBe(2026);
  });

  it("an explicit in-range entryDate is preserved alongside the period", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/impact/save")
      .send(savePayload({ kind: "annual_estimate", reportPeriod: PERIOD_2026, entryDate: "2026-03-15" }))
      .expect(200);
    expect(res.body.entryDate).toBe("2026-03-15");
    expect(res.body.reportStartDate).toBe("2026-01-01");
  });

  it("editing via targetRecordId without a reportPeriod preserves the stored period", async () => {
    const app = makeApp();
    state.impactRecords.push({
      ...makeRecord({ id: 600, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 10, hours: 1 }),
      reportStartDate: new Date("2026-01-01T00:00:00Z"),
      reportEndDate: new Date("2026-12-31T00:00:00Z"),
      reportPeriodType: "calendar",
    });

    await request(app)
      .post("/api/impact/save")
      .send(savePayload({ name: "edited", targetRecordId: "600", entryDate: "2026-05-03" }))
      .expect(200);

    expect(state.impactRecords).toHaveLength(1);
    expect(state.impactRecords[0].name).toBe("edited");
    expect(state.impactRecords[0].reportStartDate).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(state.impactRecords[0].reportPeriodType).toBe("calendar");
  });
});

describe("/history — legacy display + location round-trip", () => {
  it("returns kind/location/reportingYear for new rows and kind='legacy', location=null for historical rows", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ id: 1, entryDate: new Date(Date.UTC(2025, 5, 15)), impactValue: 100, hours: 5, name: "old" }),
      makeRecord({
        id: 2, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)),
        impactValue: 28.86, hours: 2, name: "new", locationJson: LOCATION,
      }),
    );
    const res = await request(app).get("/api/impact/history").expect(200);
    const byName = Object.fromEntries(res.body.records.map((r: Record<string, unknown>) => [r.name, r]));
    expect(byName.old.kind).toBe("legacy");
    expect(byName.old.location).toBeNull();
    expect(byName.new.kind).toBe("quick_log");
    expect(byName.new.location).toEqual(LOCATION);
    expect(byName.new.reportingYear).toBe(2026);
  });
});

describe("/recap/:year — estimate/actual reconciliation", () => {
  it("an all-legacy year is byte-identical to raw sums and exposes no estimateVsLogged", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ entryDate: new Date(Date.UTC(2025, 2, 1)), impactValue: 721.5, hours: 50 }),
      makeRecord({ entryDate: new Date(Date.UTC(2025, 6, 1)), impactValue: 28.86, hours: 2 }),
      makeRecord({ entryDate: new Date(Date.UTC(2025, 8, 1)), donations: 40 }),
    );
    const res = await request(app).get("/api/impact/recap/2025").expect(200);
    const expectedTotal = (721.5 + 50 * (NLW + PD)) + (28.86 + 2 * (NLW + PD)) + 40;
    expect(res.body.totalValue).toBeCloseTo(Math.round(expectedTotal * 100) / 100, 2);
    expect(res.body.totalHours).toBe(52);
    expect(res.body.estimateVsLogged).toEqual([]);
  });

  it("a mixed year counts the shared activity once (greater side) and reports estimated vs logged", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 28.86, hours: 2 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 10)), impactValue: 43.29, hours: 3 }),
    );
    const res = await request(app).get("/api/impact/recap/2026").expect(200);

    // Headline equals the estimate alone (logged 5h < estimated 50h).
    expect(res.body.totalValue).toBeCloseTo(Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100, 2);
    expect(res.body.totalHours).toBe(50);

    expect(res.body.estimateVsLogged).toHaveLength(1);
    const evl = res.body.estimateVsLogged[0];
    expect(evl.activityId).toBe("community_garden");
    expect(evl.estimatedValue).toBeCloseTo(721.5, 2);
    expect(evl.loggedValue).toBeCloseTo(72.15, 2);
    expect(evl.countedValue).toBeCloseTo(721.5, 2);
    expect(evl.estimatedHours).toBe(50);
    expect(evl.loggedHours).toBe(5);

    // The top activity is derived from the counted (reconciled) map.
    expect(res.body.topActivity.impactValue).toBeCloseTo(721.5, 2);
  });

  it("estimates and quick logs in DIFFERENT years never reconcile", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(2025, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 28.86, hours: 2 }),
    );
    const y25 = await request(app).get("/api/impact/recap/2025").expect(200);
    expect(y25.body.totalHours).toBe(50);
    expect(y25.body.estimateVsLogged).toEqual([]);
    const y26 = await request(app).get("/api/impact/recap/2026").expect(200);
    expect(y26.body.totalHours).toBe(2);
    expect(y26.body.estimateVsLogged).toEqual([]);
  });
});

describe("cross-year report periods — quick logs reconcile against the period, not the calendar year", () => {
  // Academic-year estimate Sep 2025 – Aug 2026, homed (entryDate/reportingYear)
  // in 2026, with quick logs for the SAME activity on both sides of the
  // calendar-year boundary. The activity must be counted once overall: each
  // year's raw sum only contains its own rows, and the estimate absorbs the
  // in-period quick logs on both sides.
  const ACADEMIC = {
    reportStartDate: new Date(Date.UTC(2025, 8, 1)),
    reportEndDate: new Date(Date.UTC(2026, 7, 31)),
    reportPeriodType: "academic",
  };

  function seedAcademicMix() {
    state.impactRecords.push(
      makeRecord({
        kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)),
        impactValue: 721.5, hours: 50, ...ACADEMIC,
      }),
      // Quick log inside the period but in the PRIOR calendar year.
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2025, 9, 5)), impactValue: 28.86, hours: 2 }),
      // Quick log inside the period, in the estimate's home year.
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 2, 3)), impactValue: 43.29, hours: 3 }),
      // Quick log OUTSIDE the period (after it ends) — never reconciled.
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 10, 1)), impactValue: 14.43, hours: 1 }),
    );
  }

  it("/recap subtracts in-period quick logs in BOTH calendar years; out-of-period logs stay", async () => {
    const app = makeApp();
    seedAcademicMix();

    // 2025: raw sum is just the October quick log; the overlapping academic
    // estimate joins the reconciliation input, so the quick log is absorbed.
    const y25 = await request(app).get("/api/impact/recap/2025").expect(200);
    expect(y25.body.totalHours).toBe(0);
    expect(y25.body.totalValue).toBeCloseTo(0, 2);

    // 2026: estimate + March quick log reconcile (estimate wins); the
    // November out-of-period quick log is added on top untouched.
    const y26 = await request(app).get("/api/impact/recap/2026").expect(200);
    expect(y26.body.totalHours).toBe(51);
    expect(y26.body.totalValue).toBeCloseTo(
      Math.round(((721.5 + 50 * (NLW + PD)) + (14.43 + 1 * (NLW + PD))) * 100) / 100, 2,
    );
  });

  it("total across both calendar years counts the activity once (estimate + out-of-period log only)", async () => {
    const app = makeApp();
    seedAcademicMix();
    const y25 = await request(app).get("/api/impact/recap/2025").expect(200);
    const y26 = await request(app).get("/api/impact/recap/2026").expect(200);
    const combined = y25.body.totalValue + y26.body.totalValue;
    expect(combined).toBeCloseTo(
      Math.round(((721.5 + 50 * (NLW + PD)) + (14.43 + 1 * (NLW + PD))) * 100) / 100, 2,
    );
  });

  it("/yoy applies the same cross-year rule to yearly totals", async () => {
    const app = makeApp();
    seedAcademicMix();
    const res25 = await request(app).get("/api/impact/yoy?year=2025").expect(200);
    expect(res25.body.selectedTotal ?? res25.body.selectedYearTotalValue).toBeCloseTo(0, 2);
  });

  it("/yoy counts a report and its org share once (report-share dedupe)", async () => {
    const app = makeApp();
    // Personal report + the org copy created by "Review & share".
    state.impactRecords.push(
      makeRecord({
        id: 500, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
      }),
      makeRecord({
        id: 501, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
        source: "member-submitted", submittedToOrgId: "org-1", sourceReportId: 500,
      }),
    );
    const res26 = await request(app).get("/api/impact/yoy?year=2026").expect(200);
    // Only the report counts — the share's totals are removed as duplicates.
    expect(res26.body.selectedTotal ?? res26.body.selectedYearTotalValue).toBeCloseTo(
      Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100, 2,
    );
    // The record COUNT dedupes too: report + its share = one contribution.
    expect(res26.body.selectedCount).toBe(1);
  });

  it("deleting a report with a live org share is blocked until the share is withdrawn", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        id: 700, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
      }),
      makeRecord({
        id: 701, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
        source: "member-submitted", submittedToOrgId: "org-1", sourceReportId: 700,
      }),
    );
    const res = await request(app).delete("/api/impact/700");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("shared_with_org");
    // Both records remain.
    expect(state.impactRecords.map(r => r.id)).toEqual(expect.arrayContaining([700, 701]));
  });

  it("DELETE /all wipes shares before their source reports (full wipe still succeeds)", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        id: 710, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
      }),
      makeRecord({
        id: 711, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
        source: "member-submitted", submittedToOrgId: "org-1", sourceReportId: 710,
      }),
    );
    const res = await request(app).delete("/api/impact/all");
    expect(res.status).toBe(200);
    expect(state.impactRecords).toHaveLength(0);
  });

  it("/recap lifetime totals count a report and its org share once", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        id: 600, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
      }),
      makeRecord({
        id: 601, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)),
        impactValue: 721.5, hours: 50,
        source: "member-submitted", submittedToOrgId: "org-1", sourceReportId: 600,
      }),
    );
    const res = await request(app).get("/api/impact/recap/2026").expect(200);
    expect(res.body.lifetimeTotalValue).toBeCloseTo(
      Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100, 2,
    );
    expect(res.body.lifetimeRecordCount).toBe(1);
    // Yearly count dedupes the same way.
    expect(res.body.recordCount).toBe(1);
  });

  it("actuals exceeding the estimate across years never reuse its capacity per window", async () => {
    // 50-hour academic estimate homed in 2026; 40 actual hours in EACH
    // calendar year. Correct combined result is the logged 80 hours — the
    // estimate's capacity must be consumed once (chronologically), not once
    // per calendar-year window.
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({
        kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)),
        impactValue: 721.5, hours: 50, ...ACADEMIC,
      }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2025, 9, 5)), impactValue: 577.2, hours: 40 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 2, 3)), impactValue: 577.2, hours: 40 }),
    );

    // 2025: its 40 hours are fully absorbed by the estimate (first come).
    const y25 = await request(app).get("/api/impact/recap/2025").expect(200);
    expect(y25.body.totalHours).toBe(0);
    expect(y25.body.totalValue).toBeCloseTo(0, 2);

    // 2026: only the estimate's REMAINING 10 hours of capacity absorb the
    // March log; total = est(50h) + log(40h) − remaining capacity(10h) = 80h.
    const y26 = await request(app).get("/api/impact/recap/2026").expect(200);
    expect(y26.body.totalHours).toBe(80);
    const hourValue = (h: number) => h * (NLW + PD);
    expect(y26.body.totalValue).toBeCloseTo(
      Math.round(((721.5 + hourValue(50)) + (577.2 + hourValue(40)) - (144.3 + hourValue(10))) * 100) / 100, 2,
    );

    // Combined = the 80 logged hours, counted once.
    expect(y25.body.totalHours + y26.body.totalHours).toBe(80);

    // /yoy agrees with recap for both windows.
    const res25 = await request(app).get("/api/impact/yoy?year=2025").expect(200);
    expect(res25.body.selectedTotal ?? res25.body.selectedYearTotalValue).toBeCloseTo(0, 2);
    const res26 = await request(app).get("/api/impact/yoy?year=2026").expect(200);
    expect(res26.body.selectedTotal ?? res26.body.selectedYearTotalValue).toBeCloseTo(y26.body.totalValue, 2);
  });

  it("rejects a client-supplied period longer than the supported maximum instead of silently dropping it", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/impact/save")
      .send(savePayload({
        kind: "annual_estimate",
        reportPeriod: { type: "custom", startDate: "2025-01-01", endDate: "2026-12-31" },
      }))
      .expect(400);
    expect(state.impactRecords).toHaveLength(0);
  });

  it("org-stats bounded windows reconcile cross-year periods like recap/YoY", async () => {
    // Manager's own academic estimate + logs; the org's bounded reporting
    // window must neither double-count nor reuse the estimate's capacity.
    const app = makeApp();
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "manager", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    state.impactRecords.push(
      makeRecord({
        kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)),
        impactValue: 721.5, hours: 50, ...ACADEMIC,
      }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2025, 9, 5)), impactValue: 577.2, hours: 40 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 2, 3)), impactValue: 577.2, hours: 40 }),
    );

    const y25 = await request(app)
      .get("/api/impact/org-stats?from=2025-01-01T00:00:00.000Z&to=2026-01-01T00:00:00.000Z")
      .expect(200);
    expect(y25.body.totalHours).toBe(0);

    const y26 = await request(app)
      .get("/api/impact/org-stats?from=2026-01-01T00:00:00.000Z&to=2027-01-01T00:00:00.000Z")
      .expect(200);
    expect(y26.body.totalHours).toBe(80);
  });

  it("estimates WITHOUT a stored period keep the legacy per-year behaviour", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2025, 9, 5)), impactValue: 28.86, hours: 2 }),
    );
    const y25 = await request(app).get("/api/impact/recap/2025").expect(200);
    expect(y25.body.totalHours).toBe(2); // no period → no cross-year absorption
  });
});

describe("/yoy — yearly totals reconciled", () => {
  it("the selected year's total counts a mixed activity once; legacy-only years are raw sums", async () => {
    const app = makeApp();
    state.impactRecords.push(
      // 2025: legacy only.
      makeRecord({ entryDate: new Date(Date.UTC(2025, 5, 15)), impactValue: 100, hours: 5 }),
      // 2026: estimate + overlapping quick log.
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 28.86, hours: 2 }),
    );
    const res = await request(app).get("/api/impact/yoy?year=2026").expect(200);
    expect(res.body.selectedTotal ?? res.body.selectedYearTotalValue).toBeCloseTo(
      Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100, 2,
    );
    const res25 = await request(app).get("/api/impact/yoy?year=2025").expect(200);
    expect(res25.body.selectedTotal ?? res25.body.selectedYearTotalValue).toBeCloseTo(
      Math.round((100 + 5 * (NLW + PD)) * 100) / 100, 2,
    );
  });
});

describe("GET /api/public-profile/:slug — public totals reconciled", () => {
  function enableProfile() {
    state.users.push({ id: USER.id, displayName: "Test User", email: USER.email });
    state.publicProfiles.push({
      id: 1, userId: USER.id, slug: "test-user", isEnabled: true, slugCustomised: false,
      customMessage: null, showHours: true, showSroi: true, showCategories: true,
      showJournalHighlights: false, updatedAt: new Date(),
    });
  }

  it("an estimate plus matching quick log counts once in hours, social value and category hours", async () => {
    const app = makeApp();
    enableProfile();
    state.impactRecords.push(
      makeRecord({ id: 1, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ id: 2, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 3)), impactValue: 28.86, hours: 2 }),
    );
    // Only the quick log is verified — approved subset has no overlap.
    state.recordVerifications.push({ id: 1, recordId: 2, orgId: "org_1", status: "approved" });

    const res = await request(app).get("/api/public-profile/test-user").expect(200);
    expect(res.body.stats.totalHours).toBe(50);
    expect(res.body.stats.totalSroi).toBeCloseTo(721.5 + 50 * (NLW + PD), 2);
    expect(res.body.stats.verifiedHours).toBe(2);
    expect(res.body.stats.categoryHours.Environment).toBeCloseTo(50, 2);
  });

  it("legacy-only profiles keep raw sums", async () => {
    const app = makeApp();
    enableProfile();
    state.impactRecords.push(
      makeRecord({ entryDate: new Date(Date.UTC(2025, 2, 1)), impactValue: 100, hours: 5 }),
      makeRecord({ entryDate: new Date(Date.UTC(2025, 6, 1)), impactValue: 50, hours: 3 }),
    );
    const res = await request(app).get("/api/public-profile/test-user").expect(200);
    expect(res.body.stats.totalHours).toBe(8);
    expect(res.body.stats.totalSroi).toBeCloseTo(150 + 8 * (NLW + PD), 2);
    expect(res.body.stats.categoryHours.Environment).toBeCloseTo(8, 2);
  });
});

describe("monthly digest / email aggregation — totals reconciled", () => {
  it("a mixed estimate + quick-log month counts the activity once in month and cumulative totals", async () => {
    state.impactRecords.push(
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 4, 2)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 10)), impactValue: 28.86, hours: 2 }),
    );
    const digest = await buildMonthlyDigest(
      USER.id,
      new Date(Date.UTC(2026, 4, 1)),
      new Date(Date.UTC(2026, 5, 1)),
      "May 2026",
    );
    const expected = Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100;
    expect(digest.totals.totalValue).toBeCloseTo(expected, 2);
    expect(digest.totals.totalHours).toBe(50);
    expect(digest.cumulative.totalValue).toBeCloseTo(expected, 2);
    expect(digest.cumulative.totalHours).toBe(50);
  });

  it("legacy-only months keep raw sums", async () => {
    state.impactRecords.push(
      makeRecord({ entryDate: new Date(Date.UTC(2026, 4, 2)), impactValue: 100, hours: 5 }),
      makeRecord({ entryDate: new Date(Date.UTC(2026, 4, 10)), impactValue: 50, hours: 3 }),
    );
    const digest = await buildMonthlyDigest(
      USER.id,
      new Date(Date.UTC(2026, 4, 1)),
      new Date(Date.UTC(2026, 5, 1)),
      "May 2026",
    );
    expect(digest.totals.totalValue).toBeCloseTo(Math.round((150 + 8 * (NLW + PD)) * 100) / 100, 2);
    expect(digest.totals.totalHours).toBe(8);
  });
});

describe("/year-rollover — prior-year headline reconciled", () => {
  it("priorYearTotalValue counts a mixed prior-year activity once", async () => {
    const app = makeApp();
    const currentYear = new Date().getUTCFullYear();
    const priorYear = currentYear - 1;
    state.impactRecords.push(
      makeRecord({ kind: "annual_estimate", entryDate: new Date(Date.UTC(priorYear, 0, 10)), impactValue: 721.5, hours: 50 }),
      makeRecord({ kind: "quick_log", entryDate: new Date(Date.UTC(priorYear, 4, 3)), impactValue: 28.86, hours: 2 }),
    );
    const res = await request(app).get("/api/impact/year-rollover").expect(200);
    expect(res.body.priorYearTotalValue).toBeCloseTo(Math.round((721.5 + 50 * (NLW + PD)) * 100) / 100, 2);
    expect(res.body.priorYearTotalHours).toBe(50);
  });
});

// ── /save → hours.logged webhook gating by org sharing mode ─────────────────
// The webhook must follow the same visibility predicate as dashboards and
// breakdowns: consented orgs only receive events for records inside a
// member's active-consent shareFrom window; revoked orgs never receive
// events; explicit orgs keep the legacy behaviour.
describe("/save — hours.logged webhook respects org sharing mode", () => {
  const flush = () => new Promise((r) => setTimeout(r, 20));

  async function saveAndFlush(payload: Record<string, unknown> = {}) {
    const { enqueueOrgEvent } = await import("../src/lib/webhookDispatcher.js");
    vi.mocked(enqueueOrgEvent).mockClear();
    const app = makeApp();
    await request(app).post("/api/impact/save").send(savePayload(payload)).expect(200);
    await flush();
    return vi.mocked(enqueueOrgEvent);
  }

  it("explicit-submission org: emits with the contribution-model fields", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const mock = await saveAndFlush({ activityDate: "2026-03-10" });
    expect(mock).toHaveBeenCalledTimes(1);
    const payload = mock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.activityDate).toBe("2026-03-10");
    expect(payload.verificationStatus).toBe("submitted");
    expect(payload.reportingYear).toBe(2026);
  });

  it("redacts the webhook location to the general area (no postcode, label, or coordinates)", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const mock = await saveAndFlush({ activityDate: "2026-03-10", location: LOCATION });
    expect(mock).toHaveBeenCalledTimes(1);
    const payload = mock.mock.calls[0][0].payload as Record<string, unknown>;
    expect(payload.location).toEqual({
      mode: "in_person",
      townCity: "Leeds",
      localAuthority: "Leeds",
      region: "Yorkshire and the Humber",
      country: "England",
      postcodeArea: "LS",
    });
    const raw = JSON.stringify(payload.location);
    expect(raw).not.toContain("LS6 3HN");
    expect(raw).not.toContain("Sunnybank");
    expect(raw).not.toContain("53.8195");
  });

  it("explicit-submission org: pending/inactive membership emits nothing", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "pending" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const mock = await saveAndFlush({ activityDate: "2026-03-10" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("consented org without an active consent: emits nothing", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "consented_logging", revokedAt: null, dashboardSections: null });
    const mock = await saveAndFlush({ activityDate: "2026-03-10" });
    expect(mock).not.toHaveBeenCalled();
  });

  it("consented org: emits only when the activity date is inside the shareFrom window", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "consented_logging", revokedAt: null, dashboardSections: null });
    state.orgMemberConsents.push({ id: "c1", orgId: "org-1", userId: USER.id, status: "active", shareFrom: new Date("2026-01-01T00:00:00Z") });

    const before = await saveAndFlush({ activityDate: "2025-12-20" });
    expect(before).not.toHaveBeenCalled();

    const inside = await saveAndFlush({ activityDate: "2026-02-01" });
    expect(inside).toHaveBeenCalledTimes(1);
  });

  it("revoked org: emits nothing", async () => {
    state.orgMembers.push({ id: "m1", orgId: "org-1", userId: USER.id, role: "member", status: "active" });
    state.organisations.push({ id: "org-1", name: "Org", dataSharingMode: "explicit_submission", revokedAt: new Date(), dashboardSections: null });
    const mock = await saveAndFlush({ activityDate: "2026-03-10" });
    expect(mock).not.toHaveBeenCalled();
  });
});

describe("/history — twin dedupe and sharedWith badge", () => {
  // Each test in this suite runs after beforeEach() resets state.

  it("unshared records appear unmodified with sharedWith=null", async () => {
    const app = makeApp();
    state.impactRecords.push(
      makeRecord({ id: 1, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 4, 1)), impactValue: 50, hours: 2, name: "solo" }),
    );
    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].name).toBe("solo");
    expect(res.body.records[0].sharedWith).toBeNull();
  });

  it("quick-log shared via orgRecordId link appears once with sharedWith metadata", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-1", name: "Acme Volunteers", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    // Personal record: resultJson carries orgRecordId pointing at the twin (id=20).
    const personal = makeRecord({ id: 10, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 3, 5)), impactValue: 30, hours: 1, name: "litter pick" });
    (personal.resultJson as Record<string, unknown>).orgRecordId = 20;
    // Member-submitted twin.
    const twin = makeRecord({ id: 20, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 3, 5)), impactValue: 30, hours: 1, name: "litter pick", source: "member-submitted", submittedToOrgId: "org-1" });
    state.impactRecords.push(personal, twin);

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    const rec = res.body.records[0];
    expect(rec.id).toBe("10");
    expect(rec.sharedWith).toEqual({ orgId: "org-1", orgName: "Acme Volunteers" });
    expect(rec.source).toBe("user");
  });

  it("yearly estimate twin pair (sourceReportId link) appears once", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-2", name: "University of Example", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    // Personal annual estimate (the source report).
    const report = makeRecord({ id: 500, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)), impactValue: 721.5, hours: 50, name: "Impact Report" });
    // Org copy created by "Review & share" — sourceReportId → personal.
    const share = makeRecord({ id: 501, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 5, 15)), impactValue: 721.5, hours: 50, name: "Impact Report", source: "member-submitted", submittedToOrgId: "org-2", sourceReportId: 500 });
    state.impactRecords.push(report, share);

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    const rec = res.body.records[0];
    expect(rec.id).toBe("500");
    expect(rec.sharedWith).toEqual({ orgId: "org-2", orgName: "University of Example" });
  });

  it("diverged-value twin pair collapses to the personal record (keeps personal values)", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-3", name: "Local Charity", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const report = makeRecord({ id: 300, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 21350, hours: 100, name: "Big estimate" });
    // Org copy has a slightly different impactValue (data drift scenario).
    const share = makeRecord({ id: 301, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 0, 10)), impactValue: 21822, hours: 100, name: "Big estimate", source: "member-submitted", submittedToOrgId: "org-3", sourceReportId: 300 });
    state.impactRecords.push(report, share);

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    // Personal record's value is preserved.
    expect(res.body.records[0].id).toBe("300");
    expect((res.body.records[0].impactResult as { impactValue: number }).impactValue).toBeCloseTo(21350, 0);
    expect(res.body.records[0].sharedWith).not.toBeNull();
  });

  it("verification status is inherited from the suppressed twin when the personal record has none", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-4", name: "Trust", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const report = makeRecord({ id: 400, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 2, 1)), impactValue: 100, hours: 5, name: "Report" });
    const share = makeRecord({ id: 401, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 2, 1)), impactValue: 100, hours: 5, name: "Report", source: "member-submitted", submittedToOrgId: "org-4", sourceReportId: 400 });
    state.impactRecords.push(report, share);
    // Verification is on the twin (401), not the personal record (400).
    state.recordVerifications.push({ id: 1, recordId: 401, orgId: "org-4", status: "approved", reason: null, decidedAt: new Date("2026-03-10T12:00:00Z") });

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    const rec = res.body.records[0];
    expect(rec.id).toBe("400");
    // Verification inherited from suppressed twin.
    expect(rec.verification).not.toBeNull();
    expect(rec.verification.status).toBe("approved");
  });

  it("personal record's own verification takes priority over the twin's", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-5", name: "Charity", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const report = makeRecord({ id: 600, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 4, 1)), impactValue: 200, hours: 10, name: "R" });
    const share = makeRecord({ id: 601, kind: "annual_estimate", entryDate: new Date(Date.UTC(2026, 4, 1)), impactValue: 200, hours: 10, name: "R", source: "member-submitted", submittedToOrgId: "org-5", sourceReportId: 600 });
    state.impactRecords.push(report, share);
    // Both have verifications — personal record's own takes priority.
    state.recordVerifications.push(
      { id: 10, recordId: 600, orgId: "org-5", status: "rejected", reason: "Wrong data", decidedAt: new Date("2026-05-02T00:00:00Z") },
      { id: 11, recordId: 601, orgId: "org-5", status: "approved", reason: null, decidedAt: new Date("2026-05-03T00:00:00Z") },
    );

    const res = await request(app).get("/api/impact/history").expect(200);
    const rec = res.body.records[0];
    expect(rec.verification.status).toBe("rejected");
  });

  it("legacy fallback twin pair (same date + activities, no explicit link) is collapsed", async () => {
    const app = makeApp();
    state.organisations.push({ id: "org-6", name: "Neighbourhood Trust", dataSharingMode: "explicit_submission", revokedAt: null, dashboardSections: null });
    const acts = [{ activityId: "food_bank", quantity: 3, hoursPerYear: 3, category: "Community", hours: 3 }];
    const personal = {
      ...makeRecord({ id: 700, kind: "legacy", entryDate: new Date(Date.UTC(2025, 6, 1)), impactValue: 50, hours: 3, name: "legacy" }),
      activitiesJson: acts,
    };
    const twin = {
      ...makeRecord({ id: 701, kind: "legacy", entryDate: new Date(Date.UTC(2025, 6, 1)), impactValue: 50, hours: 3, name: "legacy", source: "member-submitted", submittedToOrgId: "org-6" }),
      activitiesJson: acts,
    };
    state.impactRecords.push(personal, twin);

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].id).toBe("700");
    expect(res.body.records[0].sharedWith).not.toBeNull();
  });

  it("unmatched member-submitted records (no linked personal record) still appear", async () => {
    // Edge case: a record submitted directly to an org with no personal twin.
    const app = makeApp();
    const orphan = makeRecord({ id: 800, kind: "quick_log", entryDate: new Date(Date.UTC(2026, 3, 1)), impactValue: 10, hours: 1, name: "direct submit", source: "member-submitted", submittedToOrgId: "org-99" });
    state.impactRecords.push(orphan);

    const res = await request(app).get("/api/impact/history").expect(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].id).toBe("800");
    expect(res.body.records[0].sharedWith).toBeNull();
  });
});
