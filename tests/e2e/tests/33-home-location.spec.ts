import { test, expect, type Page, type Route } from "@playwright/test";
import { TestApi, uniqueEmail, type SeedCharityPlace } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 33 — town names and postcodes in the location boxes.
 *
 * The "I live in" box takes a town from the suggestions, a postcode or an
 * outward code, and saves something that can always be looked up. The activity
 * location box keeps accepting venues as free text, and resolves a town name
 * typed in full.
 *
 * postcodes.io is stubbed in the browser. Testford's nearest postcode is the
 * reserved ZZ1 1ZZ, which the api-server geocodes via its E2E stub, so the
 * /suggestions page never reaches the real service or triggers AI generation.
 */

const TOWN_AUTHORITY = "Testford";

const SEEDED_PLACES: SeedCharityPlace[] = [
  {
    name: "Testford Verified Trust",
    description: "Supports local volunteering across Testford.",
    howToJoin: "Email the volunteer coordinator.",
    source: "ai",
    verified: true,
    registrationNumber: "1234567",
  },
];

const PLACES = [
  {
    code: "place-testford",
    name_1: "Testford",
    local_type: "City",
    county_unitary: "City of Testford",
    region: "Testing Region",
    country: "England",
    outcode: "ZZ1",
    latitude: 53.48,
    longitude: -2.24,
  },
  {
    code: "place-newport-iow",
    name_1: "Newport",
    local_type: "Town",
    county_unitary: "Isle of Wight",
    region: "South East",
    country: "England",
    outcode: "PO30",
    latitude: 50.7,
    longitude: -1.29,
  },
  {
    code: "place-newport-wales",
    name_1: "Casnewydd",
    name_1_lang: "cym",
    name_2: "Newport",
    name_2_lang: "eng",
    local_type: "City",
    county_unitary: "Casnewydd - Newport",
    region: "Wales",
    country: "Wales",
    outcode: "NP20",
    latitude: 51.58,
    longitude: -3.0,
  },
];

function postcodeResult(postcode: string, adminDistrict: string, region: string | null, country: string, latitude: number) {
  return {
    postcode,
    outcode: postcode.split(" ")[0],
    admin_district: adminDistrict,
    admin_county: null,
    region,
    country,
    latitude,
    longitude: -2,
  };
}

const NEAREST: Record<string, ReturnType<typeof postcodeResult>> = {
  "53.48": postcodeResult("ZZ1 1ZZ", TOWN_AUTHORITY, "Testing Region", "England", 53.48),
  "50.7": postcodeResult("PO30 1UD", "Isle of Wight", "South East", "England", 50.7),
  "51.58": postcodeResult("NP20 1AA", "Newport", null, "Wales", 51.58),
  "53.47": postcodeResult("M1 1AE", "Manchester", "North West", "England", 53.47),
};

function reply(route: Route, status: number, result: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ status, result }),
  });
}

async function stubPostcodesIo(page: Page): Promise<void> {
  await page.route("https://api.postcodes.io/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/places") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const matches = PLACES.filter((p) =>
        [p.name_1, p.name_2].some((name) => name?.toLowerCase().startsWith(q)),
      );
      return reply(route, 200, matches);
    }
    if (url.pathname === "/postcodes") {
      const near = NEAREST[url.searchParams.get("lat") ?? ""];
      return reply(route, 200, near ? [near] : null);
    }
    if (url.pathname === "/outcodes/M1") {
      return reply(route, 200, { outcode: "M1", latitude: 53.47, longitude: -2.23 });
    }
    if (url.pathname === "/postcodes/M11AE") return reply(route, 200, NEAREST["53.47"]);
    if (url.pathname === "/postcodes/ZZ11ZZ") return reply(route, 200, NEAREST["53.48"]);
    return reply(route, 404, null);
  });
}

/** Serve a profile from before town names had their own field, and record what's sent back. */
async function serveOlderProfile(page: Page): Promise<Array<Record<string, unknown>>> {
  const sent: Array<Record<string, unknown>> = [];
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") {
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.continue();
    }
    const response = await route.fetch();
    const body = (await response.json()) as { profile: Record<string, unknown> | null };
    body.profile = { ...body.profile, postcode: "Nottingham", locationName: null };
    return route.fulfill({ response, json: body });
  });
  return sent;
}

