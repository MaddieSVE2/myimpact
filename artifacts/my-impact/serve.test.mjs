import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";

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
    }
    assert.equal(apiRequests, 70);
  } finally {
    web.kill("SIGTERM");
    api.close();
    await Promise.allSettled([once(web, "exit"), once(api, "close")]);
  }
});