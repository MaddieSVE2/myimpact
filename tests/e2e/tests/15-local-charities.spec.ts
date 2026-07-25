import { test, expect, type Page } from "@playwright/test";
import { TestApi, uniqueEmail, type SeedCharityPlace } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 15 — pre-mapped local charity suggestions on the Ideas page.
 *
 * Uses two reserved "ZZ" test postcodes that the api-server geocodes via a
 * deterministic E2E stub (no postcodes.io call):
 *   - ZZ1 1ZZ → "Testford"   — seeded READY with suggestions for every main category
 *   - ZZ2 2ZZ → "Pendington" — seeded with no suggestions, so the API reports
 *     "pending" without kicking off real background AI generation
 */

const READY_POSTCODE = "ZZ1 1ZZ";
const READY_AUTHORITY = "Testford";
const PENDING_POSTCODE = "ZZ2 2ZZ";
const PENDING_AUTHORITY = "Pendington";
const FAILED_AUTHORITY = "Failtown";

// Must mirror MAIN_CATEGORIES on the server (all catalogue categories except
// "Custom") so whichever categories the suggestion tiles land on have places.
const MAIN_CATEGORIES = [
  "Animal Welfare",
  "Arts & Culture",
  "Community",
  "Education",
  "Emergency Response",
  "Environment",
  "Fundraising",
  "Health",
  "Mentoring",
  "Sport & Active",
];

const SEEDED_PLACES: SeedCharityPlace[] = [
  {
    name: "Testford Verified Trust",
    description: "Supports local volunteering across Testford.",
    howToJoin: "Email the volunteer coordinator.",
    source: "ai",
    verified: true,
    registrationNumber: "1234567",
    recruitingVolunteers: true,
  },
  {
    name: "Testford Community Circle",
    description: "Neighbourhood group running weekly sessions.",
    howToJoin: "Drop in on a Saturday morning.",
    source: "ai",
    verified: false,
  },
];

async function setProfilePostcode(page: Page, postcode: string): Promise<void> {
  const res = await page.request.put("/api/profile", {
    data: { situation: [], interests: [], postcode },
  });
  expect(res.ok(), `PUT /api/profile failed: ${res.status()}`).toBe(true);
}

