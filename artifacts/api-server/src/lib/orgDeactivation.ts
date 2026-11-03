import { db, orgDeactivatedMembersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export const DEACTIVATED_MEMBER_MESSAGE =
  "Your membership of this organisation was deactivated. Please ask one of its managers if you think this is a mistake.";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** True when a manager has deactivated `userId` from `orgId`, which stops them joining again. */
export async function isDeactivatedFrom(orgId: string, userId: string, client: typeof db | Transaction = db): Promise<boolean> {
  const row = await client.query.orgDeactivatedMembersTable.findFirst({
    where: and(eq(orgDeactivatedMembersTable.orgId, orgId), eq(orgDeactivatedMembersTable.userId, userId)),
    columns: { userId: true },
  });
  return !!row;
}

/**
 * Queues one person's membership changes until the transaction ends, so joining,
 * deactivating and reactivating can't interleave and leave them in two
 * organisations, or both active and deactivated.
 */
export async function lockMembershipChanges(tx: Transaction, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`org-membership:${userId}`}, 0))`);
}
