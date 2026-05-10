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

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN === "true") {
    console.warn(
      "[SECURITY WARNING] ENABLE_DEMO_LOGIN=true is set in a production environment. " +
      "This bypasses email ownership verification for demo accounts. " +
      "Unset ENABLE_DEMO_LOGIN unless demo access is intentionally required."
    );
  }

  if (process.env.ENABLE_DEMO_LOGIN === "true") {
    const { seedDemo } = await import("./scripts/seed-demo.js");
    seedDemo().catch((err) => {
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
  });
}

bootstrap().catch((err) => {
  console.error("[bootstrap] failed to start server:", err);
  process.exit(1);
});
