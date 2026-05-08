import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request } from "express";

vi.mock("@workspace/db", () => import("./_mocks/db.js"));

import { dbState, dbMocks, resetDbState } from "./_mocks/db.js";
import {
  AI_DAILY_LIMIT_ANON,
  AI_DAILY_LIMIT_USER,
  AI_INFLIGHT_AVG_TOKENS,
  AI_INFLIGHT_TTL_MS,
  AI_MONTHLY_TOKEN_LIMIT_ANON,
  AI_MONTHLY_TOKEN_LIMIT_USER,
  acquireInflight,
  applyInflightToQuota,
  currentMonthRangeUtc,
  estimateCostUsd,
  getInflightCount,
  getMonthlyUsageReport,
  getRemainingQuota,
  getUserKey,
  incrementUsage,
  isAuthenticatedKey,
  releaseInflight,
  sweepExpiredInflightReservations,
  todayUtc,
} from "../src/lib/aiUsage.js";

function makeReq(opts: Partial<{
  user: { id: string; email: string };
  headers: Record<string, string | string[]>;
  ip: string;
  remoteAddress: string;
  cookies: Record<string, string>;
}> = {}): Request {
  const headers = opts.headers ?? {};
  return {
    headers,
    ip: opts.ip,
    socket: { remoteAddress: opts.remoteAddress } as unknown as Request["socket"],
    cookies: opts.cookies,
    user: opts.user,
  } as unknown as Request;
}

beforeEach(() => {
  resetDbState();
  dbMocks.execute.mockClear();
  dbMocks.select.mockClear();
  dbMocks.findFirst.mockClear();
});

describe("getUserKey", () => {
  it("uses authenticated user id when present", () => {
    expect(getUserKey(makeReq({ user: { id: "u1", email: "a@b" } }))).toBe("user:u1");
  });

  it("strips ::ffff: from IPv4-mapped IPv6 addresses", () => {
    expect(getUserKey(makeReq({ ip: "::ffff:10.0.0.1" }))).toBe("ip:10.0.0.1");
  });

  it("honours only the first hop of x-forwarded-for", () => {
    const req = makeReq({
      ip: "10.0.0.99",
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.99, 192.168.1.1" },
    });
    expect(getUserKey(req)).toBe("ip:203.0.113.5");
  });

  it("handles array x-forwarded-for and strips IPv6 prefix from first hop", () => {
    const req = makeReq({
      headers: { "x-forwarded-for": ["::ffff:198.51.100.7, 1.1.1.1"] },
    });
    expect(getUserKey(req)).toBe("ip:198.51.100.7");
  });

  it("falls back to socket remote address when req.ip is missing", () => {
    expect(getUserKey(makeReq({ remoteAddress: "::ffff:172.16.0.1" }))).toBe("ip:172.16.0.1");
  });

  it("falls back to a session cookie when no IP is available", () => {
    const req = makeReq({ cookies: { mi_session: "abcdefghijklmnopqrstuvwxyz0123456789EXTRA" } });
    expect(getUserKey(req)).toBe("sess:abcdefghijklmnopqrstuvwxyz012345");
  });

  it("returns ip:unknown as the last-resort key", () => {
    expect(getUserKey(makeReq())).toBe("ip:unknown");
  });

  it("isAuthenticatedKey only true for user:* keys", () => {
    expect(isAuthenticatedKey("user:abc")).toBe(true);
    expect(isAuthenticatedKey("ip:1.2.3.4")).toBe(false);
    expect(isAuthenticatedKey("sess:foo")).toBe(false);
  });
});

