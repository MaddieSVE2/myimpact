import { Router, type IRouter } from "express";
import { db, orgSsoConfigsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { promises as dnsPromises } from "dns";
import { configuredProviders, isProviderConfigured, normalizeDomain, type SsoProvider } from "../lib/oidc.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { requireOrgManager } from "../lib/orgManager.js";

/**
 * Enterprise SSO configuration (manager-only), including the DNS check that
 * verifies a domain. Mounted at /org.
 */
const router: IRouter = Router();

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

export default router;
