// Mock data for the demo organisation dashboard (org id "demo-org-0000000000000").
// The shape mirrors what a future server-backed activity feed will return so the
// UI can swap to real data without re-design.

export const DEMO_ORG_ID = "demo-org-0000000000000";
export const DEMO_INVITE_CODE = "DEMO-0000";
export const DEMO_ORG_NAME = "Demo Organisation";
export const DEMO_ORG_TYPE = "corporate";
export const DEMO_ORG_CONTACT_EMAIL = "organisation@organisation.org";

export type ActivityCategory =
  | "Environment"
  | "Community"
  | "Health"
  | "Education"
  | "Sport & Active"
  | "Fundraising"
  | "Mentoring"
  | "Arts & Culture"
  | "Animal Welfare"
  | "Emergency Response";

export interface DemoMember {
  id: string;
  name: string;
  email: string;
  role: "manager" | "member";
  joinedAt: string; // ISO date
  region: string;
}

export interface DemoActivity {
  id: string;
  memberId: string;
  occurredAt: string; // ISO date
  category: ActivityCategory;
  activity: string;
  description: string;
  hours: number;
  socialValueGBP: number;
  verified: boolean;
}

export const DEMO_MEMBERS: DemoMember[] = [
  { id: "m-001", name: "Sam Patel",        email: "sam.patel@demo-organisation.org",              role: "manager", joinedAt: "2025-01-12", region: "North West" },
  { id: "m-002", name: "Aisha Khan",       email: "aisha.khan@example.com",                       role: "member",  joinedAt: "2025-02-04", region: "North West" },
  { id: "m-003", name: "Tom Reilly",       email: "tom.reilly@example.com",                       role: "member",  joinedAt: "2025-02-21", region: "Yorkshire and The Humber" },
  { id: "m-004", name: "Priya Sharma",     email: "priya.sharma@example.com",                     role: "member",  joinedAt: "2025-03-08", region: "West Midlands" },
  { id: "m-005", name: "James O'Connor",   email: "james.oconnor@example.com",                    role: "member",  joinedAt: "2025-03-30", region: "London" },
  { id: "m-006", name: "Maya Hughes",      email: "maya.hughes@example.com",                      role: "member",  joinedAt: "2025-04-14", region: "South East" },
  { id: "m-007", name: "Daniel Brookes",   email: "daniel.brookes@example.com",                   role: "member",  joinedAt: "2025-05-02", region: "South West" },
  { id: "m-008", name: "Leila Ahmadi",     email: "leila.ahmadi@example.com",                     role: "member",  joinedAt: "2025-05-19", region: "North West" },
  { id: "m-009", name: "Chloe Bennett",    email: "chloe.bennett@example.com",                    role: "member",  joinedAt: "2025-06-11", region: "North East" },
  { id: "m-demo", name: "Demo User",       email: "demo@demo.org",                                role: "member",  joinedAt: "2025-07-01", region: "Yorkshire and The Humber" },
];

// Raw activity rows used to build the demo dataset. Tuple form keeps the file
// readable while we ship a credible year of impact (~95 entries spanning 12
// months, 10 members and 10 categories).
type RawActivity = readonly [
  memberId: string,
  occurredAt: string,
  category: ActivityCategory,
  activity: string,
  description: string,
  hours: number,
  socialValueGBP: number,
  verified: boolean,
];