async function savedProfile(page: Page) {
  const res = await page.request.get("/api/profile");
  return ((await res.json()) as { profile: { postcode: string | null; locationName: string | null } }).profile;
}

test.describe("Spec 33 — town names and postcodes in the location boxes", () => {
  let api: TestApi;
  const emails: string[] = [];
  const nextEmail = (label: string) => {
    const email = uniqueEmail(`home-location-${label}`);
    emails.push(email);
    return email;
  };

  const next = (page: Page) => page.getByRole("button", { name: /next:\s*add activities/i });
  const input = (page: Page) => page.getByTestId("home-location-input");
  const status = (page: Page) => page.getByTestId("home-location-status");

  async function openWizard(page: Page, label: string): Promise<void> {
    await signInWithMagicLink(page, api, nextEmail(label));
    await stubPostcodesIo(page);
    await page.goto("/wizard/actions");
    await expect(input(page)).toBeVisible();
  }

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.seedLocalCharities({
      localAuthority: TOWN_AUTHORITY,
      country: "England",
      status: "ready",
      categories: [{ category: "Community", places: SEEDED_PLACES }],
    });
  });

  test.afterAll(async () => {
    for (const email of emails) await api.resetUser(email);
    await api.resetLocalCharities(TOWN_AUTHORITY);
    await api.dispose();
  });

  test("a picked town saves its nearest postcode and drives the nearby search", async ({ page }) => {
    await openWizard(page, "pick");

    await input(page).fill("Testf");
    await page.getByTestId("home-location-suggestion-0").click();

    await expect(input(page)).toHaveValue("Testford");
    await expect(status(page)).toContainText("Testford, Testing Region");

    await next(page).click();
    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "ZZ1 1ZZ", locationName: "Testford" });

    await page.goto("/suggestions");
    await expect(page.getByText(`Live listings near ${TOWN_AUTHORITY}`)).toBeVisible({ timeout: 15_000 });
    const govo = page.locator('a[href*="govo.org/search"]').first();
    expect(await govo.getAttribute("href")).toContain(`postcode=${encodeURIComponent("ZZ1 1ZZ")}`);
    await expect(govo).toContainText("near Testford");
  });

  test("a town with one match needs a single click on Next", async ({ page }) => {
    await openWizard(page, "one-click");

    await input(page).fill("testford");
    await next(page).click();

    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "ZZ1 1ZZ", locationName: "Testford" });
  });

  test("Enter selects a town with one match", async ({ page }) => {
    await openWizard(page, "enter");

    await input(page).fill("Testford");
    await input(page).press("Enter");

    await expect(status(page)).toContainText("Testford, Testing Region");
  });

  test("a name shared by several places waits for a choice", async ({ page }) => {
    await openWizard(page, "ambiguous");

    await input(page).fill("Newport");
    const first = page.getByTestId("home-location-suggestion-0");
    await expect(first).toContainText("Newport");
    await expect(first).toContainText("Wales");
    await expect(first).toContainText("City");
    await expect(page.getByTestId("home-location-suggestions")).not.toContainText("Casnewydd");

    await next(page).click();
    await expect(status(page)).toContainText("Choose your town");
    expect(page.url()).toContain("/wizard/actions");

    await expect(page.getByTestId("home-location-suggestions")).toBeVisible();
    await page.getByTestId("home-location-suggestion-1").click();
    await expect(status(page)).toContainText("Isle of Wight, South East");

    await next(page).click();
    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "PO30 1UD", locationName: "Newport" });
  });

  test("text with no match is never saved", async ({ page }) => {
    await openWizard(page, "no-match");

    await input(page).fill("Nowheresville");
    await expect(status(page)).toContainText("Can't find it?");
    await next(page).click();
    expect(page.url()).toContain("/wizard/actions");
    await expect(status(page)).toContainText("Can't find it?");

    await input(page).fill("M1 1AE");
    await expect(status(page)).toContainText("Manchester, North West");
    await next(page).click();
    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "M1 1AE", locationName: null });
  });

  test("a postcode that doesn't exist is reported", async ({ page }) => {
    await openWizard(page, "bad-postcode");

    await input(page).fill("ZZ9 9ZZ");
    await expect(status(page)).toContainText("Postcode not found");
    await next(page).click();
    expect(page.url()).toContain("/wizard/actions");
  });

  test("an outward code keeps what was typed and gains a full postcode", async ({ page }) => {
    await openWizard(page, "outward");

    await input(page).fill("M1");
    await next(page).click();

    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "M1 1AE", locationName: "M1" });
  });

  test("the box still works when postcodes.io can't be reached", async ({ page }) => {
    await openWizard(page, "offline");
    await page.unroute("https://api.postcodes.io/**");
    await page.route("https://api.postcodes.io/**", (route) => route.abort());

    await input(page).fill("M1 1AE");
    await next(page).click();

    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "M1 1AE", locationName: null });
  });

  test("the profile page takes a town and shows it again after saving", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("profile"));
    await stubPostcodesIo(page);
    await page.goto("/profile");

    await input(page).fill("Testf");
    await page.getByTestId("home-location-suggestion-0").click();
    await expect(status(page)).toContainText("Testford, Testing Region");
    await page.getByRole("button", { name: /^save changes$/i }).click();

    await expect.poll(() => savedProfile(page)).toMatchObject({ postcode: "ZZ1 1ZZ", locationName: "Testford" });
    await page.reload();
    await expect(input(page)).toHaveValue("Testford");
  });

  test("the setup page takes a town", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("setup"));
    await stubPostcodesIo(page);
    await page.goto("/profile/setup");

    await input(page).fill("Testf");
    await page.getByTestId("home-location-suggestion-0").click();
    await expect(status(page)).toContainText("Testford, Testing Region");
    await page.getByRole("button", { name: /save and continue/i }).click();

    await page.waitForURL(/\/history/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "ZZ1 1ZZ", locationName: "Testford" });
  });

  test("a returning member's town comes back and is left as it was", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("returning"));
    await page.request.put("/api/profile", {
      data: { situation: [], interests: [], postcode: "ZZ1 1ZZ", locationName: "Testford" },
    });
    await stubPostcodesIo(page);
    await page.goto("/wizard/actions");

    await expect(input(page)).toHaveValue("Testford");
    await expect(status(page)).toContainText("Testford, Testing Region");

    await next(page).click();
    await page.waitForURL(/\/wizard\/activities/);
    expect(await savedProfile(page)).toMatchObject({ postcode: "ZZ1 1ZZ", locationName: "Testford" });
  });

  test("a town saved in the old postcode field doesn't hold up the wizard", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("legacy-wizard"));
    await stubPostcodesIo(page);
    const sent = await serveOlderProfile(page);

    await page.goto("/wizard/actions");
    await expect(input(page)).toHaveValue("Nottingham");
    await expect(status(page)).toContainText("Choose your town from the list");

    await next(page).click();
    await page.waitForURL(/\/wizard\/activities/);
    expect(sent[0]).not.toHaveProperty("postcode");
  });

  test("a town saved in the old postcode field never blocks saving", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("legacy"));
    await stubPostcodesIo(page);

    const sent = await serveOlderProfile(page);

    await page.goto("/profile");
    await expect(input(page)).toHaveValue("Nottingham");
    await expect(status(page)).toContainText("Choose your town from the list");

    await page.getByRole("button", { name: /i volunteer/i }).click();
    await page.getByRole("button", { name: /^save changes$/i }).click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).not.toHaveProperty("postcode");
    expect(sent[0]).not.toHaveProperty("locationName");
    await expect(page.getByText(/could not save/i)).toHaveCount(0);

    // The suggestions page asks for a location, and skips the lookup that can't work.
    const lookups: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/local-charities/premapped")) lookups.push(request.url());
    });
    await page.goto("/suggestions");
    await expect(page.getByText("Add your town or postcode to see opportunities near you.")).toBeVisible({
      timeout: 15_000,
    });
    expect(lookups).toEqual([]);
  });

  test("the activity box resolves town names and keeps venues as text", async ({ page }) => {
    await signInWithMagicLink(page, api, nextEmail("activity"));
    await stubPostcodesIo(page);
    await page.goto("/log");

    const box = page.getByTestId("quick-log-location-input");
    const use = page.getByTestId("quick-log-location-set");
    const chip = page.getByTestId("quick-log-location-selected");

    await page.getByTestId("quick-log-pick-search").fill("recycl");
    await page.getByTestId("quick-log-activity-option-recycling").click();
    await page.getByTestId("quick-log-quantity").fill("2");

    // Several places share the name: nothing is set until one is chosen.
    await box.fill("Newport");
    await use.click();
    await expect(page.getByTestId("quick-log-location-pick")).toBeVisible();
    await expect(chip).toHaveCount(0);
    await expect(page.getByTestId("quick-log-location-suggestions")).toBeVisible();

    // A venue stays a plain label.
    await box.fill("Village Hall");
    await use.click();
    await expect(chip).toContainText("Village Hall");
    await page.getByTestId("quick-log-location-clear").click();

    // A town typed in full gets its area, without Enter or a click on the list.
    await box.fill("testford");
    await use.click();
    await expect(chip).toContainText("Testford");

    const saveRequest = page.waitForRequest(
      (request) => request.url().includes("/api/impact/save") && request.method() === "POST",
    );
    await page.getByTestId("quick-log-submit").click();
    const body = (await saveRequest).postDataJSON() as { location: Record<string, unknown> };
    expect(body.location).toMatchObject({
      townCity: "Testford",
      localAuthority: TOWN_AUTHORITY,
      region: "Testing Region",
      postcode: "ZZ1",
    });
    await expect(page.getByTestId("quick-log-saved-confirmation")).toBeVisible({ timeout: 20_000 });
  });

  test("managers see the general area, never a member's postcode", async ({ browser }) => {
    const adminEmail = "maddie@socialvalueengine.com"; // hard-coded admin allowlist
    const managerEmail = nextEmail("manager");
    const townEmail = nextEmail("member-town");
    const postcodeEmail = nextEmail("member-postcode");
    emails.push(adminEmail);

    const adminPage = await (await browser.newContext()).newPage();
    await signInWithMagicLink(adminPage, api, adminEmail);
    const createRes = await adminPage.request.post("/api/admin/orgs", {
      data: {
        name: `E2E Home Location ${Date.now()}`,
        type: "charity",
        contactName: "E2E Manager",
        contactEmail: managerEmail,
        dataSharingMode: "explicit_submission",
      },
    });
    expect(createRes.ok()).toBe(true);
    const { org } = (await createRes.json()) as { org: { id: string; inviteCode: string } };

    const managerPage = await (await browser.newContext()).newPage();
    await signInWithMagicLink(managerPage, api, managerEmail);
    await managerPage.request.post("/api/org/join", { data: { inviteCode: org.inviteCode, orgId: org.id } });

    const join = async (email: string, profile: Record<string, unknown>) => {
      const memberPage = await (await browser.newContext()).newPage();
      await signInWithMagicLink(memberPage, api, email);
      await memberPage.request.put("/api/profile", { data: { situation: [], interests: [], ...profile } });
      await memberPage.request.post("/api/org/join", { data: { inviteCode: org.inviteCode, orgId: org.id } });
      const me = await memberPage.request.get("/api/auth/me");
      const { user } = (await me.json()) as { user: { id: string } };
      await managerPage.request.post(`/api/org/my/members/${user.id}/approve`);
    };
    await join(townEmail, { postcode: "ZZ1 1ZZ", locationName: "Testford" });
    await join(postcodeEmail, { postcode: "SW1A 1AA", locationName: null });

    const res = await managerPage.request.get("/api/org/my/members");
    const text = await res.text();
    const { members } = JSON.parse(text) as { members: Array<{ email: string; area: string | null }> };
    expect(members.find((m) => m.email === townEmail)?.area).toBe("Testford");
    expect(members.find((m) => m.email === postcodeEmail)?.area).toBe("SW");
    expect(text).not.toContain("ZZ1 1ZZ");
    expect(text).not.toContain("SW1A");

    await api.deleteOrg(org.id);
  });
});
