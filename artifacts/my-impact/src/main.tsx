import { createRoot } from "react-dom/client";
import App from "./App";
import { initSentry } from "./lib/sentry";
import "./index.css";

initSentry();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}service-worker.js`
    );
  });
}

createRoot(document.getElementById("root")!).render(<App />);
