import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@workspace/db", () => import("./_mocks/db.js"));

const sendMock = vi.fn(async () => ({ id: "email-1" }));
vi.mock("../src/lib/resend.js", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: sendMock } },
    fromEmail: "My Impact <hello@myimpact.uk>",
  })),
}));

const adminEmailsMock = vi.fn<() => string[]>(() => ["admin@example.com"]);
vi.mock("../src/lib/adminEmails.js", () => ({
  getAdminEmails: () => adminEmailsMock(),
  isAdminEmail: (e: string) => adminEmailsMock().includes(e.toLowerCase()),
}));

const monthlyReportMock = vi.fn();
vi.mock("../src/lib/aiUsage.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/aiUsage.js")>(
    "../src/lib/aiUsage.js"
  );
  return {
    ...actual,
    getMonthlyUsageReport: () => monthlyReportMock(),
  };
});

import { dbState, dbMocks, resetDbState } from "./_mocks/db.js";
import { runSpendAlertCheck } from "../src/lib/aiSpendAlert.js";
import { AI_BUDGET_ALERT_USD } from "../src/lib/aiUsage.js";

function reportAt(usd: number) {
  return {
    monthStart: "2026-05-01",
    monthEnd: "2026-06-01",
    rows: [
      { userKey: "ip:1.2.3.4", questionCount: 1, toolCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: usd },
    ],
    totals: {
      questionCount: 1,
      toolCalls: 0,
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: usd,
    },
  };
}

beforeEach(() => {
  resetDbState();
  sendMock.mockClear();
  monthlyReportMock.mockReset();
  adminEmailsMock.mockReset();
  adminEmailsMock.mockReturnValue(["admin@example.com"]);
  dbMocks.execute.mockClear();
  dbMocks.findFirst.mockClear();
});

describe("runSpendAlertCheck", () => {
  it("does NOT email when the estimated spend is below the threshold", async () => {
    monthlyReportMock.mockResolvedValueOnce(reportAt(AI_BUDGET_ALERT_USD - 1));
    await runSpendAlertCheck();
    expect(sendMock).not.toHaveBeenCalled();
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("emails admins and persists the send timestamp when the threshold is crossed", async () => {
    monthlyReportMock.mockResolvedValueOnce(reportAt(AI_BUDGET_ALERT_USD + 0.5));
    dbState.alertState = null; // never alerted before

    await runSpendAlertCheck();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0] as { to: string[]; subject: string };
    expect(call.to).toEqual(["admin@example.com"]);
    expect(call.subject).toContain("AI spend alert");
    // Records into ai_alert_state.
    expect(dbMocks.execute).toHaveBeenCalledTimes(1);
    const joined = dbState.executes[0].chunks.filter((c) => typeof c === "string").join(" ");
    expect(joined).toMatch(/INSERT INTO ai_alert_state/);
  });

  it("honours the 24h cooldown — does NOT re-send when the last alert is recent", async () => {
    monthlyReportMock.mockResolvedValueOnce(reportAt(AI_BUDGET_ALERT_USD * 2));
    dbState.alertState = {
      key: "monthly_budget",
      lastSentAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago
    };
    await runSpendAlertCheck();
    expect(sendMock).not.toHaveBeenCalled();
    // Cooldown skip path also does not re-record.
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("re-sends after the 24h cooldown window has elapsed", async () => {
    monthlyReportMock.mockResolvedValueOnce(reportAt(AI_BUDGET_ALERT_USD * 2));
    dbState.alertState = {
      key: "monthly_budget",
      lastSentAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago
    };
    await runSpendAlertCheck();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("skips sending when the admin recipient list is empty", async () => {
    monthlyReportMock.mockResolvedValueOnce(reportAt(AI_BUDGET_ALERT_USD * 3));
    adminEmailsMock.mockReturnValue([]); // ADMIN_EMAILS effectively unset and defaults wiped
    await runSpendAlertCheck();
    expect(sendMock).not.toHaveBeenCalled();
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("swallows errors from the underlying report so the cron loop never crashes", async () => {
    monthlyReportMock.mockRejectedValueOnce(new Error("boom"));
    await expect(runSpendAlertCheck()).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
