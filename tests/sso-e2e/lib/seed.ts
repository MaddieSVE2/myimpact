import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  organisationsTable,
  orgMembersTable,
  orgSsoConfigsTable,
  usersTable,
} from "@workspace/db";

type SsoProvider = "google" | "microsoft";

/**
 * Database helpers for the real-SSO e2e suite.
 *
 * Each spec creates its own throwaway organisation and inserts an
 * `org_sso_configs` row that maps the IdP test account's *real* email
 * domain to that org. After the spec runs we delete the membership,
 * the auto-provisioned user (only if it matches the test account
 * email), the SSO config and the org. This leaves no trace behind in
 * the target database.
 *
 * The domain on org_sso_configs is globally unique, so we always
 * remove any pre-existing row for that domain before inserting our
 * own — the test should never silently "succeed" because someone
 * else's stale row was steering the lookup.
 */

export interface SsoSeed {
  orgId: string;
  orgName: string;
  ssoConfigId: string;
  domain: string;
  provider: SsoProvider;
  /** Email of the IdP test account (lower-cased). Used for cleanup. */
  testEmail: string;
}

interface SeedInput {
  provider: "google" | "microsoft";
  domain: string;
  testEmail: string;
  tenantId?: string | null;
  enforceSSO?: boolean;
}

function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Insert a throwaway org + SSO config that the spec can sign in against. */
export async function seedOrgWithSso(input: SeedInput): Promise<SsoSeed> {
  const domain = input.domain.trim().toLowerCase();
  const testEmail = input.testEmail.trim().toLowerCase();
  if (!domain || !testEmail.endsWith(`@${domain}`)) {
    throw new Error(
      `Test email '${testEmail}' does not belong to configured domain '${domain}'.`,
    );
  }

  // Drop any stale row that would collide with the unique(domain) index.
  await db
    .delete(orgSsoConfigsTable)
    .where(eq(orgSsoConfigsTable.domain, domain));

  const orgId = id("org");
  const inviteCode = randomBytes(6).toString("hex");
  const orgName = `SSO E2E ${input.provider} ${new Date().toISOString().slice(0, 10)}`;

  await db.insert(organisationsTable).values({
    id: orgId,
    name: orgName,
    type: "charity",
    inviteCode,
  });

  const ssoConfigId = id("sso");
  await db.insert(orgSsoConfigsTable).values({
    id: ssoConfigId,
    orgId,
    provider: input.provider,
    domain,
    tenantId: input.tenantId ?? null,
    enforceSSO: !!input.enforceSSO,
    status: "pending",
  });

  return { orgId, orgName, ssoConfigId, domain, provider: input.provider, testEmail };
}

/** Tear down everything the spec created (and the auto-joined user). */
export async function tearDownSsoSeed(seed: SsoSeed): Promise<void> {
  // Remove the user record auto-provisioned by the SSO callback (if any).
  // We only remove a user whose email exactly matches the test account
  // so we never delete a real human's row by accident.
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, seed.testEmail),
  });

  if (user) {
    await db
      .delete(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, seed.orgId), eq(orgMembersTable.userId, user.id)));
    // Only delete the user if they're not still attached to another org.
    const otherMembership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, user.id),
    });
    if (!otherMembership) {
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }
  }

  // Remove org-level rows. Members on the org from earlier runs are also
  // wiped because the org is throwaway.
  await db.delete(orgMembersTable).where(eq(orgMembersTable.orgId, seed.orgId));
  await db.delete(orgSsoConfigsTable).where(eq(orgSsoConfigsTable.id, seed.ssoConfigId));
  await db.delete(organisationsTable).where(eq(organisationsTable.id, seed.orgId));
}

/**
 * Confirm that the SSO callback auto-joined the IdP test account to the
 * seeded org as a member. Returns the membership row when present.
 */
export async function readMembership(seed: SsoSeed) {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, seed.testEmail),
  });
  if (!user) return null;
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, seed.orgId), eq(orgMembersTable.userId, user.id)),
  });
  return membership ?? null;
}

/** Read the current SSO config row (so specs can assert `status = 'verified'`). */
export async function readSsoConfig(seed: SsoSeed) {
  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: eq(orgSsoConfigsTable.id, seed.ssoConfigId),
  });
  return cfg ?? null;
}
