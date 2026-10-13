import type { Response } from "express";
import { db, organisationsTable, orgMembersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";
import { REVOKED_ORG_MESSAGE } from "./orgSharing.js";

/**
 * The signed-in user's active membership when they manage an organisation
 * that hasn't been revoked. Otherwise sends the 404/403 and returns null, so
 * callers `return` straight away.
 */
export async function requireOrgManager(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "active")),
  });
  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return null;
  }
  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can perform this action." });
    return null;
  }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
    columns: { revokedAt: true },
  });
  if (org?.revokedAt) {
    res.status(403).json({ error: REVOKED_ORG_MESSAGE });
    return null;
  }
  return membership;
}
