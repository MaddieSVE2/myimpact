import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { authenticate } from "../middleware/authenticate.js";
import { textAiQuota } from "../lib/textAiUsage.js";
import { searchCharities } from "../lib/charity-commission";
import { searchOSCRCharities } from "../lib/oscr";
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

router.post("/suggest", authenticate, localCharitiesRateLimit, textAiQuota, async (req, res) => {
  try {
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

    const ccApiKey = process.env.CHARITY_COMMISSION_API_KEY;
    const oscrApiKey = process.env.OSCR_API_KEY;

    let registerPlaces: Array<{
      name: string;
      description: string;
      howToJoin: string;
      website: string | null;
      source: "register";
      registrationNumber: string;
      registerUrl: string;
    }> = [];

    const scotland = isScottishLocation(location);

    if (scotland) {
      try {
        const oscrResults = await Promise.race([
          searchOSCRCharities(location, activityName, oscrApiKey, 3),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("OSCR timeout")), 12000)
          ),
        ]);
        registerPlaces = oscrResults.map(c => ({
          name: c.name,
          description: c.description,
          howToJoin: `Visit their official OSCR register page to find out how to get involved`,
          website: c.website ?? c.registerUrl,
          source: "register" as const,
          registrationNumber: c.registrationNumber,
          registerUrl: c.registerUrl,
        }));
      } catch (err) {
        console.error("OSCR search error:", err);
      }
    } else if (!scotland && ccApiKey) {
      try {
        const ccResults = await searchCharities(location, activityName, ccApiKey, 3);
        registerPlaces = ccResults.map(c => ({
          name: c.name,
          description: c.description,
          howToJoin: `Visit their official Charity Commission page to find out how to get involved`,
          website: c.website ?? c.registerUrl,
          source: "register" as const,
          registrationNumber: c.registrationNumber,
          registerUrl: c.registerUrl,
        }));
      } catch (err) {
        console.error("Charity Commission search error:", err);
      }
    }

    if (registerPlaces.length > 0) {
      res.json({ places: registerPlaces });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a UK volunteering expert. Given a location and a specific volunteering activity, suggest up to 3 real local organisations, groups, or charities where someone could do that specific activity within the user's local authority/council area.

Return a JSON object with a "places" array. Each item has:
- name (string): the real name of the organisation or group
- description (string): one sentence, max 15 words, explaining what they do — specific to the activity
- howToJoin (string): one concrete action to get started, max 12 words
- website (string | null): the organisation's own website URL (e.g. "https://example.org") — only include if you are confident it is correct; otherwise return null

Rules:
- First, identify the specific local authority or council area for the given location (e.g. Fife Council, Glasgow City Council, Leeds City Council, City of Lincoln Council)
- Only suggest organisations that operate specifically within that identified local authority — not neighbouring councils or regions
- Do NOT expand to neighbouring areas, even if it would produce more results — strict boundary adherence is required
- If you cannot confidently find 2 or more real organisations within that specific local authority, return only the ones you are confident about (even just 1, or an empty array)
- Be specific — e.g. for "community garden" suggest actual named community gardens, not generic charities
- If the location is vague (e.g. "England"), suggest well-known national networks for that activity
- Skip any entry you are not reasonably confident about — quality over quantity
- Only provide a website URL if you are highly confident it is the correct, real URL for that organisation — return null if unsure
- Use British English`,
        },
        {
          role: "user",
          content: `Location: ${location.trim()}\nActivity: ${activityName.trim()}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    let parsed: { places?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const places = Array.isArray(parsed.places)
      ? parsed.places.map(({ name, description, howToJoin, website }: {
          name: string;
          description: string;
          howToJoin: string;
          website?: string | null;
        }) => ({
          name,
          description,
          howToJoin,
          website: typeof website === "string" && website.startsWith("http") ? website : null,
          source: "ai" as const,
        }))
      : [];

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

router.post("/nearby", authenticate, localCharitiesRateLimit, async (req, res) => {
  try {
    const { postcode, interests } = req.body as {
      postcode?: string;
      interests?: string[];
    };

    if (!postcode || typeof postcode !== "string" || !postcode.trim()) {
      res.status(400).json({ error: "postcode is required" });
      return;
    }

    const userGeo = await geocodePostcode(postcode);
    if (!userGeo) {
      res.status(404).json({ error: "Could not look up that postcode" });
      return;
    }

    const interestList = Array.isArray(interests)
      ? interests.filter((i): i is string => typeof i === "string")
      : [];
    const activities = activitiesForInterests(interestList);

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

    res.json({
      nearby,
      location: {
        postcode: postcode.trim().toUpperCase(),
        adminDistrict: userGeo.adminDistrict,
        country: userGeo.country,
      },
    });
  } catch (err) {
    console.error("Local charities nearby error:", err);
    res.status(500).json({ error: "Failed to find nearby organisations" });
  }
});

export default router;
