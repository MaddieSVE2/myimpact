import { Router, type IRouter } from "express";
import { db, usersTable, magicTokensTable, organisationsTable, orgMembersTable, userProfilesTable, orgSsoConfigsTable } from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { getUncachableResendClient } from "../lib/resend.js";
import { isProviderConfigured, type SsoProvider } from "../lib/oidc.js";
import { trackServerEvent } from "../lib/analytics.js";
import { recordAuditEvent } from "../lib/auditLog.js";

const router: IRouter = Router();

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : null);
  if (!appUrl) {
    throw new Error("APP_URL environment variable is not set");
  }
  return appUrl.replace(/\/$/, "");
}

function issueSession(res: any, user: { id: string; email: string }) {
  const secret = process.env.SESSION_SECRET!;
  const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: "30d" });
  res.cookie("mi_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// Age gate: compute whether a person with the given birth month/year is
// at least `years` old, conservatively. Only month and year are collected,
// so we treat the unknown day as making the person YOUNGER: they only count
// as `years` old once their birth month has fully passed. Someone whose
// 13th-birthday month is the current month is still treated as 12.
export function isAtLeastAge(birthMonth: number, birthYear: number, years: number, now = new Date()): boolean {
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1; // 1-12
  const thresholdYear = birthYear + years;
  return nowYear > thresholdYear || (nowYear === thresholdYear && nowMonth > birthMonth);
}

export type AgeGateResult =
  | { ok: true; birthMonth: number; birthYear: number; isMinor: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

export function checkAgeGate(rawMonth: unknown, rawYear: unknown): AgeGateResult {
  const birthMonth = typeof rawMonth === "number" ? rawMonth : Number(rawMonth);
  const birthYear = typeof rawYear === "number" ? rawYear : Number(rawYear);
  const currentYear = new Date().getFullYear();
  if (
    rawMonth == null || rawYear == null ||
    !Number.isInteger(birthMonth) || !Number.isInteger(birthYear) ||
    birthMonth < 1 || birthMonth > 12 ||
    birthYear < currentYear - 120 || birthYear > currentYear
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Please tell us your birth month and year to create an account.",
        code: "birth_date_required",
      },
    };
  }
  if (!isAtLeastAge(birthMonth, birthYear, 13)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "You must be 13 or older to use My Impact. We haven't stored any of your details.",
        code: "under_13",
      },
    };
  }
  return { ok: true, birthMonth, birthYear, isMinor: !isAtLeastAge(birthMonth, birthYear, 18) };
}

