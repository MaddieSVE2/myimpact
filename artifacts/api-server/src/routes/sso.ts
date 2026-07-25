import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable, organisationsTable, orgMembersTable, orgSsoConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import {
  type SsoProvider,
  buildAuthorizeUrl,
  exchangeCodeAndVerify,
  signState,
  verifyState,
  configuredProviders,
  isProviderConfigured,
} from "../lib/oidc.js";
import { createRateLimiter } from "../lib/rateLimiter.js";
import { checkAgeGate } from "./auth.js";

const router: IRouter = Router();

const ssoStartRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many sign-in attempts. Please wait a moment before trying again.",
});

function getAppUrl(): string {
  const appUrl =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  if (!appUrl) throw new Error("APP_URL not set");
  return appUrl.replace(/\/$/, "");
}

function getRedirectUri(provider: SsoProvider): string {
  return `${getAppUrl()}/api/auth/sso/${provider}/callback`;
}

function issueSession(res: Response, user: { id: string; email: string }) {
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

function isValidProvider(p: string): p is SsoProvider {
  return p === "google" || p === "microsoft";
}

function isSafePath(p: string | null | undefined): p is string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//");
}

/**
 * Public: list providers that have credentials configured. The Login UI
 * uses this to decide whether to show "Sign in with Google/Microsoft"
 * buttons at all.
 */
router.get("/providers", (_req, res) => {
  res.json({ providers: configuredProviders() });
});

/**
 * Public: look up SSO availability for an email address. Returns the
 * configured provider for the email's domain (if any) plus whether SSO
 * is enforced. The login form calls this on email entry to decide
 * between magic-link and SSO buttons.
 */
router.get("/lookup", async (req, res) => {
  const email = String(req.query.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    res.json({ sso: null });
    return;
  }
  const domain = email.split("@")[1] ?? "";
  if (!domain) {
    res.json({ sso: null });
    return;
  }
  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: eq(orgSsoConfigsTable.domain, domain),
  });
  // Only surface verified configs to the login UI. Pending/error configs are
  // not yet usable for sign-in so should be invisible to the login form.
  if (!cfg || cfg.status !== "verified") {
    res.json({ sso: null });
    return;
  }
  if (!isProviderConfigured(cfg.provider as SsoProvider)) {
    // Org has configured SSO but the platform creds aren't set — surface
    // gracefully rather than appearing broken.
    res.json({
      sso: {
        provider: cfg.provider,
        domain: cfg.domain,
        enforce: cfg.enforceSSO,
        available: false,
      },
    });
    return;
  }
  res.json({
    sso: {
      provider: cfg.provider,
      domain: cfg.domain,
      enforce: cfg.enforceSSO,
      available: true,
    },
  });
});

/**
 * Start an SSO sign-in. Resolves the email's domain to an SSO config,
 * builds the authorize URL, sets the state cookie, then 302-redirects
 * the browser to the IdP.
 *
 * GET /api/auth/sso/:provider/start?email=...&returnTo=/somewhere
 */
router.get("/:provider/start", ssoStartRateLimit, async (req, res) => {
  const provider = String(req.params.provider);
  if (!isValidProvider(provider)) {
    res.status(400).send("Unknown provider");
    return;
  }
  if (!isProviderConfigured(provider)) {
    res.status(503).send(
      "This sign-in option isn't available right now. Please use the email magic-link instead.",
    );
    return;
  }

  const email = String(req.query.email ?? "").trim().toLowerCase();
  const returnToRaw = req.query.returnTo;
  const returnTo = isSafePath(typeof returnToRaw === "string" ? returnToRaw : null) ? (returnToRaw as string) : null;

  if (!email || !email.includes("@")) {
    res.status(400).send("A valid email is required to start SSO sign-in.");
    return;
  }
  const domain = email.split("@")[1] ?? "";

  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: and(
      eq(orgSsoConfigsTable.domain, domain),
      eq(orgSsoConfigsTable.provider, provider),
    ),
  });
  if (!cfg) {
    res.status(400).send(
      `No ${provider} SSO is configured for ${domain}. Ask your organisation admin to set it up.`,
    );
    return;
  }
  if (cfg.status !== "verified") {
    res.status(400).send(
      `Your organisation's ${provider} SSO setup has not been verified yet. Ask your admin to complete the SSO test before signing in this way.`,
    );
    return;
  }

  const { state, nonce } = signState({
    provider,
    orgId: cfg.orgId,
    domain: cfg.domain,
    tenantId: cfg.tenantId,
    returnTo,
    mode: "signin",
  });

  res.cookie("mi_sso_state", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  const url = buildAuthorizeUrl(provider, state, getRedirectUri(provider), {
    domain: cfg.domain,
    tenantId: cfg.tenantId,
  });
  res.redirect(url);
});

