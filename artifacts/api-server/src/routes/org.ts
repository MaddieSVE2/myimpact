import { Router, type IRouter } from "express";
import { db, organisationsTable, orgMembersTable, impactRecordsTable, orgRegistrationsTable, orgMatchRatesTable, orgShareLinksTable, orgSsoConfigsTable, recordVerificationsTable, orgAuditLogTable, usersTable, orgApiKeysTable, userProfilesTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, lt, asc, desc, isNull, sql } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { promises as dnsPromises } from "dns";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { getUncachableResendClient } from "../lib/resend.js";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildOrgDocument } from "../lib/orgPdf.js";
import React from "react";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { computeMatchesForRecords, type RecordForMatch } from "../lib/orgMatch.js";
import { enqueueOrgEvent } from "../lib/webhookDispatcher.js";
import { trackServerEvent } from "../lib/analytics.js";
import { featureCap } from "../lib/featureFlags.js";
import { configuredProviders, isProviderConfigured, normalizeDomain, type SsoProvider } from "../lib/oidc.js";
import { generateOrgLogoKey, getUploadURL, getDownloadURL, deleteAttachment, getObjectMetadata, readObjectBuffer } from "../lib/objectStorage.js";
import { calculateImpact, ACTIVITIES } from "../lib/impactData.js";
import { deleteAttachmentsForRecord } from "../lib/attachmentCleanup.js";
import { getPeriodBounds } from "../lib/summaryPeriod.js";
import { getOrgSharingContext, sharedRecordsCondition, normalizeDashboardSections, REVOKED_ORG_MESSAGE } from "../lib/orgSharing.js";
import { orgMemberConsentsTable, orgMigrationsTable, orgMigratedActivitiesTable } from "@workspace/db";

const router: IRouter = Router();

const orgRegisterRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many registration requests. Please wait before trying again.",
});

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

