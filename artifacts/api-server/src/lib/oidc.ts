import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";
import { randomBytes, createHash } from "crypto";

/**
 * Multi-tenant OIDC sign-in helpers for Google Workspace and Microsoft Entra.
 *
 * Design:
 *  - Each provider uses a single OAuth client owned by My Impact (registered
 *    in Google Cloud Console / Microsoft Entra App Registration as multi-tenant).
 *  - We do NOT store refresh tokens. We use OIDC purely for identity: verify
 *    the id_token, extract the verified email, and issue our own session cookie.
 *  - Per-org config (domain + provider + tenant) lives in `org_sso_configs`.
 *  - State is signed (HMAC) and round-tripped via a short-lived cookie.
 */

export type SsoProvider = "google" | "microsoft";

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  issuerPattern: RegExp;
  scope: string;
}

const GOOGLE_CONFIG = (): ProviderConfig | null => {
  const clientId = process.env.GOOGLE_OIDC_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OIDC_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
    issuerPattern: /^https:\/\/accounts\.google\.com$|^accounts\.google\.com$/,
    scope: "openid email profile",
  };
};

// Microsoft Entra (formerly Azure AD). For multi-tenant apps we use the
// `common` endpoint and verify the tenant id (`tid`) claim against the
// org config.
const MICROSOFT_CONFIG = (): ProviderConfig | null => {
  const clientId = process.env.MICROSOFT_OIDC_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OIDC_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    jwksUrl: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    // Entra issuer includes the tenant id, e.g.
    //   https://login.microsoftonline.com/<tid>/v2.0
    issuerPattern: /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i,
    scope: "openid email profile",
  };
};

export function getProviderConfig(p: SsoProvider): ProviderConfig | null {
  return p === "google" ? GOOGLE_CONFIG() : MICROSOFT_CONFIG();
}

export function isProviderConfigured(p: SsoProvider): boolean {
  return getProviderConfig(p) !== null;
}

/** Returns which providers have credentials available. */
export function configuredProviders(): SsoProvider[] {
  const out: SsoProvider[] = [];
  if (isProviderConfigured("google")) out.push("google");
  if (isProviderConfigured("microsoft")) out.push("microsoft");
  return out;
}

// ────────────────────────────────────────────────────────────────────
// State signing — HMAC over a JSON payload so we can detect tampering
// ────────────────────────────────────────────────────────────────────

interface StatePayload {
  provider: SsoProvider;
  orgId: string;
  domain: string;
  tenantId?: string | null;
  returnTo?: string | null;
  nonce: string;
  issuedAt: number;
  mode: "signin" | "test";
}

function getStateSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET not set");
  return s;
}

export function signState(payload: Omit<StatePayload, "nonce" | "issuedAt">): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const full: StatePayload = { ...payload, nonce, issuedAt: Date.now() };
  const json = JSON.stringify(full);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHash("sha256").update(b64 + getStateSecret()).digest("base64url");
  return { state: `${b64}.${sig}`, nonce };
}

export function verifyState(state: string): StatePayload | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected = createHash("sha256").update(b64 + getStateSecret()).digest("base64url");
  if (sig !== expected) return null;
  try {
    const json = Buffer.from(b64, "base64url").toString("utf-8");
    const payload = JSON.parse(json) as StatePayload;
    // 10-minute window
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Authorize URL builders
// ────────────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(
  provider: SsoProvider,
  state: string,
  redirectUri: string,
  opts: { domain: string; tenantId?: string | null },
): string {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error(`Provider not configured: ${provider}`);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    scope: cfg.scope,
    redirect_uri: redirectUri,
    state,
    prompt: "select_account",
  });

  if (provider === "google") {
    // hd hints (and on Google Workspace, restricts) the allowed hosted domain
    params.set("hd", opts.domain);
    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  // Microsoft Entra: authorize against the org's specific tenant if configured,
  // falling back to /common (which lets the user choose).
  const tenant = opts.tenantId && /^[0-9a-f-]{36}$|^[a-z0-9.-]+$/i.test(opts.tenantId)
    ? opts.tenantId
    : "common";
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  // domain_hint speeds the user past the tenant picker
  params.set("domain_hint", opts.domain);
  return `${url}?${params.toString()}`;
}

