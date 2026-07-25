import { db, analyticsEventsTable, pageViewsTable } from "@workspace/db";
import { lt, sql } from "drizzle-orm";

/**
 * Retention window for raw activity logs (page views and raw analytics
 * events). Rows older than this are deleted automatically so the tables
 * stay a bounded size as the user base grows.
 *
 * Before deletion, daily aggregate counts (event name × surface × day)
 * are archived into `analytics_daily_summary` so long-term trends (e.g.
 * year-over-year growth) survive even though the raw rows are gone.
 * Legacy `page_views` rows are archived under the event name
 * "page_view_legacy" (member surface) so they don't double-count the
 * mirrored "page_view" analytics events.
 *
 * Deliberately NOT cleaned up here:
 *  - user_audit_log: GDPR-relevant, small, and legally useful long-term.
 *  - voice_usage / AI usage: kept for billing history.
 *
 * The admin UI labels analytics sections with this window, so keep the
 * two in sync via /api/analytics/admin/funnels (which reports it).
 */
export const ACTIVITY_LOG_RETENTION_DAYS = 90;

/** Event name used when archiving legacy page_views rows. */
export const LEGACY_PAGE_VIEW_EVENT = "page_view_legacy";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STARTUP_DELAY_MS = 60 * 1000; // let the process settle first

/**
 * Archive daily aggregate counts for rows about to be deleted, then delete
 * them. Archive + delete run inside one transaction per table so a failure
 * can never lose data (nothing deleted) or double-count (nothing archived
 * twice — the upsert only ever pairs with the delete that follows it).
 * Returns the number of rows removed from each table (for logging/tests).
 */
export async function runRetentionCleanup(): Promise<{
  pageViewsDeleted: number;
  analyticsEventsDeleted: number;
}> {
  const cutoff = new Date(Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const pageViewsDeleted = await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO analytics_daily_summary (day, event_name, surface, count)
      SELECT visited_at::date, ${LEGACY_PAGE_VIEW_EVENT}, 'member', count(*)::int
      FROM page_views
      WHERE visited_at < ${cutoff}
      GROUP BY visited_at::date
      ON CONFLICT (day, event_name, surface)
      DO UPDATE SET count = analytics_daily_summary.count + EXCLUDED.count
    `);
    const deleted = await tx
      .delete(pageViewsTable)
      .where(lt(pageViewsTable.visitedAt, cutoff))
      .returning({ id: pageViewsTable.id });
    return deleted.length;
  });

  const analyticsEventsDeleted = await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO analytics_daily_summary (day, event_name, surface, count)
      SELECT created_at::date, event_name, surface, count(*)::int
      FROM analytics_events
      WHERE created_at < ${cutoff}
      GROUP BY created_at::date, event_name, surface
      ON CONFLICT (day, event_name, surface)
      DO UPDATE SET count = analytics_daily_summary.count + EXCLUDED.count
    `);
    const deleted = await tx
      .delete(analyticsEventsTable)
      .where(lt(analyticsEventsTable.createdAt, cutoff))
      .returning({ id: analyticsEventsTable.id });
    return deleted.length;
  });

  const result = { pageViewsDeleted, analyticsEventsDeleted };

  if (result.pageViewsDeleted > 0 || result.analyticsEventsDeleted > 0) {
    console.log(
      `[retention-cleanup] Archived daily aggregates, then deleted ${result.pageViewsDeleted} page view(s) and ` +
        `${result.analyticsEventsDeleted} analytics event(s) older than ${ACTIVITY_LOG_RETENTION_DAYS} days.`,
    );
  }

  return result;
}

/**
 * Schedule the daily retention cleanup. Runs shortly after startup and
 * then every 24 hours. Because it is tied to the API server process it
 * runs in both development and production without extra configuration.
 * Timers are unref'd so they never block process shutdown.
 */
export function startRetentionCleanupJob(): void {
  const startup = setTimeout(() => {
    runRetentionCleanup().catch((err) => {
      console.error("[retention-cleanup] run failed:", err);
    });
    const recurring = setInterval(() => {
      runRetentionCleanup().catch((err) => {
        console.error("[retention-cleanup] run failed:", err);
      });
    }, CLEANUP_INTERVAL_MS);
    recurring.unref?.();
  }, STARTUP_DELAY_MS);
  startup.unref?.();
  console.log(
    `[retention-cleanup] scheduled daily cleanup (retention ${ACTIVITY_LOG_RETENTION_DAYS} days)`,
  );
}