router.post("/register", orgRegisterRateLimit, async (req, res) => {
  const { orgName, type, contactName, contactEmail, size, purpose } = req.body;
  if (!orgName || !type || !contactName || !contactEmail) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }

  try {
    await db.insert(orgRegistrationsTable).values({
      id: randomUUID(),
      orgName,
      type,
      contactName,
      contactEmail,
      size: size || null,
      purpose: purpose || null,
      status: "pending",
    });
  } catch (dbErr) {
    console.error("Failed to save org registration to DB:", dbErr);
    res.status(500).json({ error: "Failed to save registration. Please try again." });
    return;
  }

  // E2E test mode: skip the notification email. The registration row is
  // saved above and can be approved via the test-only endpoints.
  if (process.env.E2E_TEST_MODE === "1") {
    res.json({ ok: true });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to: "hello@myimpact.uk",
      replyTo: contactEmail,
      subject: `New organisation registration: ${escHtml(orgName)}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
          <h2 style="color:#213547;margin-top:0;">New Organisation Registration Request</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;width:160px;font-size:13px;"><strong>Organisation</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(orgName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Type</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(type)}</td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact name</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(contactName)}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Contact email</strong></td><td style="padding:12px 16px;font-size:14px;"><a href="mailto:${escHtml(contactEmail)}" style="color:#E8633A;">${escHtml(contactEmail)}</a></td></tr>
            <tr style="background:#f7f5ef;"><td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Approx size</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(size || "Not specified")}</td></tr>
            <tr><td style="padding:12px 16px;color:#555;font-size:13px;vertical-align:top;"><strong>Purpose</strong></td><td style="padding:12px 16px;color:#213547;font-size:14px;line-height:1.5;">${escHtml(purpose || "Not provided")}</td></tr>
          </table>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">Sent from My Impact · myimpact.replit.com</p>
        </div>
      `,
    });
    if (sendError) {
      console.error("Resend error sending org registration:", sendError);
      res.status(500).json({ error: "Failed to send registration. Please try again." });
      return;
    }
  } catch (err) {
    console.error("Org registration email error:", err);
    res.status(500).json({ error: "Failed to send registration. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.get("/list", authenticate, async (_req: AuthenticatedRequest, res) => {
  const orgs = await db.query.organisationsTable.findMany({
    columns: { id: true, name: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  res.json({ orgs });
});

router.post("/validate-invite", authenticate, async (req: AuthenticatedRequest, res) => {
  const { inviteCode, orgId } = req.body;
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  if (!orgId || typeof orgId !== "string") {
    res.status(400).json({ error: "Organisation selection is required" });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: and(
      eq(organisationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(organisationsTable.id, orgId),
    ),
  });

  if (!org) {
    res.status(400).json({ error: "That code does not match the selected organisation. Please check with your admin and try again." });
    return;
  }

  if (org.revokedAt) {
    res.status(403).json({ error: "This organisation is no longer active on My Impact." });
    return;
  }

  const userId = req.user!.id;

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  res.json({
    ok: true,
    orgName: org.name,
    orgId: org.id,
    allowedDomain: org.allowedDomain ?? null,
    dataSharingMode: org.dataSharingMode ?? "explicit_submission",
  });
});

router.post("/join", authenticate, async (req: AuthenticatedRequest, res) => {
  const { inviteCode, orgId } = req.body;
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }
  if (!orgId || typeof orgId !== "string") {
    res.status(400).json({ error: "Organisation selection is required" });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: and(
      eq(organisationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(organisationsTable.id, orgId),
    ),
  });

  if (!org) {
    res.status(400).json({ error: "That code does not match the selected organisation. Please check with your admin and try again." });
    return;
  }

  if (org.revokedAt) {
    res.status(403).json({ error: "This organisation is no longer active on My Impact." });
    return;
  }

  const userId = req.user!.id;
  const userEmail = req.user!.email;

  // Consented-logging orgs: joining requires an explicit consent choice.
  // 'historic' shares activities dated on/after the member-chosen date;
  // 'from_join' shares only activities from the join moment onwards.
  const isConsentedOrg = org.dataSharingMode === "consented_logging";
  let consentShareFrom: Date | null = null;
  let consentScope: "historic" | "from_join" | null = null;
  if (isConsentedOrg) {
    const scope = (req.body as Record<string, unknown>).consentScope;
    if (scope === "from_join") {
      consentScope = "from_join";
      consentShareFrom = new Date();
    } else if (scope === "historic") {
      const raw = (req.body as Record<string, unknown>).consentHistoricFrom;
      const parsed = typeof raw === "string" && raw ? new Date(raw) : null;
      if (!parsed || isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
        res.status(400).json({ error: "Please choose a valid past date to share historic activity from." });
        return;
      }
      consentScope = "historic";
      consentShareFrom = parsed;
    } else {
      res.status(400).json({ error: "This organisation uses consented logging — you must choose how your activity is shared before joining." });
      return;
    }
  }

  // Domain restriction: if the org has allowedDomain set, reject emails that don't match.
  if (org.allowedDomain) {
    const emailDomain = userEmail.split("@")[1]?.toLowerCase() ?? "";
    if (emailDomain !== org.allowedDomain.toLowerCase()) {
      res.status(403).json({
        error: `This organisation only accepts members with an @${org.allowedDomain} email address.`,
      });
      return;
    }
  }

  const registration = await db.query.orgRegistrationsTable.findFirst({
    where: and(
      eq(orgRegistrationsTable.inviteCode, inviteCode.trim().toUpperCase()),
      eq(orgRegistrationsTable.status, "approved"),
    ),
    columns: { contactEmail: true },
  });

  // A joiner is auto-promoted to manager when their email matches either the
  // approved registration's contact email (self-registered orgs) or the
  // organisation's own contact email (admin-created orgs have no registration).
  const shouldBeManager =
    registration?.contactEmail?.toLowerCase() === userEmail.toLowerCase() ||
    (org.contactEmail ?? "").toLowerCase() === userEmail.toLowerCase();
  const role = shouldBeManager ? "manager" : "member";
  // Managers are active immediately; regular members start as pending.
  const memberStatus = shouldBeManager ? "active" : "pending";

  const existing = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, org.id), eq(t.userId, userId)),
  });

  if (existing) {
    if (shouldBeManager && existing.role !== "manager") {
      await db.update(orgMembersTable)
        .set({ role: "manager", status: "active" })
        .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, userId)));
    }
    res.json({ ok: true, orgName: org.name, alreadyMember: true, status: existing.status });
    return;
  }

  const otherMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (otherMembership) {
    res.status(409).json({ error: "You're already a member of an organisation." });
    return;
  }

  await db.insert(orgMembersTable).values({ orgId: org.id, userId, role, status: memberStatus });

  if (isConsentedOrg && consentScope && consentShareFrom) {
    await db.insert(orgMemberConsentsTable).values({
      id: randomUUID(),
      orgId: org.id,
      userId,
      status: "active",
      shareFrom: consentShareFrom,
      shareScope: consentScope,
    }).onConflictDoUpdate({
      target: [orgMemberConsentsTable.orgId, orgMemberConsentsTable.userId],
      set: { status: "active", shareFrom: consentShareFrom, shareScope: consentScope, grantedAt: new Date(), withdrawnAt: null },
    });
    await writeAuditLog(org.id, userId, "consent.granted", "member", userId, {
      shareScope: consentScope,
      shareFrom: consentShareFrom.toISOString(),
    }).catch(err => console.error("[org.join] failed to write consent audit log:", err));
  }

  if (shouldBeManager) {
    enqueueOrgEvent({
      orgId: org.id,
      eventType: "member.joined",
      payload: {
        member: { ref: userId, email: userEmail },
        role,
        joinedAt: new Date().toISOString(),
      },
    }).catch(err => console.error("[org.join] failed to enqueue member.joined:", err));

    trackServerEvent({
      eventName: "org_invite_accepted",
      userId,
      surface: "org",
      props: { role, orgType: org.type ?? "unknown" },
    });
  }

  if (memberStatus === "pending") {
    (async () => {
      try {
        const managerRows = await db
          .select({ userId: orgMembersTable.userId })
          .from(orgMembersTable)
          .where(
            and(
              eq(orgMembersTable.orgId, org.id),
              eq(orgMembersTable.role, "manager"),
              eq(orgMembersTable.status, "active"),
            ),
          );

        let recipientEmails: string[];
        if (managerRows.length > 0) {
          const managerUserIds = managerRows.map(r => r.userId);
          const managerUsers = await db
            .select({ id: usersTable.id, email: usersTable.email })
            .from(usersTable)
            .where(inArray(usersTable.id, managerUserIds));
          recipientEmails = managerUsers.map(m => m.email);
        } else if (org.contactEmail) {
          // No active managers yet (e.g. admin-created org whose contact
          // hasn't claimed their manager seat) — fall back to the
          // organisation's contact email so the request isn't lost.
          recipientEmails = [org.contactEmail];
        } else {
          console.warn(
            `[org.join] org ${org.id} has no active managers and no contact email — join-request notification not sent`,
          );
          return;
        }

        const requesterUser = await db
          .select({ displayName: usersTable.displayName })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .then(rows => rows[0] ?? null);

        const requesterName = requesterUser?.displayName?.trim() || userEmail;
        const { client, fromEmail } = await getUncachableResendClient();
        const appUrl = process.env.APP_URL ?? "https://myimpact.uk";
        const reviewUrl = `${appUrl}/org/settings`;

        await Promise.all(
          recipientEmails.map(recipientEmail =>
            client.emails.send({
              from: fromEmail,
              to: recipientEmail,
              subject: `New join request for ${escHtml(org.name)}`,
              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
                  <h2 style="color:#213547;margin-top:0;">New member request</h2>
                  <p style="color:#444;font-size:15px;line-height:1.5;">
                    Someone has requested to join <strong>${escHtml(org.name)}</strong> and is waiting for your approval.
                  </p>
                  <table style="width:100%;border-collapse:collapse;margin-top:16px;background:white;border-radius:8px;overflow:hidden;">
                    <tr style="background:#f7f5ef;">
                      <td style="padding:12px 16px;color:#555;width:120px;font-size:13px;"><strong>Name</strong></td>
                      <td style="padding:12px 16px;color:#213547;font-size:14px;">${escHtml(requesterName)}</td>
                    </tr>
                    <tr>
                      <td style="padding:12px 16px;color:#555;font-size:13px;"><strong>Email</strong></td>
                      <td style="padding:12px 16px;font-size:14px;"><a href="mailto:${escHtml(userEmail)}" style="color:#E8633A;">${escHtml(userEmail)}</a></td>
                    </tr>
                  </table>
                  <div style="margin-top:24px;">
                    <a href="${reviewUrl}" style="display:inline-block;background:#E8633A;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Review request</a>
                  </div>
                  <p style="color:#aaa;font-size:11px;margin-top:32px;">My Impact · myimpact.uk</p>
                </div>
              `,
            }).catch(err => console.error("[org.join] failed to send manager notification:", err)),
          ),
        );
      } catch (err) {
        console.error("[org.join] failed to notify managers:", err);
      }
    })();
  }

  res.json({ ok: true, orgName: org.name, alreadyMember: false, status: memberStatus });
});

router.get("/my", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });

  if (!membership) {
    res.json({ org: null });
    return;
  }

  let org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });

  if (!org) {
    res.json({ org: null });
    return;
  }

  // Self-heal: if the org's own contact is stuck as a pending member (e.g.
  // they joined before the auto-promotion fix shipped), promote them to
  // active manager here — the pending screen blocks re-entering the invite
  // code, so /join's promotion path can never run for them.
  const userEmail = req.user!.email ?? "";
  if (
    membership.status === "pending" &&
    membership.role !== "manager" &&
    !org.revokedAt &&
    (org.contactEmail ?? "").toLowerCase() === userEmail.toLowerCase() &&
    userEmail
  ) {
    await db.update(orgMembersTable)
      .set({ role: "manager", status: "active" })
      .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, userId)));
    membership.role = "manager";
    membership.status = "active";
  }

  let logoUrl: string | null = null;
  if (org.logoKey) {
    try {
      logoUrl = await getDownloadURL(org.logoKey);
    } catch {
      logoUrl = null;
    }
  }

  // Server-side dashboard-section gating: when the SROI section is disabled
  // by the super-admin, the cost inputs that drive SROI panels are withheld.
  const mySections = normalizeDashboardSections(org.dashboardSections);
  res.json({
    org: {
      id: org.id,
      name: org.name,
      type: org.type,
      role: membership.role,
      membershipStatus: membership.status,
      aiSidekickEnabled: org.aiSidekickEnabled,
      challengeLeaderboardEnabled: org.challengeLeaderboardEnabled,
      autoVerifyActivities: org.autoVerifyActivities ?? false,
      sroiCostPerVolunteer: mySections.sroi ? (org.sroiCostPerVolunteer ?? null) : null,
      sroiCostBreakdown: mySections.sroi ? {
        recruitment: org.sroiCostRecruitment ?? null,
        onboarding: org.sroiCostOnboarding ?? null,
        support: org.sroiCostSupport ?? null,
        admin: org.sroiCostAdmin ?? null,
      } : { recruitment: null, onboarding: null, support: null, admin: null },
      summaryYearStart: org.summaryYearStart ?? "01-01",
      allowedDomain: org.allowedDomain ?? null,
      dataSharingMode: org.dataSharingMode ?? "explicit_submission",
      dashboardSections: normalizeDashboardSections(org.dashboardSections),
      fullTierEnabled: org.fullTierEnabled ?? false,
      revoked: !!org.revokedAt,
      branding: {
        logoUrl,
        logoKey: org.logoKey ?? null,
        brandPrimary: org.brandPrimary ?? null,
        brandAccent: org.brandAccent ?? null,
      },
    },
  });
});

// ── Member data-sharing consent (consented-logging orgs) ────────────────────

// View my consent for my current org.
router.get("/my/consent", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({ where: eq(orgMembersTable.userId, userId) });
  if (!membership) { res.json({ consent: null }); return; }
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
    columns: { dataSharingMode: true, name: true },
  });
  if (!org || org.dataSharingMode !== "consented_logging") { res.json({ consent: null }); return; }
  const consent = await db.query.orgMemberConsentsTable.findFirst({
    where: and(eq(orgMemberConsentsTable.orgId, membership.orgId), eq(orgMemberConsentsTable.userId, userId)),
  });
  res.json({
    consent: consent ? {
      status: consent.status,
      shareScope: consent.shareScope,
      shareFrom: consent.shareFrom.toISOString(),
      grantedAt: consent.grantedAt.toISOString(),
      withdrawnAt: consent.withdrawnAt ? consent.withdrawnAt.toISOString() : null,
      orgName: org.name,
    } : null,
  });
});

// Withdraw my consent — immediately removes my activities from org aggregates.
router.post("/my/consent/withdraw", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({ where: eq(orgMembersTable.userId, userId) });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  const consent = await db.query.orgMemberConsentsTable.findFirst({
    where: and(eq(orgMemberConsentsTable.orgId, membership.orgId), eq(orgMemberConsentsTable.userId, userId)),
  });
  if (!consent || consent.status !== "active") {
    res.status(400).json({ error: "You don't have an active data-sharing consent to withdraw." });
    return;
  }
  const withdrawnAt = new Date();
  await db.update(orgMemberConsentsTable)
    .set({ status: "withdrawn", withdrawnAt })
    .where(eq(orgMemberConsentsTable.id, consent.id));
  await writeAuditLog(membership.orgId, userId, "consent.withdrawn", "member", userId, {
    withdrawnAt: withdrawnAt.toISOString(),
  }).catch(err => console.error("[org.consent] failed to write audit log:", err));
  res.json({ ok: true });
});

// ── Branding (logo + colours) ─────────────────────────────────────────────────
const ALLOWED_LOGO_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml",
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

function isHexColour(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v);
}

// Step 1 of the logo upload flow: manager requests a presigned PUT URL.
router.post("/my/branding/logo-upload-url", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({ where: eq(orgMembersTable.userId, userId) });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  if (membership.role !== "manager") { res.status(403).json({ error: "Only organisation managers can change branding." }); return; }

  const body = req.body as Record<string, unknown>;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const byteSize = typeof body.byteSize === "number" ? body.byteSize : NaN;
  if (!ALLOWED_LOGO_TYPES.has(mimeType)) {
    res.status(415).json({ error: "Unsupported logo type. Use PNG, JPG, WebP or SVG." });
    return;
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    res.status(400).json({ error: "Invalid file size." });
    return;
  }
  if (byteSize > MAX_LOGO_BYTES) {
    res.status(413).json({ error: `Logo too large. Maximum size is ${Math.round(MAX_LOGO_BYTES / (1024 * 1024))} MB.` });
    return;
  }

  const logoKey = generateOrgLogoKey(membership.orgId);
  try {
    const uploadUrl = await getUploadURL(logoKey, mimeType, MAX_LOGO_BYTES);
    res.json({ uploadUrl, logoKey });
  } catch (err) {
    console.error("Failed to mint logo upload URL:", err);
    res.status(500).json({ error: "Failed to prepare upload." });
  }
});

// Step 2 / general updater. Manager-only PATCH that updates any combination of
// logoKey, brandPrimary, brandAccent. Pass null for any field to clear it.
router.patch("/my/branding", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({ where: eq(orgMembersTable.userId, userId) });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  if (membership.role !== "manager") { res.status(403).json({ error: "Only organisation managers can change branding." }); return; }

  const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, membership.orgId) });
  if (!org) { res.status(404).json({ error: "Organisation not found." }); return; }

  const body = req.body as Record<string, unknown>;
  const updates: { logoKey?: string | null; brandPrimary?: string | null; brandAccent?: string | null } = {};
  let oldLogoKeyToDelete: string | null = null;

  if ("logoKey" in body) {
    const v = body.logoKey;
    if (v === null) {
      updates.logoKey = null;
      if (org.logoKey) oldLogoKeyToDelete = org.logoKey;
    } else if (typeof v === "string" && v.startsWith(`org-logos/${membership.orgId.replace(/[^a-zA-Z0-9_-]/g, "_")}/`)) {
      // Verify the object actually exists and is an allowed image type/size.
      const meta = await getObjectMetadata(v);
      if (!meta) { res.status(400).json({ error: "Uploaded logo not found. Please upload again." }); return; }
      if (!ALLOWED_LOGO_TYPES.has(meta.contentType)) {
        await deleteAttachment(v).catch(() => {});
        res.status(415).json({ error: "Uploaded file is not a supported image type." });
        return;
      }
      if (meta.size > MAX_LOGO_BYTES) {
        await deleteAttachment(v).catch(() => {});
        res.status(413).json({ error: "Logo too large." });
        return;
      }
      updates.logoKey = v;
      if (org.logoKey && org.logoKey !== v) oldLogoKeyToDelete = org.logoKey;
    } else {
      res.status(400).json({ error: "Invalid logoKey." });
      return;
    }
  }

  if ("brandPrimary" in body) {
    const v = body.brandPrimary;
    if (v === null) updates.brandPrimary = null;
    else if (isHexColour(v)) updates.brandPrimary = v.toUpperCase();
    else { res.status(400).json({ error: "brandPrimary must be a 6-digit hex colour like #0EA5E9." }); return; }
  }
  if ("brandAccent" in body) {
    const v = body.brandAccent;
    if (v === null) updates.brandAccent = null;
    else if (isHexColour(v)) updates.brandAccent = v.toUpperCase();
    else { res.status(400).json({ error: "brandAccent must be a 6-digit hex colour like #B5BE2E." }); return; }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No branding fields supplied." });
    return;
  }

  const [updated] = await db
    .update(organisationsTable)
    .set(updates)
    .where(eq(organisationsTable.id, membership.orgId))
    .returning();

  if (oldLogoKeyToDelete) {
    await deleteAttachment(oldLogoKeyToDelete).catch(() => {});
  }

  let logoUrl: string | null = null;
  if (updated?.logoKey) {
    try { logoUrl = await getDownloadURL(updated.logoKey); } catch { logoUrl = null; }
  }
  res.json({
    branding: {
      logoUrl,
      logoKey: updated?.logoKey ?? null,
      brandPrimary: updated?.brandPrimary ?? null,
      brandAccent: updated?.brandAccent ?? null,
    },
  });
});

// Manager-only: update org-level settings (currently just the AI Sidekick toggle).
router.patch("/my/settings", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return;
  }
  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can change settings." });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { aiSidekickEnabled, challengeLeaderboardEnabled, sroiCostPerVolunteer, sroiCostBreakdown, summaryYearStart, allowedDomain } = body as {
    aiSidekickEnabled?: unknown;
    challengeLeaderboardEnabled?: unknown;
    sroiCostPerVolunteer?: unknown;
    sroiCostBreakdown?: unknown;
    summaryYearStart?: unknown;
    allowedDomain?: unknown;
  };
  const updates: {
    aiSidekickEnabled?: boolean;
    challengeLeaderboardEnabled?: boolean;
    sroiCostPerVolunteer?: number | null;
    sroiCostRecruitment?: number | null;
    sroiCostOnboarding?: number | null;
    sroiCostSupport?: number | null;
    sroiCostAdmin?: number | null;
    summaryYearStart?: string;
    allowedDomain?: string | null;
  } = {};
  if (typeof aiSidekickEnabled === "boolean") {
    updates.aiSidekickEnabled = aiSidekickEnabled;
  }
  if (typeof challengeLeaderboardEnabled === "boolean") {
    updates.challengeLeaderboardEnabled = challengeLeaderboardEnabled;
  }

  if ("summaryYearStart" in body) {
    const { isValidSummaryYearStart } = await import("../lib/summaryPeriod.js");
    if (!isValidSummaryYearStart(summaryYearStart)) {
      res.status(400).json({ error: "summaryYearStart must be a valid MM-DD string (e.g. '01-01', '09-01', '04-01')." });
      return;
    }
    updates.summaryYearStart = summaryYearStart;
  }

  if ("allowedDomain" in body) {
    if (allowedDomain === null || allowedDomain === "" || allowedDomain === undefined) {
      updates.allowedDomain = null;
    } else if (typeof allowedDomain === "string") {
      const cleaned = allowedDomain.trim().toLowerCase().replace(/^@/, "");
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned)) {
        res.status(400).json({ error: "allowedDomain must be a valid domain (e.g. organisation.org) without the @ symbol." });
        return;
      }
      updates.allowedDomain = cleaned;
    } else {
      res.status(400).json({ error: "allowedDomain must be a domain string or null." });
      return;
    }
  }

  // Validate a single sub-amount: must be null or an integer between 0 and 1,000,000.
  function validateSubAmount(name: string, v: unknown): number | null | "invalid" {
    if (v === null) return null;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000) return v;
    void name;
    return "invalid";
  }

  // The breakdown takes precedence over a bare sroiCostPerVolunteer: when
  // present we store each sub-amount and derive the total. When the
  // breakdown is provided as `null`, all four sub-columns are cleared.
  if ("sroiCostBreakdown" in body) {
    if (sroiCostBreakdown === null) {
      updates.sroiCostRecruitment = null;
      updates.sroiCostOnboarding = null;
      updates.sroiCostSupport = null;
      updates.sroiCostAdmin = null;
      // Caller may still pass sroiCostPerVolunteer alongside; otherwise clear
      // the total so the dashboard falls back to the default.
      if (!("sroiCostPerVolunteer" in body)) updates.sroiCostPerVolunteer = null;
    } else if (
      typeof sroiCostBreakdown === "object" &&
      !Array.isArray(sroiCostBreakdown)
    ) {
      const b = sroiCostBreakdown as Record<string, unknown>;
      const fields: Array<["recruitment" | "onboarding" | "support" | "admin", "sroiCostRecruitment" | "sroiCostOnboarding" | "sroiCostSupport" | "sroiCostAdmin"]> = [
        ["recruitment", "sroiCostRecruitment"],
        ["onboarding", "sroiCostOnboarding"],
        ["support", "sroiCostSupport"],
        ["admin", "sroiCostAdmin"],
      ];
      const parsed: Record<string, number | null> = {};
      for (const [bodyKey, colKey] of fields) {
        if (!(bodyKey in b)) {
          // Treat omitted sub-amounts as null so saving partial breakdowns is possible.
          (updates as Record<string, number | null>)[colKey] = null;
          parsed[bodyKey] = null;
          continue;
        }
        const v = validateSubAmount(bodyKey, b[bodyKey]);
        if (v === "invalid") {
          res.status(400).json({ error: `sroiCostBreakdown.${bodyKey} must be a whole number between 0 and 1,000,000, or null.` });
          return;
        }
        (updates as Record<string, number | null>)[colKey] = v;
        parsed[bodyKey] = v;
      }
      // Derive the total from non-null sub-amounts. If everything is null,
      // also clear sroiCostPerVolunteer so the dashboard falls back to the
      // application default.
      const subs = Object.values(parsed).filter((v): v is number => typeof v === "number");
      if (subs.length === 0) {
        if (!("sroiCostPerVolunteer" in body)) updates.sroiCostPerVolunteer = null;
      } else {
        const total = subs.reduce((acc, n) => acc + n, 0);
        // Keep the derived total within the same upper bound enforced for the
        // single-figure path so dashboard formatting and downstream consumers
        // never see absurd values.
        if (total > 1_000_000) {
          res.status(400).json({ error: "Sum of sroiCostBreakdown sub-amounts must not exceed 1,000,000." });
          return;
        }
        updates.sroiCostPerVolunteer = total;
      }
    } else {
      res.status(400).json({ error: "sroiCostBreakdown must be an object or null." });
      return;
    }
  }

  if ("sroiCostPerVolunteer" in body) {
    if (sroiCostPerVolunteer === null) {
      updates.sroiCostPerVolunteer = null;
      // Clearing the headline figure also clears any stored breakdown so the
      // two never get out of sync.
      if (!("sroiCostBreakdown" in body)) {
        updates.sroiCostRecruitment = null;
        updates.sroiCostOnboarding = null;
        updates.sroiCostSupport = null;
        updates.sroiCostAdmin = null;
      }
    } else if (
      typeof sroiCostPerVolunteer === "number" &&
      Number.isInteger(sroiCostPerVolunteer) &&
      sroiCostPerVolunteer >= 0 &&
      sroiCostPerVolunteer <= 1_000_000
    ) {
      // Only honour a bare per-volunteer figure when the caller did NOT also
      // provide a breakdown (the breakdown is the source of truth in that case).
      if (!("sroiCostBreakdown" in body)) {
        updates.sroiCostPerVolunteer = sroiCostPerVolunteer;
        updates.sroiCostRecruitment = null;
        updates.sroiCostOnboarding = null;
        updates.sroiCostSupport = null;
        updates.sroiCostAdmin = null;
      }
    } else {
      res.status(400).json({ error: "sroiCostPerVolunteer must be a whole number between 0 and 1,000,000, or null to reset." });
      return;
    }
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid settings provided." });
    return;
  }

  const [updated] = await db
    .update(organisationsTable)
    .set(updates)
    .where(eq(organisationsTable.id, membership.orgId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Organisation not found." });
    return;
  }

  res.json({
    org: {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      role: membership.role,
      aiSidekickEnabled: updated.aiSidekickEnabled,
      challengeLeaderboardEnabled: updated.challengeLeaderboardEnabled,
      sroiCostPerVolunteer: updated.sroiCostPerVolunteer ?? null,
      sroiCostBreakdown: {
        recruitment: updated.sroiCostRecruitment ?? null,
        onboarding: updated.sroiCostOnboarding ?? null,
        support: updated.sroiCostSupport ?? null,
        admin: updated.sroiCostAdmin ?? null,
      },
      summaryYearStart: updated.summaryYearStart ?? "01-01",
      allowedDomain: updated.allowedDomain ?? null,
    },
  });
});

router.get("/my-join-link", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });

  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return;
  }

  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can access the join link." });
    return;
  }

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });

  if (!org) {
    res.status(404).json({ error: "Organisation not found." });
    return;
  }

  res.json({ orgId: org.id, inviteCode: org.inviteCode, orgName: org.name });
});

interface StoredActivityBreakdownOrg {
  category: string;
  impactValue: number;
}

interface StoredSdgBreakdownOrg {
  sdg: string;
  sdgColor: string;
  value: number;
}

interface StoredResultJsonOrg {
  totalValue: number;
  totalHours: number;
  activityBreakdowns: StoredActivityBreakdownOrg[];
  sdgBreakdowns: StoredSdgBreakdownOrg[];
}

function parseResultJsonOrg(raw: unknown): StoredResultJsonOrg {
  if (raw === null || typeof raw !== "object") return { totalValue: 0, totalHours: 0, activityBreakdowns: [], sdgBreakdowns: [] };
  const r = raw as Record<string, unknown>;
  return {
    totalValue: typeof r.totalValue === "number" ? r.totalValue : 0,
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    activityBreakdowns: Array.isArray(r.activityBreakdowns)
      ? (r.activityBreakdowns as StoredActivityBreakdownOrg[]).filter(
          b => typeof b.category === "string" && typeof b.impactValue === "number"
        )
      : [],
    sdgBreakdowns: Array.isArray(r.sdgBreakdowns)
      ? (r.sdgBreakdowns as StoredSdgBreakdownOrg[]).filter(
          b => typeof b.sdg === "string" && typeof b.value === "number"
        )
      : [],
  };
}

function endOfDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

router.get("/report-pdf", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });

    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can download the report." });
      return;
    }

    const org = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, membership.orgId),
    });

    if (!org) {
      res.status(404).json({ error: "Organisation not found." });
      return;
    }

    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    if (fromRaw && isNaN(fromRaw.getTime())) {
      res.status(400).json({ error: "Invalid 'from' date" });
      return;
    }
    if (toRaw && isNaN(toRaw.getTime())) {
      res.status(400).json({ error: "Invalid 'to' date" });
      return;
    }
    const from = fromRaw;
    const to = toRaw ? endOfDay(toRaw) : undefined;

    if (org.revokedAt) {
      res.status(403).json({ error: REVOKED_ORG_MESSAGE });
      return;
    }

    const members = await db.query.orgMembersTable.findMany({
      where: and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.status, "active")),
    });

    const memberIds = members.map(m => m.userId);

    const sharingCtx = await getOrgSharingContext(org.id);
    const sharedCondition = sharedRecordsCondition(sharingCtx);

    let records: typeof impactRecordsTable.$inferSelect[] = [];
    if (sharedCondition) {
      const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
      const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
      records = await db.select().from(impactRecordsTable).where(and(sharedCondition, fromCondition, toCondition));
    }

    let totalSocialValue = 0;
    let totalHours = 0;
    const categoryValueMap: Record<string, number> = {};
    const sdgValueMap: Record<string, { sdg: string; sdgColor: string; value: number }> = {};

    for (const r of records) {
      const result = parseResultJsonOrg(r.resultJson);
      totalSocialValue += result.totalValue;
      totalHours += result.totalHours;
      for (const breakdown of result.activityBreakdowns) {
        categoryValueMap[breakdown.category] = (categoryValueMap[breakdown.category] ?? 0) + breakdown.impactValue;
      }
      for (const s of result.sdgBreakdowns) {
        if (!sdgValueMap[s.sdg]) {
          sdgValueMap[s.sdg] = { sdg: s.sdg, sdgColor: s.sdgColor || "#4C9F38", value: 0 };
        }
        sdgValueMap[s.sdg].value += s.value;
      }
    }

    const totalUsers = new Set(records.map(r => r.userId)).size;
    const valueByCategory = Object.entries(categoryValueMap)
      .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    const sdgBreakdowns = Object.values(sdgValueMap)
      .map(s => ({ ...s, value: Math.round(s.value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    let periodLabel = "All time";
    if (from && to) {
      periodLabel = `${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (from) {
      periodLabel = `From ${from.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (to) {
      periodLabel = `Up to ${to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }

    const verifiedTotals = await getVerifiedTotalsForOrg(org.id, from, to);

    let logoDataUrl: string | null = null;
    if (org.logoKey) {
      try {
        const obj = await readObjectBuffer(org.logoKey);
        if (obj) {
          logoDataUrl = `data:${obj.contentType};base64,${obj.buffer.toString("base64")}`;
        }
      } catch (err) {
        console.warn("Failed to load org logo for PDF:", err);
      }
    }

    const doc = buildOrgDocument({
      orgName: org.name,
      orgType: org.type,
      period: periodLabel,
      totalSocialValue: Math.round(totalSocialValue * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      verifiedHours: verifiedTotals.verifiedHours,
      verifiedSocialValue: verifiedTotals.verifiedSocialValue,
      verifiedRecordCount: verifiedTotals.verifiedRecordCount,
      totalMemberCount: memberIds.length,
      totalUsers,
      averageValuePerPerson: totalUsers > 0 ? Math.round((totalSocialValue / totalUsers) * 100) / 100 : 0,
      valueByCategory,
      sdgBreakdowns,
      sroiCostPerVolunteer: org.sroiCostPerVolunteer ?? null,
      sroiCostBreakdown: {
        recruitment: org.sroiCostRecruitment ?? null,
        onboarding: org.sroiCostOnboarding ?? null,
        support: org.sroiCostSupport ?? null,
        admin: org.sroiCostAdmin ?? null,
      },
      branding: {
        logoDataUrl,
        brandPrimary: org.brandPrimary ?? null,
        brandAccent: org.brandAccent ?? null,
      },
    });

    const buffer = await renderToBuffer(doc);

    const safeName = org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-impact-report.pdf"`);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (err) {
    console.error("Org PDF generation error:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/stats/monthly", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can access analytics." });
      return;
    }

    const sharingCtx = await getOrgSharingContext(membership.orgId);
    if (sharingCtx.revoked) {
      res.status(403).json({ error: REVOKED_ORG_MESSAGE });
      return;
    }
    const sharedCondition = sharedRecordsCondition(sharingCtx);

    if (!sharedCondition) {
      res.json({ monthly: [] });
      return;
    }

    // Resolve period bounds: prefer explicit from/to, otherwise use
    // the org's saved summaryYearStart + periodOffset query param.
    let from: Date;
    let to: Date;
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    if (fromRaw && !isNaN(fromRaw.getTime()) && toRaw && !isNaN(toRaw.getTime())) {
      from = fromRaw;
      to = toRaw;
    } else {
      const periodOffsetParam = req.query.periodOffset;
      const periodOffset = typeof periodOffsetParam === "string" ? parseInt(periodOffsetParam, 10) : 0;
      const org = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.id, membership.orgId),
        columns: { summaryYearStart: true },
      });
      const bounds = getPeriodBounds(org?.summaryYearStart ?? "01-01", isNaN(periodOffset) ? 0 : periodOffset);
      from = bounds.start;
      to = bounds.end;
    }

    const fromCondition = gte(impactRecordsTable.entryDate, from);
    const toCondition = lt(impactRecordsTable.entryDate, to);

    const records = await db.select({
      entryDate: impactRecordsTable.entryDate,
      resultJson: impactRecordsTable.resultJson,
    }).from(impactRecordsTable).where(and(sharedCondition, fromCondition, toCondition));

    const monthMap: Record<string, number> = {};
    for (const r of records) {
      const date = new Date(r.entryDate);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const result = parseResultJsonOrg(r.resultJson);
      monthMap[key] = (monthMap[key] ?? 0) + result.totalValue;
    }

    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const periodFrom = from;
    // `to` is exclusive (start of next period). Subtract 1 ms so the
    // label range lands on the last day of the actual period.
    const periodToInclusive = new Date(to.getTime() - 1);

    const startYear = periodFrom.getUTCFullYear();
    const startMonth = periodFrom.getUTCMonth();
    const endYear = periodToInclusive.getUTCFullYear();
    const endMonth = periodToInclusive.getUTCMonth();

    const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    const multiYear = startYear !== endYear || totalMonths > 12;

    const monthly: Array<{ month: string; value: number }> = [];
    let runningTotal = 0;
    for (let y = startYear; y <= endYear; y++) {
      const mStart = y === startYear ? startMonth : 0;
      const mEnd = y === endYear ? endMonth : 11;
      for (let m = mStart; m <= mEnd; m++) {
        const key = `${y}-${String(m + 1).padStart(2, "0")}`;
        runningTotal += monthMap[key] ?? 0;
        const label = multiYear ? `${MONTH_SHORT[m]} '${String(y).slice(2)}` : MONTH_SHORT[m]!;
        monthly.push({
          month: label,
          value: Math.round(runningTotal * 100) / 100,
        });
      }
    }

    res.json({ monthly });
  } catch (err) {
    console.error("Org monthly stats error:", err);
    res.status(500).json({ error: "Failed to load monthly data" });
  }
});

// ── Share-link management (manager-only) ──────────────────────────────────────

const VALID_SHARE_SCOPES = new Set(["all", "summary", "timeline", "categories", "regions"]);

const shareLinkCreateRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many share-link requests. Please slow down.",
});

function generateShareSlug(): string {
  // 12 hex chars (~48 bits) is plenty against guessing while staying short.
  return randomBytes(6).toString("hex");
}

async function requireManager(userId: string) {
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) return { error: { status: 404, message: "You are not a member of any organisation." } as const };
  if (membership.role !== "manager") return { error: { status: 403, message: "Only organisation managers can manage share links." } as const };
  return { membership };
}

router.get("/share-links", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const links = await db
    .select()
    .from(orgShareLinksTable)
    .where(eq(orgShareLinksTable.orgId, result.membership.orgId))
    .orderBy(desc(orgShareLinksTable.createdAt));

  res.json({
    links: links.map(l => ({
      id: l.id,
      slug: l.slug,
      scope: l.scope,
      funderLabel: l.funderLabel,
      expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
      revokedAt: l.revokedAt ? l.revokedAt.toISOString() : null,
      viewCount: l.viewCount,
      createdAt: l.createdAt.toISOString(),
    })),
  });
});

router.post("/share-links", authenticate, shareLinkCreateRateLimit, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeInput = typeof body.scope === "string" ? body.scope : "all";
  if (!VALID_SHARE_SCOPES.has(scopeInput)) {
    res.status(400).json({ error: "Invalid scope. Must be one of: all, summary, timeline, categories, regions." });
    return;
  }

  let funderLabel: string | null = null;
  if (typeof body.funderLabel === "string") {
    const trimmed = body.funderLabel.trim().slice(0, 80);
    if (trimmed.length > 0) funderLabel = trimmed;
  }

  let expiresAt: Date | null = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "") {
    if (typeof body.expiresAt !== "string") {
      res.status(400).json({ error: "Invalid expiresAt." });
      return;
    }
    const parsed = new Date(body.expiresAt);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid expiresAt date." });
      return;
    }
    // Treat date-only inputs (YYYY-MM-DD) as end-of-day so a "valid until X" link includes that day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt)) {
      parsed.setHours(23, 59, 59, 999);
    }
    if (parsed.getTime() <= Date.now()) {
      res.status(400).json({ error: "Expiry date must be in the future." });
      return;
    }
    expiresAt = parsed;
  }

  // Enforce the per-tier share-link cap (only enforced once PRICING_ENABLED
  // is on — see featureCap). Counts only links that are still usable.
  const cap = await featureCap(result.membership.orgId, "shareLinkCap");
  if (cap !== null) {
    const existingLinks = await db.select().from(orgShareLinksTable).where(eq(orgShareLinksTable.orgId, result.membership.orgId));
    const activeCount = existingLinks.filter(l => !l.revokedAt && (!l.expiresAt || l.expiresAt.getTime() > Date.now())).length;
    if (activeCount >= cap) {
      res.status(402).json({ error: `You've reached your plan's limit of ${cap} active share link${cap === 1 ? "" : "s"}. Upgrade or revoke an existing link to create a new one.` });
      return;
    }
  }

  // Generate a unique slug (collisions are vanishingly rare but loop a few times).
  let slug = generateShareSlug();
  for (let i = 0; i < 5; i++) {
    const existing = await db.query.orgShareLinksTable.findFirst({
      where: eq(orgShareLinksTable.slug, slug),
    });
    if (!existing) break;
    slug = generateShareSlug();
  }

  const [created] = await db.insert(orgShareLinksTable).values({
    id: randomUUID(),
    slug,
    orgId: result.membership.orgId,
    createdByUserId: userId,
    scope: scopeInput,
    funderLabel,
    expiresAt,
  }).returning();

  res.json({
    link: {
      id: created.id,
      slug: created.slug,
      scope: created.scope,
      funderLabel: created.funderLabel,
      expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
      revokedAt: created.revokedAt ? created.revokedAt.toISOString() : null,
      viewCount: created.viewCount,
      createdAt: created.createdAt.toISOString(),
    },
  });
});

