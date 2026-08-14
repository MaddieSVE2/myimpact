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
  const and = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.every((p) => !p || (typeof p === "function" && p(row)));
  const or = (...preds: Array<Pred | undefined | null | false>): Pred => (row) =>
    preds.some((p) => typeof p === "function" && p(row));
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
    source: "user", tags: [],
    entryDate: opts.entryDate,
    habitTemplateId: null,
    createdAt: opts.entryDate,
    kind: opts.kind ?? "legacy",
    locationJson: opts.locationJson ?? null,
    reportingYear: opts.reportingYear !== undefined ? opts.reportingYear : opts.entryDate.getUTCFullYear(),
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
