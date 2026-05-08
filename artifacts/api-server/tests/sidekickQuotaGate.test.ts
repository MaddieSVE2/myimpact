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
  acquireInflight,
  getInflightCount,
  releaseInflight,
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

function queueQuota(questionsUsedToday: number, inputTokens = 0, outputTokens = 0) {
  dbState.selectResults.push([{ questions: questionsUsedToday }]);
  dbState.selectResults.push([{ input: inputTokens, output: outputTokens }]);
}

beforeEach(() => {
  resetDbState();
  dbMocks.execute.mockClear();
  dbMocks.select.mockClear();
  // Reset any leaked inflight counts.
  for (const k of ["ip:127.0.0.1", "ip:::1", "ip:1.2.3.4", "ip:9.9.9.9"]) {
    while (getInflightCount(k) > 0) releaseInflight(k);
  }
});

describe("sidekickQuotaGate (integration)", () => {
  it("returns 429 with the daily limit message once the cap is reached", async () => {
    // 11th anonymous request in a day: persisted = AI_DAILY_LIMIT_ANON (10).
    queueQuota(AI_DAILY_LIMIT_ANON, 0, 0);
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      message: AI_DAILY_LIMIT_REACHED_MESSAGE,
      code: "ai_daily_limit_reached",
    });
  });

  it("admits the request when one slot remains and increments in-flight", async () => {
    queueQuota(AI_DAILY_LIMIT_ANON - 1, 0, 0);
    const app = express();
    app.set("trust proxy", true);
    let inflightDuringHandler = -1;
    app.post("/sidekick", sidekickQuotaGate, (_req, res) => {
      inflightDuringHandler = getInflightCount("ip:127.0.0.1");
      res.status(200).json({ ok: true });
    });
    const res = await request(app).post("/sidekick").send({});
    expect(res.status).toBe(200);
    expect(inflightDuringHandler).toBe(1);
    // Released on `finish`.
    await new Promise((r) => setImmediate(r));
    expect(getInflightCount("ip:127.0.0.1")).toBe(0);
  });

  it("returns the monthly-token-limit message when persisted tokens fill the cap", async () => {
    // Plenty of question budget left, but tokens exhausted.
    queueQuota(0, 10_000_000, 10_000_000);
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      message: AI_MONTHLY_TOKEN_LIMIT_REACHED_MESSAGE,
      code: "ai_monthly_token_limit_reached",
    });
  });

  it("blocks parallel bursts via in-flight reservations even when nothing is persisted yet", async () => {
    // Pre-fill in-flight to simulate AI_DAILY_LIMIT_ANON simultaneous
    // requests already mid-flight from the same caller.
    for (let i = 0; i < AI_DAILY_LIMIT_ANON; i++) acquireInflight("ip:127.0.0.1");
    queueQuota(0, 0, 0); // 0 persisted; daily slots all reserved by inflight.

    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("ai_daily_limit_reached");
  });

  it("releases the in-flight reservation when the client closes the connection mid-flight", async () => {
    queueQuota(0, 0, 0);
    const app = express();
    app.set("trust proxy", true);
    let releasedAt = -1;
    let acquiredAt = -1;
    app.post("/sidekick", sidekickQuotaGate, (_req, res) => {
      acquiredAt = getInflightCount("ip:127.0.0.1");
      // Hold the response open so the client can abort it before we finish.
      res.write("partial");
      res.on("close", () => {
        // The middleware's release listener also runs on `close`; since
        // listener order is deterministic (middleware attaches first,
        // route handler second) the count should already be 0 here.
        releasedAt = getInflightCount("ip:127.0.0.1");
      });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { method: "POST", host: "127.0.0.1", port, path: "/sidekick" },
        (res) => {
          res.once("data", () => {
            req.destroy();
          });
          res.on("close", () => resolve());
          res.on("error", () => resolve());
        }
      );
      req.on("error", () => resolve());
      req.end("{}");
      setTimeout(() => {
        try { req.destroy(); } catch {/* ignore */}
        reject(new Error("request did not abort in time"));
      }, 2000).unref();
    }).catch(() => {});

    // Allow the close event to propagate.
    await new Promise((r) => setTimeout(r, 50));
    server.close();

    expect(acquiredAt).toBe(1);
    expect(releasedAt).toBe(0);
    expect(getInflightCount("ip:127.0.0.1")).toBe(0);
  });

  it("returns 503 when the underlying quota lookup fails (closes the resource leak path)", async () => {
    dbMocks.select.mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const res = await request(buildApp()).post("/sidekick").send({});
    expect(res.status).toBe(503);
    // Reservation must NOT have been acquired when the gate errored out.
    expect(getInflightCount("ip:127.0.0.1")).toBe(0);
  });
});