router.post("/share-links/:id/revoke", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const result = await requireManager(userId);
  if ("error" in result) {
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  const id = req.params.id;
  const link = await db.query.orgShareLinksTable.findFirst({
    where: eq(orgShareLinksTable.id, id),
  });
  if (!link || link.orgId !== result.membership.orgId) {
    res.status(404).json({ error: "Share link not found." });
    return;
  }

  if (link.revokedAt) {
    res.json({ ok: true, alreadyRevoked: true });
    return;
  }

  await db.update(orgShareLinksTable)
    .set({ revokedAt: new Date() })
    .where(eq(orgShareLinksTable.id, id));

  res.json({ ok: true });
});

router.get("/stats/regions", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.status(404).json({ error: "You are not a member of any organisation." });
      return;
    }

    if (membership.role !== "manager") {
      res.status(403).json({ error: "Only organisation managers can access analytics." });
      return;
    }

    const sharingCtx = await getOrgSharingContext(membership.orgId);
    if (sharingCtx.revoked) {
      res.status(403).json({ error: REVOKED_ORG_MESSAGE });
      return;
    }
    if (!sharingCtx.sections.locationMap) {
      res.status(403).json({ error: "The location map is disabled for this organisation." });
      return;
    }
    const sharedCondition = sharedRecordsCondition(sharingCtx);

    if (!sharedCondition) {
      res.json({ regions: [] });
      return;
    }

    // Resolve period bounds: prefer explicit from/to, otherwise use
    // the org's saved summaryYearStart + periodOffset query param.
    let from: Date | undefined;
    let to: Date | undefined;
    const fromParam = req.query.from;
    const toParam = req.query.to;
    const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
    const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
    if (fromRaw && !isNaN(fromRaw.getTime()) && toRaw && !isNaN(toRaw.getTime())) {
      from = fromRaw;
      to = toRaw;
    } else {
      const periodOffsetParam = req.query.periodOffset;
      const periodOffset = typeof periodOffsetParam === "string" ? parseInt(periodOffsetParam, 10) : 0;
      const org = await db.query.organisationsTable.findFirst({
        where: eq(organisationsTable.id, membership.orgId),
        columns: { summaryYearStart: true },
      });
      const bounds = getPeriodBounds(org?.summaryYearStart ?? "01-01", isNaN(periodOffset) ? 0 : periodOffset);
      from = bounds.start;
      to = bounds.end;
    }

    const fromCondition = from ? gte(impactRecordsTable.entryDate, from) : undefined;
    const toCondition = to ? lt(impactRecordsTable.entryDate, to) : undefined;

    const records = await db.select({
      userId: impactRecordsTable.userId,
      region: impactRecordsTable.region,
      resultJson: impactRecordsTable.resultJson,
    }).from(impactRecordsTable).where(and(sharedCondition, fromCondition, toCondition));

    const regionMap: Record<string, { userIds: Set<string>; hours: number; value: number }> = {};
    for (const r of records) {
      const regionName = r.region ?? "Other";
      if (!regionMap[regionName]) regionMap[regionName] = { userIds: new Set(), hours: 0, value: 0 };
      regionMap[regionName].userIds.add(r.userId);
      const result = parseResultJsonOrg(r.resultJson);
      regionMap[regionName].hours += result.totalHours;
      regionMap[regionName].value += result.totalValue;
    }

    const ORG_COST_PER_VOLUNTEER = 475;
    const totalMembers = Object.values(regionMap).reduce((sum, r) => sum + r.userIds.size, 0) || 1;
    const regions = Object.entries(regionMap)
      .map(([region, data]) => {
        const investment = data.userIds.size * ORG_COST_PER_VOLUNTEER;
        const sroi = investment > 0 ? Math.round((data.value / investment) * 100) / 100 : null;
        return {
          region,
          members: data.userIds.size,
          hours: Math.round(data.hours),
          value: Math.round(data.value * 100) / 100,
          sroi,
          pct: Math.round((data.userIds.size / totalMembers) * 100),
        };
      })
      .sort((a, b) => b.members - a.members);

    res.json({ regions });
  } catch (err) {
    console.error("Org regions stats error:", err);
    res.status(500).json({ error: "Failed to load region data" });
  }
});