router.post("/request", async (req, res) => {
  const { email, returnTo, marketingOptIn, birthMonth, birthYear } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const hasMarketingConsent = marketingOptIn === true;

  const safeReturnTo =
    typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : null;

  // Enterprise SSO enforcement: if the email's domain has an active
  // org_sso_configs row with enforce_sso=true, refuse to send a magic
  // link and tell the client which provider to redirect to. Persona
  // demo accounts bypass this since they're not real domains.
  const emailDomain = normalizedEmail.split("@")[1] ?? "";
  if (emailDomain && !PERSONA_ACCOUNTS[normalizedEmail]) {
    const ssoCfg = await db.query.orgSsoConfigsTable.findFirst({
      where: eq(orgSsoConfigsTable.domain, emailDomain),
    });
    if (ssoCfg?.enforceSSO && ssoCfg.status === "verified") {
      const providerAvailable = isProviderConfigured(ssoCfg.provider as SsoProvider);
      res.status(403).json({
        error: providerAvailable
          ? `Your organisation requires single sign-on. Please continue with ${ssoCfg.provider === "google" ? "Google" : "Microsoft"}.`
          : "Your organisation requires single sign-on, but it isn't available right now. Please contact your admin.",
        ssoRequired: true,
        ssoProvider: ssoCfg.provider,
        ssoAvailable: providerAvailable,
      });
      return;
    }
  }

  // Demo persona accounts: skip the magic link entirely and issue a session
  // immediately. Only available outside of production or when explicitly enabled.
  if (PERSONA_ACCOUNTS[normalizedEmail]) {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN !== "true") {
      res.status(403).json({ error: "Demo login is not available." });
      return;
    }
    try {
      const result = await loginPersonaAccount(res, normalizedEmail);
      res.json({ ok: true, instantLogin: true, ...result });
    } catch (err) {
      console.error("Demo persona login failed:", err);
      res.status(500).json({ error: "Demo sign-in failed. Please try again." });
    }
    return;
  }

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, normalizedEmail),
  });

  if (!user) {
    // Age gate: a birth month/year is required whenever a NEW account would
    // be created. Under-13s are rejected here, BEFORE any row (user, profile,
    // magic token) is written and before any email is sent.
    const ageGate = checkAgeGate(birthMonth, birthYear);
    if (!ageGate.ok) {
      res.status(ageGate.status).json(ageGate.body);
      return;
    }
    const [created] = await db
      .insert(usersTable)
      .values({
        id: randomBytes(12).toString("hex"),
        email: normalizedEmail,
        birthMonth: ageGate.birthMonth,
        birthYear: ageGate.birthYear,
        isMinor: ageGate.isMinor,
      })
      .returning();
    user = created;
  }

  // GDPR: every magic-link request carries the current state of the
  // marketing-consent checkbox. We persist it on every request — not just
  // the first one — so that:
  //   * brand-new accounts get a profile row with the explicit choice
  //     (defaulting to opted-OUT when the box was not ticked);
  //   * existing accounts that don't yet have a profile row get one
  //     created with the explicit choice (no implicit opt-in);
  //   * users who tick the box on a later sign-in have their consent
  //     flipped on (and audited);
  //   * users who don't tick the box are never silently opted in.
  // We only ever audit and persist a marketing-consent timestamp when the
  // user actively ticked the box; we never overwrite a previous opt-in
  // back to false here (that's done from Settings).
  const existingProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.userId, user.id),
  });
  if (!existingProfile) {
    await db
      .insert(userProfilesTable)
      .values({
        userId: user.id,
        emailOptIn: hasMarketingConsent,
        marketingConsentAt: hasMarketingConsent ? new Date() : null,
        marketingConsentSource: hasMarketingConsent ? "signup" : null,
      })
      .onConflictDoNothing();
    if (hasMarketingConsent) {
      await recordAuditEvent({
        userId: user.id,
        userEmail: normalizedEmail,
        action: "consent_recorded",
        req,
        metadata: { kind: "onboarding_emails", source: "signup" },
      });
    }
  } else if (hasMarketingConsent && !existingProfile.emailOptIn) {
    await db
      .update(userProfilesTable)
      .set({
        emailOptIn: true,
        marketingConsentAt: new Date(),
        marketingConsentSource: "login",
      })
      .where(eq(userProfilesTable.userId, user.id));
    await recordAuditEvent({
      userId: user.id,
      userEmail: normalizedEmail,
      action: "consent_recorded",
      req,
      metadata: { kind: "onboarding_emails", source: "login" },
    });
  }

  // Rate-limit: at most one magic link per 60 seconds per user.
  // Select the newest unexpired token to ensure we check the most-recently issued one.
  const cooldownStart = new Date(Date.now() - 60 * 1000);
  const [newestToken] = await db
    .select()
    .from(magicTokensTable)
    .where(
      and(
        eq(magicTokensTable.userId, user.id),
        gt(magicTokensTable.expiresAt, cooldownStart)
      )
    )
    .orderBy(desc(magicTokensTable.expiresAt))
    .limit(1);
  // E2E tests sign the same user in repeatedly within seconds, so the
  // per-email cooldown is skipped in test mode.
  if (process.env.E2E_TEST_MODE !== "1" && newestToken && newestToken.expiresAt.getTime() - Date.now() > 14 * 60 * 1000) {
    res.status(429).json({ error: "A sign-in link was just sent. Please check your email or wait a moment before requesting another." });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(magicTokensTable).values({
    token,
    userId: user.id,
    expiresAt,
    confirmed: false,
  });

  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch {
    res.status(500).json({ error: "Server misconfiguration. Please try again later." });
    return;
  }

  const confirmUrl = safeReturnTo
    ? `${appUrl}/auth/confirm?token=${token}&returnTo=${encodeURIComponent(safeReturnTo)}`
    : `${appUrl}/auth/confirm?token=${token}`;

  // E2E test mode: skip the actual email send. The token is still recorded
  // and can be retrieved via the test-only /api/test/latest-token endpoint.
  if (process.env.E2E_TEST_MODE === "1") {
    res.json({ ok: true });
    return;
  }

  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const { error: sendError } = await client.emails.send({
      from: fromEmail,
      to: normalizedEmail,
      subject: "Your My Impact sign-in link",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
          <img src="${appUrl}/images/myimpact.png" alt="My Impact" style="height:48px;margin-bottom:24px;" />
          <h2 style="margin:0 0 8px;color:#213547;font-size:22px;">Sign in to My Impact</h2>
          <p style="color:#555;margin:0 0 24px;line-height:1.6;">
            Click the button below to sign in. This link expires in 15 minutes and can only be used once.
          </p>
          <a href="${confirmUrl}" style="display:inline-block;background:#F06127;color:white;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px;">
            Sign in to My Impact
          </a>
          <p style="color:#aaa;margin:24px 0 0;font-size:12px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    if (sendError) {
      console.error("Resend delivery error:", sendError);
      res.status(500).json({ error: "Failed to send email. Please try again." });
      return;
    }
  } catch (err) {
    console.error("Failed to send magic link email:", err);
    res.status(500).json({ error: "Failed to send email. Please try again." });
    return;
  }

  res.json({ ok: true });
});

