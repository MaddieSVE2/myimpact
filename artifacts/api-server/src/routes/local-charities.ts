import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  atomicIncrementTextAiUsage,
  TEXT_AI_CAP_REACHED_MESSAGE,
} from "../lib/textAiUsage.js";
import { TtlCache } from "../lib/ttlCache.js";
import { searchCharities, verifyCharityName } from "../lib/charity-commission";
import { searchOSCRCharities, verifyOSCRCharityName } from "../lib/oscr";
import { geocodePostcode, geocodePostcodes, haversineMiles } from "../lib/postcode.js";

const router = Router();

const localCharitiesRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many requests. Please slow down.",
});

const SCOTTISH_TERMS = new Set([
  "aberdeen", "aberdeenshire", "angus", "argyll", "bute", "clackmannanshire",
  "dumfries", "galloway", "dundee", "east ayrshire", "east dunbartonshire",
  "east lothian", "east renfrewshire", "edinburgh", "eilean siar",
  "falkirk", "fife", "glasgow", "highland", "highlands", "inverclyde",
  "midlothian", "moray", "north ayrshire", "north lanarkshire", "orkney",
  "perth", "kinross", "renfrewshire", "scottish borders", "shetland",
  "south ayrshire", "south lanarkshire", "stirling", "west dunbartonshire",
  "west lothian", "scotland", "scottish",
]);

function isScottishLocation(location: string): boolean {
  const lower = location.toLowerCase();
  return Array.from(SCOTTISH_TERMS).some(t => lower.includes(t));
}

const MAX_LOCATION_CHARS = 100;
const MAX_ACTIVITY_NAME_CHARS = 200;

const BLOCKED_NAME_TERMS = [
  "council", "county council", "city council", "borough council",
  "district council", "local authority", "government", "job centre",
  "jobcentre", "job center", "dwp", "department for work",
  "nhs ", " nhs", "hmrc", "home office", "police", "fire service",
];

function isBlockedOrganisation(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKED_NAME_TERMS.some(t => lower.includes(t));
}

type Verification = { registrationNumber: string } | null;

/**
 * Caches for AI/register lookups so repeat Ideas page loads don't burn AI
 * quota or hammer the charity registers. Keyed per user + normalised inputs;
 * results are cached AFTER register verification so trust badges are
 * preserved on cache hits. 24h TTL keeps suggestions reasonably fresh.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type SuggestPlace = {
  name: string;
  description: string;
  howToJoin: string;
  source: "ai";
  verified: boolean;
  registrationNumber?: string;
};
const suggestCache = new TtlCache<{ places: SuggestPlace[] }>(CACHE_TTL_MS);

function suggestCacheKey(userId: string, location: string, activityName: string): string {
  return `${userId}|${location.trim().toLowerCase()}|${activityName.trim().toLowerCase()}`;
}

/**
 * Best-effort verify a batch of AI-suggested organisation names against the
 * relevant official register (OSCR for Scotland, Charity Commission for E&W).
 * Returns one result per input name, in order; null where no confident match.
 * Never throws — verification only ever adds a trust badge, it must not block
 * AI suggestions from being returned.
 */
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

