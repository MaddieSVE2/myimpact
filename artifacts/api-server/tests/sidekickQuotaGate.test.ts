import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";

vi.mock("@workspace/db", () => import("./_mocks/db.js"));

import { dbState, dbMocks, resetDbState } from "./_mocks/db.js";
import {
  AI_DAILY_LIMIT_ANON,
  AI_DAILY_LIMIT_REACHED_MESSAGE,
  AI_MONTHLY_TOKEN_LIMIT_REACHED_MESSAGE,
  sidekickQuotaGate,
} from "../src/lib/aiUsage.js";

function buildApp() {
  const app = express();
  app.set("trust proxy", true);
  app.post("/sidekick", sidekickQuotaGate, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

/**
 * Queue the canned DB responses for one full pass through `tryAcquireSidekickSlot`,
 * which runs (in order) inside a transaction:
 *   1. SELECT pg_advisory_xact_lock(...)
 *   2. SELECT today's question count
 *   3. SELECT month-to-date token sum
 *   4. SELECT live in-flight reservation count
 *   5. (if admitted) INSERT ... RETURNING id
 *
 * If the call is admitted, a separate DELETE-by-id fires on response close.
 */
function queueGate(opts: {
  questionsUsedToday?: number;
  inputTokens?: number;
  outputTokens?: number;
  inflightCount?: number;
  reservationId?: number;
}) {
  dbState.executeResults.push({ rows: [] }); // advisory lock
  dbState.executeResults.push({ rows: [{ q: opts.questionsUsedToday ?? 0 }] });
  const tokens = (opts.inputTokens ?? 0) + (opts.outputTokens ?? 0);
  dbState.executeResults.push({ rows: [{ t: tokens }] });
  dbState.executeResults.push({ rows: [{ c: opts.inflightCount ?? 0 }] });
  if (opts.reservationId !== undefined) {
    dbState.executeResults.push({ rows: [{ id: opts.reservationId }] });
  }
}

beforeEach(() => {
  resetDbState();
  dbMocks.execute.mockReset();
  dbMocks.execute.mockImplementation(async (sqlObj: { queryChunks?: unknown[] }) => {
    // Mirror the default behaviour from the mock module so individual
    // tests can call mockImplementationOnce without losing recording.
    const chunks: unknown[] = [];
    const values: unknown[] = [];
    for (const c of sqlObj.queryChunks ?? []) {
      if (typeof c === "string" || typeof c === "number" || typeof c === "boolean" || typeof c === "bigint") {
        chunks.push(typeof c === "string" ? c : "?");
        values.push(c);
      } else if (c && typeof c === "object") {
        const cc = c as { value?: unknown };
        if (Array.isArray(cc.value)) chunks.push(cc.value.join(""));
        else if (c instanceof Number || c instanceof Boolean) { chunks.push("?"); values.push((c as Number | Boolean).valueOf()); }
        else if (cc.value !== undefined) { chunks.push("?"); values.push(cc.value); }
        else { chunks.push("?"); values.push(undefined); }
      }
    }
    dbState.executes.push({ chunks, values });
    // DELETEs (the in-flight reservation release path) don't need a
    // canned row result, so don't let them drain the queued reads that
    // belong to the *next* gate call.
    const sqlText = chunks.filter((c): c is string => typeof c === "string").join("");
    if (sqlText.includes("DELETE FROM ai_inflight_reservations")) {
      return { rows: [] };
    }
    return dbState.executeResults.shift() ?? { rows: [] };
  });
  dbMocks.select.mockClear();
  dbMocks.transaction.mockClear();
});

function findExecuteContaining(needle: string) {
  return dbState.executes.find((e) =>
    e.chunks.some((c) => typeof c === "string" && c.includes(needle)),
  );
}

describe("sidekickQuotaGate (integration, persisted reservations)", () => {
  it("returns 429 with the daily limit message once the cap is reached", async () => {
    queueGate({ questionsUsedToday: AI_DAILY_LIMIT_ANON });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      message: AI_DAILY_LIMIT_REACHED_MESSAGE,
      code: "ai_daily_limit_reached",
    });
    // Must NOT have inserted a reservation when rejected.
    expect(findExecuteContaining("INSERT INTO ai_inflight_reservations")).toBeUndefined();
  });

  it("admits the request, INSERTs a reservation inside a transaction, and DELETEs it on finish", async () => {
    queueGate({ questionsUsedToday: AI_DAILY_LIMIT_ANON - 1, reservationId: 101 });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(200);

    // Wait for the close/finish release to flush.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(dbMocks.transaction).toHaveBeenCalledTimes(1);
    expect(findExecuteContaining("pg_advisory_xact_lock")).toBeTruthy();
    expect(findExecuteContaining("INSERT INTO ai_inflight_reservations")).toBeTruthy();
    const deleteCall = findExecuteContaining(
      "DELETE FROM ai_inflight_reservations WHERE id =",
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.values).toContain(101);
  });

  it("returns the monthly-token-limit message when persisted tokens fill the cap", async () => {
    queueGate({ inputTokens: 10_000_000, outputTokens: 10_000_000 });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      message: AI_MONTHLY_TOKEN_LIMIT_REACHED_MESSAGE,
      code: "ai_monthly_token_limit_reached",
    });
    expect(findExecuteContaining("INSERT INTO ai_inflight_reservations")).toBeUndefined();
  });

  it("blocks parallel bursts using the persisted in-flight count even when nothing is in ai_usage yet", async () => {
    queueGate({ questionsUsedToday: 0, inflightCount: AI_DAILY_LIMIT_ANON });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("ai_daily_limit_reached");
  });

  it("never admits more callers than the daily cap when prior reservations are still in flight", async () => {
    // Simulate AI_DAILY_LIMIT_ANON + 1 sequential gate checks. Each check
    // sees the prior insertions reflected in the in-flight COUNT (just as
    // it would in production thanks to the transactional advisory lock),
    // so the (limit + 1)-th call must be rejected.
    for (let i = 0; i < AI_DAILY_LIMIT_ANON; i++) {
      queueGate({ questionsUsedToday: 0, inflightCount: i, reservationId: 1000 + i });
    }
    queueGate({ questionsUsedToday: 0, inflightCount: AI_DAILY_LIMIT_ANON });

    const app = buildApp();
    let admitted = 0;
    let rejected = 0;
    for (let i = 0; i < AI_DAILY_LIMIT_ANON + 1; i++) {
      const res = await request(app).post("/sidekick").send({});
      if (res.status === 200) admitted++;
      else if (res.status === 429) rejected++;
    }
    expect(admitted).toBe(AI_DAILY_LIMIT_ANON);
    expect(rejected).toBe(1);
  });

  it("releases the in-flight reservation when the client closes the connection mid-flight", async () => {
    queueGate({ reservationId: 202 });
    const app = express();
    app.set("trust proxy", true);
    app.post("/sidekick", sidekickQuotaGate, (_req, res) => {
      res.write("partial");
      // Hold the response open; the client will abort.
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    await new Promise<void>((resolve) => {
      const req = http.request(
        { method: "POST", host: "127.0.0.1", port, path: "/sidekick" },
        (res) => {
          res.once("data", () => req.destroy());
          res.on("close", () => resolve());
          res.on("error", () => resolve());
        },
      );
      req.on("error", () => resolve());
      req.end("{}");
      setTimeout(() => {
        try { req.destroy(); } catch {/* ignore */}
        resolve();
      }, 2000).unref();
    });

    await new Promise((r) => setTimeout(r, 50));
    server.close();

    const deleteCall = findExecuteContaining(
      "DELETE FROM ai_inflight_reservations WHERE id =",
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.values).toContain(202);
  });

  it("returns 503 when the underlying DB transaction fails (no leaked reservation)", async () => {
    dbMocks.transaction.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(503);
    expect(findExecuteContaining("INSERT INTO ai_inflight_reservations")).toBeUndefined();
  });

  it("returns 503 when the INSERT inside the transaction itself fails", async () => {
    queueGate({ reservationId: 999 });
    // Override the execute mock so the INSERT call throws (after the
    // advisory-lock + 3 reads succeed). The transaction body propagates
    // the error and the gate falls through to its 503 path.
    dbMocks.execute.mockImplementation(async (sqlObj: { queryChunks?: unknown[] }) => {
      const sqlText = (sqlObj.queryChunks ?? [])
        .map((c) => {
          if (typeof c === "string") return c;
          const cc = c as { value?: unknown };
          if (Array.isArray(cc.value)) return cc.value.join("");
          return "";
        })
        .join("");
      // Record the call so assertions can still inspect.
      dbState.executes.push({ chunks: [sqlText], values: [] });
      if (sqlText.includes("INSERT INTO ai_inflight_reservations")) {
        throw new Error("insert failed");
      }
      return dbState.executeResults.shift() ?? { rows: [] };
    });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(503);
  });
});
