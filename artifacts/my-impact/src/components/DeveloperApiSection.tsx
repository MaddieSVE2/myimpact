import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Code2, Plus, Trash2, Webhook, ChevronDown, Check, Copy } from "lucide-react";
import { DEMO_API_KEYS, DEMO_WEBHOOKS, DEMO_SUPPORTED_WEBHOOK_EVENTS } from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  deadAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  createdAt: string;
  secretPrefix: string;
}

function CopyableCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs font-mono bg-muted/30 border border-border rounded px-2 py-1.5 break-all">{value}</code>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded border border-border text-xs hover:bg-muted/30 transition-colors"
        aria-label={label ? `Copy ${label}` : "Copy"}
      >
        {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function DeveloperApiSection({ isDemoOrg = false }: { isDemoOrg?: boolean } = {}) {
  if (isDemoOrg) return <DemoDeveloperApiSection />;
  return <LiveDeveloperApiSection />;
}

function DemoDeveloperApiSection() {
  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      data-testid="section-developer-demo"
    >
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Developer API & webhooks</h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Push attested hours from your HR/volunteering system, pull aggregated stats, or receive real-time events when members log hours.
          </p>
        </div>
      </div>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-primary/80" data-testid="demo-data-hint-developer">
        Demo data, actions disabled
      </p>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">API keys</h4>
          <button
            type="button"
            disabled
            title="Demo data, actions disabled"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-xs font-medium text-muted-foreground cursor-not-allowed opacity-60"
          >
            <Plus className="w-3 h-3" /> New key
          </button>
        </div>
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {DEMO_API_KEYS.map(k => (
            <li key={k.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs" data-testid={`demo-api-key-${k.id}`}>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate">{k.label}</p>
                <p className="font-mono text-muted-foreground">{k.keyPrefix}…</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Scopes: {k.scopes.join(", ")} · Created {new Date(k.createdAt).toLocaleDateString("en-GB")}
                  {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}`}
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Demo data, actions disabled"
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] text-muted-foreground cursor-not-allowed opacity-60"
              >
                <Trash2 className="w-3 h-3" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Webhook className="w-3.5 h-3.5" /> Webhooks
          </h4>
          <button
            type="button"
            disabled
            title="Demo data, actions disabled"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-xs font-medium text-muted-foreground cursor-not-allowed opacity-60"
          >
            <Plus className="w-3 h-3" /> Add webhook
          </button>
        </div>
        <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {DEMO_WEBHOOKS.map(w => (
            <li key={w.id} className="px-3 py-2.5 flex items-start justify-between gap-3 text-xs" data-testid={`demo-webhook-${w.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-foreground break-all">{w.url}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Events: {w.events.join(", ")}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {w.lastSuccessAt ? `Last delivered ${new Date(w.lastSuccessAt).toLocaleString("en-GB")}` : "No deliveries yet"}
                  {w.lastError && <span className="text-amber-700"> · last failure: {w.lastError}</span>}
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Demo data, actions disabled"
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] text-muted-foreground cursor-not-allowed opacity-60"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Supported events: {DEMO_SUPPORTED_WEBHOOK_EVENTS.map(e => <code key={e} className="font-mono bg-muted/30 px-1 rounded mr-1">{e}</code>)}
        </p>
      </section>
    </motion.div>
  );
}

function LiveDeveloperApiSection() {
  const queryClient = useQueryClient();
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<{ rawKey: string; label: string } | null>(null);

  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["member.joined", "hours.logged", "hours.attested", "milestone.earned"]);
  const [revealedSecret, setRevealedSecret] = useState<{ secret: string; url: string } | null>(null);

  const keysQuery = useQuery<{ keys: ApiKey[] }>({
    queryKey: ["org-api-keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/api-keys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load API keys");
      return res.json();
    },
  });

  const webhooksQuery = useQuery<{ webhooks: WebhookEntry[]; supportedEvents: string[] }>({
    queryKey: ["org-webhooks"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/webhooks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load webhooks");
      return res.json();
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await fetch(`${BASE}/api/org/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create key");
      return data as { id: string; label: string; rawKey: string };
    },
    onSuccess: (data) => {
      setRevealedKey({ rawKey: data.rawKey, label: data.label });
      setNewKeyLabel("");
      setShowCreateKey(false);
      queryClient.invalidateQueries({ queryKey: ["org-api-keys"] });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/org/api-keys/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to revoke key");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-api-keys"] }),
  });

  const createWebhookMutation = useMutation({
    mutationFn: async ({ url, events }: { url: string; events: string[] }) => {
      const res = await fetch(`${BASE}/api/org/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url, events }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create webhook");
      return data as { id: string; url: string; events: string[]; secret: string };
    },
    onSuccess: (data) => {
      setRevealedSecret({ secret: data.secret, url: data.url });
      setWebhookUrl("");
      setShowAddWebhook(false);
      queryClient.invalidateQueries({ queryKey: ["org-webhooks"] });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/org/webhooks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to delete webhook");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-webhooks"] }),
  });

  const supportedEvents = webhooksQuery.data?.supportedEvents ?? [
    "member.joined", "hours.logged", "hours.attested", "hours.verified", "milestone.earned",
  ];

  function toggleEvent(ev: string) {
    setWebhookEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  }

  const keys = keysQuery.data?.keys ?? [];
  const webhooks = webhooksQuery.data?.webhooks ?? [];

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Developer API & webhooks</h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-xl">
            Push attested hours from your HR/volunteering system, pull aggregated stats, or receive real-time events when members log hours.
          </p>
        </div>
      </div>

      {/* === API KEYS === */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">API keys</h4>
          {!showCreateKey && (
            <button
              type="button"
              onClick={() => setShowCreateKey(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-xs font-medium hover:bg-muted/30"
            >
              <Plus className="w-3 h-3" /> New key
            </button>
          )}
        </div>

        {showCreateKey && (
          <div className="border border-border rounded-lg p-3 mb-3 bg-muted/10">
            <label className="block text-xs font-medium text-foreground mb-1">Key label</label>
            <input
              type="text"
              value={newKeyLabel}
              onChange={e => setNewKeyLabel(e.target.value)}
              placeholder="e.g. Workday integration"
              maxLength={80}
              className="w-full px-2.5 py-1.5 rounded border border-border text-xs bg-white focus:outline-none focus:border-primary mb-2"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowCreateKey(false); setNewKeyLabel(""); }}
                className="px-2.5 py-1 rounded border border-border text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { if (newKeyLabel.trim()) createKeyMutation.mutate(newKeyLabel.trim()); }}
                disabled={!newKeyLabel.trim() || createKeyMutation.isPending}
                className="px-2.5 py-1 rounded bg-primary text-white text-xs font-semibold disabled:opacity-50"
              >
                {createKeyMutation.isPending ? "Creating…" : "Create key"}
              </button>
            </div>
            {createKeyMutation.error && (
              <p className="text-xs text-red-600 mt-2">{(createKeyMutation.error as Error).message}</p>
            )}
          </div>
        )}

        {revealedKey && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-amber-900 mb-1">Copy your new key now</p>
            <p className="text-xs text-amber-800 mb-2">
              This is the only time you'll see <strong>{revealedKey.label}</strong>. Store it somewhere secret, you won't be able to retrieve it again.
            </p>
            <CopyableCode value={revealedKey.rawKey} label="API key" />
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="text-xs font-medium text-amber-900 hover:underline"
              >
                I've copied it, dismiss
              </button>
            </div>
          </div>
        )}

        {keysQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading keys…</p>
        ) : keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">No API keys yet. Create one to start pushing data into My Impact.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {keys.map(k => (
              <li key={k.id} className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{k.label}</p>
                  <p className="font-mono text-muted-foreground">{k.keyPrefix}…</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Scopes: {k.scopes.join(", ")} · Created {new Date(k.createdAt).toLocaleDateString("en-GB")}
                    {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}`}
                  </p>
                </div>
                {k.revokedAt ? (
                  <span className="shrink-0 px-2 py-1 rounded bg-muted text-muted-foreground text-[11px]">Revoked</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Revoke key '${k.label}'? Any integration using it will stop working immediately.`)) revokeKeyMutation.mutate(k.id); }}
                    disabled={revokeKeyMutation.isPending}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" /> Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* === WEBHOOKS === */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Webhook className="w-3.5 h-3.5" /> Webhooks
          </h4>
          {!showAddWebhook && (
            <button
              type="button"
              onClick={() => setShowAddWebhook(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border text-xs font-medium hover:bg-muted/30"
            >
              <Plus className="w-3 h-3" /> Add webhook
            </button>
          )}
        </div>

        {showAddWebhook && (
          <div className="border border-border rounded-lg p-3 mb-3 bg-muted/10">
            <label className="block text-xs font-medium text-foreground mb-1">Endpoint URL (https)</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.example.com/myimpact"
              className="w-full px-2.5 py-1.5 rounded border border-border text-xs bg-white focus:outline-none focus:border-primary mb-2"
            />
            <p className="text-xs font-medium text-foreground mb-1">Events to subscribe</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {supportedEvents.map(ev => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors ${webhookEvents.includes(ev) ? "bg-primary text-white border-primary" : "bg-white text-muted-foreground border-border"}`}
                >
                  {ev}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowAddWebhook(false); setWebhookUrl(""); }}
                className="px-2.5 py-1 rounded border border-border text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createWebhookMutation.mutate({ url: webhookUrl.trim(), events: webhookEvents })}
                disabled={!webhookUrl.trim() || webhookEvents.length === 0 || createWebhookMutation.isPending}
                className="px-2.5 py-1 rounded bg-primary text-white text-xs font-semibold disabled:opacity-50"
              >
                {createWebhookMutation.isPending ? "Creating…" : "Create webhook"}
              </button>
            </div>
            {createWebhookMutation.error && (
              <p className="text-xs text-red-600 mt-2">{(createWebhookMutation.error as Error).message}</p>
            )}
          </div>
        )}

        {revealedSecret && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-amber-900 mb-1">Save this signing secret now</p>
            <p className="text-xs text-amber-800 mb-2">
              Use this to verify the HMAC-SHA256 signature on every delivery to <strong>{revealedSecret.url}</strong>. You won't be able to view it again.
            </p>
            <CopyableCode value={revealedSecret.secret} label="Signing secret" />
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="text-xs font-medium text-amber-900 hover:underline"
              >
                I've copied it, dismiss
              </button>
            </div>
          </div>
        )}

        {webhooksQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading webhooks…</p>
        ) : webhooks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No webhooks configured. Add one to receive real-time events.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {webhooks.map(w => (
              <li key={w.id} className="px-3 py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-foreground break-all">{w.url}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Events: {w.events.join(", ")}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {w.deadAt
                      ? <span className="text-red-600 font-semibold">Disabled (24h retries exhausted{w.lastError ? `: ${w.lastError}` : ""})</span>
                      : w.lastSuccessAt
                        ? `Last delivered ${new Date(w.lastSuccessAt).toLocaleString("en-GB")}`
                        : "No deliveries yet"
                    }
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { if (confirm("Delete this webhook?")) deleteWebhookMutation.mutate(w.id); }}
                  disabled={deleteWebhookMutation.isPending}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* === DOCS === */}
      <details className="border border-border rounded-lg">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/20 flex items-center justify-between">
          <span>API & webhook documentation</span>
          <ChevronDown className="w-3 h-3 transition-transform" />
        </summary>
        <div className="px-4 py-3 text-xs text-foreground space-y-4">
          <div>
            <p className="font-semibold mb-1">Authentication</p>
            <p className="text-muted-foreground mb-1.5">All endpoints require a Bearer token in the <code className="font-mono bg-muted/30 px-1">Authorization</code> header. Each key is rate-limited to 120 requests/min.</p>
            <CopyableCode value={`curl -H "Authorization: Bearer mi_orgk_…" \\
  https://app.myimpact.uk/api/v1/org/me`} />
          </div>

          <div>
            <p className="font-semibold mb-1">GET /api/v1/org/me</p>
            <p className="text-muted-foreground">Returns metadata for the org the key belongs to.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">GET /api/v1/org/members</p>
            <p className="text-muted-foreground mb-1">Lists members. Anonymised by default; pass <code className="font-mono bg-muted/30 px-1">?reveal=email</code> to receive emails (requires <code>members.read</code> scope).</p>
          </div>

          <div>
            <p className="font-semibold mb-1">GET /api/v1/org/stats?from=YYYY-MM-DD&amp;to=YYYY-MM-DD</p>
            <p className="text-muted-foreground">Aggregate totals (social value, hours, donations, value-by-category) for the optional date range.</p>
          </div>

          <div>
            <p className="font-semibold mb-1">POST /api/v1/org/hours</p>
            <p className="text-muted-foreground mb-1.5">
              Push attested hours on behalf of a member. Records created via this endpoint are flagged <strong>attested</strong> and skip the user-side verification queue.
            </p>
            <CopyableCode value={`curl -X POST https://app.myimpact.uk/api/v1/org/hours \\
  -H "Authorization: Bearer mi_orgk_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "memberEmail": "alex@example.com",
    "hours": 4,
    "occurredAt": "2026-04-12T10:00:00Z",
    "category": "Education",
    "activityName": "Reading mentor session",
    "valuePerHourGBP": 17,
    "externalRef": "shift-12345"
  }'`} />
          </div>

          <div>
            <p className="font-semibold mb-1">Webhook events</p>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li><code className="font-mono">member.joined</code>: a user joined your org</li>
              <li><code className="font-mono">hours.logged</code>: a member logged hours via the app</li>
              <li><code className="font-mono">hours.attested</code>: hours pushed via your API key</li>
              <li><code className="font-mono">hours.verified</code>: hours marked verified</li>
              <li><code className="font-mono">milestone.earned</code>: member earned a milestone</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold mb-1">Verifying webhook signatures</p>
            <p className="text-muted-foreground mb-1.5">
              Every delivery includes an <code className="font-mono bg-muted/30 px-1">X-MyImpact-Signature</code> header in the form
              <code className="font-mono bg-muted/30 px-1">t=&lt;ts&gt;,v1=&lt;hex&gt;</code>. Compute
              <code className="font-mono bg-muted/30 px-1">HMAC-SHA256(secret, "&lt;ts&gt;." + body)</code> and compare in constant time.
            </p>
            <CopyableCode value={`# Node.js example
const { createHmac, timingSafeEqual } = require("crypto");
const raw = req.rawBody.toString();
const sig = req.header("X-MyImpact-Signature") || "";
const [tPart, vPart] = sig.split(",");
const ts = tPart.split("=")[1];
const expected = createHmac("sha256", SECRET).update(\`\${ts}.\${raw}\`).digest("hex");
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(vPart.split("=")[1]))) {
  return res.status(400).send("bad signature");
}`} />
          </div>

          <div>
            <p className="font-semibold mb-1">Retries</p>
            <p className="text-muted-foreground">
              Non-2xx responses (or timeouts &gt;10s) are retried with exponential backoff (1m, 2m, 4m, 8m, 16m, 32m, capped at 60m) for up to 24h. After that the webhook is automatically disabled and a "dead" status is shown above.
            </p>
          </div>
        </div>
      </details>
    </motion.div>
  );
}