router.get("/verify", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  try {
    const record = await db.query.magicTokensTable.findFirst({
      where: eq(magicTokensTable.token, token),
    });

    if (!record) {
      res.status(400).json({ error: "Invalid token" });
      return;
    }
    if (record.confirmed) {
      res.status(400).json({ error: "This link has already been used" });
      return;
    }
    if (new Date() > record.expiresAt) {
      res.status(400).json({ error: "This link has expired. Please request a new one." });
      return;
    }

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, record.userId) });
    res.json({ ok: true, email: user?.email });
  } catch (err) {
    console.error("[auth/verify] error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.post("/confirm", async (req, res) => {
  const xRequestedWith = req.headers["x-requested-with"];
  if (!xRequestedWith || xRequestedWith !== "XMLHttpRequest") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { token } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  try {
    const record = await db.query.magicTokensTable.findFirst({
      where: eq(magicTokensTable.token, token),
    });

    if (!record) {
      res.status(400).json({ error: "Invalid token" });
      return;
    }
    if (record.confirmed) {
      res.status(400).json({ error: "This link has already been used" });
      return;
    }
    if (new Date() > record.expiresAt) {
      res.status(400).json({ error: "This link has expired. Please request a new one." });
      return;
    }

    // Detect first-ever confirmation BEFORE we mark this token confirmed,
    // so we can fire signup_complete on a brand-new account.
    const priorConfirmed = await db.query.magicTokensTable.findFirst({
      where: and(
        eq(magicTokensTable.userId, record.userId),
        eq(magicTokensTable.confirmed, true),
      ),
    });
    const isFirstConfirm = !priorConfirmed;

    await db
      .update(magicTokensTable)
      .set({ confirmed: true, usedAt: new Date() })
      .where(eq(magicTokensTable.token, token));

    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, record.userId),
    });

    if (!user) {
      res.status(500).json({ error: "User not found" });
      return;
    }

    if (isFirstConfirm) {
      trackServerEvent({
        eventName: "signup_complete",
        userId: user.id,
        surface: "member",
        props: { method: "magic_link" },
      });
    }

    issueSession(res, user);
    res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("[auth/confirm] error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

const DEMO_ORG_ID = "demo-org-0000000000000";
const DEMO_ORG_NAME = "Demo Organisation";
const DEMO_ORG_TYPE = "corporate";
const DEMO_INVITE_CODE = "DEMO-0000";

const UNI_ORG_ID = "uni-org-0000000000000";
const UNI_ORG_NAME = "My Impact University";
const UNI_ORG_TYPE = "university";
const UNI_INVITE_CODE = "UNI-0000";

const PERSONA_ACCOUNTS: Record<string, { situation: string[] }> = {
  "demo@demo.org": { situation: [] },
  "volunteer@volunteer.org": { situation: ["volunteer"] },
  "student@student.org": { situation: ["student"] },
  "carer@carer.org": { situation: ["career_break"] },
  "veteran@veteran.org": { situation: ["armed_forces"] },
  "apprentice@apprentice.org": { situation: ["apprenticeship"] },
  "jobseeker@jobseeker.org": { situation: ["job_seeking"] },
  "organisation@organisation.org": { situation: [] },
  "university@university.org": { situation: [] },
};

// Personas that land on the org dashboard after login.
const ORG_PERSONA_EMAILS = new Set<string>([
  "demo@demo.org",
  "organisation@organisation.org",
  "university@university.org",
]);

// Personas that get a Demo Organisation membership on login. The student
// persona belongs to BOTH the demo org and the university.
const DEMO_ORG_MEMBER_EMAILS = new Set<string>([
  "demo@demo.org",
  "organisation@organisation.org",
  "student@student.org",
]);

// Personas that get a My Impact University membership on login. The student
// persona belongs to BOTH the demo org and the university.
const UNI_ORG_MEMBER_EMAILS = new Set<string>([
  "university@university.org",
  "student@student.org",
]);

// Ensure the given persona org exists and the user has an active membership
// with (at least) the desired role. Used for both the Demo Organisation and
// My Impact University on persona login, so the demo environment self-heals.
async function ensurePersonaOrgMembership(opts: {
  orgId: string;
  orgValues: typeof organisationsTable.$inferInsert;
  userId: string;
  role: "member" | "manager";
}) {
  const { orgId, orgValues, userId, role } = opts;

  const existingOrg = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, orgId),
  });
  if (!existingOrg) {
    await db.insert(organisationsTable).values(orgValues).onConflictDoNothing();
  }

  const existingMembership = await db.query.orgMembersTable.findFirst({
    where: (t, { and }) => and(eq(t.orgId, orgId), eq(t.userId, userId)),
  });

  if (!existingMembership) {
    await db
      .insert(orgMembersTable)
      .values({ orgId, userId, role, status: "active" })
      .onConflictDoNothing();
    return;
  }

  const needsRoleUpdate = role === "manager" && existingMembership.role !== "manager";
  const needsStatusFix = existingMembership.status !== "active";
  if (needsRoleUpdate || needsStatusFix) {
    await db
      .update(orgMembersTable)
      .set({
        ...(needsRoleUpdate ? { role: "manager" } : {}),
        ...(needsStatusFix ? { status: "active" } : {}),
      })
      .where(and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)));
  }
}

