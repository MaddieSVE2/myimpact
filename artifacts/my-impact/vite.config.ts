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

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
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
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