// ---------------------------------------------------------------------------
// Members management endpoints (manager-only)
// ---------------------------------------------------------------------------

router.get("/my/members", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  if (membership.role !== "manager") { res.status(403).json({ error: "Only organisation managers can view the member list." }); return; }

  const pageSizeParam = typeof req.query.pageSize === "string" ? parseInt(req.query.pageSize, 10) : 20;
  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam >= 1 && pageSizeParam <= 100 ? pageSizeParam : 20;
  const pageParam = typeof req.query.page === "string" ? parseInt(req.query.page, 10) : 1;
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const offset = (page - 1) * pageSize;

  const statusFilter = req.query.status === "pending" ? "pending" : req.query.status === "all" ? null : "active";

  const whereCondition = statusFilter !== null
    ? and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.status, statusFilter))
    : eq(orgMembersTable.orgId, membership.orgId);

  const [totalResult, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(orgMembersTable).where(whereCondition),
    db.select({
      orgId: orgMembersTable.orgId,
      userId: orgMembersTable.userId,
      role: orgMembersTable.role,
      status: orgMembersTable.status,
      joinedAt: orgMembersTable.joinedAt,
    }).from(orgMembersTable)
      .where(whereCondition)
      .orderBy(asc(orgMembersTable.joinedAt))
      .limit(pageSize)
      .offset(offset),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const memberUserIds = rows.map(r => r.userId);

  const [userRows, profileRows] = memberUserIds.length > 0 ? await Promise.all([
    db.select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
      .from(usersTable).where(inArray(usersTable.id, memberUserIds)),
    db.select({ userId: userProfilesTable.userId, postcode: userProfilesTable.postcode })
      .from(userProfilesTable).where(inArray(userProfilesTable.userId, memberUserIds)),
  ]) : [[], []];

  const userMap = new Map(userRows.map(u => [u.id, u]));
  const profileMap = new Map(profileRows.map(p => [p.userId, p]));

  const members = rows.map(r => {
    const u = userMap.get(r.userId);
    const p = profileMap.get(r.userId);
    return {
      userId: r.userId,
      name: u?.displayName ?? u?.email ?? r.userId,
      email: u?.email ?? "",
      role: r.role,
      status: r.status,
      joinedAt: r.joinedAt.toISOString(),
      postcode: p?.postcode ?? null,
    };
  });

  res.json({ members, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

router.post("/my/members/:userId/approve", authenticate, async (req: AuthenticatedRequest, res) => {
  const actorId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, actorId), eq(orgMembersTable.status, "active")),
  });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  if (membership.role !== "manager") { res.status(403).json({ error: "Only organisation managers can approve requests." }); return; }

  const userId = String(req.params.userId);
  const target = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.userId, userId)),
  });
  if (!target) { res.status(404).json({ error: "Member request not found." }); return; }
  if (target.status !== "pending") { res.json({ ok: true, alreadyActive: true }); return; }

  await db.update(orgMembersTable)
    .set({ status: "active" })
    .where(and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.userId, userId)));

  const targetUser = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  enqueueOrgEvent({
    orgId: membership.orgId,
    eventType: "member.joined",
    payload: {
      member: { ref: userId, email: targetUser?.email ?? "" },
      role: target.role,
      joinedAt: new Date().toISOString(),
    },
  }).catch(err => console.error("[org.approve] failed to enqueue member.joined:", err));

  if (targetUser?.email) {
    (async () => {
      try {
        const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, membership.orgId) });
        const orgName = org?.name ?? "your organisation";
        const { client, fromEmail } = await getUncachableResendClient();
        const appUrl = process.env.APP_URL ?? "https://myimpact.uk";
        const { error } = await client.emails.send({
          from: fromEmail,
          to: targetUser.email,
          subject: `You're in! Your request to join ${orgName} was approved`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
              <h2 style="color:#213547;margin-top:0;">Welcome to ${escHtml(orgName)}</h2>
              <p style="color:#444;font-size:15px;line-height:1.5;">
                Good news — a manager at <strong>${escHtml(orgName)}</strong> has approved your request to join.
                You now have full access as a member of the organisation.
              </p>
              <div style="margin-top:24px;">
                <a href="${appUrl}/dashboard" style="display:inline-block;background:#E8633A;color:white;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">Go to My Impact</a>
              </div>
              <p style="color:#aaa;font-size:11px;margin-top:32px;">My Impact · myimpact.uk</p>
            </div>
          `,
        });
        if (error) console.error("[org.approve] Resend rejected approval email:", error);
      } catch (err) {
        console.error("[org.approve] failed to send approval email:", err);
      }
    })();
  }

  res.json({ ok: true });
});

router.post("/my/members/:userId/reject", authenticate, async (req: AuthenticatedRequest, res) => {
  const actorId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.userId, actorId), eq(orgMembersTable.status, "active")),
  });
  if (!membership) { res.status(404).json({ error: "You are not a member of any organisation." }); return; }
  if (membership.role !== "manager") { res.status(403).json({ error: "Only organisation managers can reject requests." }); return; }

  const userId = String(req.params.userId);
  const target = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.userId, userId)),
  });
  if (!target) { res.status(404).json({ error: "Member request not found." }); return; }
  if (target.status !== "pending") {
    res.status(409).json({ error: "Only pending join requests can be rejected." }); return;
  }

  await db.delete(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, membership.orgId), eq(orgMembersTable.userId, userId), eq(orgMembersTable.status, "pending")));

  (async () => {
    try {
      const [targetUser, org] = await Promise.all([
        db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
        db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, membership.orgId) }),
      ]);
      if (!targetUser?.email) return;
      const orgName = org?.name ?? "the organisation";
      const { client, fromEmail } = await getUncachableResendClient();
      const { error } = await client.emails.send({
        from: fromEmail,
        to: targetUser.email,
        subject: `Update on your request to join ${orgName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#f9f9f9;border-radius:8px;">
            <h2 style="color:#213547;margin-top:0;">About your join request</h2>
            <p style="color:#444;font-size:15px;line-height:1.5;">
              Thanks for your interest in joining <strong>${escHtml(orgName)}</strong>.
              Unfortunately, a manager has reviewed your request and it wasn't approved this time.
            </p>
            <p style="color:#444;font-size:15px;line-height:1.5;">
              If you think this was a mistake, please get in touch with the organisation directly —
              they may be able to send you a fresh invite. You can still use My Impact to track your
              volunteering and giving on your own.
            </p>
            <p style="color:#aaa;font-size:11px;margin-top:32px;">My Impact · myimpact.uk</p>
          </div>
        `,
      });
      if (error) console.error("[org.reject] Resend rejected decline email:", error);
    } catch (err) {
      console.error("[org.reject] failed to send decline email:", err);
    }
  })();

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Manager-only helper — used by both the Match programme and Enterprise SSO
// admin endpoints below. Returns the full membership row so callers can read
// `.orgId`, `.role`, etc.
// ---------------------------------------------------------------------------

async function requireOrgManager(req: AuthenticatedRequest, res: import("express").Response) {
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

function parseOptionalNonNegativeNumber(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${label} must be a non-negative number.` };
  return { ok: true, value: n };
}

function parseDate(value: unknown, label: string): { ok: true; value: Date } | { ok: false; error: string } {
  if (typeof value !== "string" || !value) return { ok: false, error: `${label} is required.` };
  const d = new Date(value);
  if (isNaN(d.getTime())) return { ok: false, error: `${label} is not a valid date.` };
  return { ok: true, value: d };
}

router.get("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, membership.orgId),
    orderBy: (t, { desc }) => [desc(t.effectiveFrom)],
  });

  res.json({
    rates: rates.map(r => ({
      id: r.id,
      hourlyRate: r.hourlyRate !== null ? Number(r.hourlyRate) : null,
      donationMultiplier: r.donationMultiplier !== null ? Number(r.donationMultiplier) : null,
      monthlyCapPerMember: r.monthlyCapPerMember !== null ? Number(r.monthlyCapPerMember) : null,
      onlyVerifiedHours: r.onlyVerifiedHours,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

router.post("/match/rates", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const userId = req.user!.id;

  const hourlyResult = parseOptionalNonNegativeNumber(req.body?.hourlyRate, "Hourly rate");
  if (!hourlyResult.ok) { res.status(400).json({ error: hourlyResult.error }); return; }

  const donationResult = parseOptionalNonNegativeNumber(req.body?.donationMultiplier, "Donation multiplier");
  if (!donationResult.ok) { res.status(400).json({ error: donationResult.error }); return; }

  const capResult = parseOptionalNonNegativeNumber(req.body?.monthlyCapPerMember, "Monthly cap");
  if (!capResult.ok) { res.status(400).json({ error: capResult.error }); return; }

  if (hourlyResult.value === null && donationResult.value === null) {
    res.status(400).json({ error: "Set at least one of: hourly rate or donation multiplier." });
    return;
  }

  const fromResult = parseDate(req.body?.effectiveFrom, "Effective from");
  if (!fromResult.ok) { res.status(400).json({ error: fromResult.error }); return; }

  const onlyVerified = req.body?.onlyVerifiedHours === true;

  // End-date the previous active rate at this new rate's effective_from (if any overlap).
  const previousActive = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (previousActive) {
    const newFrom = fromResult.value;
    if (newFrom <= previousActive.effectiveFrom) {
      res.status(400).json({ error: "New rate must start after the previous active rate's start date." });
      return;
    }
    await db.update(orgMatchRatesTable)
      .set({ effectiveTo: newFrom })
      .where(eq(orgMatchRatesTable.id, previousActive.id));
  }

  const id = randomUUID();
  await db.insert(orgMatchRatesTable).values({
    id,
    orgId: membership.orgId,
    hourlyRate: hourlyResult.value !== null ? String(hourlyResult.value) : null,
    donationMultiplier: donationResult.value !== null ? String(donationResult.value) : null,
    monthlyCapPerMember: capResult.value !== null ? String(capResult.value) : null,
    onlyVerifiedHours: onlyVerified,
    effectiveFrom: fromResult.value,
    effectiveTo: null,
    createdBy: userId,
  });

  res.json({ ok: true, id });
});

router.post("/match/rates/end", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const endDate = req.body?.effectiveTo ? parseDate(req.body.effectiveTo, "End date") : { ok: true as const, value: new Date() };
  if (!endDate.ok) { res.status(400).json({ error: endDate.error }); return; }

  const active = await db.query.orgMatchRatesTable.findFirst({
    where: and(eq(orgMatchRatesTable.orgId, membership.orgId), isNull(orgMatchRatesTable.effectiveTo)),
  });
  if (!active) {
    res.status(404).json({ error: "No active match rate to end." });
    return;
  }
  if (endDate.value <= active.effectiveFrom) {
    res.status(400).json({ error: "End date must be after the rate's start date." });
    return;
  }

  await db.update(orgMatchRatesTable)
    .set({ effectiveTo: endDate.value })
    .where(eq(orgMatchRatesTable.id, active.id));

  res.json({ ok: true });
});

interface ResultJsonForMatch {
  totalHours: number;
  donationsValue: number;
}

function parseRecordForMatch(raw: unknown): ResultJsonForMatch {
  if (raw === null || typeof raw !== "object") return { totalHours: 0, donationsValue: 0 };
  const r = raw as Record<string, unknown>;
  return {
    totalHours: typeof r.totalHours === "number" ? r.totalHours : 0,
    donationsValue: typeof r.donationsValue === "number" ? r.donationsValue : 0,
  };
}

async function loadOrgMatchSet(orgId: string, from?: Date, to?: Date) {
  const members = await db.query.orgMembersTable.findMany({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.status, "active")),
  });
  const memberIds = members.map(m => m.userId);

  const rates = await db.query.orgMatchRatesTable.findMany({
    where: eq(orgMatchRatesTable.orgId, orgId),
    orderBy: (t) => [asc(t.effectiveFrom)],
  });

  let records: typeof impactRecordsTable.$inferSelect[] = [];
  if (memberIds.length > 0) {
    const baseCondition = inArray(impactRecordsTable.userId, memberIds);
    const fromCondition = from ? gte(impactRecordsTable.createdAt, from) : undefined;
    const toCondition = to ? lte(impactRecordsTable.createdAt, to) : undefined;
    records = await db.select().from(impactRecordsTable).where(and(baseCondition, fromCondition, toCondition));
  }

  const recordsForMatch: RecordForMatch[] = records.map(r => {
    const parsed = parseRecordForMatch(r.resultJson);
    return {
      id: r.id,
      userId: r.userId,
      createdAt: r.createdAt,
      totalHours: parsed.totalHours,
      donationsValue: parsed.donationsValue,
    };
  });

  const matches = computeMatchesForRecords(recordsForMatch, rates);
  return { records, recordsForMatch, matches, memberIds };
}

router.get("/match/summary", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch } = await loadOrgMatchSet(membership.orgId, from, to);

  const totalCommitment = matches.reduce((s, m) => s + m.matchedValue, 0);
  const totalHoursMatched = matches.reduce((s, m) => s + m.hoursMatched, 0);
  const totalDonationsMatched = matches.reduce((s, m) => s + m.donationsMatched, 0);
  const matchedRecordsCount = matches.filter(m => m.matchedValue > 0).length;
  const matchedMembersCount = new Set(
    matches.filter(m => m.matchedValue > 0).map(m => m.userId),
  ).size;

  // Monthly series (capped totals per month)
  const monthly: Record<string, number> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const key = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthly[key] = (monthly[key] ?? 0) + m.matchedValue;
  }

  res.json({
    totalCommitment: Math.round(totalCommitment * 100) / 100,
    totalHoursMatched: Math.round(totalHoursMatched * 100) / 100,
    totalDonationsMatched: Math.round(totalDonationsMatched * 100) / 100,
    matchedRecordsCount,
    matchedMembersCount,
    monthly: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value: Math.round(value * 100) / 100 })),
  });
});

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/match/csv", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const fromParam = req.query.from;
  const toParam = req.query.to;
  const fromRaw = typeof fromParam === "string" && fromParam ? new Date(fromParam) : undefined;
  const toRaw = typeof toParam === "string" && toParam ? new Date(toParam) : undefined;
  const from = fromRaw && !isNaN(fromRaw.getTime()) ? fromRaw : undefined;
  const to = toRaw && !isNaN(toRaw.getTime()) ? endOfDay(toRaw) : undefined;

  const { matches, recordsForMatch, memberIds } = await loadOrgMatchSet(membership.orgId, from, to);

  // Group by member-month
  type Bucket = { userId: string; month: string; hours: number; donations: number; matched: number; logged: number };
  const buckets: Record<string, Bucket> = {};
  for (const m of matches) {
    const rec = recordsForMatch.find(r => String(r.id) === m.recordId);
    if (!rec) continue;
    const month = `${rec.createdAt.getFullYear()}-${String(rec.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const key = `${rec.userId}::${month}`;
    if (!buckets[key]) buckets[key] = { userId: rec.userId, month, hours: 0, donations: 0, matched: 0, logged: 0 };
    buckets[key].hours += rec.totalHours;
    buckets[key].donations += rec.donationsValue;
    buckets[key].matched += m.matchedValue;
  }

  // Get member emails for the CSV (anonymised: we use a member index instead of email, to preserve member privacy)
  const memberOrder = new Map<string, number>();
  memberIds.forEach((id, idx) => memberOrder.set(id, idx + 1));

  const rows = [
    ["Member #", "Month", "Hours logged", "Donations logged (£)", "Matched amount (£)"],
    ...Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month) || (memberOrder.get(a.userId) ?? 0) - (memberOrder.get(b.userId) ?? 0))
      .map(b => [
        String(memberOrder.get(b.userId) ?? "?"),
        b.month,
        (Math.round(b.hours * 100) / 100).toFixed(2),
        (Math.round(b.donations * 100) / 100).toFixed(2),
        (Math.round(b.matched * 100) / 100).toFixed(2),
      ]),
  ];

  const csv = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");

  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, membership.orgId),
  });
  const safeName = (org?.name ?? "org").replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}-match-export.csv"`);
  res.send(csv);
});

