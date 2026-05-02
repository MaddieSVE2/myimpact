import { Router, type IRouter, type Response } from "express";
import { db, orgApiKeysTable, orgWebhooksTable, orgMembersTable, webhookDeliveriesTable } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID, randomBytes } from "crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { generateApiKey } from "../lib/orgApiKey.js";
import { SUPPORTED_EVENTS, type WebhookEvent } from "../lib/webhookDispatcher.js";

const router: IRouter = Router();

const ALLOWED_SCOPES = ["hours.write", "members.read", "stats.read"] as const;
type Scope = (typeof ALLOWED_SCOPES)[number];

async function requireOrgManager(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const membership = await db.query.orgMembersTable.findFirst({
    where: eq(orgMembersTable.userId, userId),
  });
  if (!membership) {
    res.status(404).json({ error: "You are not a member of any organisation." });
    return null;
  }
  if (membership.role !== "manager") {
    res.status(403).json({ error: "Only organisation managers can manage developer settings." });
    return null;
  }
  return membership;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

router.get("/api-keys", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;
  const rows = await db.query.orgApiKeysTable.findMany({
    where: eq(orgApiKeysTable.orgId, m.orgId),
    orderBy: (t) => [desc(t.createdAt)],
  });
  res.json({
    keys: rows.map(k => ({
      id: k.id,
      label: k.label,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
});

router.post("/api-keys", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;

  const labelRaw = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  if (!labelRaw || labelRaw.length > 80) {
    res.status(400).json({ error: "label is required and must be 1–80 characters." });
    return;
  }

  let scopes: Scope[] = ["hours.write", "members.read", "stats.read"];
  if (Array.isArray(req.body?.scopes)) {
    const provided = req.body.scopes.filter((s: unknown): s is string => typeof s === "string");
    const invalid = provided.filter((s: string) => !ALLOWED_SCOPES.includes(s as Scope));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Unknown scope(s): ${invalid.join(", ")}. Allowed: ${ALLOWED_SCOPES.join(", ")}.` });
      return;
    }
    if (provided.length === 0) {
      res.status(400).json({ error: "At least one scope is required." });
      return;
    }
    scopes = provided as Scope[];
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const id = randomUUID();
  await db.insert(orgApiKeysTable).values({
    id,
    orgId: m.orgId,
    label: labelRaw,
    keyHash,
    keyPrefix,
    scopes,
    createdBy: req.user!.id,
  });

  // Return the raw key ONCE. The UI must show it and warn the user to copy it.
  res.status(201).json({
    id,
    label: labelRaw,
    keyPrefix,
    scopes,
    rawKey,
    createdAt: new Date().toISOString(),
  });
});

router.post("/api-keys/:id/revoke", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;
  const id = req.params.id as string;

  const existing = await db.query.orgApiKeysTable.findFirst({
    where: and(eq(orgApiKeysTable.id, id), eq(orgApiKeysTable.orgId, m.orgId)),
  });
  if (!existing) {
    res.status(404).json({ error: "API key not found." });
    return;
  }
  if (existing.revokedAt) {
    res.json({ ok: true, alreadyRevoked: true });
    return;
  }
  await db.update(orgApiKeysTable).set({ revokedAt: new Date() }).where(eq(orgApiKeysTable.id, id));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function isHttpsOrLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

function parseEvents(raw: unknown): WebhookEvent[] | null {
  if (!Array.isArray(raw)) return null;
  const out: WebhookEvent[] = [];
  for (const v of raw) {
    if (typeof v !== "string") return null;
    if (v === "*" || SUPPORTED_EVENTS.includes(v as WebhookEvent)) {
      out.push(v as WebhookEvent);
    } else {
      return null;
    }
  }
  return out;
}

router.get("/webhooks", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;
  const rows = await db.query.orgWebhooksTable.findMany({
    where: eq(orgWebhooksTable.orgId, m.orgId),
    orderBy: (t) => [desc(t.createdAt)],
  });
  res.json({
    webhooks: rows.map(w => ({
      id: w.id,
      url: w.url,
      events: w.events,
      enabled: w.enabled,
      deadAt: w.deadAt ? w.deadAt.toISOString() : null,
      lastSuccessAt: w.lastSuccessAt ? w.lastSuccessAt.toISOString() : null,
      lastFailureAt: w.lastFailureAt ? w.lastFailureAt.toISOString() : null,
      lastError: w.lastError,
      createdAt: w.createdAt.toISOString(),
      // Show first 6 chars of secret for identification — full secret was
      // shown once at creation time.
      secretPrefix: w.secret.slice(0, 6) + "…",
    })),
    supportedEvents: SUPPORTED_EVENTS,
  });
});

router.post("/webhooks", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;

  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url || !isHttpsOrLocalhost(url) || url.length > 500) {
    res.status(400).json({ error: "url is required and must be an https URL (or http://localhost for testing)." });
    return;
  }

  const events = parseEvents(req.body?.events);
  if (!events || events.length === 0) {
    res.status(400).json({
      error: `events must be a non-empty array of supported event names. Allowed: ${SUPPORTED_EVENTS.join(", ")} or '*'.`,
    });
    return;
  }

  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const id = randomUUID();
  await db.insert(orgWebhooksTable).values({
    id,
    orgId: m.orgId,
    url,
    secret,
    events,
    enabled: true,
    createdBy: req.user!.id,
  });

  res.status(201).json({
    id,
    url,
    events,
    enabled: true,
    secret,
    createdAt: new Date().toISOString(),
  });
});

router.delete("/webhooks/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;
  const id = req.params.id as string;
  const existing = await db.query.orgWebhooksTable.findFirst({
    where: and(eq(orgWebhooksTable.id, id), eq(orgWebhooksTable.orgId, m.orgId)),
  });
  if (!existing) {
    res.status(404).json({ error: "Webhook not found." });
    return;
  }
  await db.delete(orgWebhooksTable).where(eq(orgWebhooksTable.id, id));
  res.json({ ok: true });
});

router.get("/webhooks/:id/deliveries", authenticate, async (req: AuthenticatedRequest, res) => {
  const m = await requireOrgManager(req, res);
  if (!m) return;
  const id = req.params.id as string;
  const wh = await db.query.orgWebhooksTable.findFirst({
    where: and(eq(orgWebhooksTable.id, id), eq(orgWebhooksTable.orgId, m.orgId)),
  });
  if (!wh) { res.status(404).json({ error: "Webhook not found." }); return; }
  const deliveries = await db.query.webhookDeliveriesTable.findMany({
    where: eq(webhookDeliveriesTable.webhookId, id),
    orderBy: (t) => [desc(t.createdAt)],
    limit: 25,
  });
  res.json({
    deliveries: deliveries.map(d => ({
      id: d.id,
      eventType: d.eventType,
      status: d.status,
      attempts: d.attempts,
      lastResponseStatus: d.lastResponseStatus,
      lastError: d.lastError,
      createdAt: d.createdAt.toISOString(),
      lastAttemptAt: d.lastAttemptAt ? d.lastAttemptAt.toISOString() : null,
      deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
    })),
  });
});

// Mark `isNull` as used (silence linter).
void isNull;

export default router;
