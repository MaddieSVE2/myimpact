import type { Request, Response, NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, aiUsageTable } from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

/**
 * Tiered AI usage controls for Sidekick. The model is "burst → quota →
 * budget":
 *   - burst: per-IP and per-user-key rate limits (see rateLimiter helpers)
 *   - quota: per-day question count + per-month token total, applied to
 *     anonymous and signed-in callers separately, with in-flight
 *     reservations to close the parallel-burst race window
 *   - budget: a daily cron that estimates spend and emails admins once
 *     when the configured threshold is exceeded
 *
 * This file owns the persistence layer plus the in-process reservation
 * map. Spend alerting lives in `aiSpendAlert.ts`; routing is in
 * `routes/sidekick.ts`.
 */

// ---------------------------------------------------------------------------
// Configuration (all overridable via env vars; defaults live here)
// ---------------------------------------------------------------------------

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

export const AI_DAILY_LIMIT_ANON = envInt("AI_DAILY_LIMIT_ANON", 10);
export const AI_DAILY_LIMIT_USER = envInt("AI_DAILY_LIMIT_USER", 50);
export const AI_MONTHLY_TOKEN_LIMIT_ANON = envInt("AI_MONTHLY_TOKEN_LIMIT_ANON", 200_000);
export const AI_MONTHLY_TOKEN_LIMIT_USER = envInt("AI_MONTHLY_TOKEN_LIMIT_USER", 1_500_000);
export const AI_INFLIGHT_AVG_TOKENS = envInt("AI_INFLIGHT_AVG_TOKENS", 8000);
export const AI_BUDGET_ALERT_USD = envFloat("AI_BUDGET_ALERT_USD", 50);
export const AI_GPT5_MINI_INPUT_PRICE_PER_1K = envFloat("AI_GPT5_MINI_INPUT_PRICE_PER_1K", 0.00025);
export const AI_GPT5_MINI_OUTPUT_PRICE_PER_1K = envFloat("AI_GPT5_MINI_OUTPUT_PRICE_PER_1K", 0.002);

export const AI_BURST_PER_IP_PER_MIN = envInt("AI_BURST_PER_IP_PER_MIN", 10);
export const AI_BURST_PER_USER_PER_MIN = envInt("AI_BURST_PER_USER_PER_MIN", 30);

export const AI_DAILY_LIMIT_REACHED_MESSAGE = "Daily question limit reached. Please try again tomorrow.";
export const AI_MONTHLY_TOKEN_LIMIT_REACHED_MESSAGE = "Monthly AI usage limit reached. Please try again next month.";
export const AI_BURST_LIMIT_MESSAGE = "Too many AI requests. Please slow down.";

// ---------------------------------------------------------------------------
// User-key derivation
// ---------------------------------------------------------------------------

/**
 * Returns a stable identifier for the caller. Signed-in users get
 * `user:<id>`; anonymous callers fall back to `ip:<normalized>` (stripping
 * the IPv4-mapped IPv6 `::ffff:` prefix, and only honouring the FIRST hop
 * of `X-Forwarded-For` because the Replit platform proxy is the trusted
 * inbound and any further hops are user-controlled). Session-cookie ids
 * are honoured as a fallback when the IP is unavailable.
 */
