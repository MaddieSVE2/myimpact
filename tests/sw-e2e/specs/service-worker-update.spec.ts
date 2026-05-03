import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const APP_DIR = resolve(REPO_ROOT, "artifacts", "my-impact");
const APP_DIST = resolve(APP_DIR, "dist", "public");
const MAIN_TSX = resolve(APP_DIR, "src", "main.tsx");
const SERVE_SCRIPT = resolve(APP_DIR, "serve.mjs");

/** Pick an OS-assigned free TCP port. */
async function getFreePort(): Promise<number> {
  return await new Promise((resolveFn, rejectFn) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rejectFn);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolveFn(port));
      } else {
        srv.close();
        rejectFn(new Error("Could not allocate a free port"));
      }
    });
  });
}

/** Run a vite build of the my-impact app and return where the dist landed. */
function buildApp(): void {
  execFileSync("pnpm", ["--filter", "@workspace/my-impact", "run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      // Keep the build deterministic for the test; never upload sourcemaps.
      SENTRY_AUTH_TOKEN: "",
      SENTRY_ORG: "",
      SENTRY_PROJECT: "",
      NODE_ENV: "production",
    },
  });
}

/** Start serve.mjs as a subprocess with STATIC_ROOT pointing at `root`. */
async function startStaticServer(
  root: string,
  port: number,
): Promise<ChildProcess> {
  const proc = spawn("node", [SERVE_SCRIPT], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      STATIC_ROOT: root,
      HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (d) => process.stdout.write(`[serve] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[serve] ${d}`));

  // Wait until the server starts accepting connections.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return proc;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill("SIGKILL");
  throw new Error(`Static server on port ${port} never came up`);
}

async function stopServer(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  await new Promise<void>((resolveFn) => {
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already gone
      }
      resolveFn();
    }, 5_000);
    proc.once("exit", () => {
      clearTimeout(t);
      resolveFn();
    });
  });
}

/** Read the entry-bundle URL Vite injected into the built index.html. */
function entryScriptFromHtml(html: string): string {
  // Vite emits a single `<script type="module" crossorigin src="…">` tag
  // that points at the hashed entry chunk.
  const match = html.match(
    /<script[^>]*type="module"[^>]*src="([^"]+)"/i,
  );
  if (!match) {
    throw new Error(`Could not find module entry script in built HTML:\n${html}`);
  }
  return match[1]!;
}

/** Wait for the page's controlling SW to be `activated`. */
async function waitForActiveServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active;
      return Boolean(sw && sw.state === "activated");
    },
    null,
    { timeout: 20_000 },
  );
  // Page also needs to be controlled (so subsequent fetches go through the SW).
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    null,
    { timeout: 20_000 },
  );
}