/**
 * Manager-only: start an SSO test sign-in. The callback marks the org
 * config as `verified` instead of issuing a session. Used by the org
 * portal's "test sign-in" button to confirm the IdP handshake works.
 *
 * GET /api/auth/sso/test?orgId=...&provider=...
 * (Requires the manager to already be signed in.)
 */
router.get("/test/start", ssoStartRateLimit, async (req, res) => {
  const sessionToken = req.cookies?.mi_session;
  if (!sessionToken) {
    res.status(401).send("You must be signed in to test SSO.");
    return;
  }
  let userId: string;
  try {
    const payload = jwt.verify(sessionToken, process.env.SESSION_SECRET!) as { id: string };
    userId = payload.id;
  } catch {
    res.status(401).send("Session invalid.");
    return;
  }

  const orgId = String(req.query.orgId ?? "");
  const provider = String(req.query.provider ?? "");
  if (!isValidProvider(provider)) {
    res.status(400).send("Unknown provider");
    return;
  }
  if (!isProviderConfigured(provider)) {
    res.status(503).send("Provider not configured on the platform.");
    return;
  }

  // Ensure the caller is the org's manager
  const membership = await db.query.orgMembersTable.findFirst({
    where: and(eq(orgMembersTable.orgId, orgId), eq(orgMembersTable.userId, userId)),
  });
  if (!membership || membership.role !== "manager") {
    res.status(403).send("Only the organisation manager can run an SSO test.");
    return;
  }

  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: and(eq(orgSsoConfigsTable.orgId, orgId), eq(orgSsoConfigsTable.provider, provider)),
  });
  if (!cfg) {
    res.status(404).send("No matching SSO config to test.");
    return;
  }

  const { state, nonce } = signState({
    provider,
    orgId: cfg.orgId,
    domain: cfg.domain,
    tenantId: cfg.tenantId,
    returnTo: "/org",
    mode: "test",
  });
  res.cookie("mi_sso_state", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  const url = buildAuthorizeUrl(provider, state, getRedirectUri(provider), {
    domain: cfg.domain,
    tenantId: cfg.tenantId,
  });
  res.redirect(url);
});

/** Escape a string for safe interpolation into HTML text or attribute contexts. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Shared brand styling for server-rendered SSO pages (age gate, result
 * pages). Mirrors the My Impact web app's design tokens: warm cream
 * background, Fraunces/DM Sans typography, orange pill buttons, and the
 * logo served from the web app's public /images directory.
 */