router.post("/suggest", authenticate, localCharitiesRateLimit, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }

    const { location, activityName } = req.body as {
      location: string;
      activityName: string;
    };

    if (!location?.trim() || !activityName?.trim()) {
      res.status(400).json({ error: "location and activityName are required" });
      return;
    }

    if (location.length > MAX_LOCATION_CHARS) {
      res.status(400).json({ error: `location must be at most ${MAX_LOCATION_CHARS} characters.` });
      return;
    }

    if (activityName.length > MAX_ACTIVITY_NAME_CHARS) {
      res.status(400).json({ error: `activityName must be at most ${MAX_ACTIVITY_NAME_CHARS} characters.` });
      return;
    }

    // Serve cached results without touching the AI provider or the user's
    // monthly quota. Verification badges were computed before caching.
    const cacheKey = suggestCacheKey(userId, location, activityName);
    const cached = suggestCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Only count against the monthly AI quota when we actually call the AI.
    const allowed = await atomicIncrementTextAiUsage(userId);
    if (!allowed) {
      res.status(429).json({
        error: TEXT_AI_CAP_REACHED_MESSAGE,
        code: "text_ai_cap_reached",
      });
      return;
    }

    const scotland = isScottishLocation(location);

    const baseParams = {
      model: "gpt-5-mini" as const,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" as const },
      messages: [
        {
          role: "system",
          content: `You are a UK volunteering expert. Given a location and a specific volunteering activity, suggest up to 3 real charities or voluntary organisations where someone could do that specific activity in the user's local area.

Return a JSON object with a "places" array. Each item has:
- name (string): the real name of the charity or voluntary organisation
- description (string): one sentence, max 15 words, explaining what they do — specific to the activity
- howToJoin (string): one concrete action to get started, max 12 words

Rules:
- Only suggest registered charities or voluntary/community organisations — never suggest councils, local authorities, government bodies, job centres, or DWP services
- Suggest organisations that actually operate in the given area — this INCLUDES local branches or projects of larger charities that run there, judged by where they deliver services, NOT by where they are registered
- First identify the specific local authority area for the given location so you can stay genuinely local
- Do NOT expand to clearly distant regions — keep suggestions local to the identified area
- If you cannot confidently find 2 or more real charities serving that area, return only the ones you are confident about (even just 1, or an empty array)
- Be specific — e.g. for "community garden" suggest actual named community gardens, not generic charities
- If the location is vague (e.g. "England"), suggest well-known national charitable networks for that activity
- Skip any entry you are not reasonably confident about — quality over quantity
- Use British English`,
        },
        {
          role: "user",
          content: `Location: ${location.trim()}\nActivity: ${activityName.trim()}`,
        },
      ],
    };

    let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    try {
      completion = await openai.chat.completions.create({
        ...baseParams,
        reasoning_effort: "low",
      } as Parameters<typeof openai.chat.completions.create>[0]);
    } catch (err) {
      console.warn("Local charities: reasoning_effort not accepted, retrying without it:", err);
      completion = await openai.chat.completions.create(baseParams);
    }

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
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
          .map(({ name, description, howToJoin }: {
            name: string;
            description?: string;
            howToJoin?: string;
          }) => ({
            name,
            description: typeof description === "string" ? description : "",
            howToJoin: typeof howToJoin === "string" ? howToJoin : "",
          }))
      : [];

    const verifications = await verifyMany(aiPlaces.map((p: { name: string }) => p.name), scotland);

    const places = aiPlaces.map((p: { name: string; description: string; howToJoin: string }, i: number) => ({
      ...p,
      source: "ai" as const,
      verified: verifications[i] !== null,
      registrationNumber: verifications[i]?.registrationNumber,
    }));

    // Only cache non-empty results — an empty answer is often transient
    // (truncated AI output, register hiccup) and shouldn't stick for 24h.
    if (places.length > 0) {
      suggestCache.set(cacheKey, { places });
    }

    res.json({ places });
  } catch (err) {
    console.error("Local charities error:", err);
    res.status(500).json({ error: "Failed to find local organisations" });
  }
});

/**
 * "Near you this week" lookup. Given a postcode + a list of interest ids,
 * map each interest to a small set of activity keywords, run register lookups
 * (OSCR for Scottish postcodes, Charity Commission otherwise), geocode each
 * result's postcode, and return the nearest unique charities sorted by
 * distance. We cap distance at 30 miles so a result truly is "near you".
 */

const INTEREST_TO_ACTIVITY: Record<string, string> = {
  environment: "wildlife conservation",
  mental_health: "mental health",
  community: "community garden",
  education: "tutoring",
  physical_health: "sport",
  fairness: "homelessness",
  animal_welfare: "animal welfare",
  children: "youth mentoring",
  older_people: "befriending",
  poverty: "food bank",
  arts: "arts",
  sport: "sport",
  homelessness: "homeless",
  digital: "digital skills",
  disability: "disability",
  international: "refugees",
  caring: "caring",
  military: "military",
};

const DEFAULT_ACTIVITIES = ["food bank", "befriending", "community garden"];
const MAX_INTERESTS = 4;
const MAX_DISTANCE_MILES = 30;
const MAX_NEARBY_RESULTS = 6;

function activitiesForInterests(interests: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of interests) {
    const act = INTEREST_TO_ACTIVITY[id];
    if (act && !seen.has(act)) {
      seen.add(act);
      result.push(act);
      if (result.length >= MAX_INTERESTS) break;
    }
  }
  if (result.length === 0) return DEFAULT_ACTIVITIES.slice();
  return result;
}

type NearbyResponse = {
  nearby: Array<{
    name: string;
    activityType: string;
    distanceMiles: number;
    description: string;
    website: string | null;
    registerUrl: string;
    registrationNumber: string;
    source: "register";
  }>;
  location: { postcode: string; adminDistrict: string; country: string };
};
const nearbyCache = new TtlCache<NearbyResponse>(CACHE_TTL_MS);

function nearbyCacheKey(userId: string, postcode: string, interests: string[]): string {
  const pc = postcode.replace(/\s+/g, "").toUpperCase();
  const ints = [...interests].sort().join(",");
  return `${userId}|${pc}|${ints}`;
}

