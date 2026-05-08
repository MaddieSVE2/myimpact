import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
// Single source of truth for release tag: prefer SENTRY_RELEASE so the value
// stamped onto runtime events matches the release used during sourcemap upload.
// Fall back to VITE_SENTRY_RELEASE if only that is set.
const sentryRelease = process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE;
if (sentryRelease && !process.env.VITE_SENTRY_RELEASE) {
  process.env.VITE_SENTRY_RELEASE = sentryRelease;
}
const uploadSourceMaps = Boolean(sentryAuthToken && sentryOrg && sentryProject);

// Send no-cache headers on the HTML app shell (and the service worker
// itself) during dev/preview so a redeploy is always picked up by returning
// visitors instead of being shadowed by a stale browser/proxy cache.
// Hashed assets under /assets/ keep their default long-lived caching
// because their filenames change on every build. Production uses the
// dedicated `serve.mjs` static server which applies the same policy.
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

function noCacheHtmlHeaders(): Plugin {
  const setHeaders = (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    const path = url.split("?")[0];
    const isHtml =
      path === "/" ||
      path.endsWith("/") ||
      path.endsWith(".html") ||
      !/\.[a-zA-Z0-9]+$/.test(path); // SPA fallback paths with no extension
    const isServiceWorker = path.endsWith("/service-worker.js");
    if (isHtml || isServiceWorker) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  };
  return {
    name: "no-cache-html-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        setHeaders(req, res);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        setHeaders(req, res);
        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    noCacheHtmlHeaders(),
    ...(uploadSourceMaps
      ? [
          await import("@sentry/vite-plugin").then((m) =>
            m.sentryVitePlugin({
              org: sentryOrg!,
              project: sentryProject!,
              authToken: sentryAuthToken!,
              release: sentryRelease ? { name: sentryRelease } : undefined,
              sourcemaps: {
                filesToDeleteAfterUpload: ["**/*.js.map"],
              },
              telemetry: false,
            }),
          ),
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },
  // ESM worker output so the org PDF worker (which dynamically pulls in jspdf
  // chunks) can be code-split. Vite's default IIFE worker format errors when
  // a worker imports anything that triggers code-splitting.
  worker: {
    format: "es",
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // E2E test mode: proxy /api to the standalone api-server so the dev
    // stack matches the production same-origin layout. Off by default so
    // local dev (where the Replit proxy handles routing) is unaffected.
    proxy: process.env.VITE_E2E_API_PROXY
      ? {
          "/api": {
            target: process.env.VITE_E2E_API_PROXY,
            changeOrigin: true,
            secure: false,
          },
        }
      : undefined,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
