/**
 * Pre-generate local charity suggestions for the most common UK areas.
 *
 * One-off / re-runnable seed routine: runs the same generateForAuthority
 * pipeline used by the on-demand path for a curated list of the largest UK
 * local authorities (top ~40 by population), sequentially and throttled.
 *
 * Safe to run in production:
 *   - Respects the existing 30-day freshness window: authorities generated
 *     within the last 30 days are skipped, so re-runs cost (almost) nothing.
 *   - Runs one authority at a time with a pause between each, so AI and
 *     charity-register load stays gentle.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server seed:local-charities
 *   ... seed:local-charities --dry-run      # show what would run, no AI calls
 *   ... seed:local-charities --force        # ignore freshness, regenerate all
 *   ... seed:local-charities --limit 10     # only process the first N
 */
import { db, pool, localCharityAreasTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateForAuthority, SEED_AUTHORITIES } from "../lib/premappedCharities.js";

const FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // match REFRESH_AFTER_MS
const THROTTLE_BETWEEN_AUTHORITIES_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SeedOptions {
  dryRun: boolean;
  force: boolean;
  limit: number;
}

function parseArgs(argv: string[]): SeedOptions {
  const opts: SeedOptions = { dryRun: false, force: false, limit: SEED_AUTHORITIES.length };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--limit requires a positive integer, got: ${argv[i]}`);
      }
      opts.limit = n;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function isFresh(localAuthority: string): Promise<boolean> {
  const [area] = await db
    .select({
      status: localCharityAreasTable.status,
      lastGeneratedAt: localCharityAreasTable.lastGeneratedAt,
    })
    .from(localCharityAreasTable)
    .where(eq(localCharityAreasTable.localAuthority, localAuthority));

  if (!area || area.status !== "ready" || !area.lastGeneratedAt) return false;
  return Date.now() - area.lastGeneratedAt.getTime() < FRESH_WINDOW_MS;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const targets = SEED_AUTHORITIES.slice(0, opts.limit);

  console.log(
    `[seed-local-charities] Starting: ${targets.length} authorities` +
      `${opts.dryRun ? " (dry run)" : ""}${opts.force ? " (force)" : ""}`
  );

  let generated = 0;
  let skippedFresh = 0;
  let failed = 0;

  for (const { localAuthority, country } of targets) {
    if (!opts.force && (await isFresh(localAuthority))) {
      skippedFresh++;
      console.log(`[seed-local-charities] SKIP (fresh) ${localAuthority}`);
      continue;
    }

    if (opts.dryRun) {
      generated++;
      console.log(`[seed-local-charities] WOULD GENERATE ${localAuthority} (${country})`);
      continue;
    }

    console.log(`[seed-local-charities] Generating ${localAuthority} (${country})...`);
    const started = Date.now();
    try {
      // Ensure the area row exists so status/lastGeneratedAt updates land.
      await db
        .insert(localCharityAreasTable)
        .values({ localAuthority, country, status: "pending" })
        .onConflictDoNothing();

      await generateForAuthority(localAuthority, country);
      generated++;
      console.log(
        `[seed-local-charities] Done ${localAuthority} in ${Math.round((Date.now() - started) / 1000)}s`
      );
    } catch (err) {
      failed++;
      console.error(`[seed-local-charities] FAILED ${localAuthority}:`, err);
    }

    await sleep(THROTTLE_BETWEEN_AUTHORITIES_MS);
  }

  console.log(
    `[seed-local-charities] Finished. generated=${generated} skipped_fresh=${skippedFresh} failed=${failed}`
  );

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[seed-local-charities] Unhandled error:", err);
  pool.end().finally(() => process.exit(1));
});