router.post("/nearby", authenticate, localCharitiesRateLimit, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }

    const { postcode, interests } = req.body as {
      postcode?: string;
      interests?: string[];
    };

    if (!postcode || typeof postcode !== "string" || !postcode.trim()) {
      res.status(400).json({ error: "postcode is required" });
      return;
    }

    const interestListForKey = Array.isArray(interests)
      ? interests.filter((i): i is string => typeof i === "string")
      : [];

    const cacheKey = nearbyCacheKey(userId, postcode, interestListForKey);
    const cachedNearby = nearbyCache.get(cacheKey);
    if (cachedNearby) {
      res.json(cachedNearby);
      return;
    }

    const userGeo = await geocodePostcode(postcode);
    if (!userGeo) {
      res.status(404).json({ error: "Could not look up that postcode" });
      return;
    }

    const activities = activitiesForInterests(interestListForKey);

    const ccApiKey = process.env.CHARITY_COMMISSION_API_KEY;
    const oscrApiKey = process.env.OSCR_API_KEY;
    const useScotland = userGeo.country.toLowerCase() === "scotland";
    const locationHint = userGeo.adminDistrict || postcode.trim();

    type RawCharity = {
      activityType: string;
      name: string;
      registrationNumber: string;
      description: string;
      website: string | null;
      registerUrl: string;
      postcode: string | null;
      source: "register";
    };

    const lookups = await Promise.all(
      activities.map(async (activity): Promise<RawCharity[]> => {
        try {
          if (useScotland) {
            const list = await Promise.race([
              searchOSCRCharities(locationHint, activity, oscrApiKey, 5),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("OSCR timeout")), 12000)
              ),
            ]);
            return list.map(c => ({
              activityType: activity,
              name: c.name,
              registrationNumber: c.registrationNumber,
              description: c.description,
              website: c.website,
              registerUrl: c.registerUrl,
              postcode: c.postcode,
              source: "register" as const,
            }));
          }
          if (!ccApiKey) return [];
          const list = await searchCharities(locationHint, activity, ccApiKey, 5);
          return list.map(c => ({
            activityType: activity,
            name: c.name,
            registrationNumber: c.registrationNumber,
            description: c.description,
            website: c.website,
            registerUrl: c.registerUrl,
            postcode: c.postcode,
            source: "register" as const,
          }));
        } catch (err) {
          console.error(`nearby lookup failed for ${activity}:`, err);
          return [];
        }
      })
    );

    const flat = lookups.flat();
    const candidates = flat.filter(c => c.postcode && c.postcode.trim());
    const charityPostcodes = candidates.map(c => c.postcode as string);
    const geoMap = await geocodePostcodes(charityPostcodes);

    const seen = new Set<string>();
    const enriched = candidates
      .map(c => {
        const key = (c.postcode ?? "").replace(/\s+/g, "").toUpperCase();
        const geo = geoMap.get(key);
        if (!geo) return null;
        const distanceMiles = haversineMiles(userGeo, geo);
        return { ...c, distanceMiles };
      })
      .filter((c): c is RawCharity & { distanceMiles: number } => c !== null)
      .filter(c => c.distanceMiles <= MAX_DISTANCE_MILES);

    enriched.sort((a, b) => {
      const aIdx = activities.indexOf(a.activityType);
      const bIdx = activities.indexOf(b.activityType);
      const aWeight = a.distanceMiles + aIdx * 0.5;
      const bWeight = b.distanceMiles + bIdx * 0.5;
      return aWeight - bWeight;
    });

    const nearby: Array<{
      name: string;
      activityType: string;
      distanceMiles: number;
      description: string;
      website: string | null;
      registerUrl: string;
      registrationNumber: string;
      source: "register";
    }> = [];
    for (const c of enriched) {
      if (seen.has(c.registrationNumber)) continue;
      seen.add(c.registrationNumber);
      nearby.push({
        name: c.name,
        activityType: c.activityType,
        distanceMiles: Math.round(c.distanceMiles * 10) / 10,
        description: c.description,
        website: c.website,
        registerUrl: c.registerUrl,
        registrationNumber: c.registrationNumber,
        source: "register",
      });
      if (nearby.length >= MAX_NEARBY_RESULTS) break;
    }

    const response: NearbyResponse = {
      nearby,
      location: {
        postcode: postcode.trim().toUpperCase(),
        adminDistrict: userGeo.adminDistrict,
        country: userGeo.country,
      },
    };

    // Only cache non-empty results so a transient register outage doesn't
    // pin an empty "near you" section for a full day.
    if (nearby.length > 0) {
      nearbyCache.set(cacheKey, response);
    }

    res.json(response);
  } catch (err) {
    console.error("Local charities nearby error:", err);
    res.status(500).json({ error: "Failed to find nearby organisations" });
  }
});

export default router;
