/**
 * Invites to join an organisation, sent by a manager one at a time
 * (routes/org.ts) or from a list (routes/org-groups.ts, sent in the
 * background).
 */
import { db, organisationsTable, orgInvitesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getUncachableResendClient } from "./resend.js";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function listGroups(names: string[]): string {
  const escaped = names.map((n) => `<strong>${escHtml(n)}</strong>`);
  return escaped.length <= 1 ? escaped.join("") : `${escaped.slice(0, -1).join(", ")} and ${escaped.at(-1)}`;
}

export async function sendOrgInviteEmail(
  orgId: string,
  email: string,
  groupNames: string[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
  if (!org) return { ok: false, error: "Organisation not found." };
  const appUrl = process.env.APP_URL ?? "https://myimpact.uk";
  const joinUrl = `${appUrl}/org?invite=${encodeURIComponent(org.inviteCode)}`;
  const groupsLine = groupNames.length > 0
    ? `
          <p style="color:#444;font-size:15px;line-height:1.5;">
            When you join, you'll be in ${listGroups(groupNames)}.
          </p>`
    : "";
  try {
    const { client, fromEmail } = await getUncachableResendClient("organisation");
    const { error } = await client.emails.send({
      from: fromEmail,
      to: email,
      subject: `You're invited to join ${org.name} on My Impact`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">Join ${escHtml(org.name)} on My Impact</h2>
          <p style="color:#444;font-size:15px;line-height:1.5;">
            A manager at <strong>${escHtml(org.name)}</strong> has invited you to join their organisation
            on My Impact — a simple way to track your volunteering and giving, and see the difference it makes.
          </p>${groupsLine}
          <p style="color:#444;font-size:15px;line-height:1.5;">
            Use the button below to join. If you don't have a My Impact account yet, you can create one first —
            it only takes a minute.
          </p>
          <div style="margin-top:24px;">
            <a href="${joinUrl}" style="display:inline-block;background:#E8633A;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Join ${escHtml(org.name)}</a>
          </div>
          <p style="color:#888;font-size:12px;margin-top:20px;">
            Or enter this invite code after signing in: <strong style="letter-spacing:1px;">${escHtml(org.inviteCode)}</strong>
          </p>
          <p style="color:#aaa;font-size:11px;margin-top:32px;">My Impact · myimpact.uk</p>
        </div>
      `,
    });
    if (error) {
      console.error("[org.invite] Resend rejected invite email:", error);
      return { ok: false, error: "The email service rejected the invite. Please try again later." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[org.invite] failed to send invite email:", err);
    return { ok: false, error: "Could not send the invite email. Please try again later." };
  }
}

// Resend allows about two requests a second.
const SEND_GAP_MS = process.env.E2E_TEST_MODE === "1" ? 0 : 600;

/**
 * Records invites from a list and sends them one at a time in the
 * background, so a long list doesn't hold up the request. They show as
 * pending invites straight away; one the email service refuses is removed
 * again, so the list only shows invites that went out.
 */
export async function sendInvitesInBackground(
  orgId: string,
  invitedByUserId: string,
  invites: { email: string; groupNames: string[] }[],
): Promise<void> {
  if (invites.length === 0) return;
  const rows = invites.map((inv) => ({
    id: randomUUID(),
    orgId,
    email: inv.email,
    invitedByUserId,
    sentAt: new Date(),
  }));
  const recorded = await db.insert(orgInvitesTable).values(rows).onConflictDoNothing().returning({ id: orgInvitesTable.id, email: orgInvitesTable.email });
  const recordedIds = new Map(recorded.map((r) => [r.email, r.id]));
  void (async () => {
    for (const inv of invites) {
      const id = recordedIds.get(inv.email);
      if (!id) continue;
      const sent = await sendOrgInviteEmail(orgId, inv.email, inv.groupNames);
      if (!sent.ok) {
        await db.delete(orgInvitesTable).where(eq(orgInvitesTable.id, id)).catch((err) => {
          console.error("[org.invite] could not remove an unsent invite:", err);
        });
      }
      if (SEND_GAP_MS > 0) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    }
  })().catch((err) => console.error("[org.invite] sending invites from a list stopped:", err));
}
