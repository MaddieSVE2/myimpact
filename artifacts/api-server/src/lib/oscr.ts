/**
 * OSCR (Office of the Scottish Charity Regulator) service.
 *
 * Uses the OSCR Public API (https://oscrapi.azurewebsites.net/api/all_charities).
 * Auth: `functions-key` request header (stored as OSCR_API_KEY env secret).
 *
 * The API is a paginated bulk-export endpoint with no built-in keyword or location
 * search. We fetch several pages in parallel and filter client-side by:
 *   1. Location: charityName, principalOfficeTownName, or mainOperatingLocation
 *      contains a word from the cleaned location string.
 *   2. Activity: objectives, purposes, or typesOfActivities contains a keyword
 *      derived from the activity name.
 *
 * If the API key is absent or no results match, returns [] so the route falls
 * back to AI suggestions.
 */

const OSCR_API_BASE = "https://oscrapi.azurewebsites.net/api/all_charities";
const BATCH_SIZE = 5;
const MAX_PAGES = 20;

export interface OSCRCharity {
  name: string;
  registrationNumber: string;
  description: string;
  website: string | null;
  registerUrl: string;
}

interface OSCRRecord {
  charityName?: string;
  charityNumber?: string;
  website?: string;
  objectives?: string;
  purposes?: string[];
  typesOfActivities?: string[];
  principalOfficeTownName?: string;
  mainOperatingLocation?: string;
  postcode?: string;
}

interface OSCRPage {
  totalPages?: number;
  currentPage?: number;
  data?: OSCRRecord[];
}

function buildActivityKeywords(activityName: string): string[] {
  const lower = activityName.toLowerCase();
  const KEYWORD_MAP: Array<[string, string[]]> = [
    ["food bank", ["food", "foodbank", "hunger", "poverty"]],
    ["conservation", ["conservation", "wildlife", "nature", "environment"]],
    ["mental health", ["mental health", "wellbeing", "counselling", "therapy"]],
    ["youth", ["youth", "young people", "children", "mentoring", "junior"]],
    ["elderly", ["elderly", "older", "age", "senior", "care home"]],
    ["befriending", ["befriending", "companionship", "loneliness", "isolation"]],
    ["education", ["education", "tutoring", "learning", "literacy", "numeracy"]],
    ["sport", ["sport", "athletics", "fitness", "recreation"]],
    ["arts", ["arts", "creative", "theatre", "music", "culture"]],
    ["employment", ["employment", "job", "career", "skills", "training"]],
    ["homeless", ["homeless", "housing", "shelter", "refuge"]],
    ["disability", ["disability", "disabled", "accessibility"]],
    ["community garden", ["garden", "allotment", "growing", "horticulture"]],
  ];
  for (const [key, keywords] of KEYWORD_MAP) {
    if (lower.includes(key)) return keywords;
  }
  return activityName
    .toLowerCase()
    .replace(/volunteering|volunteer|community|general/gi, "")
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 3);
}

function cleanLocation(location: string): string {
  return location
    .trim()
    .replace(/\s+(city\s+)?council\s*$/i, "")
    .replace(/\s+region\s*$/i, "")
    .trim();
}

async function fetchPage(page: number, apiKey: string): Promise<OSCRPage> {
  const resp = await fetch(`${OSCR_API_BASE}?page=${page}`, {
    headers: { "functions-key": apiKey },
  });
  if (!resp.ok) return {};
  return (await resp.json()) as OSCRPage;
}

function recordMatchesLocation(record: OSCRRecord, locationWords: string[]): boolean {
  const fields = [
    record.charityName ?? "",
    record.principalOfficeTownName ?? "",
    record.mainOperatingLocation ?? "",
  ].map(s => s.toLowerCase());
  return locationWords.some(w => fields.some(f => f.includes(w)));
}

function recordMatchesActivity(record: OSCRRecord, keywords: string[]): boolean {
  const fields = [
    record.objectives ?? "",
    ...(record.purposes ?? []),
    ...(record.typesOfActivities ?? []),
  ].map(s => s.toLowerCase());
  return keywords.some(kw => fields.some(f => f.includes(kw)));
}

export async function searchOSCRCharities(
  location: string,
  activityName: string,
  apiKey: string | undefined,
  maxResults = 3
): Promise<OSCRCharity[]> {
  if (!apiKey) {
    return [];
  }

  const locationClean = cleanLocation(location);
  const locationWords = locationClean
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);
  const activityKeywords = buildActivityKeywords(activityName);

  try {
    let totalPages = MAX_PAGES;
    let nextPage = 1;
    let bothMatches: OSCRRecord[] = [];

    while (bothMatches.length < maxResults && nextPage <= Math.min(totalPages, MAX_PAGES)) {
      const batchNums = Array.from(
        { length: Math.min(BATCH_SIZE, Math.min(totalPages, MAX_PAGES) - nextPage + 1) },
        (_, i) => nextPage + i
      );
      const pages = await Promise.all(batchNums.map(p => fetchPage(p, apiKey)));

      for (const page of pages) {
        if (page.totalPages) totalPages = page.totalPages;
        const records = Array.isArray(page.data) ? page.data : [];
        const localAndActivity = records
          .filter(r => recordMatchesLocation(r, locationWords))
          .filter(r => recordMatchesActivity(r, activityKeywords));
        bothMatches = bothMatches.concat(localAndActivity);
      }

      nextPage += BATCH_SIZE;
    }

    if (bothMatches.length === 0) return [];
    const candidates = bothMatches;

    return candidates.slice(0, maxResults).map((r): OSCRCharity => {
      const regNum = r.charityNumber ?? "";
      const registerUrl = regNum
        ? `https://www.oscr.org.uk/about-charities/search-the-register/charity-details?number=${regNum}`
        : "https://www.oscr.org.uk/about-charities/search-the-register/";
      const purposes = (r.purposes ?? []).join("; ");
      const description = purposes
        ? purposes.slice(0, 120) + (purposes.length > 120 ? "…" : "")
        : r.principalOfficeTownName
        ? `Scottish registered charity based in ${r.principalOfficeTownName}`
        : `Scottish registered charity`;
      const rawSite = r.website ?? "";
      const website = rawSite.startsWith("http") ? rawSite : null;
      return { name: r.charityName ?? "Unknown charity", registrationNumber: regNum, description, website, registerUrl };
    });
  } catch (err) {
    console.error("OSCR API error:", err);
    return [];
  }
}
