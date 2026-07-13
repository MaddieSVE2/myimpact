import {
  db, pool,
  usersTable, organisationsTable, orgMembersTable,
  orgSurveysTable, orgSurveyResponsesTable,
  challengesTable, challengeParticipantsTable,
  impactRecordsTable, recordVerificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { calculateImpact } from "../lib/impactData.js";

const DEMO_USER_ID = "demo-user-000000000000";
const DEMO_ORG_ID = "demo-org-0000000000000";
const DEMO_EMAIL = "demo@demo.org";
const DEMO_ORG_NAME = "Demo Organisation";
const DEMO_ORG_TYPE = "corporate";
const DEMO_INVITE_CODE = "DEMO-0000";

const ORG_ADMIN_USER_ID = "demo-orgadmin-000000000";
const ORG_ADMIN_EMAIL = "organisation@organisation.org";

// ---------------------------------------------------------------------------
// 50 synthetic users used solely for seeding past survey responses
// ---------------------------------------------------------------------------
const SYNTH_USERS = Array.from({ length: 50 }, (_, i) => ({
  id: `demo-synth-u-${String(i + 1).padStart(3, "0")}`,
  email: `synth-member-${String(i + 1).padStart(3, "0")}@demo-organisation.org`,
}));

// ---------------------------------------------------------------------------
// Demo pulse surveys to seed
// ---------------------------------------------------------------------------
const DEMO_SURVEYS = [
  {
    id: "demo-ps-001",
    template: "meaningfulness",
    question: "How meaningful does your volunteering feel right now?",
    schedule: "monthly",
    anonymous: true,
    createdAt: new Date("2025-09-01T09:00:00.000Z"),
  },
  {
    id: "demo-ps-002",
    template: "custom",
    question: "How connected do you feel to the rest of the team?",
    schedule: "quarterly",
    anonymous: true,
    createdAt: new Date("2025-07-01T09:00:00.000Z"),
  },
  {
    id: "demo-ps-003",
    template: "wellbeing",
    question: "How are you feeling about your wellbeing this week?",
    schedule: "monthly",
    anonymous: true,
    createdAt: new Date("2025-10-01T09:00:00.000Z"),
  },
] as const;

// ---------------------------------------------------------------------------
// Synthetic response distributions per past window
// Ratings array: [count of 1s, 2s, 3s, 4s, 5s]
// Current windows (2026-05 monthly, 2026-Q2 quarterly) are intentionally
// excluded so demo@demo.org can still respond.
// ---------------------------------------------------------------------------
type ResponseWindow = {
  surveyId: string;
  windowKey: string;
  ratings: [number, number, number, number, number]; // count of 1,2,3,4,5
  comments?: Array<{ text: string; userOffset: number }>;
};

const RESPONSE_WINDOWS: ResponseWindow[] = [
  // Survey 1: monthly meaningfulness — past windows
  {
    surveyId: "demo-ps-001",
    windowKey: "2025-09",
    ratings: [0, 1, 4, 8, 5],
    comments: [
      { text: "Could we get a bit more intro training before being put on shift?", userOffset: 1 },
    ],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2025-10",
    ratings: [0, 1, 3, 9, 8],
    comments: [
      { text: "Felt really welcomed at my first session, thanks for pairing me with Jas.", userOffset: 2 },
      { text: "Would love a bit more notice on event dates so I can plan around work.", userOffset: 3 },
    ],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2025-11",
    ratings: [0, 1, 2, 11, 10],
    comments: [
      { text: "The reading-mentor sessions are easily the highlight of my month.", userOffset: 4 },
    ],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2026-01",
    ratings: [0, 0, 3, 12, 10],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2026-02",
    ratings: [0, 0, 2, 13, 11],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2026-03",
    ratings: [0, 0, 2, 12, 12],
  },
  {
    surveyId: "demo-ps-001",
    windowKey: "2026-04",
    ratings: [0, 0, 3, 13, 12],
    comments: [
      { text: "Loving the variety, I feel like I'm actually making a difference locally.", userOffset: 5 },
    ],
  },

  // Survey 2: quarterly team connection — past windows
  {
    surveyId: "demo-ps-002",
    windowKey: "2025-Q3",
    ratings: [0, 2, 4, 8, 3],
  },
  {
    surveyId: "demo-ps-002",
    windowKey: "2025-Q4",
    ratings: [0, 1, 4, 9, 5],
    comments: [
      { text: "Quarterly catch-up was a nice touch, felt heard.", userOffset: 6 },
    ],
  },
  {
    surveyId: "demo-ps-002",
    windowKey: "2026-Q1",
    ratings: [0, 1, 4, 10, 6],
    comments: [
      { text: "More socials would be great, I only really see people on shifts.", userOffset: 7 },
      { text: "WhatsApp group has been brilliant for last-minute swaps.", userOffset: 8 },
    ],
  },

  // Survey 3: monthly wellbeing — past windows
  {
    surveyId: "demo-ps-003",
    windowKey: "2025-10",
    ratings: [1, 3, 8, 10, 8],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2025-11",
    ratings: [1, 3, 9, 11, 8],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2025-12",
    ratings: [1, 3, 8, 12, 8],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2026-01",
    ratings: [2, 4, 9, 11, 6],
    comments: [
      { text: "Energising start to the year, really needed it after the holidays.", userOffset: 9 },
    ],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2026-02",
    ratings: [1, 4, 10, 13, 8],
    comments: [
      { text: "Stretched thin between work and shifts, could do with shorter slots.", userOffset: 10 },
    ],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2026-03",
    ratings: [1, 3, 10, 15, 10],
    comments: [
      { text: "Felt better after the wellbeing chat session, more of those please.", userOffset: 11 },
    ],
  },
  {
    surveyId: "demo-ps-003",
    windowKey: "2026-04",
    ratings: [1, 3, 9, 17, 11],
    comments: [
      { text: "Volunteering has genuinely been good for my own headspace.", userOffset: 12 },
      { text: "Bit run-down this month, taking next week off the rota.", userOffset: 13 },
      { text: "Honestly the social side keeps me going through busy weeks at work.", userOffset: 14 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureUser(email: string, fallbackId: string): Promise<string> {
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
  if (existing) {
    console.log(`  User already exists (${existing.id}) for ${email}, skipping insert.`);
    return existing.id;
  }
  const [created] = await db
    .insert(usersTable)
    .values({ id: fallbackId, email })
    .returning();
  console.log(`  User created: ${email} (${created.id})`);
  return created.id;
}

async function ensureMembership(orgId: string, userId: string, role: "member" | "manager") {
  const existing = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, orgId), eq(t.userId, userId)),
  });
  if (existing) {
    if (existing.role !== role && role === "manager") {
      await db
        .update(orgMembersTable)
        .set({ role })
        .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)));
      console.log(`  Membership upgraded to manager: user ${userId} -> org ${orgId}`);
    } else {
      console.log(`  Membership already exists (${existing.role}) for user ${userId}, skipping.`);
    }
    return;
  }
  await db.insert(orgMembersTable).values({ orgId, userId, role, status: "active" });
  console.log(`  Membership created: user ${userId} -> org ${orgId} (${role})`);
}