export function getUserKey(req: Request): string {
  const userId = (req as AuthenticatedRequest).user?.id;
  if (userId) return `user:${userId}`;

  const xff = req.headers["x-forwarded-for"];
  let firstHop: string | undefined;
  if (typeof xff === "string" && xff.length > 0) {
    firstHop = xff.split(",")[0]?.trim();
  } else if (Array.isArray(xff) && xff.length > 0) {
    firstHop = String(xff[0]).split(",")[0]?.trim();
  }
  const ip = (firstHop || req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (ip) return `ip:${ip}`;

  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const sessionId = cookies.mi_session ?? cookies["connect.sid"];
  if (sessionId) return `sess:${sessionId.slice(0, 32)}`;

  return "ip:unknown";
}

export function isAuthenticatedKey(userKey: string): boolean {
  return userKey.startsWith("user:");
}

// ---------------------------------------------------------------------------
// Date / month helpers (UTC)
// ---------------------------------------------------------------------------

export function todayUtc(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function currentMonthRangeUtc(d: Date = new Date()): { start: string; end: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 10);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Quota lookup
// ---------------------------------------------------------------------------

export interface RemainingQuota {
  questionsLeft: number;
  tokensLeft: number;
  dailyLimit: number;
  monthlyTokenLimit: number;
  questionsUsedToday: number;
  tokensUsedThisMonth: number;
  isAuthenticated: boolean;
}

/**
 * Reads today's questionCount and the current UTC month's token sums for
 * `userKey`, applies the appropriate tier limits, and returns the remaining
 * budget. In-flight reservations are added on top by `getRemainingQuotaWithInflight`.
 */
export async function getRemainingQuota(userKey: string): Promise<RemainingQuota> {
  const isAuth = isAuthenticatedKey(userKey);
  const dailyLimit = isAuth ? AI_DAILY_LIMIT_USER : AI_DAILY_LIMIT_ANON;
  const monthlyTokenLimit = isAuth ? AI_MONTHLY_TOKEN_LIMIT_USER : AI_MONTHLY_TOKEN_LIMIT_ANON;
  const today = todayUtc();
  const { start, end } = currentMonthRangeUtc();

  const todayRows = await db
    .select({ questions: sql<number>`COALESCE(SUM(${aiUsageTable.questionCount}), 0)` })
    .from(aiUsageTable)
    .where(and(eq(aiUsageTable.userKey, userKey), eq(aiUsageTable.date, today)));
  const monthRows = await db
    .select({
      input: sql<number>`COALESCE(SUM(${aiUsageTable.inputTokens}), 0)`,
      output: sql<number>`COALESCE(SUM(${aiUsageTable.outputTokens}), 0)`,
    })
    .from(aiUsageTable)
    .where(and(
      eq(aiUsageTable.userKey, userKey),
      gte(aiUsageTable.date, start),
      sql`${aiUsageTable.date} < ${end}`,
    ));

  const questionsUsedToday = Number(todayRows[0]?.questions ?? 0);
  const tokensUsedThisMonth = Number(monthRows[0]?.input ?? 0) + Number(monthRows[0]?.output ?? 0);

  return {
    questionsLeft: Math.max(0, dailyLimit - questionsUsedToday),
    tokensLeft: Math.max(0, monthlyTokenLimit - tokensUsedThisMonth),
    dailyLimit,
    monthlyTokenLimit,
    questionsUsedToday,
    tokensUsedThisMonth,
    isAuthenticated: isAuth,
  };
}

// ---------------------------------------------------------------------------
// In-flight reservations
// ---------------------------------------------------------------------------

const inflightCounts = new Map<string, number>();

export function getInflightCount(userKey: string): number {
  return inflightCounts.get(userKey) ?? 0;
}

export function acquireInflight(userKey: string): void {
  inflightCounts.set(userKey, (inflightCounts.get(userKey) ?? 0) + 1);
}

export function releaseInflight(userKey: string): void {
  const next = (inflightCounts.get(userKey) ?? 1) - 1;
  if (next <= 0) inflightCounts.delete(userKey);
  else inflightCounts.set(userKey, next);
}

/**
 * Adds in-flight reservations (each pre-consuming one question and
 * `AI_INFLIGHT_AVG_TOKENS` tokens) on top of the persisted quota so that
 * 20 simultaneous requests from the same caller cannot all read the same
 * stale "remaining" balance and race past the daily cap. The caller that
 * holds the reservation ITSELF is excluded so its own slot doesn't count
 * twice when checking whether to admit it.
 */
export function applyInflightToQuota(quota: RemainingQuota, userKey: string, excludeSelf: boolean): RemainingQuota {
  const others = Math.max(0, getInflightCount(userKey) - (excludeSelf ? 1 : 0));
  if (others === 0) return quota;
  return {
    ...quota,
    questionsLeft: Math.max(0, quota.questionsLeft - others),
    tokensLeft: Math.max(0, quota.tokensLeft - others * AI_INFLIGHT_AVG_TOKENS),
    questionsUsedToday: quota.questionsUsedToday + others,
    tokensUsedThisMonth: quota.tokensUsedThisMonth + others * AI_INFLIGHT_AVG_TOKENS,
  };
}

// ---------------------------------------------------------------------------
// Atomic increment
// ---------------------------------------------------------------------------

export interface UsageDelta {
  countDelta?: number;
  toolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Atomic upsert of today's row for `(userKey, model)`, adding the supplied
 * deltas. `countDelta` defaults to 1 (one "question"); pass 0 for follow-up
 * model calls (e.g. suggested-question generation) that should still log
 * tokens but not burn a question.
 */
export async function incrementUsage(userKey: string, model: string, deltas: UsageDelta): Promise<void> {
  const countDelta = deltas.countDelta ?? 1;
  const toolCalls = deltas.toolCalls ?? 0;
  const inputTokens = deltas.inputTokens ?? 0;
  const outputTokens = deltas.outputTokens ?? 0;
  const date = todayUtc();
  await db.execute(sql`
    INSERT INTO ai_usage (user_key, date, model, question_count, tool_calls, input_tokens, output_tokens, updated_at)
    VALUES (${userKey}, ${date}, ${model}, ${countDelta}, ${toolCalls}, ${inputTokens}, ${outputTokens}, NOW())
    ON CONFLICT (user_key, date, model) DO UPDATE
      SET question_count = ai_usage.question_count + ${countDelta},
          tool_calls = ai_usage.tool_calls + ${toolCalls},
          input_tokens = ai_usage.input_tokens + ${inputTokens},
          output_tokens = ai_usage.output_tokens + ${outputTokens},
          updated_at = NOW()
  `);
}

// ---------------------------------------------------------------------------
// Burst limiters (express-rate-limit, stacked on the chat route)
// ---------------------------------------------------------------------------

/**
 * Per-IP burst limiter. Uses express-rate-limit's built-in IPv6-safe
 * `ipKeyGenerator` so dual-stack hosts don't accidentally share a bucket.
 * Returns a JSON 429 with `message` so the frontend toast can surface it.
 */
export const aiPerIpLimiter = rateLimit({
  windowMs: 60_000,
  max: AI_BURST_PER_IP_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  handler: (_req, res) => {
    res.status(429).json({ message: AI_BURST_LIMIT_MESSAGE, code: "ai_burst_ip" });
  },
});

/**
 * Per-user-key burst limiter. Keyed on the same user-key derivation used
 * by the quota gate so signed-in callers aren't lumped together by IP.
 */
export const aiPerUserLimiter = rateLimit({
  windowMs: 60_000,
  max: AI_BURST_PER_USER_PER_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getUserKey(req),
  handler: (_req, res) => {
    res.status(429).json({ message: AI_BURST_LIMIT_MESSAGE, code: "ai_burst_user" });
  },
});

// ---------------------------------------------------------------------------
// Quota gate middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that:
 *   1. derives the caller's user key,
 *   2. checks today's question count + month-to-date tokens against the
 *      tier limit (with in-flight reservations added on top),
 *   3. if under the cap, acquires an in-flight reservation and arranges
 *      for it to be released in `res.on("close"|"finish")`,
 *   4. exposes the user key on `res.locals.aiUserKey` for the route.
 *
 * Replaces the older `textAiQuota` middleware on the Sidekick chat route
 * only; other text-AI routes keep their existing per-user-id monthly cap.
 */
export function sidekickQuotaGate(req: Request, res: Response, next: NextFunction): void {
  const userKey = getUserKey(req);
  res.locals.aiUserKey = userKey;

  getRemainingQuota(userKey)
    .then((q) => {
      const withInflight = applyInflightToQuota(q, userKey, /* excludeSelf */ false);
      if (withInflight.questionsLeft <= 0) {
        res.status(429).json({
          message: AI_DAILY_LIMIT_REACHED_MESSAGE,
          code: "ai_daily_limit_reached",
        });
        return;
      }
      if (withInflight.tokensLeft <= 0) {
        res.status(429).json({
          message: AI_MONTHLY_TOKEN_LIMIT_REACHED_MESSAGE,
          code: "ai_monthly_token_limit_reached",
        });
        return;
      }
      acquireInflight(userKey);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releaseInflight(userKey);
      };
      res.on("close", release);
      res.on("finish", release);
      next();
    })
    .catch((err) => {
      console.error("[ai-usage] quota gate error", err);
      res.status(503).json({ message: "Service temporarily unavailable. Please try again shortly." });
    });
}

// ---------------------------------------------------------------------------
// Spend estimation
// ---------------------------------------------------------------------------

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1000) * AI_GPT5_MINI_INPUT_PRICE_PER_1K +
    (outputTokens / 1000) * AI_GPT5_MINI_OUTPUT_PRICE_PER_1K
  );
}