const RAW_ACTIVITIES: RawActivity[] = [
  // January
  ["m-001", "2025-01-09", "Community",          "New year volunteer briefing",  "Ran the kickoff briefing for the year's volunteer cohort.",                                3,   195, true],
  ["m-002", "2025-01-12", "Environment",        "Canal towpath clean-up",        "Cleared 1.2km of the Mersey towpath with 12 volunteers. Nine bin bags collected.",        4,   220, true],
  ["m-003", "2025-01-18", "Sport & Active",     "Junior parkrun marshalling",    "Marshalled corner three of the Saturday junior 2K parkrun, supporting 80+ young runners.", 2,   140, true],
  ["m-004", "2025-01-21", "Education",          "Year 4 reading mentor",         "Weekly one-to-one reading session at St Mary's Primary.",                                  1.5, 180, true],
  ["m-005", "2025-01-25", "Community",          "Repair café host",              "Hosted the monthly repair café and fixed two small appliances brought in by neighbours.",  3,   165, true],
  ["m-007", "2025-01-29", "Health",             "Care home visits",              "Spent the afternoon doing manicures and conversation at Oakleigh care home.",              2.5, 175, true],

  // February
  ["m-002", "2025-02-04", "Environment",        "Community tree planting",       "Planted 30 native saplings on a degraded verge by the canal.",                              5,   430, true],
  ["m-006", "2025-02-08", "Animal Welfare",     "Dog shelter dog-walking",       "Walked four shelter dogs and helped with kennel cleaning at the local rescue.",            4,   220, true],
  ["m-009", "2025-02-12", "Arts & Culture",     "Community choir lead",          "Led the weekly community choir rehearsal. 22 attendees.",                                  2,   180, true],
  ["m-008", "2025-02-15", "Mentoring",          "Apprenticeship 1:1 mentor",     "One-to-one apprenticeship mentoring session covering CV and interview prep.",               1.5, 165, true],
  ["m-003", "2025-02-19", "Sport & Active",     "Cycling buddy ride",            "Co-led a confidence-building cycling group ride for new riders around the local park.",     3,   195, true],
  ["m-005", "2025-02-22", "Fundraising",        "Quiz night fundraiser",         "Hosted a quiz night that raised £540 for the youth centre's outreach programme.",           4,   540, true],
  ["m-007", "2025-02-26", "Health",             "Hospital radio shift",          "Hosted the lunchtime hospital radio show, taking song requests from three wards.",          3,   200, true],
  ["m-001", "2025-02-28", "Community",          "Trustee board meeting",         "Attended the quarterly trustee board with full reporting pack prep.",                       3,   240, true],

  // March
  ["m-004", "2025-03-04", "Education",          "STEM workshop assistant",       "Helped run a hands-on robotics workshop for 22 girls aged 10-12.",                          4,   480, true],
  ["m-002", "2025-03-08", "Community",          "Soup kitchen evening",          "Cooked and served around 70 hot meals at the city-centre soup kitchen.",                    4,   380, true],
  ["m-006", "2025-03-12", "Environment",        "Wildflower seeding",            "Sowed pollinator-friendly wildflower mix across two verges.",                              3,   210, true],
  ["m-008", "2025-03-15", "Education",          "Refugee English class",         "Taught a beginner conversational English class to six newly arrived refugees.",            2,   240, true],
  ["m-009", "2025-03-19", "Mentoring",          "Creative writing mentor",       "Mentored two young people on their short story submissions.",                              2,   220, true],
  ["m-005", "2025-03-22", "Emergency Response", "First aid cover at gala",       "Provided first-aid cover at a youth football tournament. Minor incidents only.",          5,   400, true],
  ["m-003", "2025-03-26", "Health",             "Mental-health walk lead",       "Co-led a peer walking group for adults managing low mood.",                                2.5, 200, true],
  ["m-007", "2025-03-29", "Sport & Active",     "Couch-to-5K coach",             "Led week five of Couch-to-5K, supporting 14 new runners.",                                  1.5, 140, true],

  // April
  ["m-007", "2025-04-13", "Fundraising",        "London Marathon run",           "Ran the London Marathon raising £3,240 for the youth trust.",                              5,  3240, true],
  ["m-002", "2025-04-16", "Environment",        "Park bench restoration",        "Sanded and re-varnished four weather-damaged park benches with a small crew.",            4,   220, true],
  ["m-004", "2025-04-19", "Mentoring",          "School governor meeting",       "Attended termly governors meeting at the local primary school.",                            2.5, 250, true],
  ["m-006", "2025-04-22", "Animal Welfare",     "Hedgehog rescue volunteering",  "Cared for three injured hedgehogs at the local wildlife rescue.",                          3,   180, true],
  ["m-008", "2025-04-26", "Education",          "Adult literacy tutor",          "Tutored two adults working towards Functional Skills English level 1.",                    2,   240, true],
  ["m-009", "2025-04-29", "Arts & Culture",     "Open-mic host",                 "Hosted the monthly open-mic night supporting nine local performers.",                       3,   240, true],
  ["m-demo","2025-04-05", "Environment",        "Beach litter pick",             "Joined a Surfers Against Sewage clean of Filey beach. 14kg of plastic collected.",        4,   220, true],

  // May
  ["m-005", "2025-05-03", "Community",          "Mayfest festival stewarding",   "Stewarded the entrance gate at Mayfest, welcoming around 600 attendees.",                  6,   480, true],
  ["m-001", "2025-05-07", "Mentoring",          "New volunteer onboarding",      "Inducted four new volunteers across two evenings, including safeguarding training.",       4,   440, true],
  ["m-003", "2025-05-11", "Sport & Active",     "Inclusive football coach",      "Coached a weekly inclusive 5-a-side football session for adults with disabilities.",       2,   180, true],
  ["m-004", "2025-05-15", "Education",          "GCSE maths catch-up",           "Ran a small-group GCSE maths revision session for five Year 11s.",                          2,   260, true],
  ["m-008", "2025-05-19", "Mentoring",          "Care leaver mentor",            "Monthly mentoring session with a young care leaver setting up their first tenancy.",       2,   240, true],
  ["m-006", "2025-05-23", "Environment",        "Hedgerow planting day",         "Helped plant 60 metres of native hedgerow on a community farm.",                            5,   430, false],
  ["m-009", "2025-05-26", "Arts & Culture",     "Community mural project",       "Worked on the community mural at the youth centre. Second weekend of three.",             6,   420, true],
  ["m-002", "2025-05-30", "Community",          "Befriending visit",             "Tea and a chat with an isolated older neighbour as part of the befriending scheme.",       2,   180, true],

  // June
  ["m-007", "2025-06-04", "Sport & Active",     "Cycle sportive 80km",         "Completed an 80km charity sportive raising £1,420 for cycling-without-age.",               6,  1420, true],
  ["m-005", "2025-06-08", "Emergency Response", "Flood response sandbagging",    "Helped the local resilience team fill and place 200+ sandbags during heavy rain.",         5,   420, true],
  ["m-002", "2025-06-12", "Environment",        "Reservoir conservation day",    "Cleared invasive Himalayan balsam across 1.5km of reservoir bank.",                        6,   400, true],
  ["m-006", "2025-06-15", "Animal Welfare",     "Rescue admin & socials",        "Updated the rescue's adoption records and ran social media for the week.",                  3,   180, false],
  ["m-008", "2025-06-19", "Education",          "Coding club helper",            "Helped 10 teenagers build their first Python game at the after-school coding club.",       2,   260, true],
  ["m-004", "2025-06-23", "Mentoring",          "University application coach",  "Reviewed personal statements with three Year 12 students.",                                 3,   330, true],
  ["m-001", "2025-06-26", "Community",          "Community AGM",                 "Hosted the youth trust's community AGM and member Q&A.",                                   3,   240, true],
  ["m-003", "2025-06-29", "Health",             "Blood donor session support",   "Welcomed donors and served refreshments at the NHS blood donation session.",               4,   280, true],

  // July
  ["m-009", "2025-07-03", "Arts & Culture",     "Summer festival drumming",      "Led a drumming workshop at the city summer festival. 35 participants.",                   3,   270, true],
  ["m-005", "2025-07-07", "Community",          "Community garden harvest",      "Harvested produce and packed share boxes for 18 households.",                              4,   280, true],
  ["m-002", "2025-07-11", "Environment",        "Pond restoration",              "Cleared silt and replanted oxygenators in the community wildlife pond.",                   5,   330, true],
  ["m-007", "2025-07-15", "Sport & Active",     "Triathlon marshalling",         "Marshalled the swim-to-bike transition at the city triathlon.",                            5,   340, true],
  ["m-008", "2025-07-19", "Education",          "Summer reading scheme",         "Hosted the library's summer reading scheme afternoon. 22 children attended.",             3,   330, true],
  ["m-006", "2025-07-23", "Animal Welfare",     "Cat shelter socialisation",     "Spent the afternoon socialising shy cats at the rescue.",                                  3,   180, true],
  ["m-004", "2025-07-27", "Mentoring",          "Refugee youth mentor",          "Weekly mentoring session with a teenage refugee starting Year 11.",                        2,   240, true],
  ["m-demo","2025-07-30", "Sport & Active",     "Park run pacer",                "Paced the 30-minute group at the Saturday parkrun.",                                       1,    70, true],

  // August
  ["m-001", "2025-08-03", "Fundraising",        "Summer fete coordination",      "Coordinated the summer fete which raised £2,180 for the youth trust.",                     8,  2180, true],
  ["m-003", "2025-08-07", "Health",             "Wellbeing walks lead",          "Led two wellbeing walks with the older adults' group.",                                    4,   320, true],
  ["m-005", "2025-08-11", "Community",          "Holiday hunger lunch club",     "Cooked and served lunches to 35 children during the holiday hunger programme.",            5,   620, true],
  ["m-002", "2025-08-15", "Environment",        "Bee hotel build day",           "Built and installed eight bee hotels across community sites.",                              4,   240, false],
  ["m-009", "2025-08-19", "Arts & Culture",     "Heritage walk guide",           "Guided a heritage walk for 16 visitors through the old town.",                              2,   180, true],
  ["m-008", "2025-08-23", "Mentoring",          "Apprentice peer-support",       "Hosted a peer-support session for six apprentices.",                                       2,   240, true],
  ["m-007", "2025-08-27", "Sport & Active",     "Disability cycling lead",       "Led an adapted cycling session for nine adults with mobility needs.",                       3,   240, true],
  ["m-demo","2025-08-30", "Community",          "Community fridge stock-up",     "Restocked the community fridge with rescued supermarket donations.",                        3,   180, true],

  // September
  ["m-004", "2025-09-03", "Education",          "Year 7 transition buddy",       "Buddied a new Year 7 cohort during their first transition week.",                          5,   500, true],
  ["m-006", "2025-09-07", "Environment",        "School eco-club lead",          "Co-led the after-school eco-club's first session of term. 18 pupils.",                    2,   180, true],
  ["m-005", "2025-09-11", "Emergency Response", "Search & rescue training",      "Attended monthly volunteer lowland search & rescue training.",                              4,   320, true],
  ["m-002", "2025-09-15", "Environment",        "River clean-up day",            "Spent the morning clearing plastic from a 1.2km river footpath.",                          4,   240, true],
  ["m-009", "2025-09-19", "Mentoring",          "Creative careers panel",        "Sat on a creative-careers panel for 30 sixth-form students.",                              2,   240, true],
  ["m-001", "2025-09-23", "Mentoring",          "Volunteer 1:1 supervision",     "Held end-of-quarter 1:1s with eight regular volunteers.",                                   6,   720, true],
  ["m-008", "2025-09-27", "Education",          "Homework club lead",            "Led the secondary-school homework club covering maths, English and science.",              2.5, 320, true],
  ["m-003", "2025-09-30", "Health",             "Men's-health drop-in",          "Co-hosted the men's-health drop-in with the GP outreach team.",                            3,   220, true],

  // October
  ["m-007", "2025-10-04", "Fundraising",        "Sponsored half-marathon",       "Ran the autumn half-marathon, raising £980 for the food bank.",                            3,   980, true],
  ["m-002", "2025-10-08", "Community",          "Citizens advice triage",        "Took initial enquiries at the Citizens Advice drop-in.",                                   3,   240, true],
  ["m-006", "2025-10-12", "Animal Welfare",     "Dog re-homing fair",            "Volunteered at a dog re-homing fair. Six successful adoptions on the day.",               5,   400, true],
  ["m-009", "2025-10-16", "Arts & Culture",     "Youth theatre rehearsal",       "Helped run rehearsals for the youth theatre's autumn production.",                          3,   240, true],
  ["m-004", "2025-10-20", "Education",          "Reading volunteer training",    "Trained six new reading volunteers on safeguarding and approach.",                          2,   240, true],
  ["m-005", "2025-10-24", "Community",          "Diwali festival steward",       "Stewarded the local Diwali festival, welcoming around 600 attendees.",                     6,   480, true],
  ["m-008", "2025-10-28", "Mentoring",          "Care-leaver mentoring",         "Monthly check-in with two care-leavers about housing and study.",                          2,   240, true],

  // November
  ["m-001", "2025-11-04", "Fundraising",        "Corporate partner pitch",       "Pitched the 2026 partnership programme to a regional employer. £4,000 confirmed.",        4,  4000, true],
  ["m-002", "2025-11-08", "Environment",        "Allotment build day",           "Helped build raised beds for the new community allotment.",                                5,   330, true],
  ["m-003", "2025-11-12", "Sport & Active",     "Walking-football session",      "Co-ran a walking-football session for over-60s.",                                          2,   160, true],
  ["m-007", "2025-11-16", "Sport & Active",     "Junior cycling coach",          "Coached a junior cycling skills session. 12 participants.",                                2,   180, true],
  ["m-005", "2025-11-20", "Emergency Response", "Storm response check-in",       "Checked on 14 vulnerable households during the storm warning.",                            5,   500, true],
  ["m-009", "2025-11-24", "Arts & Culture",     "Carol service production",      "Helped stage the community carol service. Sound, lighting and refreshments.",            4,   320, false],
  ["m-008", "2025-11-28", "Education",          "Adult digital skills tutor",    "Tutored adults on basic digital skills at the library drop-in.",                            2,   240, true],

  // December
  ["m-006", "2025-12-02", "Animal Welfare",     "Winter feeding stations",       "Built and stocked winter feeding stations for urban wildlife.",                            3,   180, true],
  ["m-004", "2025-12-06", "Education",          "Christmas reading session",     "Hosted a Christmas-themed reading event for 28 primary-school children.",                  3,   360, true],
  ["m-002", "2025-12-10", "Community",          "Community Christmas dinner",    "Helped cook and serve the community Christmas lunch for 120 older residents.",            6,   600, true],
  ["m-005", "2025-12-13", "Community",          "Toy distribution drive",        "Delivered Christmas gift parcels to 14 nominated families.",                                4,   320, true],
  ["m-007", "2025-12-17", "Fundraising",        "Christmas raffle organiser",    "Organised the Christmas raffle which raised £760 for outreach.",                            5,   760, true],
  ["m-001", "2025-12-20", "Community",          "Year-end thank-you event",      "Hosted a year-end thank-you event for 45 volunteers.",                                     5,   400, true],
  ["m-009", "2025-12-22", "Arts & Culture",     "Children's panto matinee",      "Stage-managed the children's pantomime matinee. Full house of 180.",                      5,   420, true],
  ["m-008", "2025-12-27", "Mentoring",          "Winter check-in calls",         "Made winter check-in calls to eight isolated mentees.",                                    3,   330, true],
  ["m-demo","2025-12-30", "Environment",        "Christmas-tree recycling",      "Helped run the community Christmas-tree recycling drop-off.",                              4,   220, true],
];