// ────────────────────────────────────────────────────────────────────
// Enterprise SSO admin endpoints (manager-only)
//
// Each org may configure at most one SSO provider per domain. The
// `enforceSSO` flag, when true, blocks magic-link sign-ups on that
// domain and forces users through the OIDC flow.
// ────────────────────────────────────────────────────────────────────

router.get("/sso/config", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const configs = await db.query.orgSsoConfigsTable.findMany({
    where: eq(orgSsoConfigsTable.orgId, membership.orgId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  res.json({
    configs: configs.map(c => ({
      id: c.id,
      provider: c.provider,
      domain: c.domain,
      tenantId: c.tenantId,
      enforceSSO: c.enforceSSO,
      status: c.status,
      lastTestAt: c.lastTestAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    availableProviders: configuredProviders(),
  });
});

router.post("/sso/config", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const { provider, domain, tenantId, enforceSSO } = req.body ?? {};
  if (provider !== "google" && provider !== "microsoft") {
    res.status(400).json({ error: "provider must be 'google' or 'microsoft'" });
    return;
  }
  if (!isProviderConfigured(provider as SsoProvider)) {
    res.status(503).json({ error: "This SSO provider isn't enabled on the platform yet. Please contact My Impact support." });
    return;
  }
  const cleanedDomain = typeof domain === "string" ? normalizeDomain(domain) : null;
  if (!cleanedDomain) {
    res.status(400).json({ error: "A valid email domain is required (e.g. acmecharity.org)" });
    return;
  }
  const cleanTenantId = typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
  if (provider === "microsoft" && !cleanTenantId) {
    res.status(400).json({ error: "Microsoft Entra requires a tenant ID (or 'common' for any tenant)." });
    return;
  }
  const enforce = !!enforceSSO;

  // Domain uniqueness across the platform
  const existingForDomain = await db.query.orgSsoConfigsTable.findFirst({
    where: eq(orgSsoConfigsTable.domain, cleanedDomain),
  });
  if (existingForDomain && existingForDomain.orgId !== membership.orgId) {
    res.status(409).json({ error: `Domain ${cleanedDomain} is already configured by another organisation. Contact My Impact support if this is yours.` });
    return;
  }

  // Enforcement can only be enabled on a verified configuration. For new
  // configs or configs where provider/tenant is changing (which resets status
  // to pending), silently downgrade enforceSSO to false so the caller cannot
  // lock out users before the domain is confirmed.
  const id = randomUUID();
  const now = new Date();

  if (existingForDomain && existingForDomain.orgId === membership.orgId) {
    // Changing provider or tenant ID invalidates the previous verification and
    // requires a fresh DNS challenge.
    const providerOrTenantChanged =
      existingForDomain.provider !== provider || existingForDomain.tenantId !== cleanTenantId;
    const newStatus = providerOrTenantChanged ? "pending" : existingForDomain.status;

    // SSO may only be enforced once the domain config is verified.
    const safeEnforce = enforce && newStatus === "verified";

    // Issue a new verification token whenever the config resets to pending.
    const newVerificationToken = providerOrTenantChanged
      ? randomBytes(24).toString("hex")
      : existingForDomain.verificationToken;

    const [updated] = await db
      .update(orgSsoConfigsTable)
      .set({
        provider,
        tenantId: cleanTenantId,
        enforceSSO: safeEnforce,
        status: newStatus,
        verificationToken: newVerificationToken,
        updatedAt: now,
      })
      .where(eq(orgSsoConfigsTable.id, existingForDomain.id))
      .returning();
    res.json({ config: serializeConfig(updated) });
    return;
  }

  // New configs always start as pending with a fresh verification token.
  // enforceSSO cannot be true until the domain is verified via DNS challenge.
  const verificationToken = randomBytes(24).toString("hex");
  const [created] = await db
    .insert(orgSsoConfigsTable)
    .values({
      id,
      orgId: membership.orgId,
      provider,
      domain: cleanedDomain,
      tenantId: cleanTenantId,
      enforceSSO: false,
      status: "pending",
      verificationToken,
    })
    .returning();
  res.json({ config: serializeConfig(created) });
});

router.delete("/sso/config/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const id = String(req.params.id);
  const existing = await db.query.orgSsoConfigsTable.findFirst({
    where: and(eq(orgSsoConfigsTable.id, id), eq(orgSsoConfigsTable.orgId, membership.orgId)),
  });
  if (!existing) {
    res.status(404).json({ error: "SSO config not found." });
    return;
  }
  await db.delete(orgSsoConfigsTable).where(eq(orgSsoConfigsTable.id, id));
  res.json({ ok: true });
});

/**
 * Manager-only: verify domain ownership via DNS TXT record.
 *
 * The manager must have added a TXT record at `_mi-sso-verify.<domain>`
 * containing the config's verificationToken. This endpoint performs a live
 * DNS lookup and, if the token is found, transitions status to "verified",
 * which is the only path that unlocks SSO enforcement and sign-in.
 *
 * POST /api/org/sso/config/:id/verify-domain
 */
router.post("/sso/config/:id/verify-domain", authenticate, async (req: AuthenticatedRequest, res) => {
  const membership = await requireOrgManager(req, res);
  if (!membership) return;

  const id = String(req.params.id);
  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: and(eq(orgSsoConfigsTable.id, id), eq(orgSsoConfigsTable.orgId, membership.orgId)),
  });
  if (!cfg) {
    res.status(404).json({ error: "SSO config not found." });
    return;
  }
  if (cfg.status === "verified") {
    res.json({ ok: true, message: "Domain is already verified." });
    return;
  }
  if (!cfg.verificationToken) {
    res.status(400).json({ error: "No verification token exists for this config. Please recreate it." });
    return;
  }

  const recordName = makeDnsChallengeRecord(cfg.domain);
  let txtRecords: string[][];
  try {
    txtRecords = await dnsPromises.resolveTxt(recordName);
  } catch (err: any) {
    const code = err?.code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      res.status(400).json({
        error: `DNS TXT record not found for ${recordName}. Please add the TXT record and try again.`,
        recordName,
        expectedValue: cfg.verificationToken,
      });
    } else {
      console.error("DNS lookup error:", err);
      res.status(500).json({ error: "DNS lookup failed. Please try again in a moment." });
    }
    return;
  }

  const flatValues = txtRecords.flatMap((chunks) => chunks.join(""));
  if (!flatValues.includes(cfg.verificationToken)) {
    res.status(400).json({
      error: `Verification token not found in TXT records for ${recordName}. Ensure you have saved the DNS record and DNS changes have propagated.`,
      recordName,
      expectedValue: cfg.verificationToken,
    });
    return;
  }

  const [updated] = await db
    .update(orgSsoConfigsTable)
    .set({ status: "verified", updatedAt: new Date() })
    .where(eq(orgSsoConfigsTable.id, cfg.id))
    .returning();

  res.json({ ok: true, config: serializeConfig(updated) });
});

function makeDnsChallengeRecord(domain: string): string {
  return `_mi-sso-verify.${domain}`;
}

