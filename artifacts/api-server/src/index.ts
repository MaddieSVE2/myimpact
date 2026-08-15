// IMPORTANT: Sentry must be initialized BEFORE any other module that wires up
// Express / OpenTelemetry instrumentation. In ESM, static imports are hoisted,
// so we initialize Sentry first and then dynamically import the rest of the
// app inside an async bootstrap function.
import { initSentry } from "./lib/sentry.js";

initSentry();

async function bootstrap(): Promise<void> {
  const { default: app } = await import("./app.js");
  const { startWebhookDispatcher } = await import("./lib/webhookDispatcher.js");
  const { startAttachmentGCJob } = await import("./lib/attachmentGC.js");
  const { startAiSpendAlertJob } = await import("./lib/aiSpendAlert.js");
  const { startInflightReservationSweepJob } = await import("./lib/aiUsage.js");
  const { startRetentionCleanupJob, ensureAnalyticsDailySummaryTable } = await import("./lib/retentionCleanup.js");
  const { startPremappedRefreshJob } = await import("./lib/premappedCharities.js");
  const { startApprovalDigestJob } = await import("./lib/approvalDigest.js");
  const { seedProxies } = await import("./lib/proxyStore.js");
  const { runProxyRepairSweep } = await import("./lib/proxyRepair.js");
  const { runVoiceAccentBackfill } = await import("./lib/voiceAccentBackfill.js");

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN === "true") {
    console.warn(
      "[SECURITY WARNING] ENABLE_DEMO_LOGIN=true is set in a production environment. " +
      "This bypasses email ownership verification for demo accounts. " +
      "Unset ENABLE_DEMO_LOGIN unless demo access is intentionally required."
    );
  }

  if (process.env.ENABLE_DEMO_LOGIN === "true") {
    const { seedDemo, seedUniversity } = await import("./scripts/seed-demo.js");
    seedDemo()
      .then(() => seedUniversity())
      .catch((err) => {
        console.error("[seed-demo] Seed failed (non-fatal):", err);
      });
  }

  if (!process.env.APP_URL && !process.env.REPLIT_DEV_DOMAIN) {
    console.warn(
      "[CONFIG WARNING] Neither APP_URL nor REPLIT_DEV_DOMAIN is set. " +
      "Magic-link emails will fail. Set APP_URL to the canonical application URL."
    );
  }

  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startWebhookDispatcher();
    startAttachmentGCJob();
    startAiSpendAlertJob();
    startInflightReservationSweepJob();
    // Ensure analytics_daily_summary exists before the cleanup job runs.
    // Production databases can't be reached from dev, so this CREATE IF NOT
    // EXISTS guard heals prod on first deploy after migration 0033.
    ensureAnalyticsDailySummaryTable()
      .then(() => startRetentionCleanupJob())
      .catch((err) => {
        console.error("[retention-cleanup] Failed to ensure analytics_daily_summary table (non-fatal):", err);
        startRetentionCleanupJob();
      });
    startPremappedRefreshJob();
    startApprovalDigestJob();
    // Seed the proxies table from proxyData.json (insert-only), then run the
    // one-shot repair sweep for records valued with undeflated long-horizon
    // proxies. Both are idempotent and non-fatal.
    seedProxies()
      .then(() => runProxyRepairSweep())
      .catch((err) => console.error("[proxy-seed] Failed (non-fatal):", err));
    // Idempotent one-shot backfill: British is now the default Sidekick accent.
    runVoiceAccentBackfill().catch((err) =>
      console.error("[voice-accent-backfill] Failed (non-fatal):", err)
    );
  });
}

bootstrap().catch((err) => {
  console.error("[bootstrap] failed to start server:", err);
  process.exit(1);
});
