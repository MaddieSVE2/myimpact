import { db, analyticsEventsTable, pageViewsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

/**
 * Retention window for raw activity logs (page views and raw analytics
 * events). Rows older than this are deleted automatically so the tables
 * stay a bounded size as the user base grows.
 *
 * Deliberately NOT cleaned up here:
 *  - user_audit_log: GDPR-relevant, small, and legally useful long-term.
 *  - voice_usage / AI usage: kept for billing history.
 *
 * The admin UI labels analytics sections with this window, so keep the
 * two in sync via /api/analytics/admin/funnels (which reports it).
 */
export const ACTIVITY_LOG_RETENTION_DAYS = 90;

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STARTUP_DELAY_MS = 60 * 1000; // let the process settle first

/**
 * Delete raw activity rows older than the retention window. Returns the
 * number of rows removed from each table (for logging/tests).
 */
export async function runRetentionCleanup(): Promise<{
  pageViewsDeleted: number;
  analyticsEventsDeleted: number;
}> {
  const cutoff = new Date(Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deletedViews = await db
    .delete(pageViewsTable)
    .where(lt(pageViewsTable.visitedAt, cutoff))
    .returning({ id: pageViewsTable.id });

  const deletedEvents = await db
    .delete(analyticsEventsTable)
    .where(lt(analyticsEventsTable.createdAt, cutoff))
    .returning({ id: analyticsEventsTable.id });

  const result = {
    pageViewsDeleted: deletedViews.length,
    analyticsEventsDeleted: deletedEvents.length,
  };

  if (result.pageViewsDeleted > 0 || result.analyticsEventsDeleted > 0) {
    console.log(
      `[retention-cleanup] Deleted ${result.pageViewsDeleted} page view(s) and ` +
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