function serializeConfig(c: typeof orgSsoConfigsTable.$inferSelect) {
  return {
    id: c.id,
    provider: c.provider,
    domain: c.domain,
    tenantId: c.tenantId,
    enforceSSO: c.enforceSSO,
    status: c.status,
    verificationToken: c.verificationToken ?? null,
    dnsChallengeRecord: makeDnsChallengeRecord(c.domain),
    lastTestAt: c.lastTestAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ─── Verification helpers ──────────────────────────────────────────────────

interface EligibleRecord {
  record: typeof impactRecordsTable.$inferSelect;
  member: typeof orgMembersTable.$inferSelect;
}

// Returns records logged by users currently in the org since they joined.
async function getEligibleRecordsForOrg(orgId: string): Promise<EligibleRecord[]> {
  const members = await db.query.orgMembersTable.findMany({
    where: eq(orgMembersTable.orgId, orgId),
  });
  if (members.length === 0) return [];
  const memberIds = members.map(m => m.userId);
  const memberMap = new Map(members.map(m => [m.userId, m]));
  const records = await db
    .select()
    .from(impactRecordsTable)
    .where(inArray(impactRecordsTable.userId, memberIds));
  return records
    .filter(r => {
      const m = memberMap.get(r.userId);
      return m && new Date(r.createdAt) >= new Date(m.joinedAt);
    })
    .map(r => ({ record: r, member: memberMap.get(r.userId)! }));
}

async function isRecordEligibleForOrg(recordId: number, orgId: string): Promise<boolean> {
  const record = await db.query.impactRecordsTable.findFirst({
    where: eq(impactRecordsTable.id, recordId),
  });
  if (!record) return false;
  const member = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, record.userId)),
  });
  if (!member) return false;
  return new Date(record.createdAt) >= new Date(member.joinedAt);
}

async function writeAuditLog(orgId: string, actorUserId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await db.insert(orgAuditLogTable).values({
    orgId,
    actorUserId,
    action,
    targetType,
    targetId,
    metadata: metadata ?? null,
  });
}

// ─── GET /api/org/verifications/pending ────────────────────────────────────
router.get("/verifications/pending", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;

    const eligible = await getEligibleRecordsForOrg(orgId);
    if (eligible.length === 0) { res.json({ pending: [] }); return; }

    const recordIds = eligible.map(e => e.record.id);
    const verifications = await db
      .select()
      .from(recordVerificationsTable)
      .where(and(eq(recordVerificationsTable.orgId, orgId), inArray(recordVerificationsTable.recordId, recordIds)));
    const verifiedRecordIds = new Set(verifications.map(v => v.recordId));

    const pending = eligible.filter(e => !verifiedRecordIds.has(e.record.id));

    const userIds = Array.from(new Set(pending.map(e => e.record.userId)));
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const items = pending
      .sort((a, b) => new Date(b.record.createdAt).getTime() - new Date(a.record.createdAt).getTime())
      .map(({ record }) => {
        const u = userMap.get(record.userId);
        return {
          recordId: record.id,
          memberName: u?.displayName ?? u?.email ?? "Member",
          memberEmail: u?.email ?? null,
          name: record.name,
          period: record.periodLabel,
          totalHours: record.totalHours,
          totalValue: Number(record.totalValue),
          createdAt: record.createdAt.toISOString(),
        };
      });

    res.json({ pending: items });
  } catch (err) {
    console.error("List pending verifications error:", err);
    res.status(500).json({ error: "Failed to load pending verifications" });
  }
});

// ─── POST /api/org/verifications/decide ────────────────────────────────────
router.post("/verifications/decide", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;
    const userId = req.user!.id;

    const { recordId, decision, reason } = req.body as { recordId?: number; decision?: string; reason?: string };
    if (typeof recordId !== "number" || !Number.isInteger(recordId)) {
      res.status(400).json({ error: "recordId is required" });
      return;
    }
    if (decision !== "approve" && decision !== "reject") {
      res.status(400).json({ error: "decision must be 'approve' or 'reject'" });
      return;
    }

    if (!(await isRecordEligibleForOrg(recordId, orgId))) {
      res.status(403).json({ error: "Record is not eligible for verification by this organisation." });
      return;
    }

    const status = decision === "approve" ? "approved" : "rejected";
    const trimmedReason = typeof reason === "string" ? reason.trim().slice(0, 500) || null : null;

    const existing = await db.query.recordVerificationsTable.findFirst({
      where: and(eq(recordVerificationsTable.recordId, recordId), eq(recordVerificationsTable.orgId, orgId)),
    });

    if (existing) {
      await db.update(recordVerificationsTable)
        .set({ status, verifiedBy: userId, decidedAt: new Date(), reason: trimmedReason })
        .where(eq(recordVerificationsTable.id, existing.id));
    } else {
      await db.insert(recordVerificationsTable).values({
        recordId, orgId, status, verifiedBy: userId, decidedAt: new Date(), reason: trimmedReason,
      });
    }

    await writeAuditLog(orgId, userId, status === "approved" ? "verification.approve" : "verification.reject", "impact_record", String(recordId), { reason: trimmedReason });

    res.json({ ok: true, status });
  } catch (err) {
    console.error("Verification decide error:", err);
    res.status(500).json({ error: "Failed to record decision" });
  }
});

// ─── POST /api/org/verifications/bulk-approve ──────────────────────────────
router.post("/verifications/bulk-approve", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;
    const userId = req.user!.id;

    const { recordIds } = req.body as { recordIds?: unknown };
    if (!Array.isArray(recordIds) || recordIds.length === 0 || !recordIds.every(n => typeof n === "number" && Number.isInteger(n))) {
      res.status(400).json({ error: "recordIds must be a non-empty array of integers" });
      return;
    }
    if (recordIds.length > 500) {
      res.status(400).json({ error: "Cannot approve more than 500 records at once" });
      return;
    }

    const eligible = await getEligibleRecordsForOrg(orgId);
    const eligibleSet = new Set(eligible.map(e => e.record.id));
    const validIds = (recordIds as number[]).filter(id => eligibleSet.has(id));

    if (validIds.length === 0) {
      res.json({ ok: true, approved: 0, skipped: recordIds.length });
      return;
    }

    const existing = await db
      .select({ recordId: recordVerificationsTable.recordId })
      .from(recordVerificationsTable)
      .where(and(eq(recordVerificationsTable.orgId, orgId), inArray(recordVerificationsTable.recordId, validIds)));
    const existingSet = new Set(existing.map(e => e.recordId));

    const toInsert = validIds.filter(id => !existingSet.has(id));
    const toUpdate = validIds.filter(id => existingSet.has(id));
    const now = new Date();

    if (toInsert.length > 0) {
      await db.insert(recordVerificationsTable).values(
        toInsert.map(recordId => ({
          recordId, orgId, status: "approved", verifiedBy: userId, decidedAt: now, reason: null,
        }))
      );
    }
    if (toUpdate.length > 0) {
      await db.update(recordVerificationsTable)
        .set({ status: "approved", verifiedBy: userId, decidedAt: now, reason: null })
        .where(and(eq(recordVerificationsTable.orgId, orgId), inArray(recordVerificationsTable.recordId, toUpdate)));
    }

    await writeAuditLog(orgId, userId, "verification.bulk_approve", "impact_record", validIds.join(","), { count: validIds.length });

    res.json({ ok: true, approved: validIds.length, skipped: recordIds.length - validIds.length });
  } catch (err) {
    console.error("Bulk approve error:", err);
    res.status(500).json({ error: "Failed to bulk approve" });
  }
});

// ─── Verified totals helper used by stats/dashboards ───────────────────────

export async function getVerifiedTotalsForOrg(orgId: string, from?: Date, to?: Date): Promise<{ verifiedHours: number; verifiedSocialValue: number; verifiedRecordCount: number }> {
  const baseConditions = [eq(recordVerificationsTable.orgId, orgId), eq(recordVerificationsTable.status, "approved")];
  if (from) baseConditions.push(gte(impactRecordsTable.entryDate, from));
  if (to) baseConditions.push(lt(impactRecordsTable.entryDate, to));

  const rows = await db
    .select({
      totalHours: impactRecordsTable.totalHours,
      totalValue: impactRecordsTable.totalValue,
    })
    .from(recordVerificationsTable)
    .innerJoin(impactRecordsTable, eq(impactRecordsTable.id, recordVerificationsTable.recordId))
    .where(and(...baseConditions));

  let verifiedHours = 0;
  let verifiedSocialValue = 0;
  for (const r of rows) {
    verifiedHours += r.totalHours ?? 0;
    verifiedSocialValue += Number(r.totalValue ?? 0);
  }
  return {
    verifiedHours: Math.round(verifiedHours * 100) / 100,
    verifiedSocialValue: Math.round(verifiedSocialValue * 100) / 100,
    verifiedRecordCount: rows.length,
  };
}

// ─── POST /api/org/member-submit ──────────────────────────────────────────
// A logged-in org member submits a list of standard Activities (no Actions,
// Contributions, or custom activities) directly to their organisation. The
// resulting impact record is auto-accepted into org totals: tagged with
// source='member-submitted', linked to the org via submittedToOrgId, and an
// approved record_verifications row is created so it counts in verified
// totals immediately. Org managers see these in the Member submissions panel
// with a badge.
interface MemberSubmitActivity {
  activityId?: unknown;
  quantity?: unknown;
  hoursPerYear?: unknown;
  title?: unknown;
  detail?: unknown;
}
interface MemberSubmitBody {
  name?: unknown;
  periodLabel?: unknown;
  activityDate?: unknown;
  saveToPersonal?: unknown;
  activities?: unknown;
}

// How long a member can edit or withdraw their own submission after sending
// it. Managers can withdraw at any time.
const MEMBER_SUBMISSION_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

type CleanedMemberActivity = {
  activityId: string;
  quantity: number;
  hoursPerYear: number;
  title: string | null;
  detail: string | null;
  isSomethingElse: boolean;
};

// Validates and normalises the `activities` payload shared by the member
// submit (POST) and member edit (PATCH) endpoints. Returns either the cleaned
// lines or a client-facing error message.
function cleanMemberActivities(activitiesRaw: unknown): { cleaned: CleanedMemberActivity[] } | { error: string } {
  if (!Array.isArray(activitiesRaw) || activitiesRaw.length === 0) {
    return { error: "At least one activity is required." };
  }
  if (activitiesRaw.length > 100) {
    return { error: "You can submit at most 100 activities at once." };
  }

  const cleaned: CleanedMemberActivity[] = [];
  for (const raw of activitiesRaw as MemberSubmitActivity[]) {
    const id = typeof raw.activityId === "string" ? raw.activityId.trim() : "";
    const isSomethingElse = id === "something_else";

    if (isSomethingElse) {
      const hoursNum = Number(raw.hoursPerYear);
      const safeHours = Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : 0;
      if (safeHours <= 0) {
        return { error: "Custom activity ('Something else') needs a positive hours value." };
      }
      if (safeHours > 24 * 365) {
        return { error: "Custom activity has an unreasonably large hours value." };
      }
      const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : null;
      if (!title) {
        return { error: "A 'Something else' activity must include a description of what you did." };
      }
      const detail = typeof raw.detail === "string" && raw.detail.trim() ? raw.detail.trim().slice(0, 500) : null;
      cleaned.push({ activityId: "something_else", quantity: 0, hoursPerYear: safeHours, title, detail, isSomethingElse: true });
      continue;
    }

    const def = ACTIVITIES.find(a => a.id === id);
    if (!def) {
      return { error: `Unknown activity id '${id}'. Only standard activities are allowed.` };
    }
    const quantityNum = Number(raw.quantity);
    const hoursNum = Number(raw.hoursPerYear);
    const safeQuantity = Number.isFinite(quantityNum) && quantityNum > 0 ? quantityNum : 0;
    const safeHours = Number.isFinite(hoursNum) && hoursNum > 0 ? hoursNum : 0;
    // For unit=hour activities the SVE proxy is multiplied by hoursPerYear,
    // so safeHours must be > 0; for unit-based activities safeQuantity must
    // be > 0. Reject empty rows so we never insert a zero-value record.
    if (def.unit === "hour" ? safeHours <= 0 : safeQuantity <= 0) {
      return { error: `Activity '${def.name}' needs a positive quantity or hours value.` };
    }
    if (safeHours > 24 * 365 || safeQuantity > 100_000) {
      return { error: `Activity '${def.name}' has an unreasonably large value.` };
    }
    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : null;
    const detail = typeof raw.detail === "string" && raw.detail.trim() ? raw.detail.trim().slice(0, 500) : null;
    cleaned.push({ activityId: id, quantity: safeQuantity, hoursPerYear: safeHours, title, detail, isSomethingElse: false });
  }
  return { cleaned };
}