describe("getRemainingQuota", () => {
  it("returns anonymous tier limits with persisted usage subtracted", async () => {
    dbState.selectResults.push([{ questions: 4 }]);
    dbState.selectResults.push([{ input: 1000, output: 500 }]);
    const q = await getRemainingQuota("ip:1.2.3.4");
    expect(q.isAuthenticated).toBe(false);
    expect(q.dailyLimit).toBe(AI_DAILY_LIMIT_ANON);
    expect(q.monthlyTokenLimit).toBe(AI_MONTHLY_TOKEN_LIMIT_ANON);
    expect(q.questionsUsedToday).toBe(4);
    expect(q.questionsLeft).toBe(AI_DAILY_LIMIT_ANON - 4);
    expect(q.tokensUsedThisMonth).toBe(1500);
    expect(q.tokensLeft).toBe(AI_MONTHLY_TOKEN_LIMIT_ANON - 1500);
  });

  it("returns authenticated tier limits", async () => {
    dbState.selectResults.push([{ questions: 0 }]);
    dbState.selectResults.push([{ input: 0, output: 0 }]);
    const q = await getRemainingQuota("user:u1");
    expect(q.isAuthenticated).toBe(true);
    expect(q.dailyLimit).toBe(AI_DAILY_LIMIT_USER);
    expect(q.monthlyTokenLimit).toBe(AI_MONTHLY_TOKEN_LIMIT_USER);
    expect(q.questionsLeft).toBe(AI_DAILY_LIMIT_USER);
    expect(q.tokensLeft).toBe(AI_MONTHLY_TOKEN_LIMIT_USER);
  });

  it("clamps remaining counts to zero when exceeded", async () => {
    dbState.selectResults.push([{ questions: 999 }]);
    dbState.selectResults.push([{ input: 10_000_000, output: 0 }]);
    const q = await getRemainingQuota("ip:9.9.9.9");
    expect(q.questionsLeft).toBe(0);
    expect(q.tokensLeft).toBe(0);
  });

  it("treats missing aggregate rows as zero usage", async () => {
    dbState.selectResults.push([]);
    dbState.selectResults.push([]);
    const q = await getRemainingQuota("ip:1.1.1.1");
    expect(q.questionsUsedToday).toBe(0);
    expect(q.tokensUsedThisMonth).toBe(0);
  });
});

describe("applyInflightToQuota", () => {
  const base = {
    questionsLeft: 10,
    tokensLeft: 100_000,
    dailyLimit: 10,
    monthlyTokenLimit: 100_000,
    questionsUsedToday: 0,
    tokensUsedThisMonth: 0,
    isAuthenticated: false,
  };

  it("returns the same quota when no in-flight reservations exist", () => {
    expect(applyInflightToQuota(base, 0, false)).toEqual(base);
  });

  it("subtracts other in-flight reservations from the quota", () => {
    const out = applyInflightToQuota(base, 3, false);
    expect(out.questionsLeft).toBe(10 - 3);
    expect(out.tokensLeft).toBe(100_000 - 3 * AI_INFLIGHT_AVG_TOKENS);
    expect(out.questionsUsedToday).toBe(3);
    expect(out.tokensUsedThisMonth).toBe(3 * AI_INFLIGHT_AVG_TOKENS);
  });

  it("excludes the caller's own reservation when excludeSelf=true", () => {
    const out = applyInflightToQuota(base, 2, true);
    expect(out.questionsLeft).toBe(10 - 1);
  });

  it("clamps to zero when in-flight count exceeds quota", () => {
    const out = applyInflightToQuota(base, 50, false);
    expect(out.questionsLeft).toBe(0);
    expect(out.tokensLeft).toBe(0);
  });
});

describe("acquireInflight / releaseInflight / getInflightCount (persisted)", () => {
  it("acquireInflight INSERTs a row with a TTL'd expires_at and returns its id", async () => {
    dbState.executeResults.push({ rows: [{ id: 42 }] });
    const token = await acquireInflight("ip:1.2.3.4");
    expect(token).toBe(42);
    const call = dbState.executes.at(-1)!;
    const sql = call.chunks.filter((c) => typeof c === "string").join(" ");
    expect(sql).toMatch(/INSERT INTO ai_inflight_reservations/);
    expect(sql).toMatch(/RETURNING id/);
    expect(call.values).toContain("ip:1.2.3.4");
    // The configured TTL is also referenced by the helper so the gate
    // can't accidentally hand out forever-locks.
    expect(AI_INFLIGHT_TTL_MS).toBeGreaterThan(0);
  });

  it("releaseInflight DELETEs by id and is a no-op for falsy tokens", async () => {
    await releaseInflight(0);
    expect(dbMocks.execute).not.toHaveBeenCalled();

    await releaseInflight(7);
    const call = dbState.executes.at(-1)!;
    const sql = call.chunks.filter((c) => typeof c === "string").join(" ");
    expect(sql).toMatch(/DELETE FROM ai_inflight_reservations/);
    expect(call.values).toContain(7);
  });

  it("getInflightCount counts non-expired rows for the user key", async () => {
    dbState.executeResults.push({ rows: [{ count: 3 }] });
    const n = await getInflightCount("ip:9.9.9.9");
    expect(n).toBe(3);
    const call = dbState.executes.at(-1)!;
    const sql = call.chunks.filter((c) => typeof c === "string").join(" ");
    expect(sql).toMatch(/SELECT COUNT/);
    expect(sql).toMatch(/FROM ai_inflight_reservations/);
    expect(sql).toMatch(/expires_at > NOW\(\)/);
    expect(call.values).toContain("ip:9.9.9.9");
  });

  it("getInflightCount returns 0 when the row is missing", async () => {
    expect(await getInflightCount("ip:nobody")).toBe(0);
  });

  it("sweepExpiredInflightReservations DELETEs expired rows and returns the rowCount", async () => {
    dbState.executeResults.push({ rowCount: 4 });
    const removed = await sweepExpiredInflightReservations();
    expect(removed).toBe(4);
    const call = dbState.executes.at(-1)!;
    const sql = call.chunks.filter((c) => typeof c === "string").join(" ");
    expect(sql).toMatch(/DELETE FROM ai_inflight_reservations WHERE expires_at <= NOW\(\)/);
  });
});