async function loginPersonaAccount(res: any, normalizedEmail: string) {
  const persona = PERSONA_ACCOUNTS[normalizedEmail];
  if (!persona) {
    throw new Error(`Unknown persona account: ${normalizedEmail}`);
  }

  let user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, normalizedEmail),
  });

  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({ id: randomBytes(12).toString("hex"), email: normalizedEmail })
      .returning();
    user = created;
  }

  await db
    .insert(userProfilesTable)
    .values({ userId: user.id, situation: persona.situation })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { situation: persona.situation },
    });

  if (DEMO_ORG_MEMBER_EMAILS.has(normalizedEmail)) {
    await ensurePersonaOrgMembership({
      orgId: DEMO_ORG_ID,
      orgValues: {
        id: DEMO_ORG_ID,
        name: DEMO_ORG_NAME,
        type: DEMO_ORG_TYPE,
        inviteCode: DEMO_INVITE_CODE,
      },
      userId: user.id,
      role: normalizedEmail === "organisation@organisation.org" ? "manager" : "member",
    });
  }

  if (UNI_ORG_MEMBER_EMAILS.has(normalizedEmail)) {
    await ensurePersonaOrgMembership({
      orgId: UNI_ORG_ID,
      orgValues: {
        id: UNI_ORG_ID,
        name: UNI_ORG_NAME,
        type: UNI_ORG_TYPE,
        inviteCode: UNI_INVITE_CODE,
        autoVerifyActivities: true,
      },
      userId: user.id,
      role: normalizedEmail === "university@university.org" ? "manager" : "member",
    });
  }

  issueSession(res, user);
  return {
    user: { id: user.id, email: user.email },
    orgRedirect: ORG_PERSONA_EMAILS.has(normalizedEmail),
  };
}

