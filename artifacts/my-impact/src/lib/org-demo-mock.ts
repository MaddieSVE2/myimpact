// Mock data for the demo organisation dashboard (org id "demo-org-0000000000000").
// The shape mirrors what a future server-backed activity feed will return so the
// UI can swap to real data without re-design.

export const DEMO_ORG_ID = "demo-org-0000000000000";
export const DEMO_INVITE_CODE = "DEMO-0000";
export const DEMO_ORG_NAME = "Riverside Youth Trust";
export const DEMO_ORG_TYPE = "charity";
export const DEMO_ORG_CONTACT_EMAIL = "manager@riverside-youth-trust.org.uk";

export type ActivityCategory = "Environment" | "Community" | "Health" | "Education";

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
  { id: "m-001", name: "Sam Patel",        email: "sam.patel@riverside-youth-trust.org.uk",       role: "manager", joinedAt: "2025-01-12", region: "North West" },
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

export const DEMO_ACTIVITIES: DemoActivity[] = [
  { id: "a-001", memberId: "m-002", occurredAt: "2025-09-04", category: "Environment", activity: "River clean-up",          description: "Spent the morning with 12 volunteers clearing plastic and litter from a 1.2km stretch of the Mersey footpath.", hours: 4,  socialValueGBP: 84,  verified: true },
  { id: "a-002", memberId: "m-003", occurredAt: "2025-09-08", category: "Community",   activity: "Food bank shift",         description: "Sorted donations and packed family parcels at the Leeds community food bank during their busiest evening.",     hours: 3,  socialValueGBP: 63,  verified: true },
  { id: "a-003", memberId: "m-004", occurredAt: "2025-09-12", category: "Education",   activity: "Reading mentor",          description: "One-to-one reading session with a year 4 pupil at St Mary's primary school.",                                  hours: 1.5,socialValueGBP: 42,  verified: true },
  { id: "a-004", memberId: "m-005", occurredAt: "2025-09-15", category: "Health",      activity: "Park run volunteering",   description: "Marshalled the 5K junior park run in Hyde Park, supporting around 80 young runners.",                          hours: 2,  socialValueGBP: 38,  verified: false },
  { id: "a-005", memberId: "m-006", occurredAt: "2025-09-18", category: "Community",   activity: "Befriending visit",       description: "Visited an isolated older neighbour for tea and a chat as part of the Age UK befriending scheme.",             hours: 2,  socialValueGBP: 46,  verified: true },
  { id: "a-006", memberId: "m-002", occurredAt: "2025-09-22", category: "Environment", activity: "Tree planting",           description: "Helped plant 30 native saplings on a degraded verge near the canal towpath.",                                  hours: 5,  socialValueGBP: 110, verified: true },
  { id: "a-007", memberId: "m-007", occurredAt: "2025-09-25", category: "Education",   activity: "Homework club",           description: "Supported four secondary students with maths and science homework at the youth centre.",                       hours: 2,  socialValueGBP: 56,  verified: true },
  { id: "a-008", memberId: "m-008", occurredAt: "2025-09-28", category: "Health",      activity: "Mental health walk",      description: "Co-led a group walking session for adults managing low mood, focusing on conversation and pace.",              hours: 2.5,socialValueGBP: 53,  verified: true },
  { id: "a-009", memberId: "m-009", occurredAt: "2025-10-02", category: "Community",   activity: "Community fridge stock",   description: "Restocked the community fridge with rescued supermarket donations and rotated short-dated items.",            hours: 3,  socialValueGBP: 60,  verified: true },
  { id: "a-010", memberId: "m-demo",occurredAt: "2025-10-05", category: "Environment", activity: "Beach litter pick",       description: "Joined a Surfers Against Sewage clean of Filey beach — collected 14kg of plastic, rope and fishing line.",     hours: 4,  socialValueGBP: 88,  verified: false },
  { id: "a-011", memberId: "m-003", occurredAt: "2025-10-08", category: "Health",      activity: "Hospital radio shift",    description: "Hosted the lunchtime show on Leeds Hospital Radio, taking song requests from three wards.",                    hours: 3,  socialValueGBP: 57,  verified: true },
  { id: "a-012", memberId: "m-004", occurredAt: "2025-10-11", category: "Education",   activity: "STEM workshop assistant", description: "Helped run a hands-on robotics workshop for 22 girls aged 10-12 at Birmingham science centre.",                hours: 4,  socialValueGBP: 112, verified: true },
  { id: "a-013", memberId: "m-005", occurredAt: "2025-10-14", category: "Community",   activity: "Festival stewarding",     description: "Stewarded the entrance gate at the local Diwali festival, welcoming around 600 attendees.",                    hours: 6,  socialValueGBP: 138, verified: true },
  { id: "a-014", memberId: "m-006", occurredAt: "2025-10-17", category: "Environment", activity: "Wildflower meadow",       description: "Sowed wildflower seed mix across two verges to support pollinators next spring.",                              hours: 3,  socialValueGBP: 66,  verified: true },
  { id: "a-015", memberId: "m-007", occurredAt: "2025-10-20", category: "Health",      activity: "Care home visits",        description: "Spent the afternoon doing manicures and conversation with residents at Oakleigh care home.",                   hours: 2.5,socialValueGBP: 53,  verified: true },
  { id: "a-016", memberId: "m-008", occurredAt: "2025-10-23", category: "Education",   activity: "Adult literacy tutor",    description: "Tutored two adults working towards their Functional Skills English level 1.",                                   hours: 2,  socialValueGBP: 56,  verified: true },
  { id: "a-017", memberId: "m-009", occurredAt: "2025-10-26", category: "Community",   activity: "Repair café volunteer",   description: "Fixed a broken toaster and re-glued a wooden chair at the monthly Repair Café.",                                hours: 3,  socialValueGBP: 60,  verified: false },
  { id: "a-018", memberId: "m-002", occurredAt: "2025-10-29", category: "Health",      activity: "First aid cover",         description: "Provided first aid cover at a youth football tournament — treated a couple of grazes, no major incidents.",   hours: 5,  socialValueGBP: 95,  verified: true },
  { id: "a-019", memberId: "m-003", occurredAt: "2025-11-01", category: "Environment", activity: "Litter pick training",    description: "Led a 1-hour induction for 8 new litter-pick volunteers on safety, equipment and reporting.",                  hours: 1.5,socialValueGBP: 42,  verified: true },
  { id: "a-020", memberId: "m-004", occurredAt: "2025-11-04", category: "Community",   activity: "Soup kitchen",            description: "Cooked and served around 70 hot meals at the city-centre soup kitchen on a cold Tuesday evening.",            hours: 4,  socialValueGBP: 80,  verified: true },
  { id: "a-021", memberId: "m-005", occurredAt: "2025-11-07", category: "Education",   activity: "CV workshop",             description: "Reviewed CVs and ran mock interviews for six 17-year-olds preparing for apprenticeship applications.",         hours: 3,  socialValueGBP: 84,  verified: true },
  { id: "a-022", memberId: "m-006", occurredAt: "2025-11-10", category: "Health",      activity: "Blood donor support",     description: "Welcomed donors and served refreshments at the NHS blood donation session.",                                   hours: 4,  socialValueGBP: 76,  verified: true },
  { id: "a-023", memberId: "m-007", occurredAt: "2025-11-13", category: "Environment", activity: "Hedgerow planting",       description: "Helped plant 60 metres of native hedgerow on a community farm to boost biodiversity.",                          hours: 5,  socialValueGBP: 110, verified: false },
  { id: "a-024", memberId: "m-008", occurredAt: "2025-11-16", category: "Community",   activity: "Citizens advice triage",   description: "Took initial enquiries at the Citizens Advice drop-in and signposted clients to the right caseworker.",        hours: 3,  socialValueGBP: 72,  verified: true },
  { id: "a-025", memberId: "m-009", occurredAt: "2025-11-19", category: "Education",   activity: "Coding club",             description: "Helped 10 teenagers build their first Python game at the after-school coding club.",                            hours: 2,  socialValueGBP: 56,  verified: true },
  { id: "a-026", memberId: "m-demo",occurredAt: "2025-11-22", category: "Health",      activity: "Mental health first aid", description: "Completed and shadowed a 1-hour Mental Health First Aid refresher for youth workers.",                          hours: 1,  socialValueGBP: 19,  verified: true },
  { id: "a-027", memberId: "m-002", occurredAt: "2025-11-25", category: "Community",   activity: "Toy collection sort",     description: "Sorted donated toys for the Christmas appeal, age-grading and quality-checking each item.",                    hours: 4,  socialValueGBP: 80,  verified: true },
  { id: "a-028", memberId: "m-003", occurredAt: "2025-11-28", category: "Environment", activity: "Recycling audit",         description: "Audited the youth centre's waste streams and proposed a new bin layout to cut contamination by ~25%.",         hours: 2,  socialValueGBP: 44,  verified: true },
  { id: "a-029", memberId: "m-004", occurredAt: "2025-12-01", category: "Education",   activity: "School governor meeting", description: "Attended the term's full governors meeting at the local primary school as parent governor.",                  hours: 2.5,socialValueGBP: 70,  verified: true },
  { id: "a-030", memberId: "m-005", occurredAt: "2025-12-04", category: "Health",      activity: "Bereavement support",     description: "Sat in on a peer-led bereavement support circle, helping with set-up and tea afterwards.",                     hours: 2,  socialValueGBP: 38,  verified: false },
  { id: "a-031", memberId: "m-006", occurredAt: "2025-12-07", category: "Community",   activity: "Christmas dinner cook",   description: "Helped prepare and serve the Christmas community lunch for 120 older residents.",                              hours: 6,  socialValueGBP: 138, verified: true },
  { id: "a-032", memberId: "m-007", occurredAt: "2025-12-10", category: "Environment", activity: "Park bench restoration",  description: "Sanded and re-varnished 4 weather-damaged park benches with a small volunteer crew.",                          hours: 4,  socialValueGBP: 88,  verified: true },
  { id: "a-033", memberId: "m-008", occurredAt: "2025-12-13", category: "Education",   activity: "Refugee English class",   description: "Taught a beginner-level conversational English class to 6 newly arrived refugees.",                            hours: 2,  socialValueGBP: 56,  verified: true },
  { id: "a-034", memberId: "m-009", occurredAt: "2025-12-16", category: "Health",      activity: "Winter wellbeing calls",  description: "Made check-in phone calls to 8 isolated older people on the warm-line rota during the cold snap.",              hours: 3,  socialValueGBP: 57,  verified: true },
  { id: "a-035", memberId: "m-demo",occurredAt: "2025-12-19", category: "Community",   activity: "Toy distribution",        description: "Delivered Christmas gift parcels to 14 families nominated by the local school's family liaison team.",          hours: 4,  socialValueGBP: 92,  verified: true },
];

