import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for the web app's own logic (src/**/*.test.ts). Kept apart from
// vite.config.ts, which needs the Replit dev-server settings.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
