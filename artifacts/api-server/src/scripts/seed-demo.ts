import {
  db, pool,
  usersTable, organisationsTable, orgMembersTable, orgMemberConsentsTable,
  orgDeactivatedMembersTable, orgSurveysTable, orgSurveyResponsesTable,
  challengesTable, challengeParticipantsTable,
  impactRecordsTable, recordVerificationsTable,
} from "@workspace/db";
import { eq, and, or, inArray, isNull, like, sql } from "drizzle-orm";
import { calculateImpact } from "../lib/impactData.js";
import {
  UNI_SURVEYS, planUniRecords, planUniSurveyResponses, uniStudents,
  type PlannedActivity,
} from "../lib/universityDemoData.js";

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

  const existingOrg = await db.query.organisationsTable.findFirst({
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
// A university the size of a real one: 10,240 people registered, a few
// thousand of them logging activity, and over £1m of social value in each
// academic year. Who the students are and what they log is planned in
// lib/universityDemoData.ts; this file writes whatever part of that plan the
// database does not have yet. It runs on every server start, so the common
// case (nothing missing) costs a handful of small queries.

const UNI_ORG_ID = "uni-org-0000000000000";
const UNI_ORG_NAME = "My Impact University";
const UNI_ORG_TYPE = "university";
const UNI_INVITE_CODE = "UNI-0000";

const UNI_MANAGER_EMAIL = "university@university.org";
const UNI_MANAGER_USER_ID = "uni-manager-0000000000";
const UNI_STUDENT_EMAIL = "student@student.org";
const UNI_STUDENT_USER_ID = "uni-student-0000000000";
const UNI_CONSENT_SHARE_FROM = new Date("2025-09-01T00:00:00.000Z");
const UNI_CONSENT_GRANTED_AT = new Date("2025-09-15T10:00:00.000Z");

// Every seeded student's id starts this way (lib/universityDemoData.ts).
const UNI_SYNTH_ID_PATTERN = "uni-synth-u-%";
// One fixed sign-up moment for all of them, well in the past, so they sit
// together in the admin user list instead of burying recent real sign-ups.
const UNI_SYNTH_CREATED_AT = new Date("2025-09-01T09:00:00.000Z");

interface SeedRecordSpec {
  name: string;
  entryDate: Date;
  activities: PlannedActivity[];
  donationsGBP?: number;
}

// The student persona's own activities: six across the 2025/26 academic year
// and two so far in 2026/27, spanning volunteering, personal development,
// community and leadership.
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
  {
    name: "Freshers' fair volunteer lead",
    entryDate: new Date("2026-09-21T10:00:00.000Z"),
    activities: [{ activityId: "mentoring_youth", quantity: 10, hoursPerYear: 10 }],
  },
  {
    name: "Peer tutoring for a first-year",
    entryDate: new Date("2026-10-17T14:00:00.000Z"),
    activities: [{ activityId: "tutoring", quantity: 1, hoursPerYear: 12 }],
  },
];

function chunked<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

/** The impact_records row for one personal activity record, valued like a real entry. */
function uniRecordValues(userId: string, spec: SeedRecordSpec): typeof impactRecordsTable.$inferInsert {
  const result = calculateImpact(spec.activities, spec.donationsGBP ?? 0, 0, []);
  return {
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
  };
}

// Insert one personal impact record (if missing) and guarantee an approved
// record_verifications row for the university org. University sharing happens
// through member consent, not by pre-submitting these personal records.
// Idempotency key is (userId, name, entryDate) — good enough for fixed seed data.
async function ensureUniRecord(userId: string, spec: SeedRecordSpec): Promise<{ inserted: boolean }> {
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
      .values(uniRecordValues(userId, spec))
      .returning({ id: impactRecordsTable.id });
    existing = created;
    inserted = true;
  } else {
    // Earlier university seeds treated these as manual submissions. Convert
    // those fixed demo rows back to personal records so consent is the single
    // route through which the university sees activity.
    await db
      .update(impactRecordsTable)
      .set({ submittedToOrgId: null, submittedToOrgAt: null })
      .where(eq(impactRecordsTable.id, existing.id));
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

async function ensureUniversityConsent(userId: string) {
  await db
    .insert(orgMemberConsentsTable)
    .values({
      id: `uni-consent-${userId}`,
      orgId: UNI_ORG_ID,
      userId,
      status: "active",
      shareFrom: UNI_CONSENT_SHARE_FROM,
      shareScope: "historic",
      grantedAt: UNI_CONSENT_GRANTED_AT,
      withdrawnAt: null,
    })
    .onConflictDoUpdate({
      target: [orgMemberConsentsTable.orgId, orgMemberConsentsTable.userId],
      set: {
        status: "active",
        shareFrom: UNI_CONSENT_SHARE_FROM,
        shareScope: "historic",
        grantedAt: UNI_CONSENT_GRANTED_AT,
        withdrawnAt: null,
      },
    });
}

const countRows = sql<number>`count(*)::int`;

// The seeded students: their accounts, their membership of the university,
// and consent for the ones who log activity. Students who do not log have
// registered but share nothing, which is what a real cohort looks like.
async function seedUniStudents() {
  const students = uniStudents();
  const loggers = students.filter((s) => s.logsActivity);

  const [[members], [consents], [deactivated]] = await Promise.all([
    db.select({ n: countRows }).from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, UNI_ORG_ID), like(orgMembersTable.userId, UNI_SYNTH_ID_PATTERN))),
    db.select({ n: countRows }).from(orgMemberConsentsTable)
      .where(and(eq(orgMemberConsentsTable.orgId, UNI_ORG_ID), like(orgMemberConsentsTable.userId, UNI_SYNTH_ID_PATTERN))),
    db.select({ n: countRows }).from(orgDeactivatedMembersTable)
      .where(and(eq(orgDeactivatedMembersTable.orgId, UNI_ORG_ID), like(orgDeactivatedMembersTable.userId, UNI_SYNTH_ID_PATTERN))),
  ]);
  if (members!.n + deactivated!.n === students.length && consents!.n === loggers.length) {
    console.log(`  All ${students.length} university students already in place.`);
    return;
  }

  // ── Accounts ──
  const existingUsers = new Set(
    (await db.select({ id: usersTable.id }).from(usersTable).where(like(usersTable.id, UNI_SYNTH_ID_PATTERN)))
      .map((u) => u.id),
  );
  const newUsers = students.filter((s) => !existingUsers.has(s.id));
  for (const batch of chunked(newUsers, 1000)) {
    await db
      .insert(usersTable)
      .values(batch.map((s) => ({
        id: s.id,
        email: s.email,
        displayName: s.displayName,
        createdAt: UNI_SYNTH_CREATED_AT,
        // No inbox behind these addresses: never opt them in to email.
        emailDigestOptIn: false,
        emailRemindersOptIn: false,
      })))
      .onConflictDoNothing();
  }
  // Students seeded before the cohort grew have no name and the default
  // email settings. Bring them in line with the rest.
  await db
    .update(usersTable)
    .set({ emailDigestOptIn: false, emailRemindersOptIn: false })
    .where(and(
      like(usersTable.id, UNI_SYNTH_ID_PATTERN),
      or(eq(usersTable.emailDigestOptIn, true), eq(usersTable.emailRemindersOptIn, true)),
    ));
  const unnamed = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(like(usersTable.id, UNI_SYNTH_ID_PATTERN), isNull(usersTable.displayName)));
  const studentById = new Map(students.map((s) => [s.id, s]));
  for (const { id } of unnamed) {
    const student = studentById.get(id);
    if (student) await db.update(usersTable).set({ displayName: student.displayName }).where(eq(usersTable.id, id));
  }

  // ── Membership ──
  // A student a manager has deactivated in a demo stays deactivated.
  const [memberRows, deactivatedRows] = await Promise.all([
    db.select({ userId: orgMembersTable.userId }).from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, UNI_ORG_ID), like(orgMembersTable.userId, UNI_SYNTH_ID_PATTERN))),
    db.select({ userId: orgDeactivatedMembersTable.userId }).from(orgDeactivatedMembersTable)
      .where(and(eq(orgDeactivatedMembersTable.orgId, UNI_ORG_ID), like(orgDeactivatedMembersTable.userId, UNI_SYNTH_ID_PATTERN))),
  ]);
  const placed = new Set([...memberRows, ...deactivatedRows].map((m) => m.userId));
  const newMembers = students.filter((s) => !placed.has(s.id));
  for (const batch of chunked(newMembers, 1000)) {
    await db
      .insert(orgMembersTable)
      .values(batch.map((s) => ({
        orgId: UNI_ORG_ID,
        userId: s.id,
        role: "member",
        status: "active",
        joinedAt: s.joinedAt,
      })))
      .onConflictDoNothing();
  }

  // ── Consent ──
  // Everyone shares from the same day, so the dashboard's queries match the
  // whole cohort with one list (lib/orgSharing.ts sharedRecordsCondition).
  const consented = new Set(
    (await db.select({ userId: orgMemberConsentsTable.userId }).from(orgMemberConsentsTable)
      .where(and(eq(orgMemberConsentsTable.orgId, UNI_ORG_ID), like(orgMemberConsentsTable.userId, UNI_SYNTH_ID_PATTERN))))
      .map((c) => c.userId),
  );
  const newConsents = loggers.filter((s) => !consented.has(s.id));
  for (const batch of chunked(newConsents, 1000)) {
    await db
      .insert(orgMemberConsentsTable)
      .values(batch.map((s) => ({
        id: `uni-consent-${s.id}`,
        orgId: UNI_ORG_ID,
        userId: s.id,
        status: "active",
        shareFrom: UNI_CONSENT_SHARE_FROM,
        shareScope: "historic",
        grantedAt: s.joinedAt,
      })))
      .onConflictDoNothing();
  }

  console.log(`  University students: ${newUsers.length} accounts, ${newMembers.length} memberships and ${newConsents.length} consents added.`);
}

