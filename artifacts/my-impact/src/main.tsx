import { createRoot, hydrateRoot } from "react-dom/client";
import App, { PRERENDERED_ROUTE_PAGES } from "./App";
import { canHydratePrerender } from "./lib/prerender-hydration";
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

const root = document.getElementById("root")!;
// Reuse the prerendered page when it was rendered for exactly what this
// visitor would see; otherwise draw it from scratch (lib/prerender-hydration).
if (canHydratePrerender(root)) {
  // Load the page's code first: hydrating while it is still loading would
  // make React redraw the page as soon as anything above it updated. The
  // prerendered page stays on screen meanwhile.
  const page = PRERENDERED_ROUTE_PAGES[root.dataset.prerendered ?? ""];
  (page ? page.preload() : Promise.resolve()).then(
    () =>
      hydrateRoot(root, <App />, {
        // React redraws the affected part itself; log it so mismatches show up.
        onRecoverableError: (error) => console.warn("[hydrate] redrew a mismatched part of the page:", error),
      }),
    () => createRoot(root).render(<App />),
  );
} else {
  createRoot(root).render(<App />);
}
