import { db, pool, usersTable, organisationsTable, orgMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DEMO_USER_ID = "demo-user-000000000000";
const DEMO_ORG_ID = "demo-org-0000000000000";
const DEMO_EMAIL = "demo@demo.org";
const DEMO_ORG_NAME = "Demo Organisation";
const DEMO_ORG_TYPE = "corporate";
const DEMO_INVITE_CODE = "DEMO-0000";

const ORG_ADMIN_USER_ID = "demo-orgadmin-000000000";
const ORG_ADMIN_EMAIL = "organisation@organisation.org";

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
