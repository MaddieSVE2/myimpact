import { describe, it, expect } from "vitest";
import { db, voiceUsageTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { voiceUsageCostPenceExpr } from "../src/lib/voiceUsage.js";

/**
 * Regression test for the production 22P02 crash:
 * `invalid input syntax for type integer: "0.004"`.
 *
 * The admin voice-usage leaderboard orders by an estimated-cost expression
 * that multiplies integer columns by decimal pence-per-unit constants. If
 * those constants are bound as bare parameters, Postgres types them against
 * the integer columns and rejects the query at plan time — even with zero
 * rows in the table. Executing the real query against the database is
 * therefore a faithful regression test regardless of table contents.
 */
describe("voice-usage cost ordering query", () => {
  it("executes ORDER BY cost expression without 22P02", async () => {
    const rows = await db
      .select({
        userId: voiceUsageTable.userId,
        transcribeSeconds: voiceUsageTable.transcribeSeconds,
        ttsCharacters: voiceUsageTable.ttsCharacters,
      })
      .from(voiceUsageTable)
      .orderBy(
        desc(voiceUsageCostPenceExpr()),
        desc(voiceUsageTable.transcribeSeconds),
        desc(voiceUsageTable.ttsCharacters),
      )
      .limit(5);
    expect(Array.isArray(rows)).toBe(true);
  });
});
