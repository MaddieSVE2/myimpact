import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

initSentry();

// Service worker registration is handled inside <ServiceWorkerUpdatePrompt />
// so it can show an in-app toast when a new version is waiting.

createRoot(document.getElementById("root")!).render(<App />);
