import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { request as httpRequest } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { compressDir } from "./compress-assets.mjs";

const TOKEN = "test-ssr-secret";
const API_PORT = 43998;
const WEB_PORT = 43999;

const profileData = {
  profile: {
    slug: "jane",
    displayName: "Jane Example",
    customMessage: "Helping my community",
    showHours: true,
    showSroi: true,
    showCategories: false,
    showJournalHighlights: false,
  },
  stats: {
    totalHours: 125,
    verifiedHours: 80,
    totalSroi: 4321,
    categoryHours: null,
  },
  journalHighlights: [],
};

const orgData = {
  share: {
    slug: "acme",
    scope: "summary",
    funderLabel: "Community Fund",
    expiresAt: null,
    orgName: "Acme Volunteers",
    orgType: "charity",
    sroiCostPerVolunteer: null,
    sroiCostBreakdown: null,
    sroiRatio: null,
  },
  sections: {
    summary: {
      totalSocialValue: 98765,
      totalHours: 456,
      totalMemberCount: 32,
      totalUsers: 30,
      averageValuePerPerson: 3086,
    },
    monthly: null,
    valueByCategory: null,
    regions: null,
  },
};

async function waitForServer(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process has not started listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

test("slug SSR remains complete beyond the public per-IP request limit", async () => {
  let apiRequests = 0;
  const api = createServer((req, res) => {
    apiRequests += 1;
    if (req.headers["x-my-impact-ssr-token"] !== TOKEN) {
      res.writeHead(apiRequests > 30 ? 429 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing internal SSR authentication." }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url?.includes("public-profile") ? profileData : orgData));
  });
  api.listen(API_PORT, "127.0.0.1");
  await once(api, "listening");

  const web = spawn(process.execPath, ["serve.mjs"], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      API_PORT: String(API_PORT),
      HOST: "127.0.0.1",
      PORT: String(WEB_PORT),
      SESSION_SECRET: TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(`http://127.0.0.1:${WEB_PORT}/`);
    const removedPricingResponse = await fetch(`http://127.0.0.1:${WEB_PORT}/pricing`);
    assert.equal(removedPricingResponse.status, 404);
    const removedPricingHtml = await removedPricingResponse.text();
    assert.match(removedPricingHtml, /Page not found/i);
    assert.doesNotMatch(removedPricingHtml, /Simple pricing for measurable impact/i);

    const schemas = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map(match => JSON.parse(match[1]));
    const homeHtml = await (await fetch(`http://127.0.0.1:${WEB_PORT}/`)).text();
    assert.deepEqual(schemas(homeHtml).map(schema => schema["@type"]), ["WebSite", "WebApplication", "FAQPage"]);

    const methodologyHtml = await (await fetch(`http://127.0.0.1:${WEB_PORT}/methodology`)).text();
    assert.deepEqual(schemas(methodologyHtml).map(schema => schema["@type"]), ["Article"]);
    const whatsNewHtml = await (await fetch(`http://127.0.0.1:${WEB_PORT}/whats-new`)).text();
    assert.deepEqual(schemas(whatsNewHtml).map(schema => schema["@id"]), [
      "https://myimpact.uk/whats-new#september-2026",
      "https://myimpact.uk/whats-new#july-2026",
      "https://myimpact.uk/whats-new#may-2026",
      "https://myimpact.uk/whats-new#march-2026",
    ]);

    for (let requestNumber = 0; requestNumber < 35; requestNumber += 1) {
      const [profileResponse, orgResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${WEB_PORT}/profile/jane`),
        fetch(`http://127.0.0.1:${WEB_PORT}/org/share/acme`),
      ]);
      assert.equal(profileResponse.status, 200);
      assert.equal(orgResponse.status, 200);

      const [profileHtml, orgHtml] = await Promise.all([
        profileResponse.text(),
        orgResponse.text(),
      ]);
      assert.match(profileHtml, /Jane Example/);
      assert.match(profileHtml, /Helping my community/);
      assert.match(orgHtml, /Acme Volunteers/);
      assert.match(orgHtml, /98,765/);
      assert.match(profileHtml, /window\.__MY_IMPACT_SSR_DATA__/);
      assert.match(orgHtml, /window\.__MY_IMPACT_SSR_DATA__/);
      for (const html of [profileHtml, orgHtml]) {
        assert.equal((html.match(/property="og:locale" content="en_GB"/g) ?? []).length, 1);
      }
      assert.deepEqual(schemas(profileHtml), []);
      assert.deepEqual(schemas(orgHtml), []);
    }
    assert.equal(apiRequests, 70);
  } finally {
    web.kill("SIGTERM");
    api.close();
    await Promise.allSettled([once(web, "exit"), once(api, "close")]);
  }
});
// Raw requests: fetch() decompresses, which would hide what the server sends.
function rawGet(port, path, headers = {}, method = "GET") {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolvePromise({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("sends precompressed files when accepted, with security headers", async () => {
  const STATIC_PORT = 44001;
  const root = mkdtempSync(join(tmpdir(), "mi-serve-"));
  const js = "console.log('hello');\n".repeat(200);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8" /><title>T</title></head><body><div id="root"></div>${"<p>x</p>".repeat(300)}</body></html>`;
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "app-ABCDEFGH12.js"), js);
  writeFileSync(join(root, "index.html"), html);
  writeFileSync(join(root, "tiny.txt"), "small");
  compressDir(root);

  const web = spawn(process.execPath, ["serve.mjs"], {
    cwd: import.meta.dirname,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(STATIC_PORT), STATIC_ROOT: root },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForServer(`http://127.0.0.1:${STATIC_PORT}/`);
    const asset = "/assets/app-ABCDEFGH12.js";

    const br = await rawGet(STATIC_PORT, asset, { "accept-encoding": "gzip, deflate, br" });
    assert.equal(br.headers["content-encoding"], "br");
    assert.equal(br.headers["vary"], "Accept-Encoding");
    assert.equal(Number(br.headers["content-length"]), br.body.length);
    assert.equal(brotliDecompressSync(br.body).toString(), js);
    assert.match(br.headers["cache-control"], /immutable/);

    const gz = await rawGet(STATIC_PORT, asset, { "accept-encoding": "gzip" });
    assert.equal(gz.headers["content-encoding"], "gzip");
    assert.equal(gunzipSync(gz.body).toString(), js);

    const refused = await rawGet(STATIC_PORT, asset, { "accept-encoding": "br;q=0, gzip;q=0" });
    assert.equal(refused.headers["content-encoding"], undefined);
    assert.equal(refused.body.toString(), js);

    const plain = await rawGet(STATIC_PORT, asset);
    assert.equal(plain.headers["content-encoding"], undefined);
    assert.equal(plain.body.toString(), js);

    const head = await rawGet(STATIC_PORT, asset, { "accept-encoding": "br" }, "HEAD");
    assert.equal(head.headers["content-encoding"], "br");
    assert.equal(head.body.length, 0);

    const page = await rawGet(STATIC_PORT, "/", { "accept-encoding": "br" });
    assert.equal(page.headers["content-encoding"], "br");
    assert.equal(brotliDecompressSync(page.body).toString(), html);
    assert.equal(page.headers["x-frame-options"], "SAMEORIGIN");
    assert.equal(page.headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    assert.match(page.headers["permissions-policy"], /camera=\(self\), microphone=\(self\), geolocation=\(\)/);
    assert.match(page.headers["content-security-policy"], /default-src 'self'.*storage\.googleapis\.com.*report-uri \/api\/csp-report/);
    assert.equal(page.headers["content-security-policy-report-only"], undefined);

    // Small files have no compressed copy and are sent as they are.
    const tiny = await rawGet(STATIC_PORT, "/tiny.txt", { "accept-encoding": "br" });
    assert.equal(tiny.headers["content-encoding"], undefined);
    assert.equal(tiny.body.toString(), "small");

    // The copies are never served on their own.
    assert.equal((await rawGet(STATIC_PORT, `${asset}.br`)).status, 404);
    assert.equal((await rawGet(STATIC_PORT, "/index.html.gz")).status, 404);

    // www goes to the bare domain, keeping the path and query.
    const www = await rawGet(STATIC_PORT, "/about?ref=x", { host: "www.myimpact.uk" });
    assert.equal(www.status, 301);
    assert.equal(www.headers.location, "https://myimpact.uk/about?ref=x");
    assert.equal((await rawGet(STATIC_PORT, "/", { host: "myimpact.uk" })).status, 200);
  } finally {
    web.kill("SIGTERM");
    await once(web, "exit");
    rmSync(root, { recursive: true, force: true });
  }
});