export const DEMO_ACTIVITIES: DemoActivity[] = RAW_ACTIVITIES.map((r, i) => ({
  id: `a-${String(i + 1).padStart(3, "0")}`,
  memberId: r[0],
  occurredAt: r[1],
  category: r[2],
  activity: r[3],
  description: r[4],
  hours: r[5],
  socialValueGBP: r[6],
  verified: r[7],
}));

export function getDemoMember(id: string): DemoMember | undefined {
  return DEMO_MEMBERS.find(m => m.id === id);
}

// Each activity category maps to its primary UN Sustainable Development Goal.
// Numbers, labels and colours follow the official SDG identity set.
export interface SdgInfo { number: number; label: string; color: string }
export const SDG_BY_CATEGORY: Record<ActivityCategory, SdgInfo> = {
  Environment:          { number: 13, label: "Climate Action",                   color: "#3F7E44" },
  Community:            { number: 11, label: "Sustainable Cities & Communities", color: "#FD9D24" },
  Health:               { number: 3,  label: "Good Health & Wellbeing",          color: "#4C9F38" },
  Education:            { number: 4,  label: "Quality Education",                color: "#C5192D" },
  "Sport & Active":     { number: 3,  label: "Good Health & Wellbeing",          color: "#4C9F38" },
  Fundraising:          { number: 1,  label: "No Poverty",                       color: "#E5243B" },
  Mentoring:            { number: 10, label: "Reduced Inequalities",             color: "#DD1367" },
  "Arts & Culture":     { number: 4,  label: "Quality Education",                color: "#C5192D" },
  "Animal Welfare":     { number: 15, label: "Life on Land",                     color: "#56C02B" },
  "Emergency Response": { number: 16, label: "Peace, Justice & Strong Institutions", color: "#00689D" },
};