// Legacy direct demo-login endpoint, kept for back-compat. Use /api/auth/request
// instead, which auto-detects persona emails.
router.post("/demo-login", async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN !== "true") {
    res.status(403).json({ error: "Demo login is not available." });
    return;
  }

  const { email } = req.body;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!PERSONA_ACCOUNTS[normalizedEmail]) {
    res.status(403).json({ error: "Instant login is not available for this email" });
    return;
  }

  try {
    const result = await loginPersonaAccount(res, normalizedEmail);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Demo persona login failed:", err);
    res.status(500).json({ error: "Demo sign-in failed. Please try again." });
  }
});

router.get("/me", async (req: any, res) => {
  const token = req.cookies?.mi_session;
  if (!token) {
    res.json({ user: null });
    return;
  }

  try {
    const secret = process.env.SESSION_SECRET!;
    const payload = jwt.verify(token, secret) as { id: string; email: string };
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, payload.id) });
    if (!user) { res.json({ user: null }); return; }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName ?? null,
        createdAt: user.createdAt,
        emailDigestOptIn: user.emailDigestOptIn,
        voiceEnabled: user.voiceEnabled,
        voicePersona: user.voicePersona,
        voiceAccent: user.voiceAccent ?? "neutral",
        preferredLocale: user.preferredLocale ?? "en",
        gamificationEnabled: user.gamificationEnabled,
      },
    });
  } catch {
    res.json({ user: null });
  }
});