// ---------------------------------------------------------------------------
// Seed helpers (challenges)
// ---------------------------------------------------------------------------


interface DemoChallengeSpec {
  id: string;
  name: string;
  description: string;
  goalType: "social_value" | "hours";
  target: string;
  startDate: Date;
  endDate: Date;
  inviteCode: string;
}

const DEMO_CHALLENGE_SPECS: DemoChallengeSpec[] = [
  {
    id: "demo-ch-001",
    name: "Spring community sprint",
    description: "Hit £3,000 of Community-category social value before the end of June.",
    goalType: "social_value",
    target: "3000",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-06-30T23:59:59.000Z"),
    inviteCode: "DEMOCH001",
  },
  {
    id: "demo-ch-002",
    name: "150 environmental hours",
    description: "A combined goal across all members to log 150 hours of environmental work this quarter.",
    goalType: "hours",
    target: "150",
    startDate: new Date("2026-05-01T00:00:00.000Z"),
    endDate: new Date("2026-07-31T23:59:59.000Z"),
    inviteCode: "DEMOCH002",
  },
  {
    id: "demo-ch-003",
    name: "Reading mentor month",
    description: "Get 7 members signed up as weekly reading mentors at local primary schools.",
    goalType: "social_value",
    target: "1500",
    startDate: new Date("2026-05-01T00:00:00.000Z"),
    endDate: new Date("2026-05-31T23:59:59.000Z"),
    inviteCode: "DEMOCH003",
  },
  {
    id: "demo-ch-004",
    name: "Winter fundraising drive",
    description: "Reach £5,000 of fundraising activity across the organisation.",
    goalType: "social_value",
    target: "5000",
    startDate: new Date("2025-12-01T00:00:00.000Z"),
    endDate: new Date("2026-02-28T23:59:59.000Z"),
    inviteCode: "DEMOCH004",
  },
];

