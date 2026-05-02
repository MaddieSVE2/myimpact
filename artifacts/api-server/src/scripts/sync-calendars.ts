/**
 * Calendar sync worker.
 *
 * Iterates every active `calendar_sources` row, pulls events in the window
 * [-24h, +30 days] from the provider via the Replit Connectors proxy,
 * applies the per-source filter, and upserts into `calendar_events`.
 *
 * Designed to run as a Replit Scheduled Deployment (recommended every
 * 15-30 minutes). Safe to invoke ad-hoc — `syncSource()` is idempotent.
 *
 * Flags:
 *   --prune       Also delete cached events whose end time is more than
 *                  60 days in the past.
 *   --once        (default) run a single sync pass and exit.
 */
import { pool } from "@workspace/db";
import { syncAllSources, pruneOldEvents } from "../lib/calendarSync.js";

async function main() {
  const args = process.argv.slice(2);
  const prune = args.includes("--prune");

  console.log(`[calendar-sync] starting at ${new Date().toISOString()}`);
  const summaries = await syncAllSources();

  let totalFetched = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalRemoved = 0;
  for (const s of summaries) {
    totalFetched += s.fetched;
    totalInserted += s.inserted;
    totalUpdated += s.updated;
    totalRemoved += s.removed;
  }

  console.log(
    `[calendar-sync] sources=${summaries.length} fetched=${totalFetched} inserted=${totalInserted} updated=${totalUpdated} removed=${totalRemoved}`,
  );

  if (prune) {
    const pruned = await pruneOldEvents();
    console.log(`[calendar-sync] pruned ${pruned} old cached events`);
  }
}

main()
  .catch((err) => {
    console.error("[calendar-sync] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