const BRAND_HEAD = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet" />
<link rel="icon" href="/images/icon-192.png" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: hsl(45, 33%, 95%);
    color: #213547;
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    text-align: center;
  }
  .logo-chip {
    background: #213547;
    border-radius: 14px;
    padding: 12px 22px;
    margin-bottom: 28px;
    display: inline-flex;
    align-items: center;
  }
  .logo { height: 36px; display: block; }
  .card {
    background: #fff;
    border: 1px solid hsl(45, 18%, 87%);
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.06);
    padding: 40px 32px;
    max-width: 440px;
    width: 100%;
  }
  h1 {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 700;
    font-size: 26px;
    line-height: 1.25;
    margin: 0 0 12px;
    color: #213547;
  }
  p { color: hsl(208, 20%, 42%); line-height: 1.6; font-size: 15px; margin: 0 0 16px; }
  p strong { color: #213547; }
  a.btn, button.btn {
    display: inline-block;
    background: #E8633A;
    color: #fff;
    padding: 13px 30px;
    border-radius: 100px;
    border: none;
    text-decoration: none;
    font-family: 'DM Sans', sans-serif;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  a.btn:hover, button.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(232, 99, 58, 0.31);
  }
  .icon {
    width: 56px; height: 56px;
    border-radius: 100px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700;
    margin: 0 auto 18px;
  }
  .icon.ok { background: hsl(64, 61%, 46%, 0.18); color: hsl(64, 61%, 32%); }
  .icon.err { background: rgba(232, 99, 58, 0.14); color: #E8633A; }
  select {
    padding: 12px 14px;
    border: 1px solid hsl(45, 18%, 87%);
    border-radius: 10px;
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    color: #213547;
    background: #fff;
    margin: 0 4px;
  }
  select:focus { outline: 2px solid #E8633A; outline-offset: 1px; }
  .error { color: #c0392b; font-weight: 600; }
  .footnote { font-size: 13px; color: hsl(208, 20%, 55%); margin-top: 22px; margin-bottom: 0; }
</style>`;

const BRAND_LOGO = `<div class="logo-chip"><img class="logo" src="/images/myimpact.png" alt="My Impact" /></div>`;

/** Render an HTML page that closes the OAuth flow on the user's side. */
function renderResultPage(res: Response, opts: { ok: boolean; title: string; message: string; redirectTo?: string | null }) {
  const safeRedirect = isSafePath(opts.redirectTo ?? null) ? opts.redirectTo! : null;
  const safeRedirectEscaped = safeRedirect ? escapeHtml(safeRedirect) : null;
  const meta = safeRedirectEscaped
    ? `<meta http-equiv="refresh" content="1;url=${safeRedirectEscaped}" />`
    : "";
  const titleEscaped = escapeHtml(opts.title);
  const messageEscaped = escapeHtml(opts.message);
  res.status(opts.ok ? 200 : 400).type("html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
${meta}
<title>${titleEscaped} · My Impact</title>
${BRAND_HEAD}
</head><body>
${BRAND_LOGO}
<div class="card">
<div class="icon ${opts.ok ? "ok" : "err"}">${opts.ok ? "✓" : "✕"}</div>
<h1>${titleEscaped}</h1>
<p>${messageEscaped}</p>
${safeRedirectEscaped ? `<p style="margin-bottom:0"><a class="btn" href="${safeRedirectEscaped}">Continue</a></p>` : `<p style="margin-bottom:0"><a class="btn" href="/">Back to My Impact</a></p>`}
</div>
</body></html>`);
}

/**
 * OIDC callback. Validates state, exchanges the code, verifies the id_token,
 * then either:
 *   - mode 'signin': finds/creates the user, links them as an org member,
 *     issues a session cookie, and redirects to the post-login destination.
 *   - mode 'test':   marks the org SSO config as `verified` and redirects
 *     back to the org portal.
 *
 * GET /api/auth/sso/:provider/callback?code=...&state=...
 */
router.get("/:provider/callback", async (req, res) => {
  const provider = String(req.params.provider);
  if (!isValidProvider(provider)) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Unknown sign-in provider." });
    return;
  }

  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  if (error || typeof code !== "string" || typeof state !== "string") {
    const detail = typeof error === "string" ? error : "Provider did not return an authorisation code.";
    renderResultPage(res, { ok: false, title: "Sign-in cancelled", message: detail });
    return;
  }

  const payload = verifyState(state);
  if (!payload || payload.provider !== provider) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Sign-in state was invalid or expired. Please start again." });
    return;
  }

  // Cookie nonce check — defends against state replayed without the
  // browser-bound nonce cookie set by /start.
  const cookieNonce = req.cookies?.mi_sso_state;
  if (cookieNonce !== payload.nonce) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Sign-in session expired. Please try again." });
    return;
  }

  // Re-load org config in case it was changed between start and callback
  const cfg = await db.query.orgSsoConfigsTable.findFirst({
    where: and(
      eq(orgSsoConfigsTable.orgId, payload.orgId),
      eq(orgSsoConfigsTable.provider, provider),
    ),
  });
  if (!cfg || cfg.domain.toLowerCase() !== payload.domain.toLowerCase()) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Your organisation's SSO config has changed. Please ask your admin." });
    return;
  }

  let identity;
  try {
    identity = await exchangeCodeAndVerify(provider, code, getRedirectUri(provider), {
      domain: cfg.domain,
      tenantId: cfg.tenantId,
    });
  } catch (err) {
    console.error("SSO exchange/verify failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (payload.mode === "test") {
      // Persist failure on the config so the admin can see what went wrong
      await db
        .update(orgSsoConfigsTable)
        .set({ status: "error", lastTestAt: new Date(), updatedAt: new Date() })
        .where(eq(orgSsoConfigsTable.id, cfg.id));
    }
    renderResultPage(res, {
      ok: false,
      title: "Sign-in failed",
      message: `We couldn't complete the sign-in handshake. ${msg.slice(0, 200)}`,
      redirectTo: payload.mode === "test" ? "/org" : "/login",
    });
    return;
  }

  if (!identity.emailVerified) {
    renderResultPage(res, { ok: false, title: "Email not verified", message: "Your provider says this email isn't verified. Please verify it and try again." });
    return;
  }

  // ── Test mode: confirm IdP handshake works but do NOT mark verified.
  // Domain ownership is proved separately via DNS TXT challenge
  // (POST /api/org/sso/config/:id/verify-domain). ──
  if (payload.mode === "test") {
    await db
      .update(orgSsoConfigsTable)
      .set({ lastTestAt: new Date(), updatedAt: new Date() })
      .where(eq(orgSsoConfigsTable.id, cfg.id));
    res.clearCookie("mi_sso_state", { path: "/", secure: true, sameSite: "lax" });
    renderResultPage(res, {
      ok: true,
      title: "SSO test successful",
      message: `The IdP handshake worked for ${identity.email}. To enable SSO sign-in, complete domain verification from your organisation settings.`,
      redirectTo: payload.returnTo ?? "/org",
    });
    return;
  }

  // ── Sign-in mode: find or create user, link to org, issue session ──
  // Re-check verified status here to close any TOCTOU window between
  // /start and /callback (e.g. admin reverts verification mid-flow).
  if (cfg.status !== "verified") {
    renderResultPage(res, {
      ok: false,
      title: "SSO not ready",
      message: "Your organisation's SSO domain has not been verified yet. Please ask your admin to complete domain verification before signing in this way.",
      redirectTo: "/login",
    });
    return;
  }

  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, identity.email) });
  if (!user) {
    // Age gate: brand-new SSO accounts must confirm their birth month/year
    // BEFORE any user row is stored — same policy as magic-link sign-up.
    // Nothing is persisted here; the verified identity is carried forward
    // in a short-lived signed token, and the user row is only created by
    // /complete-signup once the age gate passes.
    const pendingToken = jwt.sign(
      {
        purpose: "sso_pending_signup",
        email: identity.email,
        name: identity.name ?? null,
        orgId: cfg.orgId,
        returnTo: payload.returnTo ?? null,
      },
      process.env.SESSION_SECRET!,
      { expiresIn: "15m" },
    );
    res.clearCookie("mi_sso_state", { path: "/", secure: true, sameSite: "lax" });
    renderAgeGatePage(res, { token: pendingToken, email: identity.email });
    return;
  }

  if (!user.displayName && identity.name) {
    // Backfill display name on first SSO login if it was blank
    await db.update(usersTable).set({ displayName: identity.name }).where(eq(usersTable.id, user.id));
  }

  const linked = await linkUserToOrg(res, user, cfg.orgId);
  if (!linked) return;

  issueSession(res, user);
  res.clearCookie("mi_sso_state", { path: "/", secure: true, sameSite: "lax" });

  renderResultPage(res, {
    ok: true,
    title: "Signed in",
    message: `Welcome, ${identity.name ?? identity.email}. Taking you to ${linked.name}…`,
    redirectTo: payload.returnTo ?? "/",
  });
});

