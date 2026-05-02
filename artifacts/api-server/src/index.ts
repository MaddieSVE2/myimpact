import app from "./app";
import { startWebhookDispatcher } from "./lib/webhookDispatcher.js";

if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN === "true") {
  console.warn(
    "[SECURITY WARNING] ENABLE_DEMO_LOGIN=true is set in a production environment. " +
    "This bypasses email ownership verification for demo accounts. " +
    "Unset ENABLE_DEMO_LOGIN unless demo access is intentionally required."
  );
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
});
