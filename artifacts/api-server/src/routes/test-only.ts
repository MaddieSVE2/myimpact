import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  magicTokensTable,
  organisationsTable,
  orgMembersTable,
  orgRegistrationsTable,
  orgSurveysTable,
  challengesTable,
  challengeParticipantsTable,
  recordVerificationsTable,
  orgShareLinksTable,
  orgAuditLogTable,
  localCharityAreasTable,
  localCharitySuggestionsTable,
  type StoredCharityPlace,
} from "@workspace/db";
import { eq, like, gt, desc, and, sql, inArray } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";
import { eraseUserData } from "../lib/userDeletion.js";
import { CURRENT_GENERATION_VERSION } from "../lib/premappedCharities.js";

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

// Single source of truth for user deletion lives in lib/userDeletion.ts so
// the e2e teardown path matches the production right-to-erasure path.
const deleteUserCascade = (userId: string) => eraseUserData(userId).then(() => undefined);

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
 * Fetch a user's age-gate fields (or confirm they don't exist).
 * Used by the age-gate spec to assert on birth month/year and minor flag,
 * and that under-13 attempts never created a row.
 */
router.get("/user-info", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    res.json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    userId: user.id,
    birthMonth: user.birthMonth,
    birthYear: user.birthYear,
    isMinor: user.isMinor,
  });
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
 * Delete an org and all its dependents. Used to clean up between runs.
 *
 * Order matters: several tables reference organisations without ON DELETE
 * CASCADE (challenges, record_verifications, org_share_links, org_audit_log,
 * org_members), so they must be removed before the organisation row itself
 * or Postgres raises a foreign-key violation.
 */
router.post("/delete-org", async (req, res) => {
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : "";
  if (!orgId) {
    res.status(400).json({ error: "orgId required" });
    return;
  }
  // Order matters: several tables reference organisations without ON DELETE
  // CASCADE, so they must be removed before the organisation row itself
  // or Postgres raises a foreign-key violation.

  // 1. Challenges reference organisations. Challenge participants cascade off challenges.
  const orgChallenges = await db
    .select({ id: challengesTable.id })
    .from(challengesTable)
    .where(eq(challengesTable.orgId, orgId));
  if (orgChallenges.length > 0) {
    await db.delete(challengeParticipantsTable).where(
      inArray(
        challengeParticipantsTable.challengeId,
        orgChallenges.map((c) => c.id),
      ),
    );
    await db.delete(challengesTable).where(eq(challengesTable.orgId, orgId));
  }

  // 2. Other non-cascading FK tables are cleaned via raw SQL or Drizzle
  // to ensure the delete never trips a foreign-key violation.
  await db.execute(sql`delete from record_verifications where org_id = ${orgId}`);
  await db.execute(sql`delete from org_audit_log where org_id = ${orgId}`);
  await db.execute(sql`delete from org_share_links where org_id = ${orgId}`);
  await db.delete(orgMembersTable).where(eq(orgMembersTable.orgId, orgId));
  await db.delete(organisationsTable).where(eq(organisationsTable.id, orgId));
  res.json({ ok: true });
});

/**
 * Seed an org-wide pulse survey. Returns the new survey id.
 * createdBy is an arbitrary existing member of the org so the FK holds.
 */
router.post("/seed-org-survey", async (req, res) => {
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : "";
  const template = typeof req.body?.template === "string" ? req.body.template : "meaningfulness";
  const question =
    typeof req.body?.question === "string" && req.body.question.trim()
      ? req.body.question
      : "How meaningful did your work feel this month?";
  const schedule = typeof req.body?.schedule === "string" ? req.body.schedule : "monthly";
  const anonymous = req.body?.anonymous === false ? false : true;
  if (!orgId) {
    res.status(400).json({ error: "orgId required" });
    return;
  }
  const member = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.orgId, orgId),
  });
  if (!member) {
    res.status(400).json({ error: "org has no members yet — join one first" });
    return;
  }
  const id = `e2e-survey-${randomUUID().slice(0, 8)}`;
  await db.insert(orgSurveysTable).values({
    id,
    orgId,
    template,
    question,
    schedule,
    anonymous,
    createdBy: member.userId,
  });
  res.json({ ok: true, id });
});

/**
 * Seed an active org-wide challenge and add every existing org member as a
 * participant. Returns the new challenge id.
 */