// The seeded students' activity up to `now`, each record with an approved
// verification. Records have no natural unique key, so two servers starting
// together could both add the same ones: a database lock makes the second
// wait and then find nothing left to add.
async function seedUniRecords(now: Date) {
  const planned = planUniRecords(now);
  const keyOf = (r: { userId: string; name: string; entryDate: Date }) => `${r.userId}|${r.name}|${r.entryDate.getTime()}`;
  const missingFrom = (existing: Array<{ userId: string; name: string; entryDate: Date }>) => {
    const have = new Set(existing.map(keyOf));
    return planned.filter((r) => !have.has(keyOf(r)));
  };
  const seededColumns = {
    userId: impactRecordsTable.userId,
    name: impactRecordsTable.name,
    entryDate: impactRecordsTable.entryDate,
  };

  const seeded = await db.select(seededColumns).from(impactRecordsTable)
    .where(like(impactRecordsTable.userId, UNI_SYNTH_ID_PATTERN));
  if (missingFrom(seeded).length === 0) {
    console.log(`  All ${planned.length} university activity records already in place.`);
    return;
  }

  const added = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('my-impact-university-seed'))`);
    const missing = missingFrom(
      await tx.select(seededColumns).from(impactRecordsTable)
        .where(like(impactRecordsTable.userId, UNI_SYNTH_ID_PATTERN)),
    );
    for (const batch of chunked(missing, 200)) {
      const inserted = await tx
        .insert(impactRecordsTable)
        .values(batch.map((r) => uniRecordValues(r.userId, r)))
        .returning({ id: impactRecordsTable.id, entryDate: impactRecordsTable.entryDate });
      await tx
        .insert(recordVerificationsTable)
        .values(inserted.map((r) => ({
          recordId: r.id,
          orgId: UNI_ORG_ID,
          status: "approved",
          decidedAt: r.entryDate,
          reason: "auto-verified",
        })))
        .onConflictDoNothing();
    }
    return missing.length;
  });
  console.log(`  University activity records: ${added} added, ${planned.length - added} already existed (all with approved verifications).`);
}

async function seedUniSurveys(managerId: string, now: Date) {
  for (const survey of UNI_SURVEYS) {
    const existing = await db.query.orgSurveysTable.findFirst({
      where: eq(orgSurveysTable.id, survey.id),
    });
    if (existing) continue;
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

  // Each planned answer has a fixed id, so answers already there are skipped.
  const planned = planUniSurveyResponses(now);
  const have = new Set(
    (await db.select({ id: orgSurveyResponsesTable.id }).from(orgSurveyResponsesTable)
      .where(inArray(orgSurveyResponsesTable.surveyId, UNI_SURVEYS.map((s) => s.id))))
      .map((r) => r.id),
  );
  const missing = planned.filter((r) => !have.has(r.id));
  for (const batch of chunked(missing, 500)) {
    await db.insert(orgSurveyResponsesTable).values(batch).onConflictDoNothing();
  }
  console.log(`  University survey responses: ${missing.length} added, ${planned.length - missing.length} already existed.`);
}

export async function seedUniversity(now: Date = new Date()) {
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
      dataSharingMode: "consented_logging",
      summaryYearStart: "09-01",
    }).onConflictDoNothing();
    console.log(`  Organisation created: ${UNI_ORG_NAME} (${UNI_ORG_ID})`);
  } else if (!existingOrg.autoVerifyActivities || existingOrg.dataSharingMode !== "consented_logging") {
    await db
      .update(organisationsTable)
      .set({ autoVerifyActivities: true, dataSharingMode: "consented_logging" })
      .where(eq(organisationsTable.id, UNI_ORG_ID));
    console.log("  Organisation settings updated for consented logging.");
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

  // The student persona shares historically too, so the account is ready to
  // show the same automatic sharing for anything newly logged in a demo.
  await ensureUniversityConsent(studentId);
  for (const spec of UNI_STUDENT_RECORDS) {
    if (spec.entryDate <= now) await ensureUniRecord(studentId, spec);
  }

  // ── Seeded students, their activity and their survey answers ──────────────
  await seedUniStudents();
  await seedUniRecords(now);
  await seedUniSurveys(managerId, now);

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
