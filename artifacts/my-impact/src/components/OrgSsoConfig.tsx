import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldCheck, AlertCircle, Trash2, Lock, ExternalLink, Plus } from "lucide-react";
import { DEMO_SSO_CONFIGS, DEMO_SSO_AVAILABLE_PROVIDERS } from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SsoConfig {
  id: string;
  provider: "google" | "microsoft";
  domain: string;
  tenantId: string | null;
  enforceSSO: boolean;
  status: "pending" | "verified" | "error";
  lastTestAt: string | null;
}

interface SsoConfigPayload {
  configs: SsoConfig[];
  availableProviders: Array<"google" | "microsoft">;
}

function useSsoConfigs(enabled = true) {
  return useQuery<SsoConfigPayload>({
    queryKey: ["org-sso-config"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/sso/config`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load SSO configs");
      return res.json();
    },
  });
}

function DemoSsoPanel() {
  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      data-testid="section-sso-demo"
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Single sign-on (SSO)</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Let staff sign in with their existing Google Workspace or Microsoft Entra account. New users will be auto-joined to your organisation.
      </p>
      <p className="mt-2 mb-3 text-[11px] font-semibold uppercase tracking-wider text-primary/80" data-testid="demo-data-hint-sso">
        Demo data, actions disabled
      </p>

      <div className="space-y-3 mb-3">
        {DEMO_SSO_CONFIGS.map((cfg) => (
          <div key={cfg.id} className="rounded-lg border border-border bg-white p-4" data-testid={`demo-sso-row-${cfg.id}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-foreground">{cfg.domain}</p>
                  <StatusPill status={cfg.status} />
                  {cfg.enforceSSO && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                      <Lock className="w-3 h-3" /> Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {cfg.provider === "google" ? "Google Workspace" : "Microsoft Entra"}
                  {cfg.tenantId && <span className="font-mono"> · tenant {cfg.tenantId.slice(0, 8)}…</span>}
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Demo data, actions disabled"
                className="text-xs text-muted-foreground inline-flex items-center gap-1 cursor-not-allowed opacity-60"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled
                title="Demo data, actions disabled"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground cursor-not-allowed opacity-60"
              >
                <ExternalLink className="w-3 h-3" /> Test sign-in
              </button>
              <label className="inline-flex items-center gap-2 ml-auto opacity-60">
                <input type="checkbox" checked={cfg.enforceSSO} disabled readOnly />
                <span className="text-xs text-foreground">Require SSO for this domain</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled
        title="Demo data, actions disabled"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground cursor-not-allowed opacity-60"
        data-testid="button-add-sso-demo"
      >
        <Plus className="w-3.5 h-3.5" /> Add SSO provider
      </button>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Available providers in this demo: {DEMO_SSO_AVAILABLE_PROVIDERS.map(p => p === "google" ? "Google Workspace" : "Microsoft Entra").join(" · ")}.
      </p>
    </motion.div>
  );
}

function StatusPill({ status }: { status: SsoConfig["status"] }) {
  const map = {
    verified: { label: "Verified", cls: "bg-green-50 text-green-700 border-green-200" },
    pending: { label: "Not yet tested", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    error: { label: "Test failed", cls: "bg-red-50 text-red-700 border-red-200" },
  } as const;
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function AddConfigForm({ availableProviders, onCancel, onSaved }: {
  availableProviders: Array<"google" | "microsoft">;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [provider, setProvider] = useState<"google" | "microsoft">(availableProviders[0] ?? "google");
  const [domain, setDomain] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [enforce, setEnforce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/org/sso/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider,
          domain: domain.trim(),
          tenantId: provider === "microsoft" ? tenantId.trim() : null,
          enforceSSO: enforce,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save SSO config");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-sso-config"] });
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (availableProviders.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">SSO providers aren't enabled on the platform yet.</p>
        <p className="text-xs">My Impact admins must register OAuth credentials with Google Workspace and/or Microsoft Entra before organisations can configure SSO.</p>
      </div>
    );
  }

  return (
    <motion.div
      className="rounded-lg border border-border bg-white p-4 space-y-3"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Provider</label>
        <div className="flex gap-2">
          {availableProviders.includes("google") && (
            <button
              type="button"
              onClick={() => setProvider("google")}
              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                provider === "google"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-foreground hover:border-primary/40"
              }`}
            >
              Google Workspace
            </button>
          )}
          {availableProviders.includes("microsoft") && (
            <button
              type="button"
              onClick={() => setProvider("microsoft")}
              className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                provider === "microsoft"
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-foreground hover:border-primary/40"
              }`}
            >
              Microsoft Entra
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Email domain
        </label>
        <input
          type="text"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setError(null); }}
          placeholder="e.g. acmecharity.org"
          className="bg-white w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          Users with email addresses on this domain can sign in via {provider === "google" ? "Google" : "Microsoft"}.
        </p>
      </div>

      {provider === "microsoft" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Microsoft Entra tenant ID
          </label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => { setTenantId(e.target.value); setError(null); }}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="bg-white w-full px-3 py-2 rounded-lg border border-border text-sm font-mono focus:outline-none focus:border-primary"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Find this in your Azure portal under Microsoft Entra ID → Overview → Tenant ID.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enforce}
          onChange={(e) => setEnforce(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs">
          <span className="font-medium text-foreground">Require SSO for this domain</span>
          <span className="block text-muted-foreground">
            Block magic-link sign-up for emails on this domain. We recommend enabling this only after you've successfully tested the sign-in.
          </span>
        </span>
      </label>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !domain.trim() || (provider === "microsoft" && !tenantId.trim())}
          className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save SSO config"}
        </button>
      </div>
    </motion.div>
  );
}

function ConfigRow({ cfg, providerAvailable, orgId }: { cfg: SsoConfig; providerAvailable: boolean; orgId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async (enforce: boolean) => {
      const res = await fetch(`${BASE}/api/org/sso/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: cfg.provider,
          domain: cfg.domain,
          tenantId: cfg.tenantId,
          enforceSSO: enforce,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-sso-config"] }),
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/org/sso/config/${cfg.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-sso-config"] }),
    onError: (err: Error) => setError(err.message),
  });

  function handleTest() {
    const params = new URLSearchParams({ orgId, provider: cfg.provider });
    window.location.href = `${BASE}/api/auth/sso/test/start?${params.toString()}`;
  }

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-foreground">{cfg.domain}</p>
            <StatusPill status={cfg.status} />
            {cfg.enforceSSO && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                <Lock className="w-3 h-3" /> Required
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {cfg.provider === "google" ? "Google Workspace" : "Microsoft Entra"}
            {cfg.tenantId && <span className="font-mono"> · tenant {cfg.tenantId.slice(0, 8)}…</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove SSO config for ${cfg.domain}? Users on this domain will revert to magic-link sign-in.`)) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="text-xs text-red-600 hover:text-red-700 transition-colors inline-flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Remove
        </button>
      </div>

      {!providerAvailable && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900 mb-3 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>The {cfg.provider === "google" ? "Google" : "Microsoft"} provider isn't enabled on the platform right now. Contact My Impact support.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={!providerAvailable}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
        >
          <ExternalLink className="w-3 h-3" /> Test sign-in
        </button>

        <label className="inline-flex items-center gap-2 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={cfg.enforceSSO}
            disabled={toggleMutation.isPending || !providerAvailable}
            onChange={(e) => {
              setError(null);
              if (e.target.checked && cfg.status !== "verified") {
                if (!window.confirm("This SSO config hasn't been tested yet. Enabling 'Require SSO' could lock people out. Continue anyway?")) {
                  return;
                }
              }
              toggleMutation.mutate(e.target.checked);
            }}
          />
          <span className="text-xs text-foreground">Require SSO for this domain</span>
        </label>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export function OrgSsoConfigPanel({ orgId, isDemoOrg = false }: { orgId: string; isDemoOrg?: boolean }) {
  const { data, isLoading, isError } = useSsoConfigs(!isDemoOrg);
  const [adding, setAdding] = useState(false);

  if (isDemoOrg) {
    return <DemoSsoPanel />;
  }

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Single sign-on (SSO)</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Let staff sign in with their existing Google Workspace or Microsoft Entra account. New users will be auto-joined to your organisation.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <div className="animate-spin w-5 h-5 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <p className="text-xs text-red-600">Failed to load SSO configuration. Please refresh the page.</p>
      ) : (
        <>
          {(data?.configs.length ?? 0) === 0 && !adding && (
            <p className="text-xs text-muted-foreground italic mb-3">No SSO providers configured yet.</p>
          )}

          <div className="space-y-3 mb-3">
            {data?.configs.map((c) => (
              <ConfigRow
                key={c.id}
                cfg={c}
                providerAvailable={data.availableProviders.includes(c.provider)}
                orgId={orgId}
              />
            ))}
          </div>

          {adding ? (
            <AddConfigForm
              availableProviders={data?.availableProviders ?? []}
              onCancel={() => setAdding(false)}
              onSaved={() => setAdding(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add SSO provider
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}