async function ensureDemoChallenges(orgId: string, memberUserIds: string[]) {
  for (const spec of DEMO_CHALLENGE_SPECS) {
    const existing = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, spec.id),
    });
    if (existing) {
      console.log(`  Challenge already exists: "${spec.name}", skipping.`);
    } else {
      await db.insert(challengesTable).values({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        goalType: spec.goalType,
        target: spec.target,
        startDate: spec.startDate,
        endDate: spec.endDate,
        ownerId: null,
        orgId,
        scope: "org",
        inviteCode: spec.inviteCode,
      });
      console.log(`  Challenge created: "${spec.name}"`);
    }

    for (const userId of memberUserIds) {
      await db
        .insert(challengeParticipantsTable)
        .values({ challengeId: spec.id, userId })
        .onConflictDoNothing();
    }
  }
  console.log(`  Challenge participants enrolled: ${memberUserIds.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seedDemo() {
  const userId = await ensureUser(DEMO_EMAIL, DEMO_USER_ID);

  let existingOrg = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.inviteCode, DEMO_INVITE_CODE),
  });

  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`  Organisation already exists (${orgId}), skipping insert.`);
  } else {
    const [created] = await db
      .insert(organisationsTable)
      .values({
        id: DEMO_ORG_ID,
        name: DEMO_ORG_NAME,
        type: DEMO_ORG_TYPE,
        inviteCode: DEMO_INVITE_CODE,
      })
      .returning();
    orgId = created.id;
    console.log(`  Organisation created: ${DEMO_ORG_NAME} (${orgId})`);
  }

  await ensureMembership(orgId, userId, "member");

  const orgAdminUserId = await ensureUser(ORG_ADMIN_EMAIL, ORG_ADMIN_USER_ID);
  await ensureMembership(orgId, orgAdminUserId, "manager");

  // ── Synthetic users for response seeding ──────────────────────────────────
  // Note: orgAdminUserId is used as createdBy for surveys (the actual DB id,
  // not the hardcoded constant, to handle cases where auth already created the user).
  console.log(`  Ensuring ${SYNTH_USERS.length} synthetic users for response seeding…`);
  const existingSynth = await db.query.usersTable.findMany({
    where: inArray(usersTable.id, SYNTH_USERS.map(u => u.id)),
  });
  const existingSynthIds = new Set(existingSynth.map(u => u.id));
  const newSynth = SYNTH_USERS.filter(u => !existingSynthIds.has(u.id));
  if (newSynth.length > 0) {
    await db.insert(usersTable).values(newSynth);
    console.log(`  Inserted ${newSynth.length} synthetic users.`);
  } else {
    console.log(`  All synthetic users already exist.`);
  }

  // ── Demo pulse surveys ────────────────────────────────────────────────────
  console.log("  Seeding demo pulse surveys…");
  for (const survey of DEMO_SURVEYS) {
    const existing = await db.query.orgSurveysTable.findFirst({
      where: eq(orgSurveysTable.id, survey.id),
    });
    if (existing) {
      console.log(`  Survey ${survey.id} already exists, skipping.`);
      continue;
    }
    await db.insert(orgSurveysTable).values({
      id: survey.id,
      orgId,
      template: survey.template,
      question: survey.question,
      schedule: survey.schedule,
      anonymous: survey.anonymous,
      createdBy: orgAdminUserId,
      createdAt: survey.createdAt,
    });
    console.log(`  Survey created: ${survey.id} — "${survey.question}"`);
  }

  // ── Synthetic responses ───────────────────────────────────────────────────
  console.log("  Seeding synthetic survey responses…");
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const window of RESPONSE_WINDOWS) {
    // Expand the rating distribution into individual rating values
    const ratingValues: number[] = [];
    for (let r = 1; r <= 5; r++) {
      const count = window.ratings[r - 1];
      for (let i = 0; i < count; i++) {
        ratingValues.push(r);
      }
    }

    // Assign synthetic users round-robin starting from userOffset if present
    // Each user gets one response per surveyId+windowKey (unique constraint)
    const startIdx = (window.comments?.[0]?.userOffset ?? 0);
    const commentMap = new Map<number, string>();
    for (const c of window.comments ?? []) {
      commentMap.set(c.userOffset % SYNTH_USERS.length, c.text);
    }

    for (let i = 0; i < ratingValues.length; i++) {
      const userIdx = (startIdx + i) % SYNTH_USERS.length;
      const user = SYNTH_USERS[userIdx]!;
      const rating = ratingValues[i]!;
      const comment = commentMap.get(userIdx) ?? null;

      // Check if response already exists
      const existingResp = await db.query.orgSurveyResponsesTable.findFirst({
        where: and(
          eq(orgSurveyResponsesTable.surveyId, window.surveyId),
          eq(orgSurveyResponsesTable.userId, user.id),
          eq(orgSurveyResponsesTable.windowKey, window.windowKey),
        ),
      });
      if (existingResp) {
        totalSkipped++;
        continue;
      }

      // Stagger createdAt within the window for realistic timestamps
      const [year, monthOrQ] = window.windowKey.split("-");
      let responseDate: Date;
      if (window.windowKey.includes("Q")) {
        const qNum = parseInt(monthOrQ!.replace("Q", ""), 10);
        const month = (qNum - 1) * 3 + 1 + Math.floor(i / 3);
        responseDate = new Date(`${year}-${String(Math.min(month, 12)).padStart(2, "0")}-${String(5 + (i % 20)).padStart(2, "0")}T${String(9 + (i % 10)).padStart(2, "0")}:00:00.000Z`);
      } else {
        responseDate = new Date(`${window.windowKey}-${String(5 + (i % 20)).padStart(2, "0")}T${String(9 + (i % 10)).padStart(2, "0")}:00:00.000Z`);
      }

      await db.insert(orgSurveyResponsesTable).values({
        id: `seed-${window.surveyId}-${window.windowKey}-u${userIdx}`,
        surveyId: window.surveyId,
        userId: user.id,
        windowKey: window.windowKey,
        rating,
        comment,
        createdAt: responseDate,
      });
      totalInserted++;
    }
  }

  console.log(`  Responses: ${totalInserted} inserted, ${totalSkipped} already existed.`);

  await ensureDemoChallenges(orgId, [userId, orgAdminUserId]);

  console.log("Demo seed complete.");
  console.log(`  Member email:   ${DEMO_EMAIL}`);
  console.log(`  Manager email:  ${ORG_ADMIN_EMAIL}`);
  console.log(`  Invite code:    ${DEMO_INVITE_CODE}`);
}

// ---------------------------------------------------------------------------
// My Impact University seed
// ---------------------------------------------------------------------------

const UNI_ORG_ID = "uni-org-0000000000000";
const UNI_ORG_NAME = "My Impact University";
const UNI_ORG_TYPE = "university";
const UNI_INVITE_CODE = "UNI-0000";

const UNI_MANAGER_EMAIL = "university@university.org";
const UNI_MANAGER_USER_ID = "uni-manager-0000000000";
const UNI_STUDENT_EMAIL = "student@student.org";
const UNI_STUDENT_USER_ID = "uni-student-0000000000";

// 25 synthetic university students used to give the dashboard realistic
// aggregate numbers. Emails match the exclusion pattern in
// scripts/onboarding-emails.ts so they can never receive real emails.
const UNI_SYNTH_USERS = Array.from({ length: 25 }, (_, i) => ({
  id: `uni-synth-u-${String(i + 1).padStart(3, "0")}`,
  email: `uni-synth-u-${String(i + 1).padStart(3, "0")}@myimpact-university.org`,
}));

type SeedActivity = { activityId: string; quantity: number; hoursPerYear: number };

interface SeedRecordSpec {
  name: string;
  entryDate: Date;
  activities: SeedActivity[];
  donationsGBP?: number;
}

// ~6 realistic activities for the student persona across the current
// academic year (Sep 2025 – Jun 2026), spanning volunteering, personal
// development, community, and leadership.
const UNI_STUDENT_RECORDS: SeedRecordSpec[] = [
  {
    name: "Freshers' peer mentoring",
    entryDate: new Date("2025-09-22T10:00:00.000Z"),
    activities: [{ activityId: "mentoring_youth", quantity: 12, hoursPerYear: 12 }],
  },
  {
    name: "Campus food bank shifts",
    entryDate: new Date("2025-10-18T09:30:00.000Z"),
    activities: [{ activityId: "food_bank", quantity: 4, hoursPerYear: 10 }],
  },
  {
    name: "Duke of Edinburgh Gold volunteering",
    entryDate: new Date("2025-11-15T14:00:00.000Z"),
    activities: [{ activityId: "dofe", quantity: 15, hoursPerYear: 15 }],
  },
  {
    name: "Schools coding workshop",
    entryDate: new Date("2026-01-24T11:00:00.000Z"),
    activities: [{ activityId: "stem_workshop", quantity: 1, hoursPerYear: 6 }],
  },
  {
    name: "River clean-up with the eco society",
    entryDate: new Date("2026-03-14T10:00:00.000Z"),
    activities: [{ activityId: "litter_picking", quantity: 3, hoursPerYear: 6 }],
  },
  {
    name: "CV clinic for first-years",
    entryDate: new Date("2026-05-09T13:00:00.000Z"),
    activities: [{ activityId: "employability_coaching", quantity: 8, hoursPerYear: 8 }],
  },
];

// Rotation of realistic records for the synthetic students. Combined with
// the student persona's entries this lands on roughly 185 total hours and
// £17k–£18k total social value — inside the £15k–£30k / 150–200hr target.
const UNI_SYNTH_RECORD_SPECS: Array<Omit<SeedRecordSpec, "entryDate"> & { monthOffset: number }> = [
  { name: "Community food bank support", activities: [{ activityId: "food_bank", quantity: 2, hoursPerYear: 5 }], monthOffset: 0 },
  { name: "Campus litter pick", activities: [{ activityId: "litter_picking", quantity: 3, hoursPerYear: 5 }], monthOffset: 1 },
  { name: "Coding taster workshop", activities: [{ activityId: "stem_workshop", quantity: 1, hoursPerYear: 5 }], monthOffset: 2 },
  { name: "Youth mentoring programme", activities: [{ activityId: "mentoring_youth", quantity: 6, hoursPerYear: 6 }], monthOffset: 3 },
  { name: "Employability drop-in", activities: [{ activityId: "employability_coaching", quantity: 4, hoursPerYear: 4 }], monthOffset: 4 },
  { name: "DofE volunteering section", activities: [{ activityId: "dofe", quantity: 8, hoursPerYear: 8 }], monthOffset: 5 },
  { name: "Peer tutoring", activities: [{ activityId: "tutoring", quantity: 1, hoursPerYear: 5 }], monthOffset: 6 },
  { name: "Digital skills for older residents", activities: [{ activityId: "digital_coaching", quantity: 1, hoursPerYear: 4 }], monthOffset: 7 },
];

const UNI_SURVEYS = [
  {
    id: "uni-ps-001",
    template: "meaningfulness" as const,
    question: "How meaningful does your volunteering feel this term?",
    schedule: "monthly" as const,
    createdAt: new Date("2025-10-01T09:00:00.000Z"),
  },
  {
    id: "uni-ps-002",
    template: "custom" as const,
    question: "How much is volunteering helping you build skills for after graduation?",
    schedule: "quarterly" as const,
    createdAt: new Date("2025-10-01T09:05:00.000Z"),
  },
];

const UNI_RESPONSE_WINDOWS: Array<{
  surveyId: string;
  windowKey: string;
  ratings: [number, number, number, number, number];
  comments?: Array<{ text: string; userOffset: number }>;
}> = [
  {
    surveyId: "uni-ps-001",
    windowKey: "2025-11",
    ratings: [0, 1, 4, 7, 4],
    comments: [
      { text: "The mentoring scheme has been a highlight of my first term.", userOffset: 2 },
    ],
  },
  {
    surveyId: "uni-ps-001",
    windowKey: "2026-02",
    ratings: [0, 1, 3, 8, 6],
    comments: [
      { text: "Would be great to have more weekend options around exams.", userOffset: 5 },
    ],
  },
  {
    surveyId: "uni-ps-001",
    windowKey: "2026-04",
    ratings: [0, 0, 3, 9, 7],
  },
  {
    surveyId: "uni-ps-002",
    windowKey: "2025-Q4",
    ratings: [0, 1, 5, 7, 3],
  },
  {
    surveyId: "uni-ps-002",
    windowKey: "2026-Q1",
    ratings: [0, 1, 4, 8, 5],
    comments: [
      { text: "Ran my first workshop solo, straight onto the CV.", userOffset: 9 },
    ],
  },
];

// Insert one impact record (if missing) and guarantee an approved
// record_verifications row for the university org. Idempotency key is
// (userId, name, entryDate) — good enough for fixed seed data.
async function ensureUniRecord(userId: string, spec: SeedRecordSpec): Promise<{ inserted: boolean }> {
  const result = calculateImpact(spec.activities, spec.donationsGBP ?? 0, 0, []);

  let existing = await db.query.impactRecordsTable.findFirst({
    where: and(
      eq(impactRecordsTable.userId, userId),
      eq(impactRecordsTable.name, spec.name),
      eq(impactRecordsTable.entryDate, spec.entryDate),
    ),
    columns: { id: true },
  });

  let inserted = false;
  if (!existing) {
    const [created] = await db
      .insert(impactRecordsTable)
      .values({
        userId,
        name: spec.name,
        periodLabel: spec.entryDate.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
        totalValue: String(result.totalValue),
        impactValue: String(result.impactValue),
        contributionValue: String(result.contributionValue),
        donationsValue: String(result.donationsValue),
        personalDevelopmentValue: String(result.personalDevelopmentValue),
        totalHours: result.totalHours,
        activitiesJson: spec.activities,
        resultJson: result,
        entryDate: spec.entryDate,
        source: "user",
        createdAt: spec.entryDate,
      })
      .returning({ id: impactRecordsTable.id });
    existing = created;
    inserted = true;
  }

  await db
    .insert(recordVerificationsTable)
    .values({
      recordId: existing!.id,
      orgId: UNI_ORG_ID,
      status: "approved",
      decidedAt: spec.entryDate,
      reason: "auto-verified",
    })
    .onConflictDoNothing();

  return { inserted };
}

export async function seedUniversity() {
  console.log("Seeding My Impact University…");

  // ── Org ───────────────────────────────────────────────────────────────────
  const existingOrg = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, UNI_ORG_ID),
  });
  if (!existingOrg) {
    await db.insert(organisationsTable).values({
      id: UNI_ORG_ID,
      name: UNI_ORG_NAME,
      type: UNI_ORG_TYPE,
      inviteCode: UNI_INVITE_CODE,
      autoVerifyActivities: true,
      summaryYearStart: "09-01",
    }).onConflictDoNothing();
    console.log(`  Organisation created: ${UNI_ORG_NAME} (${UNI_ORG_ID})`);
  } else if (!existingOrg.autoVerifyActivities) {
    await db
      .update(organisationsTable)
      .set({ autoVerifyActivities: true })
      .where(eq(organisationsTable.id, UNI_ORG_ID));
    console.log("  Organisation existed without auto-verify — enabled it.");
  } else {
    console.log(`  Organisation already exists (${UNI_ORG_ID}), skipping insert.`);
  }

  // ── Persona users & memberships ───────────────────────────────────────────
  const managerId = await ensureUser(UNI_MANAGER_EMAIL, UNI_MANAGER_USER_ID);
  const studentId = await ensureUser(UNI_STUDENT_EMAIL, UNI_STUDENT_USER_ID);
  await ensureMembership(UNI_ORG_ID, managerId, "manager");
  await ensureMembership(UNI_ORG_ID, studentId, "member");
  // Dual membership: the student persona also belongs to the Demo Organisation.
  await ensureMembership(DEMO_ORG_ID, studentId, "member");

  // ── Synthetic students ────────────────────────────────────────────────────
  const existingSynth = await db.query.usersTable.findMany({
    where: inArray(usersTable.id, UNI_SYNTH_USERS.map((u) => u.id)),
  });
  const existingSynthIds = new Set(existingSynth.map((u) => u.id));
  const newSynth = UNI_SYNTH_USERS.filter((u) => !existingSynthIds.has(u.id));
  if (newSynth.length > 0) {
    await db.insert(usersTable).values(newSynth);
    console.log(`  Inserted ${newSynth.length} synthetic university students.`);
  } else {
    console.log("  All synthetic university students already exist.");
  }
  for (const synth of UNI_SYNTH_USERS) {
    await db
      .insert(orgMembersTable)
      .values({ orgId: UNI_ORG_ID, userId: synth.id, role: "member", status: "active" })
      .onConflictDoNothing();
  }

  // ── Student persona activities (pre-approved) ─────────────────────────────
  let recordsInserted = 0;
  let recordsSkipped = 0;
  for (const spec of UNI_STUDENT_RECORDS) {
    const { inserted } = await ensureUniRecord(studentId, spec);
    inserted ? recordsInserted++ : recordsSkipped++;
  }

  // ── Synthetic student activities (pre-approved) ───────────────────────────
  for (let i = 0; i < UNI_SYNTH_USERS.length; i++) {
    const synth = UNI_SYNTH_USERS[i]!;
    const spec = UNI_SYNTH_RECORD_SPECS[i % UNI_SYNTH_RECORD_SPECS.length]!;
    // Spread entries across Oct 2025 – May 2026, staggering the day so the
    // timeline looks organic.
    const month = 9 + ((spec.monthOffset + i) % 8); // Oct (9) .. May (16 → wraps)
    const year = month > 11 ? 2026 : 2025;
    const entryDate = new Date(Date.UTC(year, month % 12, 3 + ((i * 7) % 24), 10 + (i % 7)));
    const { inserted } = await ensureUniRecord(synth.id, { ...spec, entryDate });
    inserted ? recordsInserted++ : recordsSkipped++;
  }
  console.log(`  Impact records: ${recordsInserted} inserted, ${recordsSkipped} already existed (all with approved verifications).`);

  // ── Pulse surveys ─────────────────────────────────────────────────────────
  for (const survey of UNI_SURVEYS) {
    const existing = await db.query.orgSurveysTable.findFirst({
      where: eq(orgSurveysTable.id, survey.id),
    });
    if (existing) {
      console.log(`  Survey ${survey.id} already exists, skipping.`);
      continue;
    }
    await db.insert(orgSurveysTable).values({
      id: survey.id,
      orgId: UNI_ORG_ID,
      template: survey.template,
      question: survey.question,
      schedule: survey.schedule,
      anonymous: true,
      createdBy: managerId,
      createdAt: survey.createdAt,
    });
    console.log(`  Survey created: ${survey.id} — "${survey.question}"`);
  }

  let respInserted = 0;
  let respSkipped = 0;
  for (const window of UNI_RESPONSE_WINDOWS) {
    const ratingValues: number[] = [];
    for (let r = 1; r <= 5; r++) {
      for (let i = 0; i < window.ratings[r - 1]!; i++) ratingValues.push(r);
    }
    const commentMap = new Map<number, string>();
    for (const c of window.comments ?? []) {
      commentMap.set(c.userOffset % UNI_SYNTH_USERS.length, c.text);
    }
    for (let i = 0; i < ratingValues.length; i++) {
      const userIdx = i % UNI_SYNTH_USERS.length;
      const user = UNI_SYNTH_USERS[userIdx]!;
      const existingResp = await db.query.orgSurveyResponsesTable.findFirst({
        where: and(
          eq(orgSurveyResponsesTable.surveyId, window.surveyId),
          eq(orgSurveyResponsesTable.userId, user.id),
          eq(orgSurveyResponsesTable.windowKey, window.windowKey),
        ),
      });
      if (existingResp) {
        respSkipped++;
        continue;
      }
      const [year, monthOrQ] = window.windowKey.split("-");
      let responseDate: Date;
      if (window.windowKey.includes("Q")) {
        const qNum = parseInt(monthOrQ!.replace("Q", ""), 10);
        const month = (qNum - 1) * 3 + 1 + Math.floor(i / 8);
        responseDate = new Date(`${year}-${String(Math.min(month, 12)).padStart(2, "0")}-${String(4 + (i % 20)).padStart(2, "0")}T${String(9 + (i % 9)).padStart(2, "0")}:00:00.000Z`);
      } else {
        responseDate = new Date(`${window.windowKey}-${String(4 + (i % 20)).padStart(2, "0")}T${String(9 + (i % 9)).padStart(2, "0")}:00:00.000Z`);
      }
      await db.insert(orgSurveyResponsesTable).values({
        id: `seed-${window.surveyId}-${window.windowKey}-u${userIdx}`,
        surveyId: window.surveyId,
        userId: user.id,
        windowKey: window.windowKey,
        rating: ratingValues[i]!,
        comment: commentMap.get(userIdx) ?? null,
        createdAt: responseDate,
      });
      respInserted++;
    }
  }
  console.log(`  Survey responses: ${respInserted} inserted, ${respSkipped} already existed.`);

  console.log("University seed complete.");
  console.log(`  Manager email:  ${UNI_MANAGER_EMAIL}`);
  console.log(`  Member email:   ${UNI_STUDENT_EMAIL}`);
  console.log(`  Invite code:    ${UNI_INVITE_CODE}`);
}

// Allow running directly: tsx src/scripts/seed-demo.ts
const isMain = process.argv[1]?.endsWith("seed-demo.ts") || process.argv[1]?.endsWith("seed-demo.js");
if (isMain) {
  seedDemo()
    .then(() => seedUniversity())
    .then(() => pool.end())
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