router.post("/seed-org-challenge", async (req, res) => {
  const orgId = typeof req.body?.orgId === "string" ? req.body.orgId : "";
  const name = typeof req.body?.name === "string" && req.body.name.trim()
    ? req.body.name
    : "E2E Org Challenge";
  const goalType = typeof req.body?.goalType === "string" ? req.body.goalType : "hours";
  const target = typeof req.body?.target === "number" ? req.body.target : 100;
  if (!orgId) {
    res.status(400).json({ error: "orgId required" });
    return;
  }
  const id = `e2e-ch-${randomUUID().slice(0, 8)}`;
  const inviteCode = `E2EC-${randomBytes(3).toString("hex").toUpperCase()}`;
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(challengesTable).values({
    id,
    name,
    description: "Seeded by E2E test",
    goalType,
    target: String(target),
    startDate: start,
    endDate: end,
    ownerId: null,
    orgId,
    scope: "org",
    inviteCode,
  });
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, orgId),
  });
  if (members.length > 0) {
    await db
      .insert(challengeParticipantsTable)
      .values(members.map((m) => ({ challengeId: id, userId: m.userId })))
      .onConflictDoNothing();
  }
  res.json({ ok: true, id, inviteCode });
});

/**
 * Insert an APPROVED org_registrations row matching `inviteCode` + `contactEmail`.
 * When the user with that email next calls /api/org/join with the same invite
 * code, they will be promoted to manager. Used by the org-prompts spec to make
 * one of two test users the manager of the same org.
 */
router.post("/seed-approved-registration", async (req, res) => {
  const orgName = typeof req.body?.orgName === "string" ? req.body.orgName : "E2E Org";
  const type = typeof req.body?.type === "string" ? req.body.type : "charity";
  const contactEmail =
    typeof req.body?.contactEmail === "string" ? req.body.contactEmail.trim().toLowerCase() : "";
  const inviteCode =
    typeof req.body?.inviteCode === "string" ? req.body.inviteCode.trim().toUpperCase() : "";
  if (!contactEmail || !inviteCode) {
    res.status(400).json({ error: "contactEmail and inviteCode required" });
    return;
  }
  const id = `e2e-reg-${randomUUID().slice(0, 8)}`;
  await db.insert(orgRegistrationsTable).values({
    id,
    orgName,
    type,
    contactName: "E2E Manager",
    contactEmail,
    status: "approved",
    inviteCode,
  });
  res.json({ ok: true, id });
});

/**
 * Seed a local-charity area (and optionally per-category suggestion rows)
 * so the pre-mapped suggestions flow can be tested without any AI calls.
 *
 * Body: {
 *   localAuthority: string,
 *   country?: string,          // default "England"
 *   status?: string,           // default "ready"
 *   categories?: Array<{ category: string; places: StoredCharityPlace[] }>
 * }
 *
 * Note: to simulate the "pending" API response WITHOUT triggering real
 * background generation, seed status "ready" with no categories — the
 * /premapped route reports "pending" when no suggestion rows exist, and
 * ensureAuthority only re-queues generation for "failed"/"pending" rows.
 */
router.post("/seed-local-charities", async (req, res) => {
  const localAuthority =
    typeof req.body?.localAuthority === "string" ? req.body.localAuthority.trim() : "";
  if (!localAuthority) {
    res.status(400).json({ error: "localAuthority required" });
    return;
  }
  const country = typeof req.body?.country === "string" ? req.body.country : "England";
  const status = typeof req.body?.status === "string" ? req.body.status : "ready";
  const categories = Array.isArray(req.body?.categories)
    ? (req.body.categories as Array<{ category: string; places: StoredCharityPlace[] }>)
    : [];

  await db
    .insert(localCharityAreasTable)
    .values({
      localAuthority,
      country,
      status,
      lastGeneratedAt: new Date(),
      generationVersion: CURRENT_GENERATION_VERSION,
    })
    .onConflictDoUpdate({
      target: localCharityAreasTable.localAuthority,
      set: {
        country,
        status,
        lastGeneratedAt: new Date(),
        generationVersion: CURRENT_GENERATION_VERSION,
        updatedAt: new Date(),
      },
    });

  await db
    .delete(localCharitySuggestionsTable)
    .where(eq(localCharitySuggestionsTable.localAuthority, localAuthority));

  for (const entry of categories) {
    if (!entry || typeof entry.category !== "string" || !Array.isArray(entry.places)) continue;
    await db.insert(localCharitySuggestionsTable).values({
      localAuthority,
      category: entry.category,
      places: entry.places,
      generatedAt: new Date(),
    });
  }

  res.json({ ok: true, localAuthority, status, seededCategories: categories.length });
});

/** Delete a seeded local-charity area and all its suggestion rows. */
router.post("/reset-local-charities", async (req, res) => {
  const localAuthority =
    typeof req.body?.localAuthority === "string" ? req.body.localAuthority.trim() : "";
  if (!localAuthority) {
    res.status(400).json({ error: "localAuthority required" });
    return;
  }
  await db
    .delete(localCharitySuggestionsTable)
    .where(eq(localCharitySuggestionsTable.localAuthority, localAuthority));
  await db
    .delete(localCharityAreasTable)
    .where(eq(localCharityAreasTable.localAuthority, localAuthority));
  res.json({ ok: true });
});

export default router;