// ────────────────────────────────────────────────────────────────────
// Token exchange + id_token verification
// ────────────────────────────────────────────────────────────────────

export interface VerifiedIdentity {
  email: string;
  emailVerified: boolean;
  sub: string;
  name?: string | null;
  hostedDomain?: string | null;
  tenantId?: string | null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(url: string) {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export async function exchangeCodeAndVerify(
  provider: SsoProvider,
  code: string,
  redirectUri: string,
  expected: { domain: string; tenantId?: string | null },
): Promise<VerifiedIdentity> {
  const cfg = getProviderConfig(provider);
  if (!cfg) throw new Error(`Provider not configured: ${provider}`);

  // For Microsoft, exchange tokens at the org's tenant endpoint when known
  // — Entra requires the same endpoint for authorize and token exchange when
  // a specific tenant was used.
  let tokenUrl = cfg.tokenUrl;
  if (provider === "microsoft" && expected.tenantId) {
    tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(expected.tenantId)}/oauth2/v2.0/token`;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    throw new Error(`Token exchange failed (${tokenRes.status}): ${errText.slice(0, 300)}`);
  }

  const tokens = await tokenRes.json() as { id_token?: string; access_token?: string };
  if (!tokens.id_token) {
    throw new Error("No id_token returned by provider");
  }

  // Verify signature + standard claims
  const jwks = getJwks(cfg.jwksUrl);
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    audience: cfg.clientId,
  });

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!cfg.issuerPattern.test(iss)) {
    throw new Error(`Unexpected token issuer: ${iss}`);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) throw new Error("id_token missing email claim");

  // Google sets email_verified; Microsoft Entra work/school accounts are
  // implicitly verified by the IdP, but we check the claim if present.
  const emailVerified = payload.email_verified === true || payload.email_verified === "true" ||
    (provider === "microsoft" && payload.email_verified === undefined);

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("id_token missing sub claim");

  // Domain enforcement: the email must be on the configured domain. For
  // Google Workspace we additionally check the `hd` claim.
  const emailDomain = email.split("@")[1] ?? "";
  if (emailDomain.toLowerCase() !== expected.domain.toLowerCase()) {
    throw new Error(`Email domain ${emailDomain} does not match configured domain ${expected.domain}`);
  }

  let hostedDomain: string | null = null;
  if (provider === "google") {
    hostedDomain = typeof payload.hd === "string" ? payload.hd : null;
    if (!hostedDomain || hostedDomain.toLowerCase() !== expected.domain.toLowerCase()) {
      throw new Error(`Google hosted-domain mismatch (got ${hostedDomain ?? "none"})`);
    }
  }

  let tenantId: string | null = null;
  if (provider === "microsoft") {
    tenantId = typeof payload.tid === "string" ? payload.tid : null;
    if (expected.tenantId && tenantId && tenantId.toLowerCase() !== expected.tenantId.toLowerCase()) {
      throw new Error(`Microsoft tenant mismatch (got ${tenantId})`);
    }
  }

  const name = typeof payload.name === "string" ? payload.name : null;

  return {
    email,
    emailVerified,
    sub,
    name,
    hostedDomain,
    tenantId,
  };
}

/** Decode without verifying — used only for client-side debugging messages. */
export function unsafeDecodeIdToken(token: string): Record<string, unknown> | null {
  try {
    return decodeJwt(token) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizeDomain(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v) return null;
  // Strip protocol/path if a user pasted a URL
  const m = v.match(/^(?:https?:\/\/)?([a-z0-9.-]+)/i);
  if (!m) return null;
  const host = m[1];
  // Very permissive domain check — must contain a dot and only domain chars
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host)) {
    return null;
  }
  return host;
}
