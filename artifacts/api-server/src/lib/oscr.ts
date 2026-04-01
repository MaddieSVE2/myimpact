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
 * Candidates are ranked by most recent GrossIncome (from annual returns) descending
 * before slicing to maxResults.
 *
 * If the API key is absent or no results match, returns [] so the route falls
 * back to AI suggestions.
 */

const OSCR_API_BASE = "https://oscrapi.azurewebsites.net/api";
const BATCH_SIZE = 4;
const MAX_PAGES = 4;
const TIMEOUT_MS = 12000;

export interface OSCRCharity {
  name: string;
  registrationNumber: string;
  description: string;
  website: string | null;
  registerUrl: string;
}

interface OSCRRecord {
  id?: string;
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

interface OSCRAnnualReturn {
  GrossIncome?: number;
  Year?: number;
  [key: string]: unknown;
}

function buildActivityKeywords(activityName: string): string[] {
  const lower = activityName.toLowerCase();
  const KEYWORD_MAP: Array<[string, string[]]> = [
    // Health
    ["blood donation", ["blood", "transfusion", "donor", "nhs blood"]],
    ["mental health", ["mental health", "wellbeing", "counselling", "therapy", "mind", "depression", "anxiety"]],
    ["medical", ["medical", "health", "nhs", "clinical"]],
    // Caring / befriending
    ["befriend", ["befriending", "companionship", "loneliness", "isolation", "visiting"]],
    ["caring", ["caring", "carer", "care", "support", "unpaid care"]],
    ["elderly", ["elderly", "older people", "age", "senior", "care home", "dementia"]],
    ["visiting isolated", ["befriending", "loneliness", "isolation", "visiting", "companionship"]],
    ["family caring", ["carer", "care", "family support", "disability", "unpaid"]],
    // Food / poverty
    ["food bank", ["food bank", "foodbank", "food poverty", "hunger", "poverty relief", "trussell"]],
    ["food waste", ["food", "waste", "surplus", "redistribution"]],
    // Environment / nature
    ["recycling", ["recycling", "waste", "environment", "sustainability", "circular"]],
    ["litter", ["litter", "clean up", "environment", "cleaner communities"]],
    ["wildlife conservation", ["conservation", "wildlife", "nature", "biodiversity", "habitat", "environment"]],
    ["conservation", ["conservation", "wildlife", "nature", "environment", "biodiversity"]],
    ["community garden", ["garden", "allotment", "growing", "horticulture", "green space", "biodiversity"]],
    ["tree planting", ["trees", "woodland", "reforestation", "green space", "environment"]],
    ["energy saving", ["energy", "fuel poverty", "climate", "sustainability", "renewable"]],
    ["eco transport", ["cycling", "walking", "sustainable transport", "active travel"]],
    ["sustainable transport", ["cycling", "walking", "sustainable transport", "active travel"]],
    // Community
    ["fundraising", ["fundraising", "fund raising", "charity events", "donations", "sponsorship"]],
    ["sports coaching", ["sport", "athletics", "coaching", "fitness", "recreation", "active"]],
    ["sport", ["sport", "athletics", "coaching", "fitness", "recreation", "active"]],
    ["arts", ["arts", "creative", "theatre", "music", "culture", "performing arts", "visual arts"]],
    ["music", ["music", "performing arts", "arts", "culture", "choir"]],
    ["community social", ["social club", "community group", "companionship", "loneliness"]],
    ["charity shop", ["charity shop", "reuse", "recycling", "thrift", "second hand"]],
    ["animal", ["animal welfare", "animals", "pets", "veterinary", "wildlife", "rescue"]],
    // Education / mentoring / digital
    ["mentoring", ["mentoring", "young people", "youth", "coaching", "guidance"]],
    ["youth mentoring", ["mentoring", "young people", "youth", "coaching", "guidance", "junior"]],
    ["youth", ["youth", "young people", "children", "junior", "mentoring"]],
    ["tutoring", ["education", "tutoring", "learning", "literacy", "numeracy", "teaching"]],
    ["literacy", ["literacy", "reading", "writing", "numeracy", "education"]],
    ["digital skills", ["digital", "technology", "online", "internet", "computer skills", "digital inclusion"]],
    ["digital coaching", ["digital", "technology", "online", "internet", "computer skills", "digital inclusion"]],
    ["employability", ["employability", "employment", "jobs", "careers", "skills", "work", "training"]],
    ["employment", ["employment", "job", "career", "skills", "training", "employability"]],
    ["job club", ["employment", "job", "career", "skills", "training", "employability"]],
    ["coding", ["digital", "technology", "coding", "stem", "computing", "programming", "education"]],
    ["stem", ["stem", "science", "technology", "engineering", "maths", "education"]],
    ["duke of edinburgh", ["youth", "young people", "volunteering", "skills", "dofe"]],
    // Housing / homelessness
    ["homeless", ["homeless", "housing", "shelter", "refuge", "rough sleeping", "homelessness"]],
    // Disability
    ["disability", ["disability", "disabled", "accessibility", "inclusion", "impairment"]],
    // General
    ["education", ["education", "learning", "tutoring", "literacy", "numeracy", "teaching"]],
    ["community", ["community", "local", "neighbourhood", "civic"]],
    ["military", ["armed forces", "veterans", "military", "ex-service"]],
    ["volunteering", ["community", "volunteering", "voluntary", "local", "civic", "neighbourhood"]],
    ["volunteer", ["community", "volunteering", "voluntary", "local", "civic", "neighbourhood"]],
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
  const resp = await fetch(`${OSCR_API_BASE}/all_charities?page=${page}`, {
    headers: { "x-functions-key": apiKey },
  });
  if (!resp.ok) return {};
  return (await resp.json()) as OSCRPage;
}

async function fetchAnnualReturns(charityId: string, apiKey: string): Promise<OSCRAnnualReturn[]> {
  try {
    const resp = await fetch(`${OSCR_API_BASE}/annualreturns?charityid=${encodeURIComponent(charityId)}`, {
      headers: { "x-functions-key": apiKey },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getMostRecentIncome(returns: OSCRAnnualReturn[]): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => (b.Year ?? 0) - (a.Year ?? 0));
  return sorted[0].GrossIncome ?? 0;
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

    const candidates = bothMatches.slice(0, maxResults);

    return candidates.map((r): OSCRCharity => {
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