describe("incrementUsage", () => {
  it("issues a single upsert against ai_usage with the supplied deltas", async () => {
    await incrementUsage("ip:1.2.3.4", "gpt-5-mini", {
      countDelta: 1,
      toolCalls: 2,
      inputTokens: 1234,
      outputTokens: 567,
    });
    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const call = dbState.executes[0];
    const joined = call.chunks.filter((c) => typeof c === "string").join(" ");
    expect(joined).toMatch(/INSERT INTO ai_usage/);
    expect(joined).toMatch(/ON CONFLICT \(user_key, date, model\) DO UPDATE/);
    const values = call.values;
    expect(values).toContain("ip:1.2.3.4");
    expect(values).toContain("gpt-5-mini");
    expect(values).toContain(todayUtc());
    expect(values).toContain(1);
    expect(values).toContain(2);
    expect(values).toContain(1234);
    expect(values).toContain(567);
  });

  it("defaults countDelta to 1 and other deltas to 0", async () => {
    await incrementUsage("user:u1", "gpt-5-mini", {});
    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const values = dbState.executes[0].values;
    expect(values).toContain(1); // countDelta default
    expect(values.filter((v) => v === 0).length).toBeGreaterThanOrEqual(3);
  });

  it("supports countDelta=0 for follow-up model calls that should only log tokens", async () => {
    await incrementUsage("user:u1", "gpt-5-mini", { countDelta: 0, inputTokens: 50, outputTokens: 25 });
    const values = dbState.executes[0].values;
    expect(values).toContain(50);
    expect(values).toContain(25);
    const zeros = values.filter((v) => v === 0).length;
    expect(zeros).toBeGreaterThanOrEqual(2);
  });
});

describe("getMonthlyUsageReport", () => {
  it("aggregates rows, sorts by estimated cost desc, and computes totals", async () => {
    dbState.selectResults.push([
      { userKey: "ip:a", questions: 5, tools: 0, input: 10_000, output: 5_000 },
      { userKey: "user:big", questions: 100, tools: 3, input: 1_000_000, output: 500_000 },
      { userKey: "ip:b", questions: 1, tools: 0, input: 0, output: 0 },
    ]);

    const report = await getMonthlyUsageReport();
    const range = currentMonthRangeUtc();
    expect(report.monthStart).toBe(range.start);
    expect(report.monthEnd).toBe(range.end);

    expect(report.rows).toHaveLength(3);
    expect(report.rows[0].userKey).toBe("user:big");
    expect(report.rows[2].userKey).toBe("ip:b");
    expect(report.rows[2].estimatedCostUsd).toBe(0);

    for (const row of report.rows) {
      expect(row.estimatedCostUsd).toBeCloseTo(estimateCostUsd(row.inputTokens, row.outputTokens), 9);
    }

    expect(report.totals.questionCount).toBe(5 + 100 + 1);
    expect(report.totals.toolCalls).toBe(0 + 3 + 0);
    expect(report.totals.inputTokens).toBe(10_000 + 1_000_000 + 0);
    expect(report.totals.outputTokens).toBe(5_000 + 500_000 + 0);
    expect(report.totals.estimatedCostUsd).toBeCloseTo(
      report.rows.reduce((s, r) => s + r.estimatedCostUsd, 0),
      9
    );
  });

  it("returns an empty report when there are no rows", async () => {
    dbState.selectResults.push([]);
    const report = await getMonthlyUsageReport();
    expect(report.rows).toEqual([]);
    expect(report.totals).toEqual({
      questionCount: 0,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
    });
  });
});