export const ALL_CATEGORIES: ActivityCategory[] = Object.keys(SDG_BY_CATEGORY) as ActivityCategory[];

export interface SdgBreakdownPoint extends SdgInfo {
  value: number;
  hours: number;
  activities: number;
  members: number; // distinct members contributing to this SDG
  pct: number; // 0-100, share of social value
}

export function computeSdgBreakdown(activities: DemoActivity[] = DEMO_ACTIVITIES): SdgBreakdownPoint[] {
  const total = activities.reduce((s, a) => s + a.socialValueGBP, 0);
  const map = new Map<number, SdgBreakdownPoint>();
  const memberSets = new Map<number, Set<string>>();
  for (const a of activities) {
    const sdg = SDG_BY_CATEGORY[a.category];
    if (!sdg) continue;
    if (!map.has(sdg.number)) {
      map.set(sdg.number, { ...sdg, value: 0, hours: 0, activities: 0, members: 0, pct: 0 });
      memberSets.set(sdg.number, new Set<string>());
    }
    const p = map.get(sdg.number)!;
    p.value += a.socialValueGBP;
    p.hours += a.hours;
    p.activities += 1;
    memberSets.get(sdg.number)!.add(a.memberId);
  }
  for (const [n, set] of memberSets) {
    const p = map.get(n)!;
    p.members = set.size;
  }
  const arr = Array.from(map.values()).sort((a, b) => b.value - a.value);
  if (total > 0) for (const p of arr) p.pct = Math.round((p.value / total) * 100);
  return arr;
}