router.post("/member-submit", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.status(403).json({ error: "You must be a member of an organisation to submit activities." });
      return;
    }

    const body = (req.body ?? {}) as MemberSubmitBody & Record<string, unknown>;

    // This flow is intentionally Activities-only. Reject payloads that try to
    // sneak Actions, Contributions, donations, custom activities or any other
    // wizard-style fields through this endpoint instead of silently dropping
    // them — that protects org totals and makes misuse explicit to clients.
    const FORBIDDEN_KEYS = [
      "actions", "contributions", "donations", "donationsGBP",
      "customActivities", "additionalVolunteerHours", "personalDevelopment",
    ];
    const offending = FORBIDDEN_KEYS.filter(k => Object.prototype.hasOwnProperty.call(body, k));
    if (offending.length > 0) {
      res.status(400).json({
        error: `This flow only accepts standard Activities. Remove these fields: ${offending.join(", ")}.`,
      });
      return;
    }

    const name = typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : "Activities submitted to organisation";
    const periodLabel = typeof body.periodLabel === "string" && body.periodLabel.trim()
      ? body.periodLabel.trim().slice(0, 80)
      : null;

    // Parse activityDate (ISO date string, e.g. "2026-05-09")
    const activityDateRaw = typeof body.activityDate === "string" ? body.activityDate.trim() : "";
    const parsedActivityDate = activityDateRaw
      ? (() => { const d = new Date(activityDateRaw); return isNaN(d.getTime()) ? new Date() : d; })()
      : new Date();

    const saveToPersonal = body.saveToPersonal === true;

    const parsed = cleanMemberActivities(body.activities);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const cleaned = parsed.cleaned;

    // Separate standard activities (have SVE proxy) from custom "something_else" ones
    const standardCleaned = cleaned.filter(c => !c.isSomethingElse);
    const somethingElseHours = cleaned
      .filter(c => c.isSomethingElse)
      .reduce((sum, c) => sum + c.hoursPerYear, 0);

    // calculateImpact handles standard activities; something_else hours are
    // passed as additionalVolunteerHours so they count for contribution value
    // and personal development value but have no SVE proxy impact value.
    const calc = calculateImpact(
      standardCleaned.map(c => ({ activityId: c.activityId, quantity: c.quantity, hoursPerYear: c.hoursPerYear })),
      0,
      somethingElseHours,
      [],
    );

    const now = new Date();
    const memberLines = cleaned.map(c => ({
      activityId: c.activityId,
      quantity: c.quantity,
      hoursPerYear: c.hoursPerYear,
      title: c.title,
      detail: c.detail,
    }));

    const resultJson = {
      ...calc,
      source: "member-submitted",
      submittedToOrgId: membership.orgId,
      submittedToOrgAt: now.toISOString(),
      memberLines,
    };

    const activitiesJson = cleaned.map(c => ({
      activityId: c.activityId,
      quantity: c.quantity,
      hoursPerYear: c.hoursPerYear,
      title: c.title,
      detail: c.detail,
    }));

    const [inserted] = await db.insert(impactRecordsTable).values({
      userId,
      name,
      periodLabel,
      totalValue: String(calc.totalValue),
      impactValue: String(calc.impactValue),
      contributionValue: String(calc.contributionValue),
      donationsValue: "0",
      personalDevelopmentValue: String(calc.personalDevelopmentValue),
      totalHours: Math.round(calc.totalHours),
      activitiesJson,
      resultJson,
      source: "member-submitted",
      submittedToOrgId: membership.orgId,
      submittedToOrgAt: now,
      entryDate: parsedActivityDate,
    }).returning();

    // Auto-accept: insert an approved verification row attributed to the
    // submitting member so it flows into verified-total dashboards.
    await db.insert(recordVerificationsTable).values({
      recordId: inserted.id,
      orgId: membership.orgId,
      status: "approved",
      verifiedBy: userId,
      decidedAt: now,
      reason: "member-submitted",
    });

    // When saveToPersonal is true, also create a personal impact record for
    // the member so they can see this submission in their own impact report.
    // This runs regardless of whether there are standard activities — a
    // something_else-only submission is still valid for a personal record.
    let personalRecordId: number | null = null;
    if (saveToPersonal) {
      // Standard activities contribute SVE proxy impact value.
      // something_else hours are passed as additionalVolunteerHours so they
      // count for contribution value and personal development value even though
      // they have no SVE proxy.
      const personalCalc = calculateImpact(
        standardCleaned.map(c => ({ activityId: c.activityId, quantity: c.quantity, hoursPerYear: c.hoursPerYear })),
        0,
        somethingElseHours,
        [],
      );
      // Include all submitted activities (standard + something_else) in the
      // personal record's activitiesJson so the full submission is preserved.
      const personalActivitiesJson = cleaned.map(c => ({
        activityId: c.activityId,
        quantity: c.quantity,
        hoursPerYear: c.hoursPerYear,
        title: c.title,
        detail: c.detail,
      }));
      const dateLabel = parsedActivityDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const [personalInserted] = await db.insert(impactRecordsTable).values({
        userId,
        name: `${name} (personal)`,
        periodLabel: dateLabel,
        totalValue: String(personalCalc.totalValue),
        impactValue: String(personalCalc.impactValue),
        contributionValue: String(personalCalc.contributionValue),
        donationsValue: "0",
        personalDevelopmentValue: String(personalCalc.personalDevelopmentValue),
        totalHours: Math.round(personalCalc.totalHours),
        activitiesJson: personalActivitiesJson,
        resultJson: personalCalc,
        source: "user",
        entryDate: parsedActivityDate,
      }).returning({ id: impactRecordsTable.id });
      personalRecordId = personalInserted?.id ?? null;
    }

    await writeAuditLog(membership.orgId, userId, "member.submit", "impact_record", String(inserted.id), {
      activityCount: cleaned.length,
      totalHours: calc.totalHours,
      totalValue: calc.totalValue,
    });

    await enqueueOrgEvent({
      orgId: membership.orgId,
      eventType: "hours.logged",
      payload: {
        recordId: String(inserted.id),
        member: { ref: userId, email: req.user!.email },
        source: "member-submitted",
        activityCount: cleaned.length,
        hours: calc.totalHours,
        socialValueGBP: calc.totalValue,
        occurredAt: now.toISOString(),
        attested: true,
      },
    });

    trackServerEvent({
      eventName: "org_member_submit_completed",
      userId,
      surface: "org",
      props: { orgId: membership.orgId, activityCount: cleaned.length, totalHours: calc.totalHours },
    });

    res.status(201).json({
      ok: true,
      record: {
        id: inserted.id,
        totalValue: calc.totalValue,
        totalHours: calc.totalHours,
        activityCount: cleaned.length,
        submittedToOrgId: membership.orgId,
        submittedToOrgAt: now.toISOString(),
        personalRecordId: personalRecordId ?? undefined,
      },
    });
  } catch (err) {
    console.error("Member-submit error:", err);
    res.status(500).json({ error: "Failed to submit activities to your organisation." });
  }
});

// ─── GET /api/org/member-submissions ──────────────────────────────────────
// Manager-only list of records submitted by org members through the dedicated
// flow (source='member-submitted'). Used by the Org portal's "Member
// submissions" panel — they don't appear in the pending verifications queue
// because they're auto-accepted.
router.get("/member-submissions", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;

    const sourceParamRaw = typeof req.query.source === "string" ? req.query.source : "member-submitted";
    const sourceParam: "member-submitted" | "org-attested" | "all" =
      sourceParamRaw === "org-attested" || sourceParamRaw === "all"
        ? sourceParamRaw
        : "member-submitted";

    // member-submitted: records this org received via /member-submit.
    // org-attested:    records attested via this org's API key. The
    //                  /api/v1/org/hours route doesn't set submitted_to_org_id,
    //                  so we resolve org ownership through the API key id.
    // all:             union of the two.
    const orgApiKeyIds = await db
      .select({ id: orgApiKeysTable.id })
      .from(orgApiKeysTable)
      .where(eq(orgApiKeysTable.orgId, orgId));
    const apiKeyIdList = orgApiKeyIds.map(k => k.id);

    const memberCond = and(
      eq(impactRecordsTable.submittedToOrgId, orgId),
      eq(impactRecordsTable.source, "member-submitted"),
    )!;
    const attestedCond = apiKeyIdList.length > 0
      ? inArray(impactRecordsTable.attestedByApiKeyId, apiKeyIdList)
      : sql`FALSE`;
    const whereExpr =
      sourceParam === "member-submitted" ? memberCond
      : sourceParam === "org-attested" ? attestedCond
      : sql`(${memberCond}) OR (${attestedCond})`;

    const records = await db
      .select()
      .from(impactRecordsTable)
      .where(whereExpr)
      .orderBy(desc(impactRecordsTable.submittedToOrgAt));

    const userIds = Array.from(new Set(records.map(r => r.userId)));
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const items = records.map(r => {
      const u = userMap.get(r.userId);
      const lines = Array.isArray(r.activitiesJson) ? (r.activitiesJson as Array<{ activityId?: string; title?: string | null; detail?: string | null; hoursPerYear?: number; quantity?: number }>) : [];
      const rowSource: "member-submitted" | "org-attested" =
        r.source === "member-submitted" ? "member-submitted" : "org-attested";
      return {
        recordId: r.id,
        memberName: u?.displayName ?? u?.email ?? "Member",
        memberEmail: u?.email ?? null,
        name: r.name,
        period: r.periodLabel,
        totalHours: r.totalHours,
        totalValue: Number(r.totalValue),
        submittedAt: (r.submittedToOrgAt ?? r.attestedAt ?? r.createdAt).toISOString(),
        source: rowSource,
        activityCount: lines.length,
        lines: lines.map(l => {
          const def = ACTIVITIES.find(a => a.id === l.activityId);
          return {
            activityName: def?.name ?? l.activityId ?? "Activity",
            category: def?.category ?? null,
            title: l.title ?? null,
            detail: l.detail ?? null,
            hoursPerYear: l.hoursPerYear ?? 0,
            quantity: l.quantity ?? 0,
          };
        }),
      };
    });

    res.json({ submissions: items });
  } catch (err) {
    console.error("List member submissions error:", err);
    res.status(500).json({ error: "Failed to load member submissions" });
  }
});

// ─── GET /api/org/my-submissions ──────────────────────────────────────────
// Member-scoped: returns the current user's own member-submitted records to
// their organisation. Used by /org/submit so members can see what they've
// already sent and avoid duplicates.
router.get("/my-submissions", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const membership = await db.query.orgMembersTable.findFirst({
      where: eq(orgMembersTable.userId, userId),
    });
    if (!membership) {
      res.json({ submissions: [] });
      return;
    }

    const records = await db
      .select()
      .from(impactRecordsTable)
      .where(and(
        eq(impactRecordsTable.userId, userId),
        eq(impactRecordsTable.submittedToOrgId, membership.orgId),
        eq(impactRecordsTable.source, "member-submitted"),
      )!)
      .orderBy(desc(impactRecordsTable.submittedToOrgAt));

    const nowMs = Date.now();
    const items = records.map(r => {
      const lines = Array.isArray(r.activitiesJson)
        ? (r.activitiesJson as Array<{ activityId?: string; quantity?: number; hoursPerYear?: number; title?: string | null; detail?: string | null }>)
        : [];
      const submittedAt = r.submittedToOrgAt ?? r.createdAt;
      const editableUntil = new Date(submittedAt.getTime() + MEMBER_SUBMISSION_EDIT_WINDOW_MS);
      return {
        recordId: r.id,
        name: r.name,
        period: r.periodLabel,
        totalHours: r.totalHours,
        totalValue: Number(r.totalValue),
        submittedAt: submittedAt.toISOString(),
        activityCount: lines.length,
        editableUntil: editableUntil.toISOString(),
        canEdit: nowMs < editableUntil.getTime(),
        lines: lines.map(l => {
          const def = ACTIVITIES.find(a => a.id === l.activityId);
          return {
            activityId: l.activityId ?? "",
            activityName: l.activityId === "something_else" ? (l.title ?? "Something else") : (def?.name ?? l.activityId ?? "Activity"),
            unit: def?.unit ?? "hour",
            quantity: l.quantity ?? 0,
            hoursPerYear: l.hoursPerYear ?? 0,
            title: l.title ?? null,
            detail: l.detail ?? null,
          };
        }),
      };
    });

    res.json({ submissions: items });
  } catch (err) {
    console.error("List my submissions error:", err);
    res.status(500).json({ error: "Failed to load your submissions" });
  }
});

// ─── DELETE /api/org/member-submissions/:recordId ─────────────────────────
// Withdraw a member submission. Allowed when the caller is either:
//   • the submitting member (their own member-submitted record), or
//   • a manager of the org the record was submitted to.
// Removes the impact record (which cascades the auto-approved
// record_verifications row) and any attachments, so org totals re-balance.
// Writes an audit-log entry attributing the withdrawal.
router.delete("/member-submissions/:recordId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const recordId = parseInt(req.params.recordId as string, 10);
    if (!Number.isFinite(recordId)) {
      res.status(400).json({ error: "Invalid record id." });
      return;
    }

    const rawReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (rawReason.length > 500) {
      res.status(400).json({ error: "Reason must be 500 characters or fewer." });
      return;
    }
    const reason = rawReason.length > 0 ? rawReason : null;

    const record = await db.query.impactRecordsTable.findFirst({
      where: eq(impactRecordsTable.id, recordId),
    });
    if (!record) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    if (record.source !== "member-submitted" || !record.submittedToOrgId) {
      res.status(400).json({ error: "Only member submissions can be withdrawn here." });
      return;
    }

    const orgId = record.submittedToOrgId;
    const isOwner = record.userId === userId;

    // Managers can withdraw at any time; members only within the edit window.
    const membership = await db.query.orgMembersTable.findFirst({
      where: and(eq(orgMembersTable.userId, userId), eq(orgMembersTable.orgId, orgId)),
    });
    const isManager = membership?.role === "manager";
    const actorRole: "member" | "manager" = isManager ? "manager" : "member";

    if (!isOwner && !isManager) {
      res.status(403).json({ error: "You don't have permission to withdraw this submission." });
      return;
    }
    if (!isManager) {
      const submittedAtMs = (record.submittedToOrgAt ?? record.createdAt).getTime();
      if (Date.now() - submittedAtMs > MEMBER_SUBMISSION_EDIT_WINDOW_MS) {
        res.status(403).json({ error: "This submission is more than 24 hours old. Ask an organisation manager to withdraw it." });
        return;
      }
    }

    await deleteAttachmentsForRecord(record.userId, recordId);
    await db.delete(impactRecordsTable).where(eq(impactRecordsTable.id, recordId));

    await writeAuditLog(orgId, userId, "member.submit.withdraw", "impact_record", String(recordId), {
      actorRole,
      submittingUserId: record.userId,
      totalHours: record.totalHours,
      totalValue: Number(record.totalValue),
      submittedAt: (record.submittedToOrgAt ?? record.createdAt).toISOString(),
      ...(reason ? { reason } : {}),
    });

    // Re-fire a webhook event so downstream systems that consumed the
    // original hours.logged event can re-balance their totals.
    await enqueueOrgEvent({
      orgId,
      eventType: "hours.withdrawn",
      payload: {
        recordId: String(recordId),
        member: { ref: record.userId },
        withdrawnBy: { ref: userId, role: actorRole },
        hours: record.totalHours,
        socialValueGBP: Number(record.totalValue),
        reason: reason ?? null,
        occurredAt: new Date().toISOString(),
      },
    });

    trackServerEvent({
      eventName: "org_member_submit_withdrawn",
      userId,
      surface: "org",
      props: { orgId, actorRole, recordId },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Withdraw member submission error:", err);
    res.status(500).json({ error: "Failed to withdraw submission." });
  }
});

