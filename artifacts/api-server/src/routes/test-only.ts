import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  magicTokensTable,
  userProfilesTable,
  pageViewsTable,
  feedbackTable,
  onboardingEmailSendsTable,
  organisationsTable,
  orgMembersTable,
  orgRegistrationsTable,
  publicProfilesTable,
  journalEntriesTable,
  impactRecordsTable,
  recurringTemplatesTable,
} from "@workspace/db";
import { eq, like, gt, desc, and, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";

/**
 * Test-only endpoints. Mounted only when E2E_TEST_MODE=1 is set.
 *
 * SECURITY: Never enable this in production. The parent index gates the
 * mount on the env var; this file performs an additional defensive check.
 */

const router: IRouter = Router();

router.use((_req, res, next) => {
  if (process.env.E2E_TEST_MODE !== "1") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

async function deleteUserCascade(userId: string): Promise<void> {
  // The schema does NOT cascade from users.id to most tables, so delete
  // dependents explicitly. Order matters where FKs exist.
  await db.delete(magicTokensTable).where(eq(magicTokensTable.userId, userId));
  await db.delete(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  await db.delete(pageViewsTable).where(eq(pageViewsTable.userId, userId));
  await db.delete(feedbackTable).where(eq(feedbackTable.userId, userId));
  await db.delete(onboardingEmailSendsTable).where(eq(onboardingEmailSendsTable.userId, userId));
  await db.delete(orgMembersTable).where(eq(orgMembersTable.userId, userId));
  await db.delete(publicProfilesTable).where(eq(publicProfilesTable.userId, userId));
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.userId, userId));
  await db.delete(impactRecordsTable).where(eq(impactRecordsTable.userId, userId));
  await db.delete(recurringTemplatesTable).where(eq(recurringTemplatesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
}

/**
 * Delete a single user (and all their data) by email.
 * No-op if the user does not exist.
 */
router.post("/reset-user", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    res.json({ ok: true, deleted: false });
    return;
  }
  await deleteUserCascade(user.id);
  res.json({ ok: true, deleted: true, userId: user.id });
});

/**
 * Bulk delete every user whose email matches a SQL LIKE pattern, plus all
 * their data. Used for test-suite-wide teardown of `%@e2etest.local` users.
 */
router.post("/reset-emails", async (req, res) => {
  const pattern = typeof req.body?.pattern === "string" ? req.body.pattern : "";
  if (!pattern) {
    res.status(400).json({ error: "pattern required" });
    return;
  }
  // Hard guard: only allow patterns ending in @e2etest.local for safety.
  if (!pattern.endsWith("@e2etest.local")) {
    res.status(400).json({ error: "pattern must end with @e2etest.local" });
    return;
  }
  const users = await db.select().from(usersTable).where(like(usersTable.email, pattern));
  for (const u of users) {
    await deleteUserCascade(u.id);
  }
  // Also clean up any pending org registrations from the same pattern.
  await db
    .delete(orgRegistrationsTable)
    .where(like(orgRegistrationsTable.contactEmail, pattern));
  res.json({ ok: true, deleted: users.length });
});

/**
 * Fetch the latest unexpired, unconfirmed magic-link token for an email.
 * Used to bypass the real email channel in tests.
 */
router.get("/latest-token", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }
  const [tok] = await db
    .select()
    .from(magicTokensTable)
    .where(
      and(
        eq(magicTokensTable.userId, user.id),
        gt(magicTokensTable.expiresAt, new Date()),
        eq(magicTokensTable.confirmed, false),
      ),
    )
    .orderBy(desc(magicTokensTable.expiresAt))
    .limit(1);
  if (!tok) {
    res.status(404).json({ error: "no token" });
    return;
  }
  res.json({ token: tok.token });
});

/**
 * Approve the most recent pending org registration with the given contact
 * email. Creates the organisation and stamps the registration with the
 * generated invite code so a subsequent /api/org/join with that user as
 * contact will promote them to manager.
 */
router.post("/approve-org-registration", async (req, res) => {
  const contactEmail =
    typeof req.body?.contactEmail === "string" ? req.body.contactEmail.trim().toLowerCase() : "";
  if (!contactEmail) {
    res.status(400).json({ error: "contactEmail required" });
    return;
  }
  const reg = await db.query.orgRegistrationsTable.findFirst({
    where: and(
      sql`lower(${orgRegistrationsTable.contactEmail}) = ${contactEmail}`,
      eq(orgRegistrationsTable.status, "pending"),
    ),
    orderBy: [desc(orgRegistrationsTable.createdAt)],
  });
  if (!reg) {
    res.status(404).json({ error: "registration not found" });
    return;
  }

  const orgId = `e2e-org-${randomUUID().slice(0, 8)}`;
  const inviteCode = `E2E-${randomBytes(3).toString("hex").toUpperCase()}`;

  await db.insert(organisationsTable).values({
    id: orgId,
    name: reg.orgName,
    type: reg.type,
    inviteCode,
  });

  await db
    .update(orgRegistrationsTable)
    .set({ status: "approved", inviteCode })
    .where(eq(orgRegistrationsTable.id, reg.id));

  res.json({ ok: true, orgId, inviteCode, orgName: reg.orgName });
});

/**
 * Direct-create an organisation. Useful for spec 4 to skip the
 * pending-approval flow entirely when test isolation matters more than
 * reproducing the exact admin-approval path (which is covered above).
 */
router.post("/create-org", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "E2E Test Org";
  const type = typeof req.body?.type === "string" ? req.body.type : "charity";
  const orgId = `e2e-org-${randomUUID().slice(0, 8)}`;
  const inviteCode = `E2E-${randomBytes(3).toString("hex").toUpperCase()}`;
  await db.insert(organisationsTable).values({ id: orgId, name, type, inviteCode });
  res.json({ ok: true, orgId, inviteCode, orgName: name });
});

/**
 * Delete an org and cascade all members. Used to clean up between runs.
 */
router.post("/delete-org", async (req, res) => {
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : "";
  if (!orgId) {
    res.status(400).json({ error: "orgId required" });
    return;
  }
  await db.delete(orgMembersTable).where(eq(orgMembersTable.orgId, orgId));
  await db.delete(organisationsTable).where(eq(organisationsTable.id, orgId));
  res.json({ ok: true });
});

export default router;