test.describe("Spec 15 — instant pre-mapped local charity suggestions", () => {
  let api: TestApi;
  // One email per test: the magic-link endpoint rate-limits per email, so
  // two back-to-back sign-ins with the same address can 429.
  const readyEmail = uniqueEmail("localcharities-ready");
  const pendingEmail = uniqueEmail("localcharities-pending");
  const failedEmail = uniqueEmail("localcharities-failed");

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    await api.resetUser(readyEmail);
    await api.resetUser(pendingEmail);
    await api.resetUser(failedEmail);
    // Ready area: every main category has the same two seeded places.
    await api.seedLocalCharities({
      localAuthority: READY_AUTHORITY,
      country: "England",
      status: "ready",
      categories: MAIN_CATEGORIES.map((category) => ({ category, places: SEEDED_PLACES })),
    });
    // Pending area: "ready" row with zero suggestion rows makes the API
    // report "pending" without triggering real background generation.
    await api.seedLocalCharities({
      localAuthority: PENDING_AUTHORITY,
      country: "England",
      status: "ready",
      categories: [],
    });
  });

  test.afterAll(async () => {
    await api.resetUser(readyEmail);
    await api.resetUser(pendingEmail);
    await api.resetUser(failedEmail);
    await api.resetLocalCharities(READY_AUTHORITY);
    await api.resetLocalCharities(PENDING_AUTHORITY);
    await api.dispose();
  });

  test("ready area shows instant local results with verified badges", async ({ page }) => {
    await signInWithMagicLink(page, api, readyEmail);
    await setProfilePostcode(page, READY_POSTCODE);

    await page.goto("/suggestions");

    // Suggestion tiles render (deterministic catalogue scoring, no AI).
    const toggles = page.getByRole("button", { name: /see what's near you/i });
    await expect(toggles.first()).toBeVisible({ timeout: 20_000 });

    // The old "Near you this week" section must NOT exist any more.
    await expect(page.getByText(/near you this week/i)).toHaveCount(0);

    // Live-search section: GoVo card with the user's postcode, headed by the
    // resolved local authority.
    await expect(
      page.getByRole("heading", { name: /search live opportunities/i }),
    ).toBeVisible();
    await expect(page.getByText(`Live listings near ${READY_AUTHORITY}`)).toBeVisible({
      timeout: 15_000,
    });
    const govoLink = page.locator('a[href*="govo.org/search"]').first();
    await expect(govoLink).toBeVisible();
    expect(await govoLink.getAttribute("href")).toContain(
      `postcode=${encodeURIComponent(READY_POSTCODE)}`,
    );

    // Expanding a tile is instant — results are pre-mapped, no live call.
    await toggles.first().click();
    await expect(page.getByText(`Near ${READY_AUTHORITY}`).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Testford Verified Trust").first()).toBeVisible();
    await expect(page.getByText(/✓ Verified charity/i).first()).toBeVisible();
    await expect(page.getByText("Testford Community Circle").first()).toBeVisible();
    await expect(page.getByText(/^Suggested$/i).first()).toBeVisible();

    // Expanding the verified place's detail view reveals the how-to-join
    // copy, the registration number, and the "Looking for volunteers" badge.
    await page.getByTestId("place-card-Testford Verified Trust").first().click();
    await expect(page.getByText(/how to get involved/i).first()).toBeVisible();
    await expect(page.getByText(/Registered charity no\. 1234567/).first()).toBeVisible();
    await expect(
      page.getByTestId("place-recruiting-Testford Verified Trust").first(),
    ).toBeVisible();

    // The unverified place has no recruiting signal, so no badge is shown.
    await page.getByTestId("place-card-Testford Community Circle").first().click();
    await expect(page.getByText(/Drop in on a Saturday morning/).first()).toBeVisible();
    await expect(page.getByTestId("place-recruiting-Testford Community Circle")).toHaveCount(0);

    // Collapse works too.
    await page.getByRole("button", { name: /hide local places/i }).first().click();
    await expect(page.getByText("Testford Verified Trust")).toHaveCount(0);
  });

  test("pending area shows the finding-charities state with fallback search cards", async ({
    page,
  }) => {
    await signInWithMagicLink(page, api, pendingEmail);
    await setProfilePostcode(page, PENDING_POSTCODE);

    await page.goto("/suggestions");

    const toggles = page.getByRole("button", { name: /see what's near you/i });
    await expect(toggles.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`Live listings near ${PENDING_AUTHORITY}`)).toBeVisible({
      timeout: 15_000,
    });

    await toggles.first().click();
    await expect(
      page.getByText(/finding local charities for your area — check back soon/i),
    ).toBeVisible({ timeout: 10_000 });

    // The expanded panel carries its own GoVo fallback card, in addition to
    // the one in the live-search section at the top of the page.
    const govoCards = page.locator('a[href*="govo.org/search"]');
    await expect(govoCards).toHaveCount(2);
    for (const href of await govoCards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    )) {
      expect(href).toContain(`postcode=${encodeURIComponent(PENDING_POSTCODE)}`);
    }
  });

  test("failed area shows the error copy with fallback search cards", async ({ page }) => {
    // Seeding a "failed" status row directly would make ensureAuthority
    // re-queue real background AI generation, so intercept the premapped
    // fetch and return a deterministic "failed" payload instead.
    await page.route("**/api/local-charities/premapped*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "failed",
          location: {
            postcode: READY_POSTCODE,
            localAuthority: FAILED_AUTHORITY,
            country: "England",
          },
          categories: [],
        }),
      });
    });

    await signInWithMagicLink(page, api, failedEmail);
    await setProfilePostcode(page, READY_POSTCODE);

    await page.goto("/suggestions");

    const toggles = page.getByRole("button", { name: /see what's near you/i });
    await expect(toggles.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`Live listings near ${FAILED_AUTHORITY}`)).toBeVisible({
      timeout: 15_000,
    });

    await toggles.first().click();

    // The expanded panel shows the helpful error copy — never a blank panel.
    await expect(page.getByText(`Near ${FAILED_AUTHORITY}`).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/couldn't load local suggestions right now/i),
    ).toBeVisible();

    // GoVo fallback card inside the panel, plus the one in the live-search
    // section at the top of the page.
    const govoCards = page.locator('a[href*="govo.org/search"]');
    await expect(govoCards).toHaveCount(2);
    for (const href of await govoCards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    )) {
      expect(href).toContain(`postcode=${encodeURIComponent(READY_POSTCODE)}`);
    }
  });
});