// ─── PATCH /api/org/member-submissions/:recordId ──────────────────────────
// Edit a member submission. Only the submitting member may edit, and only
// within the 24-hour edit window. Accepts a replacement `activities` array
// (same validation as /member-submit), recalculates the impact figures, and
// updates the record in place. The auto-approved verification row is left
// untouched, so org totals simply reflect the new figures. Writes an audit
// entry and fires an hours.updated webhook so downstream systems re-sync.
router.patch("/member-submissions/:recordId", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const recordId = parseInt(req.params.recordId as string, 10);
    if (!Number.isFinite(recordId)) {
      res.status(400).json({ error: "Invalid record id." });
      return;
    }

    const rawReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (rawReason.length > 500) {
      res.status(400).json({ error: "Reason must be 500 characters or fewer." });
      return;
    }
    const reason = rawReason.length > 0 ? rawReason : null;

    const record = await db.query.impactRecordsTable.findFirst({
      where: eq(impactRecordsTable.id, recordId),
    });
    if (!record) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    if (record.source !== "member-submitted" || !record.submittedToOrgId) {
      res.status(400).json({ error: "Only member submissions can be edited here." });
      return;
    }
    if (record.userId !== userId) {
      res.status(403).json({ error: "You can only edit your own submissions." });
      return;
    }
    const submittedAtMs = (record.submittedToOrgAt ?? record.createdAt).getTime();
    if (Date.now() - submittedAtMs > MEMBER_SUBMISSION_EDIT_WINDOW_MS) {
      res.status(403).json({ error: "This submission is more than 24 hours old and can no longer be edited. Ask an organisation manager to withdraw it if it's wrong." });
      return;
    }

    const parsed = cleanMemberActivities(req.body?.activities);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const cleaned = parsed.cleaned;

    const standardCleaned = cleaned.filter(c => !c.isSomethingElse);
    const somethingElseHours = cleaned
      .filter(c => c.isSomethingElse)
      .reduce((sum, c) => sum + c.hoursPerYear, 0);

    const calc = calculateImpact(
      standardCleaned.map(c => ({ activityId: c.activityId, quantity: c.quantity, hoursPerYear: c.hoursPerYear })),
      0,
      somethingElseHours,
      [],
    );

    const memberLines = cleaned.map(c => ({
      activityId: c.activityId,
      quantity: c.quantity,
      hoursPerYear: c.hoursPerYear,
      title: c.title,
      detail: c.detail,
    }));

    const orgId = record.submittedToOrgId;
    const now = new Date();

    await db.update(impactRecordsTable)
      .set({
        totalValue: String(calc.totalValue),
        impactValue: String(calc.impactValue),
        contributionValue: String(calc.contributionValue),
        personalDevelopmentValue: String(calc.personalDevelopmentValue),
        totalHours: Math.round(calc.totalHours),
        activitiesJson: memberLines,
        resultJson: {
          ...calc,
          source: "member-submitted",
          submittedToOrgId: orgId,
          submittedToOrgAt: (record.submittedToOrgAt ?? record.createdAt).toISOString(),
          editedAt: now.toISOString(),
          memberLines,
        },
      })
      .where(eq(impactRecordsTable.id, recordId));

    await writeAuditLog(orgId, userId, "member.submit.edit", "impact_record", String(recordId), {
      actorRole: "member",
      previousTotalHours: record.totalHours,
      previousTotalValue: Number(record.totalValue),
      newTotalHours: calc.totalHours,
      newTotalValue: calc.totalValue,
      activityCount: cleaned.length,
      ...(reason ? { reason } : {}),
    });

    await enqueueOrgEvent({
      orgId,
      eventType: "hours.updated",
      payload: {
        recordId: String(recordId),
        member: { ref: userId, email: req.user!.email },
        source: "member-submitted",
        activityCount: cleaned.length,
        hours: calc.totalHours,
        socialValueGBP: calc.totalValue,
        previousHours: record.totalHours,
        previousSocialValueGBP: Number(record.totalValue),
        reason: reason ?? null,
        occurredAt: now.toISOString(),
      },
    });

    trackServerEvent({
      eventName: "org_member_submit_edited",
      userId,
      surface: "org",
      props: { orgId, recordId, activityCount: cleaned.length, totalHours: calc.totalHours },
    });

    res.json({
      ok: true,
      record: {
        id: recordId,
        totalValue: calc.totalValue,
        totalHours: calc.totalHours,
        activityCount: cleaned.length,
      },
    });
  } catch (err) {
    console.error("Edit member submission error:", err);
    res.status(500).json({ error: "Failed to update submission." });
  }
});

// ─── GET /api/org/activities ───────────────────────────────────────────────
// Manager-only. Returns a flat list of individual activity lines (one entry
// per activity within each impact record) for all members of this org, across
// both member-submitted and org-attested sources. Each line includes the SVE
// proxy citation and formula fields so the frontend can render the info-icon
// tooltip without falling back to category-level defaults.
//
// Query params:
//   from  — ISO-8601 date (inclusive lower bound on activity date)
//   to    — ISO-8601 date (inclusive upper bound on activity date)
router.get("/activities", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;

    const fromParam = req.query.from;
    const toParam   = req.query.to;
    const fromStr = typeof fromParam === "string" && fromParam ? fromParam : null;
    const toStr   = typeof toParam   === "string" && toParam   ? toParam   : null;

    // Resolve API key IDs that belong to this org (for org-attested records).
    const orgApiKeyRows = await db
      .select({ id: orgApiKeysTable.id })
      .from(orgApiKeysTable)
      .where(eq(orgApiKeysTable.orgId, orgId));
    const apiKeyIdList = orgApiKeyRows.map(k => k.id);

    const memberCond = eq(impactRecordsTable.submittedToOrgId, orgId);
    const attestedCond = apiKeyIdList.length > 0
      ? inArray(impactRecordsTable.attestedByApiKeyId, apiKeyIdList)
      : sql`FALSE`;

    // Consented-logging orgs additionally see all activities from consenting
    // members within each member's shared window (never journals or pulse).
    const sharingCtx = await getOrgSharingContext(orgId);
    // Server-side dashboard-section gating (super-admin controlled).
    if (!sharingCtx.sections.topActivities) {
      res.status(403).json({ error: "The activities section is disabled for this organisation." });
      return;
    }
    const consentedCond = sharingCtx.mode === "consented_logging"
      ? sharedRecordsCondition(sharingCtx)
      : undefined;

    const records = await db
      .select()
      .from(impactRecordsTable)
      .where(consentedCond
        ? sql`(${memberCond}) OR (${attestedCond}) OR (${consentedCond})`
        : sql`(${memberCond}) OR (${attestedCond})`)
      .orderBy(desc(impactRecordsTable.createdAt));

    // Approved verifications for these records, so member-submitted lines can
    // be flagged verified even without an org attestation.
    const recordIdList = records.map(r => r.id);
    const approvedVerifications = recordIdList.length > 0
      ? await db
          .select({ recordId: recordVerificationsTable.recordId })
          .from(recordVerificationsTable)
          .where(and(
            eq(recordVerificationsTable.orgId, orgId),
            eq(recordVerificationsTable.status, "approved"),
            inArray(recordVerificationsTable.recordId, recordIdList),
          ))
      : [];
    const approvedRecordIds = new Set(approvedVerifications.map(v => v.recordId));

    const userIds = Array.from(new Set(records.map(r => r.userId)));
    const users = userIds.length > 0
      ? await db
          .select({ id: usersTable.id, displayName: usersTable.displayName, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    interface ActivityLine {
      id: string;
      occurredAt: string;
      memberId: string;
      memberName: string;
      memberEmail: string | null;
      category: string;
      activity: string;
      description: string;
      hours: number;
      socialValueGBP: number;
      verified: boolean;
      valuePerUnit: number;
      unitLabel: string;
      proxy: string;
      proxyYear: string;
      source: "member-submitted" | "org-attested";
    }

    const lines: ActivityLine[] = [];

    for (const r of records) {
      const user = userMap.get(r.userId);
      const memberName  = user?.displayName ?? user?.email ?? "Member";
      const memberEmail = user?.email ?? null;

      const actLines = Array.isArray(r.activitiesJson)
        ? (r.activitiesJson as Array<Record<string, unknown>>)
        : [];

      // Determine the canonical date for this record.
      // org-attested: occurredAt lives in resultJson; fall back to attestedAt/createdAt.
      // member-submitted: entryDate is the activity date.
      let recordDate: string;
      if (r.source === "org-attested") {
        const rj = (r.resultJson ?? {}) as Record<string, unknown>;
        const raw = typeof rj.occurredAt === "string" ? rj.occurredAt : null;
        recordDate = raw
          ? raw.slice(0, 10)
          : (r.attestedAt ?? r.createdAt).toISOString().slice(0, 10);
      } else {
        recordDate = r.entryDate
          ? r.entryDate.toISOString().slice(0, 10)
          : (r.submittedToOrgAt ?? r.createdAt).toISOString().slice(0, 10);
      }

      // Apply date-range filter in application code so both sources are handled
      // uniformly regardless of which DB column holds the activity date.
      if (fromStr && recordDate < fromStr) continue;
      if (toStr   && recordDate > toStr)   continue;

      for (let i = 0; i < actLines.length; i++) {
        const l = actLines[i];
        const actId = typeof l.activityId === "string" ? l.activityId : "";

        if (actId === "org_attested") {
          // Org-attested records: rate stored alongside the line.
          const valuePerUnit = typeof l.valuePerUnit === "number" ? l.valuePerUnit : 17;
          const hours = typeof l.hoursPerYear === "number"
            ? l.hoursPerYear
            : typeof l.quantity === "number" ? l.quantity : 0;
          const description = typeof l.description === "string" ? l.description : "";
          const category = typeof (r.resultJson as Record<string, unknown>)?.category === "string"
            ? ((r.resultJson as Record<string, unknown>).category as string)
            : "Community";

          lines.push({
            id: `${r.id}-${i}`,
            occurredAt: recordDate,
            memberId: r.userId,
            memberName,
            memberEmail,
            category,
            activity: r.name ?? "Attested activity",
            description,
            hours,
            socialValueGBP: Math.round(Number(r.totalValue) * 100) / 100,
            verified: true,
            valuePerUnit,
            unitLabel: "hrs",
            proxy: "Organisation-attested volunteer hours (wage-replacement proxy, ONS)",
            proxyYear: "2023",
            source: "org-attested",
          });
        } else {
          // Member-submitted: look up the canonical activity definition.
          const actDef = ACTIVITIES.find(a => a.id === actId);
          const hours    = typeof l.hoursPerYear === "number" ? l.hoursPerYear : 0;
          const quantity = typeof l.quantity     === "number" ? l.quantity     : 0;

          // Use the stored quantity for the formula (hours for hour-based
          // activities, the specific quantity otherwise).
          const isHourBased = actDef
            ? actDef.unit === "hour" || actDef.unit === "hour_per_week"
            : false;
          const formulaQty = isHourBased ? hours : quantity;
          const valuePerUnit = actDef?.valuePerUnit ?? 0;
          const socialValueGBP = Math.round(formulaQty * valuePerUnit * 100) / 100;

          const description =
            typeof l.detail       === "string" ? l.detail :
            typeof l.description  === "string" ? l.description : "";

          // something_else activities have no SVE proxy.
          const isSomethingElse = actId === "something_else" || !actDef;

          lines.push({
            id: `${r.id}-${i}`,
            occurredAt: recordDate,
            memberId: r.userId,
            memberName,
            memberEmail,
            category: actDef?.category ?? "Community",
            activity: actDef?.name ?? (typeof l.title === "string" ? l.title : actId) ?? "Activity",
            description,
            hours,
            socialValueGBP: isSomethingElse ? 0 : socialValueGBP,
            verified: !!r.attestedAt || approvedRecordIds.has(r.id),
            valuePerUnit: actDef?.valuePerUnit ?? 0,
            unitLabel: actDef?.unitLabel ?? "hrs",
            proxy: actDef?.proxy ?? "",
            proxyYear: actDef?.proxyYear ?? "",
            source: "member-submitted",
          });
        }
      }
    }

    // Members list (for the filter dropdown in the UI).
    const memberList = users.map(u => ({
      id: u.id,
      name: u.displayName ?? u.email ?? "Member",
      email: u.email,
    }));

    res.json({ activities: lines, members: memberList });
  } catch (err) {
    console.error("Org activities error:", err);
    res.status(500).json({ error: "Failed to load activities" });
  }
});

// Migrated history: historical activity restored from a super-admin import
// of a previous organisation's data export. Read-only, clearly separated
// from live records.
router.get("/migrated-history", authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const membership = await requireOrgManager(req, res);
    if (!membership) return;
    const orgId = membership.orgId;

    const migrations = await db
      .select()
      .from(orgMigrationsTable)
      .where(eq(orgMigrationsTable.orgId, orgId))
      .orderBy(desc(orgMigrationsTable.createdAt));

    if (migrations.length === 0) {
      res.json({ migration: null, activities: [] });
      return;
    }
    const migration = migrations[0];

    const rows = await db
      .select()
      .from(orgMigratedActivitiesTable)
      .where(eq(orgMigratedActivitiesTable.orgId, orgId))
      .orderBy(desc(orgMigratedActivitiesTable.entryDate));

    res.json({
      migration: {
        id: migration.id,
        sourceOrgName: migration.sourceOrgName,
        sourceDataSharingMode: migration.sourceDataSharingMode,
        exportedAt: migration.exportedAt.toISOString(),
        importedAt: migration.createdAt.toISOString(),
        membersInSource: migration.membersInSource,
        activitiesImported: migration.activitiesImported,
        surveyAggregates: migration.surveyAggregates ?? null,
      },
      activities: rows.map((r) => ({
        id: r.id,
        entryDate: r.entryDate.toISOString().slice(0, 10),
        memberName: r.memberName ?? "Member",
        name: r.name,
        totalValue: Number(r.totalValue),
        totalHours: r.totalHours,
        source: r.source,
        verified: r.verified,
        verificationStatus: r.verificationStatus,
      })),
    });
  } catch (err) {
    console.error("Org migrated-history error:", err);
    res.status(500).json({ error: "Failed to load migrated history" });
  }
});

export default router;
