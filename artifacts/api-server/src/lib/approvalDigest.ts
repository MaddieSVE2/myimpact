import {
  db,
  organisationsTable,
  orgMembersTable,
  impactRecordsTable,
  recordVerificationsTable,
  aiAlertStateTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getUncachableResendClient } from "./resend.js";

// Send a reminder when submissions have been waiting longer than this.
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
// Never email the same org's managers more than once per this window.
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 90 * 1000;

// Last-sent timestamps live in the generic keyed alert-state table,
// one row per org: key = `approval_digest:<orgId>`.
const STATE_KEY_PREFIX = "approval_digest:";
const DEMO_ORG_ID = "demo-org-0000000000000";

function getAppUrl(): string {
  const url =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  return url.replace(/\/$/, "");
}

interface OrgPendingSummary {
  orgId: string;
  orgName: string;
  pendingCount: number;
  staleCount: number;
  oldestCreatedAt: Date;
}

// Mirrors the eligibility rules used by GET /api/org/verifications/pending:
// records logged by current members since they joined, with no verification
// row for this org yet.
async function getPendingSummary(orgId: string, orgName: string): Promise<OrgPendingSummary | null> {
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, orgId),
  });
  if (members.length === 0) return null;
  const memberMap = new Map(members.map(m => [m.userId, m]));

  const records = await db
    .select({
      id: impactRecordsTable.id,
      userId: impactRecordsTable.userId,
      createdAt: impactRecordsTable.createdAt,
    })
    .from(impactRecordsTable)
    .where(inArray(impactRecordsTable.userId, members.map(m => m.userId)));

  const eligible = records.filter(r => {
    const m = memberMap.get(r.userId);
    return m && new Date(r.createdAt) >= new Date(m.joinedAt);
  });
  if (eligible.length === 0) return null;

  const verifications = await db
    .select({ recordId: recordVerificationsTable.recordId })
    .from(recordVerificationsTable)
    .where(and(
      eq(recordVerificationsTable.orgId, orgId),
      inArray(recordVerificationsTable.recordId, eligible.map(r => r.id)),
    ));
  const decided = new Set(verifications.map(v => v.recordId));

  const pending = eligible.filter(r => !decided.has(r.id));
  if (pending.length === 0) return null;

  const now = Date.now();
  const staleCount = pending.filter(r => now - new Date(r.createdAt).getTime() > STALE_AFTER_MS).length;
  const oldestCreatedAt = pending.reduce(
    (oldest, r) => (new Date(r.createdAt) < oldest ? new Date(r.createdAt) : oldest),
    new Date(pending[0]!.createdAt),
  );

  return { orgId, orgName, pendingCount: pending.length, staleCount, oldestCreatedAt };
}

async function lastDigestSentAt(orgId: string): Promise<Date | null> {
  const row = await db.query.aiAlertStateTable.findFirst({
    where: eq(aiAlertStateTable.key, `${STATE_KEY_PREFIX}${orgId}`),
  });
  return row?.lastSentAt ?? null;
}

async function recordDigestSent(orgId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_alert_state (key, last_sent_at)
    VALUES (${`${STATE_KEY_PREFIX}${orgId}`}, NOW())
    ON CONFLICT (key) DO UPDATE SET last_sent_at = NOW()
  `);
}

async function managerEmails(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ email: usersTable.email })
    .from(orgMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, orgMembersTable.userId))
    .where(and(
      eq(orgMembersTable.orgId, orgId),
      eq(orgMembersTable.role, "manager"),
      eq(orgMembersTable.status, "active"),
    ));
  return rows.map(r => (r.email ?? "").trim()).filter(e => e.includes("@"));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

async function sendDigestForOrg(summary: OrgPendingSummary): Promise<boolean> {
  const recipients = await managerEmails(summary.orgId);
  if (recipients.length === 0) {
    console.log(`[approval-digest] org ${summary.orgId} has pending items but no manager emails; skipping`);
    return false;
  }

  const appUrl = getAppUrl();
  const approvalsUrl = appUrl ? `${appUrl}/org` : null;
  const days = Math.floor((Date.now() - summary.oldestCreatedAt.getTime()) / (24 * 60 * 60 * 1000));
  const plural = summary.pendingCount === 1 ? "submission is" : "submissions are";

  const { client, fromEmail } = await getUncachableResendClient();
  const result = await client.emails.send({
    from: fromEmail,
    to: recipients,
    subject: `[My Impact] ${summary.pendingCount} ${summary.pendingCount === 1 ? "submission" : "submissions"} waiting for your approval`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;color:#213547;">
        <h2 style="color:#E8633A;">Submissions waiting for approval</h2>
        <p><strong>${summary.pendingCount}</strong> member ${plural} waiting for review at <strong>${escapeHtml(summary.orgName)}</strong>.</p>
        <p style="color:#555;font-size:13px;">The oldest has been waiting for ${days} ${days === 1 ? "day" : "days"}. Approving keeps members' verified hours up to date and your funder reports accurate.</p>
        ${approvalsUrl ? `<p style="margin:24px 0;"><a href="${approvalsUrl}" style="background:#E8633A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Review pending submissions</a></p>` : ""}
        <p style="color:#888;font-size:12px;margin-top:32px;">You're receiving this because you're a manager of ${escapeHtml(summary.orgName)} on My Impact. We'll remind you at most once a week while items are waiting.</p>
      </div>
    `,
  });
  if (result.error) {
    console.error(`[approval-digest] send failed for org ${summary.orgId}:`, result.error);
    return false;
  }

  await recordDigestSent(summary.orgId);
  console.log(`[approval-digest] sent digest for org ${summary.orgId} (${summary.pendingCount} pending) to ${recipients.length} manager(s)`);
  return true;
}

export async function runApprovalDigestCheck(): Promise<void> {
  try {
    const orgs = await db
      .select({ id: organisationsTable.id, name: organisationsTable.name })
      .from(organisationsTable)
      .where(eq(organisationsTable.autoVerifyActivities, false));

    let sent = 0;
    for (const org of orgs) {
      if (org.id === DEMO_ORG_ID) continue;
      try {
        const summary = await getPendingSummary(org.id, org.name);
        // Only nudge once at least one item has been waiting a few days.
        if (!summary || summary.staleCount === 0) continue;

        const lastSent = await lastDigestSentAt(org.id);
        if (lastSent && Date.now() - lastSent.getTime() < COOLDOWN_MS) continue;

        if (await sendDigestForOrg(summary)) sent++;
      } catch (err) {
        console.error(`[approval-digest] failed for org ${org.id}:`, err);
      }
    }
    console.log(`[approval-digest] check complete: ${orgs.length} approval-mode org(s) scanned, ${sent} digest(s) sent`);
  } catch (err) {
    console.error("[approval-digest] check failed:", err);
  }
}

/**
 * Schedule the daily pending-approvals digest. Runs after a short startup
 * delay and then every 24 hours. Timers are unref'd so they do not keep
 * the event loop alive on shutdown.
 */
export function startApprovalDigestJob(): void {
  const startup = setTimeout(() => {
    runApprovalDigestCheck().catch(() => {});
    const recurring = setInterval(() => {
      runApprovalDigestCheck().catch(() => {});
    }, CHECK_INTERVAL_MS);
    recurring.unref?.();
  }, STARTUP_DELAY_MS);
  startup.unref?.();
  console.log("[approval-digest] scheduled daily pending-approvals digest check");
}