export function getDemoMember(id: string): DemoMember | undefined {
  return DEMO_MEMBERS.find(m => m.id === id);
}

// Each activity category maps to its primary UN Sustainable Development Goal.
// Numbers, labels and colours follow the official SDG identity set.
export interface SdgInfo { number: number; label: string; color: string }
export const SDG_BY_CATEGORY: Record<ActivityCategory, SdgInfo> = {
  Environment: { number: 13, label: "Climate Action",                    color: "#3F7E44" },
  Community:   { number: 11, label: "Sustainable Cities & Communities",  color: "#FD9D24" },
  Health:      { number: 3,  label: "Good Health & Wellbeing",           color: "#4C9F38" },
  Education:   { number: 4,  label: "Quality Education",                 color: "#C5192D" },
};

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

// Richer per-category aggregate used by the "Top categories" panel — adds
// distinct member count on top of value/hours/activities.
export interface CategoryBreakdownPoint {
  category: ActivityCategory;
  value: number;
  hours: number;
  activities: number;
  members: number;
}
export function computeCategoryBreakdown(activities: DemoActivity[] = DEMO_ACTIVITIES): CategoryBreakdownPoint[] {
  const cats: ActivityCategory[] = ["Environment", "Community", "Health", "Education"];
  return cats.map(c => {
    const items = activities.filter(a => a.category === c);
    return {
      category: c,
      value: items.reduce((s, a) => s + a.socialValueGBP, 0),
      hours: items.reduce((s, a) => s + a.hours, 0),
      activities: items.length,
      members: new Set(items.map(a => a.memberId)).size,
    };
  }).sort((a, b) => b.value - a.value);
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
  const cats: ActivityCategory[] = ["Environment", "Community", "Health", "Education"];
  const byCategory = cats.map(c => {
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
  trend: Array<{ windowKey: string; label: string; average: number; count: number }>;
  comments: Array<{ id: string; comment: string; windowLabel: string; createdAt: string }>;
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
      { windowKey: "2025-09", label: "Sep 2025", average: 3.9, count: 18 },
      { windowKey: "2025-10", label: "Oct 2025", average: 4.0, count: 21 },
      { windowKey: "2025-11", label: "Nov 2025", average: 4.2, count: 24 },
      { windowKey: "2026-04", label: "Apr 2026", average: 4.3, count: 28 },
    ],
    comments: [
      { id: "demo-cm-001", comment: "The reading-mentor sessions are easily the highlight of my month.", windowLabel: "Apr 2026", createdAt: "2026-04-12T10:00:00.000Z" },
      { id: "demo-cm-002", comment: "Loving the variety — I feel like I'm actually making a difference locally.", windowLabel: "Apr 2026", createdAt: "2026-04-15T18:00:00.000Z" },
      { id: "demo-cm-003", comment: "Would love a bit more notice on event dates so I can plan around work.", windowLabel: "Mar 2026", createdAt: "2026-03-20T08:30:00.000Z" },
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
      { windowKey: "2025-Q3", label: "Q3 2025", average: 3.7, count: 17 },
      { windowKey: "2025-Q4", label: "Q4 2025", average: 3.9, count: 19 },
      { windowKey: "2026-Q1", label: "Q1 2026", average: 4.0, count: 21 },
      { windowKey: "2026-Q2", label: "Q2 2026", average: 4.1, count: 22 },
    ],
    comments: [
      { id: "demo-cm-101", comment: "The new buddy pairings really help when you're starting out.", windowLabel: "Q2 2026", createdAt: "2026-04-08T12:00:00.000Z" },
      { id: "demo-cm-102", comment: "More socials would be great — I only really see people on shifts.", windowLabel: "Q1 2026", createdAt: "2026-02-18T18:00:00.000Z" },
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
      { windowKey: "2026-01", label: "Jan 2026", average: 3.5, count: 32 },
      { windowKey: "2026-02", label: "Feb 2026", average: 3.6, count: 36 },
      { windowKey: "2026-03", label: "Mar 2026", average: 3.7, count: 39 },
      { windowKey: "2026-04", label: "Apr 2026", average: 3.8, count: 41 },
    ],
    comments: [
      { id: "demo-cm-201", comment: "Volunteering has genuinely been good for my own headspace.", windowLabel: "Apr 2026", createdAt: "2026-04-10T20:00:00.000Z" },
      { id: "demo-cm-202", comment: "Bit run-down this month — taking next week off the rota.", windowLabel: "Apr 2026", createdAt: "2026-04-22T07:30:00.000Z" },
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