// Richer per-category aggregate used by the "Top categories" panel, adds
// distinct member count on top of value/hours/activities.
export interface CategoryBreakdownPoint {
  category: ActivityCategory;
  value: number;
  hours: number;
  activities: number;
  members: number;
}
export function computeCategoryBreakdown(activities: DemoActivity[] = DEMO_ACTIVITIES): CategoryBreakdownPoint[] {
  return ALL_CATEGORIES.map(c => {
    const items = activities.filter(a => a.category === c);
    return {
      category: c,
      value: items.reduce((s, a) => s + a.socialValueGBP, 0),
      hours: items.reduce((s, a) => s + a.hours, 0),
      activities: items.length,
      members: new Set(items.map(a => a.memberId)).size,
    };
  })
  .filter(c => c.activities > 0)
  .sort((a, b) => b.value - a.value);
}

export interface DemoOrgAggregates {
  totalMembers: number;
  activeMembers: number;
  totalActivities: number;
  totalHours: number;
  totalSocialValue: number;
  verifiedSocialValue: number;
  averagePerMember: number;
  byCategory: Array<{ category: ActivityCategory; count: number; hours: number; value: number }>;
}

export function computeDemoAggregates(activities: DemoActivity[] = DEMO_ACTIVITIES): DemoOrgAggregates {
  const totalActivities = activities.length;
  const totalHours = activities.reduce((s, a) => s + a.hours, 0);
  const totalSocialValue = activities.reduce((s, a) => s + a.socialValueGBP, 0);
  const verifiedSocialValue = activities.filter(a => a.verified).reduce((s, a) => s + a.socialValueGBP, 0);
  const memberIds = new Set(activities.map(a => a.memberId));
  const byCategory = ALL_CATEGORIES.map(c => {
    const items = activities.filter(a => a.category === c);
    return {
      category: c,
      count: items.length,
      hours: items.reduce((s, a) => s + a.hours, 0),
      value: items.reduce((s, a) => s + a.socialValueGBP, 0),
    };
  });
  return {
    totalMembers: DEMO_MEMBERS.length,
    activeMembers: memberIds.size,
    totalActivities,
    totalHours,
    totalSocialValue,
    verifiedSocialValue,
    averagePerMember: DEMO_MEMBERS.length ? Math.round(totalSocialValue / DEMO_MEMBERS.length) : 0,
    byCategory,
  };
}

