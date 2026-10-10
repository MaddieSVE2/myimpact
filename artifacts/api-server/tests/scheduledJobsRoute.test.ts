import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

const runner = vi.hoisted(() => ({
  dueJobIds: vi.fn(),
  runScheduledJob: vi.fn(),
}));
vi.mock("../src/jobs/runner.js", () => runner);

import scheduledJobsRouter from "../src/routes/scheduled-jobs.js";

const TOKEN = "t".repeat(40);
const app = express();
app.use("/api", scheduledJobsRouter);

const due = () => request(app).post("/api/internal/scheduled-jobs/due");
const run = (id: string, query = "") => request(app).post(`/api/internal/scheduled-jobs/run/${id}${query}`);

describe("scheduled jobs trigger", () => {
  beforeEach(() => {
    process.env.SCHEDULED_JOBS_TOKEN = TOKEN;
    runner.dueJobIds.mockResolvedValue(["onboarding-emails", "calendar-sync"]);
    runner.runScheduledJob.mockResolvedValue({ status: "ran", ok: true, ms: 5 });
  });
  afterEach(() => {
    delete process.env.SCHEDULED_JOBS_TOKEN;
    vi.clearAllMocks();
  });

  describe("fails closed", () => {
    it("refuses every request when no token is configured", async () => {
      delete process.env.SCHEDULED_JOBS_TOKEN;
      expect((await due().set("Authorization", "Bearer ")).status).toBe(503);
      expect((await run("onboarding-emails")).status).toBe(503);
      expect(runner.runScheduledJob).not.toHaveBeenCalled();
    });

    it("treats a short token as not configured", async () => {
      process.env.SCHEDULED_JOBS_TOKEN = "short";
      expect((await due().set("Authorization", "Bearer short")).status).toBe(503);
    });

    it("rejects a missing or wrong token", async () => {
      expect((await due()).status).toBe(401);
      expect((await due().set("Authorization", `Bearer ${"x".repeat(40)}`)).status).toBe(401);
      expect((await due().set("Authorization", TOKEN)).status).toBe(401);
      expect((await run("onboarding-emails").set("Authorization", "Bearer nope")).status).toBe(401);
      expect(runner.dueJobIds).not.toHaveBeenCalled();
      expect(runner.runScheduledJob).not.toHaveBeenCalled();
    });
  });

  it("lists the due jobs", async () => {
    const res = await due().set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ due: ["onboarding-emails", "calendar-sync"] });
  });

  it("runs one job, only forcing it when asked", async () => {
    const res = await run("calendar-sync").set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "calendar-sync", status: "ran", ok: true });
    expect(runner.runScheduledJob).toHaveBeenCalledWith("calendar-sync", { force: false });

    await run("calendar-sync", "?force=1").set("Authorization", `Bearer ${TOKEN}`);
    expect(runner.runScheduledJob).toHaveBeenLastCalledWith("calendar-sync", { force: true });
  });

  it("reports a failed job as a server error so the workflow fails", async () => {
    runner.runScheduledJob.mockResolvedValue({ status: "ran", ok: false, ms: 5, error: "boom" });
    const res = await run("monthly-digest").set("Authorization", `Bearer ${TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("boom");
  });

  it("returns 409 while another job holds the lock", async () => {
    runner.runScheduledJob.mockResolvedValue({ status: "busy" });
    expect((await run("push-reminders").set("Authorization", `Bearer ${TOKEN}`)).status).toBe(409);
  });

  it("returns 404 for an unknown job without running anything", async () => {
    expect((await run("no-such-job").set("Authorization", `Bearer ${TOKEN}`)).status).toBe(404);
    expect(runner.runScheduledJob).not.toHaveBeenCalled();
  });

  describe("run-due (cron-job.org)", () => {
    const CRON_TOKEN = "c".repeat(40);
    const runDue = () => request(app).post("/api/internal/scheduled-jobs/run-due");
    beforeEach(() => {
      process.env.SCHEDULED_JOBS_CRON_TOKEN = CRON_TOKEN;
    });
    afterEach(() => {
      delete process.env.SCHEDULED_JOBS_CRON_TOKEN;
      vi.restoreAllMocks();
    });

    it("runs every due job in turn, never forcing one", async () => {
      const res = await runDue().set("Authorization", `Bearer ${CRON_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        failed: [],
        jobs: [
          { id: "onboarding-emails", status: "ran", ok: true, ms: 5 },
          { id: "calendar-sync", status: "ran", ok: true, ms: 5 },
        ],
      });
      expect(runner.runScheduledJob.mock.calls).toEqual([["onboarding-emails"], ["calendar-sync"]]);
    });

    it("answers GET the same way", async () => {
      const res = await request(app).get("/api/internal/scheduled-jobs/run-due").set("Authorization", `Bearer ${CRON_TOKEN}`);
      expect(res.status).toBe(200);
      expect(runner.runScheduledJob).toHaveBeenCalledTimes(2);
    });

    it("takes the full token too", async () => {
      expect((await runDue().set("Authorization", `Bearer ${TOKEN}`)).status).toBe(200);
    });

    it("gives the cron token nothing else", async () => {
      expect((await due().set("Authorization", `Bearer ${CRON_TOKEN}`)).status).toBe(401);
      expect((await run("push-reminders", "?force=1").set("Authorization", `Bearer ${CRON_TOKEN}`)).status).toBe(401);
      expect(runner.runScheduledJob).not.toHaveBeenCalled();
    });

    it("fails closed, and rejects a wrong token", async () => {
      expect((await runDue().set("Authorization", `Bearer ${"x".repeat(40)}`)).status).toBe(401);
      delete process.env.SCHEDULED_JOBS_TOKEN;
      process.env.SCHEDULED_JOBS_CRON_TOKEN = "short";
      expect((await runDue().set("Authorization", "Bearer short")).status).toBe(503);
      expect(runner.dueJobIds).not.toHaveBeenCalled();
    });

    it("reports a failure as a 500 without the error text, and still runs the rest", async () => {
      runner.runScheduledJob
        .mockResolvedValueOnce({ status: "ran", ok: false, ms: 5, error: "Resend said no for someone@example.org" })
        .mockResolvedValueOnce({ status: "ran", ok: true, ms: 5 });
      const res = await runDue().set("Authorization", `Bearer ${CRON_TOKEN}`);
      expect(res.status).toBe(500);
      expect(res.body.failed).toEqual(["onboarding-emails"]);
      expect(JSON.stringify(res.body)).not.toContain("example.org");
      expect(runner.runScheduledJob).toHaveBeenCalledTimes(2);
    });

    it("stops starting jobs once its time is up, leaving them due", async () => {
      let now = 1_000_000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      runner.dueJobIds.mockResolvedValue(["database-backup", "retention-cleanup", "activity-reminders"]);
      runner.runScheduledJob.mockImplementation(async () => {
        now += 25_000;
        return { status: "ran", ok: true, ms: 25_000 };
      });
      const res = await runDue().set("Authorization", `Bearer ${CRON_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.jobs.map((j: { id: string; status: string }) => `${j.id}:${j.status}`)).toEqual([
        "database-backup:ran",
        "retention-cleanup:deferred",
        "activity-reminders:deferred",
      ]);
    });

    it("passes on a busy lock without failing", async () => {
      runner.runScheduledJob.mockResolvedValue({ status: "busy" });
      const res = await runDue().set("Authorization", `Bearer ${CRON_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.jobs[0]).toEqual({ id: "onboarding-emails", status: "busy" });
    });
  });
});