test.describe("service worker survives a redeploy", () => {
  let workDir: string;
  let buildA: string;
  let buildB: string;
  let port: number;
  let server: ChildProcess | null = null;
  let originalMainTsx: string;

  test.beforeAll(async () => {
    workDir = mkdtempSync(resolve(tmpdir(), "sw-e2e-"));
    buildA = resolve(workDir, "build-a");
    buildB = resolve(workDir, "build-b");

    // Snapshot main.tsx so we can append a perturbation between builds
    // to force Vite to emit different content hashes for the entry chunk.
    originalMainTsx = readFileSync(MAIN_TSX, "utf8");

    // The perturbation must survive minification — a bare comment is
    // stripped by terser/esbuild, leaving the entry chunk byte-identical
    // and producing the same content hash. A `console.log(...)` of a
    // unique string is a side-effect the minifier preserves.
    const markerLine = (id: string) =>
      `\nconsole.log(${JSON.stringify(`sw-e2e build marker: ${id}`)});\n`;

    try {
      // ── Build #1 ────────────────────────────────────────────────────────
      writeFileSync(
        MAIN_TSX,
        originalMainTsx + markerLine(`A-${Date.now()}-${Math.random()}`),
      );
      buildApp();
      cpSync(APP_DIST, buildA, { recursive: true });

      // ── Build #2 (different content → different hashes) ─────────────────
      writeFileSync(
        MAIN_TSX,
        originalMainTsx + markerLine(`B-${Date.now()}-${Math.random()}`),
      );
      buildApp();
      cpSync(APP_DIST, buildB, { recursive: true });
    } finally {
      // Always restore main.tsx, even if a build failed.
      writeFileSync(MAIN_TSX, originalMainTsx);
    }

    // Sanity check: the two builds really do differ in their entry hash.
    const htmlA = readFileSync(resolve(buildA, "index.html"), "utf8");
    const htmlB = readFileSync(resolve(buildB, "index.html"), "utf8");
    const entryA = entryScriptFromHtml(htmlA);
    const entryB = entryScriptFromHtml(htmlB);
    expect(
      entryA,
      "Builds A and B produced identical entry bundle URLs — the test " +
        "perturbation no longer changes the bundle hash, so the regression " +
        "guard is not actually checking anything. Inspect main.tsx and the " +
        "build pipeline.",
    ).not.toBe(entryB);

    port = await getFreePort();
    server = await startStaticServer(buildA, port);
  });

  test.afterAll(async () => {
    if (server) await stopServer(server);
    server = null;
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  test("a returning visitor gets the new bundle, not a white screen", async ({
    page,
  }) => {
    const baseUrl = `http://127.0.0.1:${port}`;

    // ── First visit: install + activate the SW from build A. ──────────────
    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await waitForActiveServiceWorker(page);

    // App must actually render — `#root` non-empty proves the JS ran.
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 });

    const htmlA = readFileSync(resolve(buildA, "index.html"), "utf8");
    const entryA = entryScriptFromHtml(htmlA);
    const htmlB = readFileSync(resolve(buildB, "index.html"), "utf8");
    const entryB = entryScriptFromHtml(htmlB);

    // ── "Redeploy": swap the static server to serve build B. ──────────────
    await stopServer(server!);
    server = await startStaticServer(buildB, port);

    // Capture every request the page makes during the reload so we can
    // confirm the new bundle URL was actually fetched (not just resolved
    // via cached HTML pointing at build A).
    const requestedUrls: string[] = [];
    page.on("request", (req) => requestedUrls.push(req.url()));

    // ── Second visit: SW is already installed; HTML is network-first, so
    //    the new index.html (and therefore the new bundle hash) must be
    //    fetched and the app must render again.
    const navResponse = await page.goto(`${baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });
    expect(navResponse, "Navigation returned no response").not.toBeNull();
    expect(navResponse!.ok()).toBe(true);

    // The served HTML must be the new build, not a cached copy of A.
    const servedHtml = await navResponse!.text();
    const servedEntry = entryScriptFromHtml(servedHtml);
    expect(servedEntry).toBe(entryB);
    expect(servedEntry).not.toBe(entryA);

    // The new bundle URL must actually be requested by the page.
    const fetchedNewBundle = requestedUrls.some((u) =>
      u.endsWith(entryB) || u.includes(entryB),
    );
    expect(
      fetchedNewBundle,
      `Page never requested the new entry bundle (${entryB}). ` +
        `Requested URLs:\n${requestedUrls.join("\n")}`,
    ).toBe(true);

    // No request should have been served the *old* bundle URL — that would
    // mean a stale index.html slipped through.
    const fetchedOldBundle = requestedUrls.some((u) =>
      u.endsWith(entryA) || u.includes(entryA),
    );
    expect(
      fetchedOldBundle,
      `Page requested the old entry bundle (${entryA}) after redeploy — ` +
        `the SW or cache headers are serving stale HTML.`,
    ).toBe(false);

    // And the app actually renders post-redeploy (the white-screen check).
    await expect(page.locator("#root")).not.toBeEmpty({ timeout: 15_000 });
  });
});
