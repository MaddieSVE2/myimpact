const CC_BASE = "https://api.charitycommission.gov.uk/register/api";

export interface CCCharity {
  name: string;
  registrationNumber: string;
  description: string;
  website: string | null;
  registerUrl: string;
}

const ACTIVITY_KEYWORDS: Record<string, string[]> = {
  "food bank": ["food bank", "foodbank"],
  "community garden": ["community garden", "allotment"],
  "wildlife": ["wildlife", "conservation", "nature"],
  "tree planting": ["tree", "woodland", "forestry"],
  "litter": ["litter", "environment", "clean"],
  "social club": ["community", "social"],
  "fundraising": ["fundraising", "fund raising"],
  "sports": ["sport", "sports", "athletics"],
  "arts": ["arts", "creative", "theatre", "museum"],
  "employment": ["employment", "job club", "careers"],
  "elderly": ["elderly", "older people", "age", "senior"],
  "befriending": ["befriending", "companionship", "loneliness"],
  "mental health": ["mental health", "wellbeing", "counselling"],
  "youth": ["youth", "young people", "mentoring"],
  "education": ["education", "tutoring", "learning", "skills"],
  "literacy": ["literacy", "reading", "numeracy"],
  "digital": ["digital", "technology", "computing"],
  "blood": ["blood", "donation"],
  "children": ["children", "family", "child"],
  "hospice": ["hospice", "palliative"],
  "homelessness": ["homeless", "housing", "shelter"],
  "disability": ["disability", "disabled"],
  "refugees": ["refugee", "asylum"],
};

function activityToKeywords(activityName: string): string[] {
  const lower = activityName.toLowerCase();
  for (const [key, keywords] of Object.entries(ACTIVITY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k)) || lower.includes(key)) {
      return keywords;
    }
  }
  const words = lower
    .replace(/volunteering|volunteer|community|support|helping|general/gi, "")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .slice(0, 2);
  return words.length ? words : [activityName.split(" ").slice(0, 2).join(" ")];
}

async function searchByName(term: string, apiKey: string): Promise<Array<{
  reg_charity_number: number;
  group_subsid_suffix: number;
  charity_name: string;
  reg_status: string;
}>> {
  const encoded = encodeURIComponent(term);
  const url = `${CC_BASE}/searchCharityName/${encoded}`;
  const resp = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

type CCDetails = {
  web?: string;
  address_post_code?: string;
  address_line_one?: string;
  address_line_two?: string;
  address_line_three?: string;
  address_line_four?: string;
  address_line_five?: string;
};

function parseCCDetails(raw: unknown): CCDetails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    web: str(r["web"]),
    address_post_code: str(r["address_post_code"]),
    address_line_one: str(r["address_line_one"]),
    address_line_two: str(r["address_line_two"]),
    address_line_three: str(r["address_line_three"]),
    address_line_four: str(r["address_line_four"]),
    address_line_five: str(r["address_line_five"]),
  };
}

async function getCharityDetails(regNumber: number, suffix: number, apiKey: string): Promise<CCDetails | null> {
  const url = `${CC_BASE}/charitydetails/${regNumber}/${suffix}`;
  const resp = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!resp.ok) return null;
  return parseCCDetails(await resp.json());
}

export async function searchCharities(
  location: string,
  activityName: string,
  apiKey: string,
  maxResults = 3
): Promise<CCCharity[]> {
  const keywords = activityToKeywords(activityName);
  const primaryKeyword = keywords[0];

  const locationParts = location
    .trim()
    .toLowerCase()
    .replace(/\s*(council|city council|borough|district)\s*/i, "")
    .trim();

  type CandidateRow = {
    reg_charity_number: number;
    group_subsid_suffix: number;
    charity_name: string;
    reg_status: string;
  };
  let candidates: CandidateRow[] = [];

  const isRegistered = (c: CandidateRow) => c.reg_status === "R" || c.reg_status === "Registered";

  const [localByName, broadByKeyword] = await Promise.all([
    searchByName(`${locationParts} ${primaryKeyword}`, apiKey),
    searchByName(primaryKeyword, apiKey),
  ]);

  const confirmedByName = localByName.filter(isRegistered);
  candidates = confirmedByName;

  if (candidates.length < maxResults) {
    const broadRegistered = broadByKeyword.filter(isRegistered);
    const locationWords = locationParts.split(/\s+/).filter(w => w.length > 2);
    const nameMatchesLocation = (name: string) =>
      locationWords.some(w => name.toLowerCase().includes(w));

    const nameLocalMatches = broadRegistered.filter(c => nameMatchesLocation(c.charity_name));
    const existingNums = new Set(candidates.map(c => c.reg_charity_number));
    for (const r of nameLocalMatches) {
      if (!existingNums.has(r.reg_charity_number)) {
        candidates.push(r);
        existingNums.add(r.reg_charity_number);
      }
    }
  }

  const top = candidates.slice(0, maxResults * 3);

  const detailed = await Promise.all(
    top.map(c => getCharityDetails(c.reg_charity_number, c.group_subsid_suffix, apiKey))
  );

  const locationWords = locationParts
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => w.toLowerCase());

  function addressMatchesLocation(d: CCDetails | null): boolean {
    if (!d) return false;
    const addressText = [
      d.address_line_one,
      d.address_line_two,
      d.address_line_three,
      d.address_line_four,
      d.address_line_five,
      d.address_post_code,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return locationWords.some(w => addressText.includes(w));
  }

  if (top.length === 0) return [];

  const enriched = top.map((c, i) => ({
    candidate: c,
    detail: detailed[i],
    local: addressMatchesLocation(detailed[i]),
  }));

  enriched.sort((a, b) => Number(b.local) - Number(a.local));

  const results: CCCharity[] = [];
  for (let i = 0; i < enriched.length && results.length < maxResults; i++) {
    const { candidate: c, detail: d, local } = enriched[i];
    const regNum = String(c.reg_charity_number);
    const registerUrl = `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${regNum}/`;
    const addressParts = [d?.address_line_one, d?.address_line_two, d?.address_post_code]
      .filter(Boolean)
      .join(", ");
    const description = addressParts
      ? `Registered charity based in ${addressParts}`
      : local
      ? `Registered charity working in ${location}`
      : `Registered UK charity working in ${activityName.toLowerCase()}`;

    results.push({
      name: c.charity_name,
      registrationNumber: regNum,
      description,
      website: d?.web && d.web.startsWith("http") ? d.web : null,
      registerUrl,
    });
  }

  return results;
}
