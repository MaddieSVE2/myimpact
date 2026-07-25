/**
 * Pre-mapped local charity suggestions pipeline.
 *
 * For each local authority (from postcodes.io admin_district) we generate
 * charity suggestions per main activity category ahead of time — AI
 * suggestions verified against the official registers (Charity Commission
 * for England & Wales, OSCR for Scotland) — and store them in the database
 * so the Inspire page can serve results instantly.
 *
 * Generation runs in the background the first time a local authority is
 * seen, and a daily sweep re-generates any authority whose results are older
 * than REFRESH_AFTER_MS (~monthly).
 */

import {
  db,
  localCharityAreasTable,
  localCharitySuggestionsTable,
  type StoredCharityPlace,
} from "@workspace/db";
import { eq, isNull, lt, or, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { CATEGORIES } from "./impactData.js";
import { verifyCharityName } from "./charity-commission";
import { verifyOSCRCharityName } from "./oscr";
import { detectVolunteerRecruitment } from "./volunteerRecruitment.js";
import { getOverridesForAuthority, mergeOverrides } from "./charityOverrides.js";

/** Main categories to pre-map; "Custom" holds user-defined activities only. */
export const MAIN_CATEGORIES: string[] = CATEGORIES.filter((c) => c !== "Custom");

const REFRESH_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // ~monthly

/**
 * Version of the generation pipeline. Bump this whenever the stored output
 * shape changes (v2 added website URLs) — the daily sweep re-generates any
 * area recorded with an older version, without waiting for the monthly
 * refresh window.
 */
export const CURRENT_GENERATION_VERSION = 2;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const SWEEP_STARTUP_DELAY_MS = 2 * 60 * 1000;
const SWEEP_THROTTLE_MS = 5_000; // pause between authorities during a sweep

/**
 * Largest UK local authorities by population, pre-seeded so most users get
 * instant results. Names must exactly match postcodes.io `admin_district`
 * values (e.g. "Glasgow City", "City of Edinburgh", "County Durham"), since
 * that is the key the on-demand path uses.
 */
export const SEED_AUTHORITIES: Array<{ localAuthority: string; country: string }> = [
  { localAuthority: "Birmingham", country: "England" },
  { localAuthority: "Leeds", country: "England" },
  { localAuthority: "Glasgow City", country: "Scotland" },
  { localAuthority: "Sheffield", country: "England" },
  { localAuthority: "Manchester", country: "England" },
  { localAuthority: "Bradford", country: "England" },
  { localAuthority: "City of Edinburgh", country: "Scotland" },
  { localAuthority: "Liverpool", country: "England" },
  { localAuthority: "Bristol, City of", country: "England" },
  { localAuthority: "Cardiff", country: "Wales" },
  { localAuthority: "County Durham", country: "England" },
  { localAuthority: "Buckinghamshire", country: "England" },
  { localAuthority: "Cornwall", country: "England" },
  { localAuthority: "Wiltshire", country: "England" },
  { localAuthority: "Coventry", country: "England" },
  { localAuthority: "Belfast", country: "Northern Ireland" },
  { localAuthority: "Leicester", country: "England" },
  { localAuthority: "Nottingham", country: "England" },
  { localAuthority: "Newcastle upon Tyne", country: "England" },
  { localAuthority: "Sunderland", country: "England" },
  { localAuthority: "Wakefield", country: "England" },
  { localAuthority: "Dudley", country: "England" },
  { localAuthority: "Wigan", country: "England" },
  { localAuthority: "Fife", country: "Scotland" },
  { localAuthority: "Croydon", country: "England" },
  { localAuthority: "Barnet", country: "England" },
  { localAuthority: "Kingston upon Hull, City of", country: "England" },
  { localAuthority: "Ealing", country: "England" },
  { localAuthority: "Kirklees", country: "England" },
  { localAuthority: "Newham", country: "England" },
  { localAuthority: "North Lanarkshire", country: "Scotland" },
  { localAuthority: "Sandwell", country: "England" },
  { localAuthority: "Brent", country: "England" },
  { localAuthority: "Bromley", country: "England" },
  { localAuthority: "South Lanarkshire", country: "Scotland" },
  { localAuthority: "Doncaster", country: "England" },
  { localAuthority: "Stockport", country: "England" },
  { localAuthority: "Plymouth", country: "England" },
  { localAuthority: "Swansea", country: "Wales" },
  { localAuthority: "Southampton", country: "England" },
  { localAuthority: "Wandsworth", country: "England" },
  { localAuthority: "Salford", country: "England" },
  { localAuthority: "Milton Keynes", country: "England" },
  { localAuthority: "Aberdeen City", country: "Scotland" },
  { localAuthority: "Portsmouth", country: "England" },
  { localAuthority: "Northumberland", country: "England" },
  { localAuthority: "Lambeth", country: "England" },
  { localAuthority: "Reading", country: "England" },
  { localAuthority: "Luton", country: "England" },
  { localAuthority: "Brighton and Hove", country: "England" },
];

const BLOCKED_NAME_TERMS = [
  "council", "county council", "city council", "borough council",
  "district council", "local authority", "government", "job centre",
  "jobcentre", "job center", "dwp", "department for work",
  "nhs ", " nhs", "hmrc", "home office", "police", "fire service",
];

function isBlockedOrganisation(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKED_NAME_TERMS.some((t) => lower.includes(t));
}

/**
 * A short activity description per category, used to steer the AI towards
 * concrete volunteering suggestions rather than the abstract category label.
 */
const CATEGORY_PROMPTS: Record<string, string> = {
  "Animal Welfare": "animal welfare and animal rescue volunteering",
  "Arts & Culture": "arts, culture, theatre, music or museum volunteering",
  "Community": "community volunteering such as food banks, befriending, community gardens or social clubs",
  "Education": "education volunteering such as tutoring, mentoring, literacy or school support",
  "Emergency Response": "emergency response volunteering such as first aid, search and rescue or community resilience",
  "Environment": "environmental volunteering such as conservation, litter picking, tree planting or recycling",
  "Fundraising": "charity fundraising and charity events",
  "Health": "health and wellbeing volunteering such as mental health support, hospices or blood donation",
  "Mentoring": "youth mentoring and coaching volunteering",
  "Sport & Active": "sports coaching and active lifestyle volunteering",
};

/**
 * Keep only plausible http(s) charity URLs; anything else becomes undefined
 * so the frontend simply hides the website link.
 */
function sanitizeWebsite(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function isScottish(country: string): boolean {
  return country.trim().toLowerCase() === "scotland";
}

type Verification = { registrationNumber: string } | null;

async function verifyMany(names: string[], scotland: boolean): Promise<Verification[]> {
  const ccApiKey = process.env.CHARITY_COMMISSION_API_KEY;
  const oscrApiKey = process.env.OSCR_API_KEY;

  return Promise.all(
    names.map(async (name): Promise<Verification> => {
      try {
        if (scotland) {
          return await verifyOSCRCharityName(name, oscrApiKey);
        }
        if (!ccApiKey) return null;
        return await verifyCharityName(name, ccApiKey);
      } catch {
        return null;
      }
    })
  );
}

/**
 * Generate up to 3 verified charity suggestions for one local authority and
 * one category. Returns [] when the AI has nothing confident to offer.
 */
async function generateCategoryPlaces(
  localAuthority: string,
  country: string,
  category: string,
): Promise<StoredCharityPlace[]> {
  const activityDescription = CATEGORY_PROMPTS[category] ?? `${category.toLowerCase()} volunteering`;

  const baseParams = {
    model: "gpt-5-mini" as const,
    max_completion_tokens: 1000,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content: `You are a UK volunteering expert. Given a UK local authority area and a volunteering theme, suggest up to 3 real charities or voluntary organisations where someone could volunteer on that theme in that local area.

Return a JSON object with a "places" array. Each item has:
- name (string): the real name of the charity or voluntary organisation
- description (string): one sentence, max 15 words, explaining what they do — specific to the theme
- howToJoin (string): one concrete action to get started, max 12 words
- website (string): the organisation's official website URL (https), or "" if you are not confident of the exact URL — never guess

Rules:
- Only suggest registered charities or voluntary/community organisations — never suggest councils, local authorities, government bodies, job centres, or DWP services
- Suggest organisations that actually operate in the given local authority — this INCLUDES local branches or projects of larger charities that run there, judged by where they deliver services, NOT by where they are registered
- Do NOT expand to clearly distant regions — keep suggestions local to the given area
- If you cannot confidently find 2 or more real charities serving that area, return only the ones you are confident about (even just 1, or an empty array)
- Skip any entry you are not reasonably confident about — quality over quantity
- Use British English`,
      },
      {
        role: "user" as const,
        content: `Local authority: ${localAuthority}${country ? ` (${country})` : ""}\nVolunteering theme: ${activityDescription}`,
      },
    ],
  };

  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>> & {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  try {
    completion = await openai.chat.completions.create({
      ...baseParams,
      reasoning_effort: "low",
    } as Parameters<typeof openai.chat.completions.create>[0]);
  } catch {
    completion = await openai.chat.completions.create(baseParams);
  }

  const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
  let parsed: { places?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const aiPlaces = Array.isArray(parsed.places)
    ? parsed.places
        .filter((p: unknown): p is { name: string } =>
          !!p && typeof p === "object" && typeof (p as { name?: unknown }).name === "string" &&
          !isBlockedOrganisation((p as { name: string }).name)
        )
        .map(({ name, description, howToJoin, website }: {
          name: string;
          description?: string;
          howToJoin?: string;
          website?: string;
        }) => ({
          name,
          description: typeof description === "string" ? description : "",
          howToJoin: typeof howToJoin === "string" ? howToJoin : "",
          website: sanitizeWebsite(website),
        }))
    : [];

  const [verifications, recruitingSignals] = await Promise.all([
    verifyMany(aiPlaces.map((p) => p.name), isScottish(country)),
    Promise.all(
      aiPlaces.map(async (p) => {
        try {
          return await detectVolunteerRecruitment(p.website);
        } catch {
          return undefined;
        }
      })
    ),
  ]);

  return aiPlaces.map((p, i) => ({
    ...p,
    source: "ai" as const,
    verified: verifications[i] !== null,
    registrationNumber: verifications[i]?.registrationNumber,
    recruitingVolunteers: recruitingSignals[i],
  }));
}

/**
 * Generate and persist suggestions for every main category for one local
 * authority. Categories run sequentially to keep AI/register load gentle.
 * Marks the area "ready" when at least one category produced results, or
 * "failed" when every category errored/came back empty so a retry can be
 * triggered on the next visit.
 */
export async function generateForAuthority(localAuthority: string, country: string): Promise<void> {
  let anyStored = false;
  let anyError = false;

  for (const category of MAIN_CATEGORIES) {
    try {
      const places = await generateCategoryPlaces(localAuthority, country, category);
      if (places.length > 0) {
        await db
          .insert(localCharitySuggestionsTable)
          .values({ localAuthority, category, places, generatedAt: new Date() })
          .onConflictDoUpdate({
            target: [localCharitySuggestionsTable.localAuthority, localCharitySuggestionsTable.category],
            set: { places, generatedAt: new Date() },
          });
        anyStored = true;
      }
    } catch (err) {
      anyError = true;
      console.error(`[premapped-charities] generation failed for ${localAuthority} / ${category}:`, err);
    }
  }

  // Keep previously stored rows even if this run produced nothing new.
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(localCharitySuggestionsTable)
    .where(eq(localCharitySuggestionsTable.localAuthority, localAuthority));
  const hasRows = (existing[0]?.count ?? 0) > 0;

  const status = anyStored || hasRows ? "ready" : anyError ? "failed" : "ready";

  await db
    .update(localCharityAreasTable)
    .set({
      status,
      lastGeneratedAt: new Date(),
      generationVersion: CURRENT_GENERATION_VERSION,
      updatedAt: new Date(),
    })
    .where(eq(localCharityAreasTable.localAuthority, localAuthority));
}

/** In-flight guard so concurrent requests don't kick off duplicate generations. */
const inFlight = new Set<string>();

function runGenerationInBackground(localAuthority: string, country: string): void {
  if (inFlight.has(localAuthority)) return;
  inFlight.add(localAuthority);
  generateForAuthority(localAuthority, country)
    .catch((err) => {
      console.error(`[premapped-charities] background generation failed for ${localAuthority}:`, err);
    })
    .finally(() => {
      inFlight.delete(localAuthority);
    });
}

/**
 * Ensure a local authority is known. Inserts a pending area row and kicks
 * off background generation the first time an authority is seen (or retries
 * after a failure). Returns the current area row.
 */
export async function ensureAuthority(
  localAuthority: string,
  country: string,
): Promise<{ status: string }> {
  const inserted = await db
    .insert(localCharityAreasTable)
    .values({ localAuthority, country, status: "pending" })
    .onConflictDoNothing()
    .returning({ status: localCharityAreasTable.status });

  if (inserted.length > 0) {
    runGenerationInBackground(localAuthority, country);
    return { status: "pending" };
  }

  const [area] = await db
    .select()
    .from(localCharityAreasTable)
    .where(eq(localCharityAreasTable.localAuthority, localAuthority));

  if (!area) {
    // Extremely unlikely race; treat as pending and let the next visit retry.
    return { status: "pending" };
  }

  // Retry failed areas, and restart generations that were interrupted by a
  // server restart (pending but nothing in flight).
  if (area.status === "failed" || (area.status === "pending" && !inFlight.has(localAuthority))) {
    runGenerationInBackground(localAuthority, area.country || country);
    return { status: "pending" };
  }

  return { status: area.status };
}

/**
 * Fetch stored suggestions for an authority, keyed by category, with the
 * community-corrections overrides layer merged on top. Merging at read time
 * means verified fixes are live immediately and survive regeneration.
 */
export async function getStoredSuggestions(
  localAuthority: string,
): Promise<Array<{ category: string; places: StoredCharityPlace[] }>> {
  const [rows, overrides] = await Promise.all([
    db
      .select()
      .from(localCharitySuggestionsTable)
      .where(eq(localCharitySuggestionsTable.localAuthority, localAuthority)),
    getOverridesForAuthority(localAuthority),
  ]);
  return mergeOverrides(
    rows.map((r) => ({ category: r.category, places: r.places })),
    overrides,
  );
}

/**
 * Refresh every known authority whose results are stale, missing, or were
 * generated by an older pipeline version (e.g. before website URLs were
 * added). Before sweeping, the SEED_AUTHORITIES list (top ~50 UK areas by
 * population) is inserted so big cities are pre-generated without anyone
 * having to visit first. Runs authorities sequentially with a throttle —
 * this is a slow background sweep, not a latency-sensitive path. Fresh
 * areas are skipped, so re-runs cost (almost) nothing.
 */
export async function runPremappedRefreshSweep(): Promise<number> {
  // Ensure the seed areas exist so they are picked up below (never
  // generated yet ⇒ lastGeneratedAt is null).
  await db
    .insert(localCharityAreasTable)
    .values(SEED_AUTHORITIES.map((s) => ({ ...s, status: "pending" as const })))
    .onConflictDoNothing();

  const cutoff = new Date(Date.now() - REFRESH_AFTER_MS);
  const stale = await db
    .select()
    .from(localCharityAreasTable)
    .where(
      or(
        isNull(localCharityAreasTable.lastGeneratedAt),
        lt(localCharityAreasTable.lastGeneratedAt, cutoff),
        lt(localCharityAreasTable.generationVersion, CURRENT_GENERATION_VERSION),
      ),
    );

  if (stale.length > 0) {
    console.log(`[premapped-charities] sweep: ${stale.length} authorities to generate`);
  }

  for (const area of stale) {
    try {
      await generateForAuthority(area.localAuthority, area.country);
    } catch (err) {
      console.error(`[premapped-charities] refresh failed for ${area.localAuthority}:`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, SWEEP_THROTTLE_MS));
  }
  return stale.length;
}

export function startPremappedRefreshJob(): void {
  // Never run the sweep during E2E tests — it would seed 50 areas and make
  // real AI calls in the middle of a test run.
  if (process.env.E2E_TEST_MODE === "1") {
    console.log("[premapped-charities] E2E test mode — refresh sweep disabled.");
    return;
  }
  setTimeout(() => {
    runPremappedRefreshSweep().catch((err) =>
      console.error("[premapped-charities] initial refresh sweep failed:", err)
    );
    setInterval(() => {
      runPremappedRefreshSweep().catch((err) =>
        console.error("[premapped-charities] refresh sweep failed:", err)
      );
    }, SWEEP_INTERVAL_MS);
  }, SWEEP_STARTUP_DELAY_MS);
}
