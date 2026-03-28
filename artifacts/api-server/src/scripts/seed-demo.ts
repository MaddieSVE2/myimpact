import { db, pool, usersTable, organisationsTable, orgMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEMO_USER_ID = "demo-user-000000000000";
const DEMO_ORG_ID = "demo-org-0000000000000";
const DEMO_EMAIL = "demo@demo.org";
const DEMO_ORG_NAME = "Demo Organisation";
const DEMO_ORG_TYPE = "corporate";
const DEMO_INVITE_CODE = "DEMO-0000";

async function seedDemo() {
  let existingUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, DEMO_EMAIL),
  });

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    console.log(`  User already exists (${userId}), skipping insert.`);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ id: DEMO_USER_ID, email: DEMO_EMAIL })
      .returning();
    userId = created.id;
    console.log(`  User created: ${DEMO_EMAIL} (${userId})`);
  }

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

  const existingMembership = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, orgId), eq(t.userId, userId)),
  });

  if (existingMembership) {
    console.log(`  Membership already exists, skipping insert.`);
  } else {
    await db.insert(orgMembersTable).values({ orgId, userId });
    console.log(`  Membership created: user ${userId} -> org ${orgId}`);
  }

  console.log("Demo seed complete.");
  console.log(`  Email:        ${DEMO_EMAIL}`);
  console.log(`  Invite code:  ${DEMO_INVITE_CODE}`);

  await pool.end();
}

seedDemo().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