/**
 * Verify the org still exists and link the user as a member (if not already
 * a member elsewhere). Renders an error page and returns null on failure;
 * returns the org row on success.
 */
async function linkUserToOrg(
  res: Response,
  user: { id: string },
  orgId: string,
): Promise<{ id: string; name: string } | null> {
  const org = await db.query.organisationsTable.findFirst({
    where: eq(organisationsTable.id, orgId),
  });
  if (!org) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Your organisation could not be found." });
    return null;
  }

  const existingMembership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, user.id),
  });

  if (!existingMembership) {
    // Auto-join as a member (role = 'member' per task spec).
    try {
      await db.insert(orgMembersTable).values({
        orgId: org.id,
        userId: user.id,
        role: "member",
      });
    } catch (err) {
      console.error("Failed to auto-link SSO user to org:", err);
      renderResultPage(res, { ok: false, title: "Sign-in failed", message: "We couldn't add you to your organisation. Please contact support." });
      return null;
    }
  } else if (existingMembership.orgId !== org.id) {
    // User is already in a different org — surface a clear error rather
    // than silently moving them.
    renderResultPage(res, {
      ok: false,
      title: "Already in another organisation",
      message: "Your account is already linked to a different organisation on My Impact. Please contact support to switch.",
    });
    return null;
  }
  return org;
}