export interface MonthlyUsageRow {
  userKey: string;
  questionCount: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface MonthlyUsageReport {
  monthStart: string;
  monthEnd: string;
  rows: MonthlyUsageRow[];
  totals: {
    questionCount: number;
    toolCalls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

/** Sum the current UTC month's usage grouped by user_key. */
export async function getMonthlyUsageReport(): Promise<MonthlyUsageReport> {
  const { start, end } = currentMonthRangeUtc();
  const rows = await db
    .select({
      userKey: aiUsageTable.userKey,
      questions: sql<number>`COALESCE(SUM(${aiUsageTable.questionCount}), 0)`,
      tools: sql<number>`COALESCE(SUM(${aiUsageTable.toolCalls}), 0)`,
      input: sql<number>`COALESCE(SUM(${aiUsageTable.inputTokens}), 0)`,
      output: sql<number>`COALESCE(SUM(${aiUsageTable.outputTokens}), 0)`,
    })
    .from(aiUsageTable)
    .where(and(gte(aiUsageTable.date, start), sql`${aiUsageTable.date} < ${end}`))
    .groupBy(aiUsageTable.userKey);

  const out: MonthlyUsageRow[] = rows.map((r) => {
    const inputTokens = Number(r.input ?? 0);
    const outputTokens = Number(r.output ?? 0);
    return {
      userKey: r.userKey,
      questionCount: Number(r.questions ?? 0),
      toolCalls: Number(r.tools ?? 0),
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
    };
  }).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd);

  const totals = out.reduce(
    (acc, r) => {
      acc.questionCount += r.questionCount;
      acc.toolCalls += r.toolCalls;
      acc.inputTokens += r.inputTokens;
      acc.outputTokens += r.outputTokens;
      acc.estimatedCostUsd += r.estimatedCostUsd;
      return acc;
    },
    { questionCount: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
  );

  return { monthStart: start, monthEnd: end, rows: out, totals };
}

// Suppress "unused import" until/unless future code paths need lte.
void lte;
// Re-export so callers using just the middleware don't need a second import.
export type { Request, Response, NextFunction };
