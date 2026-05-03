import { db, textAiUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import { currentMonthKey } from "./voiceUsage.js";

/**
 * Monthly per-user cap on text AI requests (all paid chat-completion routes
 * combined). Defaults to 500 and is overridable via TEXT_AI_MONTHLY_CAP so
 * the limit can be adjusted without a redeploy.
 *
 * 500 requests/month is generous for legitimate personal use (~16/day) while
 * still bounding worst-case OpenAI spend for a single compromised account.
 */
export const TEXT_AI_MONTHLY_CAP = (() => {
  const raw = Number(process.env.TEXT_AI_MONTHLY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 500;
})();

export const TEXT_AI_CAP_REACHED_MESSAGE =
  "You've reached your monthly AI usage limit. Usage resets at the start of next month.";

/**
 * Atomically increment the current-month request count for `userId` and
 * enforce `cap` in a single SQL statement, preventing concurrent requests
 * from racing past the monthly limit.
 *
 * Returns `true` if the increment was applied (request is within quota), or
 * `false` if incrementing would exceed the cap.
 */
export async function atomicIncrementTextAiUsage(
  userId: string,
  cap: number = TEXT_AI_MONTHLY_CAP,
): Promise<boolean> {
  const yearMonth = currentMonthKey();

  // Pre-check: a single request can never exceed the cap on its own, but
  // guard against a misconfigured/zero cap edge case.
  if (cap <= 0) return false;

  // Atomic upsert: the WHERE clause on DO UPDATE prevents the increment when
  // request_count is already at or above the cap, returning no rows in that
  // case.  For the INSERT path (new row this month), the inserted value is 1
  // which is always <= cap given the pre-check above.
  const result = await db.execute(sql`
    INSERT INTO text_ai_usage (user_id, year_month, request_count, updated_at)
    VALUES (${userId}, ${yearMonth}, 1, NOW())
    ON CONFLICT (user_id, year_month) DO UPDATE
      SET request_count = text_ai_usage.request_count + 1,
          updated_at = NOW()
      WHERE text_ai_usage.request_count < ${cap}
    RETURNING request_count
  `);

  return result.rows.length > 0;
}

/**
 * Express middleware that enforces a durable per-user monthly quota for paid
 * text AI routes. Atomically increments the request count before the route
 * handler runs and rejects with 429 if the cap is reached.
 *
 * Must be placed after `authenticate` so `req.user` is available.
 */
export function textAiQuota(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as AuthenticatedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorised" });
    return;
  }

  atomicIncrementTextAiUsage(userId)
    .then(allowed => {
      if (!allowed) {
        res.status(429).json({
          error: TEXT_AI_CAP_REACHED_MESSAGE,
          code: "text_ai_cap_reached",
        });
        return;
      }
      next();
    })
    .catch(err => {
      console.error("[text-ai-quota] usage check error:", err);
      res.status(503).json({ error: "Service temporarily unavailable. Please try again shortly." });
    });
}

export async function getTextAiUsage(userId: string): Promise<{ requestCount: number; cap: number; remaining: number }> {
  const yearMonth = currentMonthKey();
  const row = await db.query.textAiUsageTable.findFirst({
    where: and(
      eq(textAiUsageTable.userId, userId),
      eq(textAiUsageTable.yearMonth, yearMonth)
    ),
  });
  const requestCount = row?.requestCount ?? 0;
  const cap = TEXT_AI_MONTHLY_CAP;
  return { requestCount, cap, remaining: Math.max(0, cap - requestCount) };
}