// Aggregate social value & activity counts by month (YYYY-MM) for the trend chart.
export interface MonthlyTrendPoint { month: string; label: string; value: number; activities: number; hours: number }
export function computeMonthlyTrend(activities: DemoActivity[] = DEMO_ACTIVITIES): MonthlyTrendPoint[] {
  const by = new Map<string, MonthlyTrendPoint>();
  for (const a of activities) {
    const month = a.occurredAt.slice(0, 7);
    if (!by.has(month)) {
      const d = new Date(`${month}-01T00:00:00Z`);
      by.set(month, {
        month,
        label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        value: 0, activities: 0, hours: 0,
      });
    }
    const p = by.get(month)!;
    p.value += a.socialValueGBP;
    p.activities += 1;
    p.hours += a.hours;
  }
  return Array.from(by.values()).sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// Challenges (demo org only)
// ---------------------------------------------------------------------------
// Shape mirrors the `ApiChallenge` returned by `/api/challenges/mine` so the
// `OrgChallengesPanel` can render demo data with no rework.
export interface DemoChallenge {
  id: string;
  name: string;
  description: string;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string; // ISO
  endDate: string;   // ISO
  ownerId: string | null;
  orgId: string;
  scope: "org";
  inviteCode: string;
  hasEnded: boolean;
  hasStarted: boolean;
  participantCount: number;
  isOwner: boolean;
  progressTotal: number;
  progressPercent: number;
  isActive: boolean;
}

export const DEMO_CHALLENGES: DemoChallenge[] = [
  {
    id: "demo-ch-001",
    name: "Spring community sprint",
    description: "Hit £3,000 of Community-category social value before the end of June.",
    goalType: "social_value",
    target: 3000,
    progressTotal: 2150,
    progressPercent: 72,
    participantCount: 12,
    startDate: "2026-04-01T00:00:00.000Z",
    endDate: "2026-06-30T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH01",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-002",
    name: "150 environmental hours",
    description: "A combined goal across all members to log 150 hours of environmental work this quarter.",
    goalType: "hours",
    target: 150,
    progressTotal: 92,
    progressPercent: 61,
    participantCount: 11,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-07-31T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH02",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-003",
    name: "Reading mentor month",
    description: "Get 7 members signed up as weekly reading mentors at local primary schools.",
    goalType: "social_value",
    target: 1500,
    progressTotal: 870,
    progressPercent: 58,
    participantCount: 7,
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-05-31T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH03",
    hasStarted: true,
    hasEnded: false,
    isActive: true,
    isOwner: true,
  },
  {
    id: "demo-ch-004",
    name: "Winter fundraising drive",
    description: "Reach £5,000 of fundraising activity across the organisation.",
    goalType: "social_value",
    target: 5000,
    progressTotal: 5240,
    progressPercent: 100,
    participantCount: 18,
    startDate: "2025-12-01T00:00:00.000Z",
    endDate: "2026-02-28T23:59:59.000Z",
    ownerId: "m-001",
    orgId: DEMO_ORG_ID,
    scope: "org",
    inviteCode: "DEMO-CH04",
    hasStarted: true,
    hasEnded: true,
    isActive: false,
    isOwner: true,
  },
];

// ---------------------------------------------------------------------------
// Pulse surveys (demo org only)
// ---------------------------------------------------------------------------
// Shape mirrors `SurveyListItem` + `SurveyResults` so both `OrgPulseSummaryCard`
// and `PulseSurveysSection` can swap to demo data with no rework.
export type DemoPulseSchedule = "one_off" | "monthly" | "quarterly";
export type DemoPulseTemplate = "meaningfulness" | "wellbeing" | "custom";
export interface DemoPulseSurvey {
  id: string;
  template: DemoPulseTemplate;
  question: string;
  schedule: DemoPulseSchedule;
  anonymous: boolean;
  createdAt: string;
  archivedAt: string | null;
  totals: { responses: number; average: number };
  distribution: Array<{ rating: number; count: number }>;
  trend: Array<{
    windowKey: string;
    label: string;
    average: number;
    count: number;
    distribution: Array<{ rating: number; count: number }>;
  }>;
  comments: Array<{ id: string; comment: string; windowKey: string; windowLabel: string; createdAt: string }>;
}

export const DEMO_COMMENT_PRIVACY_THRESHOLD = 3;

export const DEMO_PULSE_SURVEYS: DemoPulseSurvey[] = [
  {
    id: "demo-ps-001",
    template: "meaningfulness",
    question: "How meaningful does your volunteering feel right now?",
    schedule: "monthly",
    anonymous: true,
    createdAt: "2025-09-01T09:00:00.000Z",
    archivedAt: null,
    totals: { responses: 28, average: 4.3 },
    distribution: [
      { rating: 1, count: 0 },
      { rating: 2, count: 1 },
      { rating: 3, count: 4 },
      { rating: 4, count: 10 },
      { rating: 5, count: 13 },
    ],
    trend: [
      {
        windowKey: "2025-09", label: "Sep 2025", average: 3.9, count: 18,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 4 },
          { rating: 4, count: 8 },
          { rating: 5, count: 5 },
        ],
      },
      {
        windowKey: "2025-10", label: "Oct 2025", average: 4.0, count: 21,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 3 },
          { rating: 4, count: 11 },
          { rating: 5, count: 6 },
        ],
      },
      {
        windowKey: "2025-11", label: "Nov 2025", average: 4.2, count: 24,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 2 },
          { rating: 4, count: 12 },
          { rating: 5, count: 9 },
        ],
      },
      {
        windowKey: "2026-04", label: "Apr 2026", average: 4.3, count: 28,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 0 },
          { rating: 3, count: 3 },
          { rating: 4, count: 13 },
          { rating: 5, count: 12 },
        ],
      },
    ],
    comments: [
      { id: "demo-cm-001", comment: "The reading-mentor sessions are easily the highlight of my month.", windowKey: "2026-04", windowLabel: "Apr 2026", createdAt: "2026-04-12T10:00:00.000Z" },
      { id: "demo-cm-002", comment: "Loving the variety, I feel like I'm actually making a difference locally.", windowKey: "2026-04", windowLabel: "Apr 2026", createdAt: "2026-04-15T18:00:00.000Z" },
      { id: "demo-cm-003", comment: "Would love a bit more notice on event dates so I can plan around work.", windowKey: "2025-11", windowLabel: "Nov 2025", createdAt: "2025-11-20T08:30:00.000Z" },
      { id: "demo-cm-004", comment: "Felt really welcomed at my first session, thanks for pairing me with Jas.", windowKey: "2025-11", windowLabel: "Nov 2025", createdAt: "2025-11-18T19:00:00.000Z" },
      { id: "demo-cm-005", comment: "Could we get a bit more intro training before being put on shift?", windowKey: "2025-10", windowLabel: "Oct 2025", createdAt: "2025-10-09T07:30:00.000Z" },
    ],
  },
  {
    id: "demo-ps-002",
    template: "custom",
    question: "How connected do you feel to the rest of the team?",
    schedule: "quarterly",
    anonymous: true,
    createdAt: "2025-07-01T09:00:00.000Z",
    archivedAt: null,
    totals: { responses: 22, average: 4.1 },
    distribution: [
      { rating: 1, count: 0 },
      { rating: 2, count: 1 },
      { rating: 3, count: 4 },
      { rating: 4, count: 10 },
      { rating: 5, count: 7 },
    ],
    trend: [
      {
        windowKey: "2025-Q3", label: "Q3 2025", average: 3.7, count: 17,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 2 },
          { rating: 3, count: 4 },
          { rating: 4, count: 8 },
          { rating: 5, count: 3 },
        ],
      },
      {
        windowKey: "2025-Q4", label: "Q4 2025", average: 3.9, count: 19,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 4 },
          { rating: 4, count: 9 },
          { rating: 5, count: 5 },
        ],
      },
      {
        windowKey: "2026-Q1", label: "Q1 2026", average: 4.0, count: 21,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 4 },
          { rating: 4, count: 10 },
          { rating: 5, count: 6 },
        ],
      },
      {
        windowKey: "2026-Q2", label: "Q2 2026", average: 4.1, count: 22,
        distribution: [
          { rating: 1, count: 0 },
          { rating: 2, count: 1 },
          { rating: 3, count: 4 },
          { rating: 4, count: 10 },
          { rating: 5, count: 7 },
        ],
      },
    ],
    comments: [
      { id: "demo-cm-101", comment: "The new buddy pairings really help when you're starting out.", windowKey: "2026-Q2", windowLabel: "Q2 2026", createdAt: "2026-04-08T12:00:00.000Z" },
      { id: "demo-cm-102", comment: "More socials would be great, I only really see people on shifts.", windowKey: "2026-Q1", windowLabel: "Q1 2026", createdAt: "2026-02-18T18:00:00.000Z" },
      { id: "demo-cm-103", comment: "WhatsApp group has been brilliant for last-minute swaps.", windowKey: "2026-Q2", windowLabel: "Q2 2026", createdAt: "2026-04-25T09:15:00.000Z" },
      { id: "demo-cm-104", comment: "Quarterly catch-up was a nice touch, felt heard.", windowKey: "2025-Q4", windowLabel: "Q4 2025", createdAt: "2025-12-12T16:00:00.000Z" },
    ],
  },
  {
    id: "demo-ps-003",
    template: "wellbeing",
    question: "How are you feeling about your wellbeing this week?",
    schedule: "monthly",
    anonymous: true,
    createdAt: "2025-10-01T09:00:00.000Z",
    archivedAt: null,
    totals: { responses: 41, average: 3.8 },
    distribution: [
      { rating: 1, count: 1 },
      { rating: 2, count: 3 },
      { rating: 3, count: 9 },
      { rating: 4, count: 17 },
      { rating: 5, count: 11 },
    ],
    trend: [
      {
        windowKey: "2026-01", label: "Jan 2026", average: 3.5, count: 32,
        distribution: [
          { rating: 1, count: 2 },
          { rating: 2, count: 4 },
          { rating: 3, count: 9 },
          { rating: 4, count: 11 },
          { rating: 5, count: 6 },
        ],
      },
      {
        windowKey: "2026-02", label: "Feb 2026", average: 3.6, count: 36,
        distribution: [
          { rating: 1, count: 1 },
          { rating: 2, count: 4 },
          { rating: 3, count: 10 },
          { rating: 4, count: 13 },
          { rating: 5, count: 8 },
        ],
      },
      {
        windowKey: "2026-03", label: "Mar 2026", average: 3.7, count: 39,
        distribution: [
          { rating: 1, count: 1 },
          { rating: 2, count: 3 },
          { rating: 3, count: 10 },
          { rating: 4, count: 15 },
          { rating: 5, count: 10 },
        ],
      },
      {
        windowKey: "2026-04", label: "Apr 2026", average: 3.8, count: 41,
        distribution: [
          { rating: 1, count: 1 },
          { rating: 2, count: 3 },
          { rating: 3, count: 9 },
          { rating: 4, count: 17 },
          { rating: 5, count: 11 },
        ],
      },
    ],
    comments: [
      { id: "demo-cm-201", comment: "Volunteering has genuinely been good for my own headspace.", windowKey: "2026-04", windowLabel: "Apr 2026", createdAt: "2026-04-10T20:00:00.000Z" },
      { id: "demo-cm-202", comment: "Bit run-down this month, taking next week off the rota.", windowKey: "2026-04", windowLabel: "Apr 2026", createdAt: "2026-04-22T07:30:00.000Z" },
      { id: "demo-cm-203", comment: "Honestly the social side keeps me going through busy weeks at work.", windowKey: "2026-04", windowLabel: "Apr 2026", createdAt: "2026-04-28T19:45:00.000Z" },
      { id: "demo-cm-204", comment: "Felt better after the wellbeing chat session, more of those please.", windowKey: "2026-03", windowLabel: "Mar 2026", createdAt: "2026-03-14T17:00:00.000Z" },
      { id: "demo-cm-205", comment: "Stretched thin between work and shifts, could do with shorter slots.", windowKey: "2026-02", windowLabel: "Feb 2026", createdAt: "2026-02-09T08:00:00.000Z" },
      { id: "demo-cm-206", comment: "Energising start to the year, really needed it after the holidays.", windowKey: "2026-01", windowLabel: "Jan 2026", createdAt: "2026-01-21T18:30:00.000Z" },
    ],
  },
];

