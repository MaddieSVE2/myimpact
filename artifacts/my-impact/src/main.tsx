import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Defer Sentry so its SDK stays out of the initial bundle and off the
// critical path. initSentry() dynamically imports the SDK; kicking it off
// at idle time keeps first-paint JS small while still catching errors.
import { initSentry } from "./lib/sentry";
if ("requestIdleCallback" in window) {
  requestIdleCallback(() => initSentry(), { timeout: 4000 });
} else {
  setTimeout(initSentry, 3000);
}

// Service worker registration is handled inside <ServiceWorkerUpdatePrompt />
// so it can show an in-app toast when a new version is waiting.

createRoot(document.getElementById("root")!).render(<App />);
