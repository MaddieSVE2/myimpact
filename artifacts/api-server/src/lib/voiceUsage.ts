import { db, voiceUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Monthly cap on transcribed audio per user. Defaults to 30 minutes
 * (1800 seconds) and is overridable via the VOICE_TRANSCRIBE_SECONDS_CAP
 * env var so we can tighten or loosen it without redeploying schema.
 */
export const TRANSCRIBE_SECONDS_CAP = (() => {
  const raw = Number(process.env.VOICE_TRANSCRIBE_SECONDS_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1800;
})();

/**
 * Monthly cap on TTS characters per user. Defaults to 60,000 chars
 * (~40 long replies). Overridable via VOICE_TTS_CHARACTERS_CAP.
 */
export const TTS_CHARACTERS_CAP = (() => {
  const raw = Number(process.env.VOICE_TTS_CHARACTERS_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60000;
})();

// Approximate unit costs in pence sterling. These exist purely to log a
// rough running spend estimate; the real OpenAI invoice is the source of
// truth. Numbers below assume gpt-4o-mini-transcribe at ~$0.003/min and
// gpt-audio TTS at ~$0.015/1k chars, converted at $1 ≈ £0.80.
export const PENCE_PER_TRANSCRIBE_SECOND = 0.004;
export const PENCE_PER_TTS_CHAR = 0.0012;

export const VOICE_CAP_REACHED_MESSAGE =
  "You've used your voice budget for this month — voice will be back next month, or upgrade your plan.";

export function currentMonthKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface VoiceUsageSummary {
  yearMonth: string;
  transcribeSeconds: number;
  ttsCharacters: number;
  transcribeSecondsCap: number;
  ttsCharactersCap: number;
  transcribeSecondsRemaining: number;
  ttsCharactersRemaining: number;
  estimatedCostPence: number;
  capReached: boolean;
}

export async function getUserVoiceUsage(userId: string): Promise<VoiceUsageSummary> {
  const yearMonth = currentMonthKey();
  const row = await db.query.voiceUsageTable.findFirst({
    where: and(
      eq(voiceUsageTable.userId, userId),
      eq(voiceUsageTable.yearMonth, yearMonth)
    ),
  });
  const transcribeSeconds = row?.transcribeSeconds ?? 0;
  const ttsCharacters = row?.ttsCharacters ?? 0;
  const transcribeSecondsRemaining = Math.max(0, TRANSCRIBE_SECONDS_CAP - transcribeSeconds);
  const ttsCharactersRemaining = Math.max(0, TTS_CHARACTERS_CAP - ttsCharacters);
  return {
    yearMonth,
    transcribeSeconds,
    ttsCharacters,
    transcribeSecondsCap: TRANSCRIBE_SECONDS_CAP,
    ttsCharactersCap: TTS_CHARACTERS_CAP,
    transcribeSecondsRemaining,
    ttsCharactersRemaining,
    estimatedCostPence:
      transcribeSeconds * PENCE_PER_TRANSCRIBE_SECOND +
      ttsCharacters * PENCE_PER_TTS_CHAR,
    capReached: transcribeSecondsRemaining <= 0 || ttsCharactersRemaining <= 0,
  };
}

export async function recordTranscribeUsage(userId: string, seconds: number): Promise<void> {
  if (!(seconds > 0)) return;
  const yearMonth = currentMonthKey();
  const intSeconds = Math.max(1, Math.round(seconds));
  await db
    .insert(voiceUsageTable)
    .values({
      userId,
      yearMonth,
      transcribeSeconds: intSeconds,
      ttsCharacters: 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [voiceUsageTable.userId, voiceUsageTable.yearMonth],
      set: {
        transcribeSeconds: sql`${voiceUsageTable.transcribeSeconds} + ${intSeconds}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Atomically reserve `seconds` of transcription quota for a user, enforcing
 * `cap` in a single SQL statement so that concurrent requests cannot all read
 * the same remaining balance and race past the monthly limit.
 *
 * Returns `true` if the quota was reserved (usage row updated/inserted within
 * the cap), or `false` if the increment would exceed the cap.
 */
export async function atomicReserveTranscribeSeconds(
  userId: string,
  seconds: number,
  cap: number,
): Promise<boolean> {
  if (!(seconds > 0)) return true;
  const yearMonth = currentMonthKey();
  const intSeconds = Math.max(1, Math.round(seconds));

  // Reject immediately if this single clip alone exceeds the cap — avoids
  // inserting an over-cap row on the brand-new-user (INSERT) path.
  if (intSeconds > cap) return false;

  // The ON CONFLICT ... WHERE clause is only evaluated for the UPDATE branch.
  // If the condition fails (adding intSeconds would exceed cap) PostgreSQL
  // performs a no-op and returns zero rows, which we treat as "cap exceeded".
  // For a brand-new row (INSERT path) intSeconds <= cap is guaranteed above.
  const result = await db.execute(sql`
    INSERT INTO voice_usage (user_id, year_month, transcribe_seconds, tts_characters, updated_at)
    VALUES (${userId}, ${yearMonth}, ${intSeconds}, 0, NOW())
    ON CONFLICT (user_id, year_month) DO UPDATE
      SET transcribe_seconds = voice_usage.transcribe_seconds + ${intSeconds},
          updated_at = NOW()
      WHERE voice_usage.transcribe_seconds + ${intSeconds} <= ${cap}
    RETURNING transcribe_seconds
  `);

  // Zero rows returned means the UPDATE WHERE clause blocked the increment.
  return result.rows.length > 0;
}

export async function recordTtsUsage(userId: string, characters: number): Promise<void> {
  if (!(characters > 0)) return;
  const yearMonth = currentMonthKey();
  const intChars = Math.max(1, Math.round(characters));
  await db
    .insert(voiceUsageTable)
    .values({
      userId,
      yearMonth,
      transcribeSeconds: 0,
      ttsCharacters: intChars,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [voiceUsageTable.userId, voiceUsageTable.yearMonth],
      set: {
        ttsCharacters: sql`${voiceUsageTable.ttsCharacters} + ${intChars}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Atomically reserve `characters` of TTS quota for a user, enforcing `cap`
 * in a single SQL statement so that concurrent requests cannot all read the
 * same remaining balance and race past the monthly limit.
 *
 * Returns `true` if the quota was reserved (usage row updated/inserted within
 * the cap), or `false` if the increment would exceed the cap.
 */
export async function atomicReserveTtsChars(
  userId: string,
  characters: number,
  cap: number,
): Promise<boolean> {
  if (!(characters > 0)) return true;
  const yearMonth = currentMonthKey();
  const intChars = Math.max(1, Math.round(characters));

  if (intChars > cap) return false;

  const result = await db.execute(sql`
    INSERT INTO voice_usage (user_id, year_month, transcribe_seconds, tts_characters, updated_at)
    VALUES (${userId}, ${yearMonth}, 0, ${intChars}, NOW())
    ON CONFLICT (user_id, year_month) DO UPDATE
      SET tts_characters = voice_usage.tts_characters + ${intChars},
          updated_at = NOW()
      WHERE voice_usage.tts_characters + ${intChars} <= ${cap}
    RETURNING tts_characters
  `);

  return result.rows.length > 0;
}

/**
 * Return the duration of an audio buffer in seconds using ffprobe. If
 * ffprobe is not available or the buffer is unreadable, returns 0 (in
 * which case the caller should fall back to a length-based estimate so
 * we never undercount usage).
 */
export async function probeAudioDurationSeconds(buffer: Buffer): Promise<number> {
  const inputPath = join(tmpdir(), `voice-probe-${randomUUID()}`);
  try {
    await writeFile(inputPath, buffer);
    return await new Promise<number>((resolve) => {
      const ffprobe = spawn("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ]);
      let out = "";
      ffprobe.stdout.on("data", (d) => {
        out += d.toString();
      });
      ffprobe.stderr.on("data", () => {});
      ffprobe.on("close", () => {
        const seconds = parseFloat(out.trim());
        resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
      });
      ffprobe.on("error", () => resolve(0));
    });
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

export function estimateTranscribeCostPence(seconds: number): number {
  return seconds * PENCE_PER_TRANSCRIBE_SECOND;
}

export function estimateTtsCostPence(characters: number): number {
  return characters * PENCE_PER_TTS_CHAR;
}