// Pre-computed summary used by `OrgPulseSummaryCard` for the demo org.
export interface DemoPulseSummary {
  active: number;
  responses: number;
  average: number;
}
export function computeDemoPulseSummary(surveys: DemoPulseSurvey[] = DEMO_PULSE_SURVEYS): DemoPulseSummary {
  const active = surveys.filter(s => !s.archivedAt);
  const responses = active.reduce((s, x) => s + x.totals.responses, 0);
  const weighted = active.reduce((s, x) => s + x.totals.average * x.totals.responses, 0);
  return {
    active: active.length,
    responses,
    average: responses > 0 ? weighted / responses : 0,
  };
}

// Mock invite link state: managers can revoke + regenerate. Persisted per-org so demos survive a refresh.
const INVITE_KEY = (orgId: string) => `org-invite-code:${orgId}`;
export function getOrgInviteCode(orgId: string, fallback: string): string {
  try {
    return localStorage.getItem(INVITE_KEY(orgId)) ?? fallback;
  } catch { return fallback; }
}
export function setOrgInviteCode(orgId: string, code: string): void {
  try { localStorage.setItem(INVITE_KEY(orgId), code); } catch { /* ignore */ }
}
export function generateInviteCode(): string {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${part()}-${part()}`;
}

// ---------------------------------------------------------------------------
// SSO configs (demo org only), shape mirrors `SsoConfig` from
// `OrgSsoConfig.tsx` so the panel can swap to demo data with no rework.
// ---------------------------------------------------------------------------
export interface DemoSsoConfig {
  id: string;
  provider: "google" | "microsoft";
  domain: string;
  tenantId: string | null;
  enforceSSO: boolean;
  status: "pending" | "verified" | "error";
  lastTestAt: string | null;
}
export const DEMO_SSO_AVAILABLE_PROVIDERS: Array<"google" | "microsoft"> = ["google", "microsoft"];
export const DEMO_SSO_CONFIGS: DemoSsoConfig[] = [
  {
    id: "demo-sso-001",
    provider: "google",
    domain: "demo-organisation.org",
    tenantId: null,
    enforceSSO: true,
    status: "verified",
    lastTestAt: "2026-04-22T09:30:00.000Z",
  },
  {
    id: "demo-sso-002",
    provider: "microsoft",
    domain: "riverside-board.org.uk",
    tenantId: "00000000-1111-2222-3333-444455556666",
    enforceSSO: false,
    status: "pending",
    lastTestAt: null,
  },
];

// ---------------------------------------------------------------------------
// Developer API & webhooks (demo org only)
// ---------------------------------------------------------------------------
export interface DemoApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export const DEMO_API_KEYS: DemoApiKey[] = [
  {
    id: "demo-key-001",
    label: "Workday hours sync",
    keyPrefix: "mi_orgk_riv_w0rk",
    scopes: ["hours.write", "members.read"],
    lastUsedAt: "2026-05-06T14:12:00.000Z",
    revokedAt: null,
    createdAt: "2025-11-04T10:00:00.000Z",
  },
  {
    id: "demo-key-002",
    label: "Board reporting dashboard",
    keyPrefix: "mi_orgk_riv_b0rd",
    scopes: ["stats.read"],
    lastUsedAt: "2026-05-01T08:45:00.000Z",
    revokedAt: null,
    createdAt: "2026-01-18T09:00:00.000Z",
  },
];

export interface DemoWebhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  deadAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  createdAt: string;
  secretPrefix: string;
}
export const DEMO_WEBHOOKS: DemoWebhook[] = [
  {
    id: "demo-wh-001",
    url: "https://hooks.demo-organisation.org/myimpact",
    events: ["member.joined", "hours.attested", "milestone.earned"],
    enabled: true,
    deadAt: null,
    lastSuccessAt: "2026-05-07T07:14:00.000Z",
    lastFailureAt: null,
    lastError: null,
    createdAt: "2025-12-02T09:00:00.000Z",
    secretPrefix: "whs_riv_a1b2",
  },
  {
    id: "demo-wh-002",
    url: "https://make.com/hooks/riverside-impact-feed",
    events: ["hours.logged"],
    enabled: true,
    deadAt: null,
    lastSuccessAt: "2026-05-05T19:02:00.000Z",
    lastFailureAt: "2026-04-30T03:00:00.000Z",
    lastError: "504 Gateway Timeout (retried)",
    createdAt: "2026-02-09T11:30:00.000Z",
    secretPrefix: "whs_riv_c3d4",
  },
];
export const DEMO_SUPPORTED_WEBHOOK_EVENTS = [
  "member.joined", "hours.logged", "hours.attested", "hours.verified", "milestone.earned",
];

// ---------------------------------------------------------------------------
// Share links (demo org only)
// ---------------------------------------------------------------------------
export interface DemoShareLink {
  id: string;
  slug: string;
  scope: "all" | "summary" | "timeline" | "categories" | "regions";
  funderLabel: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
export const DEMO_SHARE_LINKS: DemoShareLink[] = [
  {
    id: "demo-sl-001",
    slug: "demo-nlcf-snapshot",
    scope: "all",
    funderLabel: "National Lottery Community Fund",
    expiresAt: "2026-09-30T23:59:59.000Z",
    revokedAt: null,
    viewCount: 23,
    createdAt: "2026-03-12T10:00:00.000Z",
  },
  {
    id: "demo-sl-002",
    slug: "demo-board-q1",
    scope: "summary",
    funderLabel: "Trustee board · Q1 review",
    expiresAt: null,
    revokedAt: null,
    viewCount: 11,
    createdAt: "2026-04-04T09:00:00.000Z",
  },
  {
    id: "demo-sl-003",
    slug: "demo-mersey-partner",
    scope: "categories",
    funderLabel: "Mersey Catchment Partnership",
    expiresAt: "2026-06-30T23:59:59.000Z",
    revokedAt: null,
    viewCount: 6,
    createdAt: "2026-04-22T15:00:00.000Z",
  },
  {
    id: "demo-sl-004",
    slug: "demo-pilot-funder",
    scope: "timeline",
    funderLabel: "Pilot funder (2024 round)",
    expiresAt: null,
    revokedAt: "2026-02-01T09:00:00.000Z",
    viewCount: 41,
    createdAt: "2024-11-10T10:00:00.000Z",
  },
];

// Mock member-removal/anonymisation state, kept in localStorage so the demo
// reflects the manager's actions across navigation.
const REMOVED_KEY = (orgId: string) => `org-removed-members:${orgId}`;
export function getRemovedMemberIds(orgId: string): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_KEY(orgId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}
export function setRemovedMemberIds(orgId: string, ids: string[]): void {
  try { localStorage.setItem(REMOVED_KEY(orgId), JSON.stringify(ids)); } catch { /* ignore */ }
}
