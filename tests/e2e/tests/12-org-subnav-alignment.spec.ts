import { test, expect, type Page } from "@playwright/test";
import { TestApi, uniqueEmail } from "../helpers/api";
import { signInWithMagicLink } from "../helpers/auth";

/**
 * Spec 12 — Navbar / org-member sub-nav alignment.
 *
 * The white band above the university sub-nav happened because sticky offsets
 * differ between desktop (inner scroll container, offset 0) and mobile (body
 * scroll, offset 80px = navbar height). This spec pixel-measures the two
 * elements at desktop and mobile widths across multiple scroll positions and
 * fails if a future style tweak reintroduces a gap or an overlap.
 */

const TOLERANCE_PX = 1;

// Scroll offsets to sample. "bottom" scrolls to the end of the content.
const SCROLL_POSITIONS: (number | "bottom")[] = [0, 40, 300, 900, "bottom"];

interface Alignment {
  navBottom: number;
  subTop: number;
  navHeight: number;
  effectiveScroll: number;
}

/** Scroll both possible scrollers — the inner desktop container and the
 *  window. Whichever one actually scrolls at the current breakpoint wins. */
async function setScroll(page: Page, y: number | "bottom"): Promise<void> {
  await page.evaluate((target) => {
    const inner = document.getElementById("main-content-scroll");
    const top = target === "bottom" ? Number.MAX_SAFE_INTEGER : (target as number);
    inner?.scrollTo({ top, behavior: "instant" as ScrollBehavior });
    window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  }, y);
  // Give the browser a frame to settle sticky positioning before measuring.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

async function measureAlignment(page: Page): Promise<Alignment> {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-testid="main-navbar"]');
    const sub = document.querySelector('[data-testid="org-member-subnav"]');
    if (!nav) throw new Error("main-navbar not found");
    if (!sub) throw new Error("org-member-subnav not found");
    const n = nav.getBoundingClientRect();
    const s = sub.getBoundingClientRect();
    const inner = document.getElementById("main-content-scroll");
    return {
      navBottom: n.bottom,
      subTop: s.top,
      navHeight: n.height,
      effectiveScroll: Math.max(window.scrollY, inner?.scrollTop ?? 0),
    };
  });
}

/** Append a tall spacer inside <main> so every scroll position is reachable
 *  regardless of how much real content the page renders. */
async function ensureScrollable(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.getElementById("e2e-scroll-spacer")) return;
    const spacer = document.createElement("div");
    spacer.id = "e2e-scroll-spacer";
    spacer.style.height = "3000px";
    document.querySelector("main")?.appendChild(spacer);
  });
}

async function assertFlushAtAllScrollPositions(page: Page, label: string): Promise<void> {
  await ensureScrollable(page);

  for (const pos of SCROLL_POSITIONS) {
    await setScroll(page, pos);
    const m = await measureAlignment(page);

    const gap = m.subTop - m.navBottom;
    expect(
      Math.abs(gap),
      `${label} @ scroll=${pos} (effective ${m.effectiveScroll}px): sub-nav top ` +
        `(${m.subTop.toFixed(1)}px) must sit flush against navbar bottom ` +
        `(${m.navBottom.toFixed(1)}px) — measured ${gap > 0 ? "gap" : "overlap"} of ` +
        `${Math.abs(gap).toFixed(1)}px`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);

    // Both bars must remain pinned inside the viewport while scrolled — a
    // sub-nav that scrolls away would trivially "align" once off-screen.
    expect(m.navBottom, `${label} @ scroll=${pos}: navbar must stay pinned`).toBeGreaterThan(0);
    expect(
      m.subTop,
      `${label} @ scroll=${pos}: sub-nav must stay within the viewport`,
    ).toBeLessThanOrEqual(m.navHeight + TOLERANCE_PX);
  }
}

// One member email per viewport: the magic-link endpoint rate-limits repeat
// requests for the same address, so back-to-back sign-ins with a shared email
// would flake on the second test.
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800, email: uniqueEmail("subnav-desktop") },
  { name: "mobile", width: 390, height: 844, email: uniqueEmail("subnav-mobile") },
];

test.describe("Spec 12 — org member sub-nav sits flush under the navbar", () => {
  let api: TestApi;
  let orgId: string | undefined;
  let inviteCode: string | undefined;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
    for (const vp of VIEWPORTS) await api.resetUser(vp.email);
    const created = await api.createOrg(`E2E Subnav Align Org ${Date.now()}`, "education");
    orgId = created.orgId;
    inviteCode = created.inviteCode;
  });

  test.afterAll(async () => {
    for (const vp of VIEWPORTS) await api.resetUser(vp.email);
    if (orgId) await api.deleteOrg(orgId);
    await api.dispose();
  });

  for (const viewport of VIEWPORTS) {
    test(`no gap or overlap at ${viewport.name} width (${viewport.width}x${viewport.height})`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      try {
        const page = await ctx.newPage();
        await signInWithMagicLink(page, api, viewport.email);

        // Join as a plain member (managers see a different nav treatment and
        // no sub-nav) — idempotent across the two viewport tests.
        const join = await page.request.post("/api/org/join", {
          data: { inviteCode, orgId },
        });
        expect(join.ok()).toBe(true);

        await page.goto("/org/submit");
        await expect(page.getByTestId("org-member-submit-root")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("org-member-subnav")).toBeVisible({ timeout: 10_000 });

        await assertFlushAtAllScrollPositions(page, viewport.name);
      } finally {
        await ctx.close();
      }
    });
  }
});