router.patch("/me", async (req: any, res) => {
  const token = req.cookies?.mi_session;
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const secret = process.env.SESSION_SECRET!;
    const payload = jwt.verify(token, secret) as { id: string; email: string };

    const { displayName, emailDigestOptIn, voiceEnabled, voicePersona, voiceAccent, preferredLocale, gamificationEnabled } = req.body ?? {};
    const updates: {
      displayName?: string | null;
      emailDigestOptIn?: boolean;
      voiceEnabled?: boolean;
      voicePersona?: string;
      voiceAccent?: string;
      preferredLocale?: string;
      gamificationEnabled?: boolean;
    } = {};

    if (displayName !== undefined) {
      if (typeof displayName !== "string" && displayName !== null) {
        res.status(400).json({ error: "displayName must be a string or null" });
        return;
      }
      updates.displayName =
        typeof displayName === "string" ? displayName.trim().slice(0, 80) || null : null;
    }

    if (emailDigestOptIn !== undefined) {
      if (typeof emailDigestOptIn !== "boolean") {
        res.status(400).json({ error: "emailDigestOptIn must be a boolean" });
        return;
      }
      updates.emailDigestOptIn = emailDigestOptIn;
    }

    if (voiceEnabled !== undefined) {
      if (typeof voiceEnabled !== "boolean") {
        res.status(400).json({ error: "voiceEnabled must be a boolean" });
        return;
      }
      updates.voiceEnabled = voiceEnabled;
    }

    if (voicePersona !== undefined) {
      const allowed = ["alloy", "nova", "shimmer", "echo", "fable", "onyx"];
      if (typeof voicePersona !== "string" || !allowed.includes(voicePersona)) {
        res.status(400).json({ error: `voicePersona must be one of: ${allowed.join(", ")}` });
        return;
      }
      updates.voicePersona = voicePersona;
    }

    if (voiceAccent !== undefined) {
      const allowedAccents = ["neutral", "british"];
      if (typeof voiceAccent !== "string" || !allowedAccents.includes(voiceAccent)) {
        res.status(400).json({ error: `voiceAccent must be one of: ${allowedAccents.join(", ")}` });
        return;
      }
      updates.voiceAccent = voiceAccent;
    }

    if (preferredLocale !== undefined) {
      if (preferredLocale !== "en" && preferredLocale !== "cy") {
        res.status(400).json({ error: "preferredLocale must be 'en' or 'cy'" });
        return;
      }
      updates.preferredLocale = preferredLocale;
    }

    if (gamificationEnabled !== undefined) {
      if (typeof gamificationEnabled !== "boolean") {
        res.status(400).json({ error: "gamificationEnabled must be a boolean" });
        return;
      }
      updates.gamificationEnabled = gamificationEnabled;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No updatable fields supplied" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, payload.id))
      .returning();

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName ?? null,
        emailDigestOptIn: updated.emailDigestOptIn,
        voiceEnabled: updated.voiceEnabled,
        voicePersona: updated.voicePersona,
        voiceAccent: updated.voiceAccent ?? "neutral",
        preferredLocale: updated.preferredLocale ?? "en",
        gamificationEnabled: updated.gamificationEnabled,
      },
    });
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
});

/**
 * One-click email-digest unsubscribe. Designed to be safely linked
 * from email footers — flips `email_digest_opt_in` to false without
 * requiring a session.
 *
 * The token is per-user and 24 random bytes; we do not invalidate the
 * token after use so a user can re-click an old email and still hit
 * a working confirmation page (the action is idempotent).
 */
router.get("/unsubscribe", async (req, res) => {
  const { token } = req.query;
  function renderPage(title: string, body: string, statusCode = 200) {
    res.status(statusCode).type("html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} · My Impact</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 480px; margin: 60px auto; padding: 32px 24px; color: #213547; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  p { color: #555; line-height: 1.6; font-size: 15px; margin: 0 0 16px; }
  a.btn { display: inline-block; background: #F06127; color: #fff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  a.btn:hover { background: #d95420; }
</style>
</head><body>${body}</body></html>`);
  }

  if (!token || typeof token !== "string") {
    renderPage(
      "Invalid link",
      `<h1>That link doesn't look right</h1>
       <p>The unsubscribe link is missing or malformed. You can manage your preferences from your account settings instead.</p>
       <p><a class="btn" href="${getAppUrl()}/settings">Go to settings</a></p>`,
      400,
    );
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.unsubscribeToken, token),
  });

  if (!user) {
    renderPage(
      "Link not found",
      `<h1>We couldn't find that subscription</h1>
       <p>This unsubscribe link is no longer valid. If you'd like to stop receiving monthly recaps, sign in and update your preferences from your account settings.</p>
       <p><a class="btn" href="${getAppUrl()}/settings">Manage preferences</a></p>`,
      404,
    );
    return;
  }

  if (user.emailDigestOptIn) {
    await db
      .update(usersTable)
      .set({ emailDigestOptIn: false })
      .where(eq(usersTable.id, user.id));
  }

  renderPage(
    "Unsubscribed",
    `<h1>You're unsubscribed from monthly recaps</h1>
     <p>We won't send any more monthly recap emails to <strong>${user.email}</strong>. You can re-enable them anytime from your settings.</p>
     <p><a class="btn" href="${getAppUrl()}/settings">Open My Impact</a></p>`,
  );
});

router.post("/logout", (_req, res) => {
  res.clearCookie("mi_session", { path: "/", secure: true, sameSite: "lax" });
  res.json({ ok: true });
});

export default router;
