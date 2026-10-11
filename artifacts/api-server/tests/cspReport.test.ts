import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { readCspReports, withoutQuery } from "../src/lib/cspReport.js";
import cspReportRouter from "../src/routes/csp-report.js";

describe("readCspReports", () => {
  it("reads the report-uri shape", () => {
    expect(
      readCspReports({
        "csp-report": {
          "document-uri": "https://myimpact.uk/results?token=secret",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?id=1",
        },
      }),
    ).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "https://myimpact.uk/results" }]);
  });

  it("reads the Reporting API shape and skips other report types", () => {
    expect(
      readCspReports([
        { type: "csp-violation", body: { documentURL: "https://myimpact.uk/", effectiveDirective: "img-src", blockedURL: "inline" } },
        { type: "deprecation", body: { message: "x" } },
      ]),
    ).toEqual([{ directive: "img-src", blocked: "inline", page: "https://myimpact.uk/" }]);
  });

  it("ignores anything else", () => {
    expect(readCspReports(null)).toEqual([]);
    expect(readCspReports("nonsense")).toEqual([]);
    expect(readCspReports({ other: 1 })).toEqual([]);
  });

  it("keeps only origin and path of URLs, and short keywords as they are", () => {
    expect(withoutQuery("https://myimpact.uk/profile/jo?ref=mail#top")).toBe("https://myimpact.uk/profile/jo");
    expect(withoutQuery("eval")).toBe("eval");
    expect(withoutQuery(undefined)).toBe("");
  });
});

describe("POST /api/csp-report", () => {
  const app = express();
  app.use("/api", cspReportRouter);
  afterEach(() => vi.restoreAllMocks());

  it("logs each violation on one line and answers 204", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { "document-uri": "https://myimpact.uk/", "effective-directive": "connect-src", "blocked-uri": "https://api.example/x" } }));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledWith("[csp] connect-src would block https://api.example/x on https://myimpact.uk/");
  });

  it("refuses oversized reports", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await request(app)
      .post("/api/csp-report")
      .set("Content-Type", "application/csp-report")
      .send(JSON.stringify({ "csp-report": { "document-uri": "x".repeat(20_000) } }));
    expect(res.status).toBe(413);
  });
});
