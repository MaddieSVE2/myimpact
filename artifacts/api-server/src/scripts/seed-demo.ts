import {
  db, pool,
  usersTable, organisationsTable, orgMembersTable,
  orgSurveysTable, orgSurveyResponsesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

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
  await db.insert(orgMembersTable).values({ orgId, userId, role });
  console.log(`  Membership created: user ${userId} -> org ${orgId} (${role})`);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seedDemo() {
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

  console.log("Demo seed complete.");
  console.log(`  Member email:   ${DEMO_EMAIL}`);
  console.log(`  Manager email:  ${ORG_ADMIN_EMAIL}`);
  console.log(`  Invite code:    ${DEMO_INVITE_CODE}`);

  await pool.end();
}

seedDemo().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