/**
 * Render the birth month/year form shown to brand-new SSO users before
 * their account is created. Posts back to /api/auth/sso/complete-signup.
 */
function renderAgeGatePage(res: Response, opts: { token: string; email: string; error?: string }) {
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentYear = new Date().getFullYear();
  const monthOptions = monthNames
    .map((m, i) => `<option value="${i + 1}">${m}</option>`)
    .join("");
  let yearOptions = "";
  for (let y = currentYear; y >= currentYear - 120; y--) {
    yearOptions += `<option value="${y}">${y}</option>`;
  }
  const emailEscaped = escapeHtml(opts.email);
  const tokenEscaped = escapeHtml(opts.token);
  const errorHtml = opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : "";
  res.status(200).type("html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>One last step · My Impact</title>
${BRAND_HEAD}
</head><body>
${BRAND_LOGO}
<div class="card">
<h1>One last step</h1>
<p>You're creating a new My Impact account for <strong>${emailEscaped}</strong>.<br/>Please tell us your date of birth — you must be 13 or older to use My Impact.</p>
${errorHtml}
<form method="post" action="/api/auth/sso/complete-signup">
  <input type="hidden" name="token" value="${tokenEscaped}" />
  <div>
    <select name="birthMonth" required aria-label="Birth month" data-testid="select-birth-month">
      <option value="">Month</option>${monthOptions}
    </select>
    <select name="birthYear" required aria-label="Birth year" data-testid="select-birth-year">
      <option value="">Year</option>${yearOptions}
    </select>
  </div>
  <button type="submit" class="btn" style="margin-top:20px" data-testid="button-complete-signup">Continue</button>
</form>
<p class="footnote">We only use this to check you're old enough — nothing is saved until you continue.</p>
</div>
</body></html>`);
}

/**
 * Finish a brand-new SSO sign-up after the age gate. Validates the pending
 * token issued by the callback, runs the same age gate as magic-link
 * sign-up, and only then creates the user row, links the org membership,
 * and issues a session. Under-13s are blocked and nothing is stored.
 */
router.post("/complete-signup", async (req, res) => {
  const { token, birthMonth, birthYear } = req.body ?? {};
  if (typeof token !== "string" || !token) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Your sign-in session was invalid. Please start again.", redirectTo: "/login" });
    return;
  }

  let pending: { purpose?: string; email?: string; name?: string | null; orgId?: string; returnTo?: string | null };
  try {
    pending = jwt.verify(token, process.env.SESSION_SECRET!) as typeof pending;
  } catch {
    renderResultPage(res, { ok: false, title: "Sign-in expired", message: "Your sign-in session expired. Please sign in again.", redirectTo: "/login" });
    return;
  }
  if (pending.purpose !== "sso_pending_signup" || !pending.email || !pending.orgId) {
    renderResultPage(res, { ok: false, title: "Sign-in failed", message: "Your sign-in session was invalid. Please start again.", redirectTo: "/login" });
    return;
  }

  const ageGate = checkAgeGate(birthMonth, birthYear);
  if (!ageGate.ok) {
    if (ageGate.body.code === "under_13") {
      // Same friendly message as magic-link; no data has been stored.
      renderResultPage(res, {
        ok: false,
        title: "Sorry, you can't join yet",
        message: "You must be 13 or older to use My Impact. We haven't stored any of your details.",
        redirectTo: "/",
      });
      return;
    }
    renderAgeGatePage(res, {
      token,
      email: pending.email,
      error: "Please choose your birth month and year to continue.",
    });
    return;
  }

  // The user may have been created between callback and now (e.g. a
  // parallel magic-link sign-up). Reuse the existing row in that case
  // rather than failing.
  let user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, pending.email) });
  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({
        id: randomBytes(12).toString("hex"),
        email: pending.email,
        displayName: pending.name ?? null,
        birthMonth: ageGate.birthMonth,
        birthYear: ageGate.birthYear,
        isMinor: ageGate.isMinor,
      })
      .returning();
    user = created;
  }

  const linked = await linkUserToOrg(res, user, pending.orgId);
  if (!linked) return;

  issueSession(res, user);

  renderResultPage(res, {
    ok: true,
    title: "Signed in",
    message: `Welcome, ${pending.name ?? pending.email}. Taking you to ${linked.name}…`,
    redirectTo: (isSafePath(pending.returnTo) ? pending.returnTo : null) ?? "/",
  });
});

export default router;
