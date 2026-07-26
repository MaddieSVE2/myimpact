import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * One-shot, idempotent startup sweep making the British accent the
 * site-wide default for Sidekick's spoken replies (migration 0042).
 * Runs inside the deployed app because the production database is not
 * reachable from development. Safe to run on every boot: the ALTER is a
 * no-op once applied and the UPDATE only touches rows still on the old
 * 'neutral' default.
 */
export async function runVoiceAccentBackfill(): Promise<void> {
  await db.execute(sql`ALTER TABLE users ALTER COLUMN voice_accent SET DEFAULT 'british'`);
  const result = await db.execute(
    sql`UPDATE users SET voice_accent = 'british' WHERE voice_accent = 'neutral'`
  );
  const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (updated > 0) {
    console.log(`[voice-accent-backfill] set ${updated} user(s) to the British default accent`);
  }
}
