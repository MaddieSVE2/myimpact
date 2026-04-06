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
    // Health — specific clinical/service terms only
    ["blood donation", ["blood donation", "blood donor", "blood transfusion", "nhs blood"]],
    ["mental health", ["mental health", "counselling", "therapy", "depression", "anxiety", "psychiatric", "wellbeing support"]],
    ["medical", ["medical", "clinical", "nhs", "hospital", "patient"]],
    // Caring / befriending — specific outcome terms
    ["befriend", ["befriending", "companionship", "loneliness", "social isolation", "visiting volunteers"]],
    ["caring", ["unpaid carer", "carer support", "informal carer", "family carer"]],
    ["elderly", ["elderly", "older people", "older adults", "dementia", "care home", "sheltered housing"]],
    ["visiting isolated", ["befriending", "social isolation", "loneliness", "visiting volunteer"]],
    ["family caring", ["family carer", "unpaid carer", "carer support", "disability support"]],
    // Food / poverty — specific named services
    ["food bank", ["food bank", "foodbank", "food parcel", "food poverty", "emergency food", "trussell"]],
    ["food waste", ["food waste", "surplus food", "food redistribution", "food sharing"]],
    // Environment / nature — SPECIFIC terms only, no broad "environment"
    ["recycling", ["recycling", "household waste", "waste reduction", "zero waste", "circular economy", "reuse"]],
    ["litter", ["litter picking", "litter collection", "street clean", "beach clean", "clean-up"]],
    ["wildlife conservation", ["wildlife", "conservation volunteer", "nature reserve", "habitat restoration", "biodiversity", "species"]],
    ["conservation", ["wildlife", "nature reserve", "habitat", "biodiversity", "conservation volunteer"]],
    ["community garden", ["community garden", "allotment", "growing food", "horticulture", "urban growing", "community growing"]],
    ["tree planting", ["tree planting", "woodland creation", "reforestation", "forestry volunteer", "tree nursery"]],
    ["energy saving", ["fuel poverty", "energy efficiency", "insulation", "retrofit", "warm homes", "heating costs"]],
    ["eco transport", ["cycling", "active travel", "walking group", "sustainable transport", "car sharing"]],
    ["sustainable transport", ["cycling", "active travel", "walking", "sustainable transport"]],
    // Community — specific activity terms
    ["fundraising", ["fundraising", "fund raising", "sponsored", "charity event", "charity run"]],
    ["sports coaching", ["sports coaching", "sports club", "athletics", "fitness coaching", "recreational sport"]],
    ["sport", ["sports club", "athletics", "sporting", "fitness", "recreational sport", "active"]],
    ["arts", ["arts", "creative", "theatre", "performing arts", "visual arts", "cultural"]],
    ["music", ["music", "choir", "orchestra", "band", "singing", "performing arts"]],
    ["community social", ["social club", "social group", "community café", "lunch club", "befriending", "isolation"]],
    ["charity shop", ["charity shop", "second hand", "thrift", "reuse", "donated goods"]],
    ["animal", ["animal welfare", "animal rescue", "pets", "veterinary", "dog rescue", "cat rescue"]],
    // Education / mentoring / digital — specific programme terms
    ["mentoring", ["mentoring", "mentor", "young people", "guidance", "personal development"]],
    ["youth mentoring", ["mentoring", "youth mentor", "young people", "guidance", "personal development"]],
    ["youth", ["youth", "young people", "children", "junior", "youth club", "after school"]],
    ["tutoring", ["tutoring", "tuition", "literacy support", "numeracy", "homework", "reading support"]],
    ["literacy", ["literacy", "reading", "writing skills", "numeracy", "phonics", "adult literacy"]],
    ["digital skills", ["digital inclusion", "digital skills", "computer skills", "online safety", "internet access"]],
    ["digital coaching", ["digital inclusion", "digital skills", "computer training", "online skills"]],
    ["employability", ["employability", "employment support", "job skills", "career guidance", "back to work"]],
    ["employment", ["employment support", "job club", "career guidance", "employability", "back to work"]],
    ["job club", ["job club", "employment support", "cv help", "interview skills", "job search"]],
    ["coding", ["coding", "programming", "computing", "stem", "software", "digital skills"]],
    ["stem", ["stem", "science", "engineering", "maths", "computing", "robotics"]],
    ["duke of edinburgh", ["duke of edinburgh", "dofe", "d of e", "youth award", "bronze award"]],
    // Housing / homelessness
    ["homeless", ["homeless", "homelessness", "rough sleeping", "housing support", "night shelter", "refuge"]],
    // Disability
    ["disability", ["disability", "disabled people", "learning disability", "physical disability", "accessibility"]],
    // General — kept deliberately broad only for catch-alls
    ["education", ["education", "learning", "tutoring", "literacy", "teaching", "training"]],
    ["military", ["armed forces", "veterans", "ex-service", "military", "forces"]],
    ["volunteering", ["volunteering", "volunteer programme", "voluntary work", "community action"]],
    ["volunteer", ["volunteering", "volunteer programme", "voluntary work", "community action"]],
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
