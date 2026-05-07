import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Share2, Eye, X, Copy, Check, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface ShareLink {
  id: string;
  slug: string;
  scope: "all" | "summary" | "timeline" | "categories" | "regions";
  funderLabel: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}

const SCOPE_LABELS: Record<ShareLink["scope"], string> = {
  all: "Whole dashboard",
  summary: "Summary tiles only",
  timeline: "Impact over time only",
  categories: "Categories only",
  regions: "Regions only",
};

function shareUrl(slug: string): string {
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${origin}${base}/org/share/${slug}`;
}

export function CopyShareLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(shareUrl(slug)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
      data-testid={`button-copy-share-${slug}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function ShareLinkManager() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<ShareLink["scope"]>("all");
  const [funderLabel, setFunderLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreatedSlug, setJustCreatedSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ links: ShareLink[] }>({
    queryKey: ["org-share-links"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/share-links`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load share links");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/org/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scope,
          funderLabel: funderLabel.trim() || null,
          expiresAt: expiresAt || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create share link");
      return json as { link: ShareLink };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["org-share-links"] });
      setCreating(false);
      setScope("all");
      setFunderLabel("");
      setExpiresAt("");
      setCreateError(null);
      setJustCreatedSlug(data.link.slug);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/org/share-links/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Failed to revoke");
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["org-share-links"] }),
  });

  const links = data?.links ?? [];
  const active = links.filter(l => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt).getTime() > Date.now()));
  const inactive = links.filter(l => l.revokedAt || (l.expiresAt && new Date(l.expiresAt).getTime() <= Date.now()));

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Share with funder</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create a read-only, no-login link to share live dashboard data with a specific funder. Revoke any link instantly.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => { setCreating(true); setCreateError(null); setJustCreatedSlug(null); }}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-new-share-link"
          >
            <Share2 className="w-3.5 h-3.5" /> New share link
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Funder name (optional)</label>
            <input
              type="text"
              value={funderLabel}
              onChange={e => setFunderLabel(e.target.value.slice(0, 80))}
              placeholder="e.g. National Lottery Community Fund"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="input-funder-label"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">What to share</label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value as ShareLink["scope"])}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary"
                data-testid="select-scope"
              >
                {(Object.keys(SCOPE_LABELS) as ShareLink["scope"][]).map(k => (
                  <option key={k} value={k}>{SCOPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Expiry date (optional)</label>
              <input
                type="date"
                value={expiresAt}
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:border-primary"
                data-testid="input-expires-at"
              />
            </div>
          </div>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setCreating(false); setCreateError(null); }}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setCreateError(null); createMutation.mutate(); }}
              disabled={createMutation.isPending}
              className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
              data-testid="button-create-share-link"
            >
              {createMutation.isPending ? "Creating…" : "Create link"}
            </button>
          </div>
        </div>
      )}

      {justCreatedSlug && !creating && (
        <div className="mt-4 p-3 rounded-lg border border-green-200 bg-green-50 text-xs text-green-800 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">Link ready to share</p>
            <p className="font-mono break-all mt-1 text-green-900">{shareUrl(justCreatedSlug)}</p>
          </div>
          <button onClick={() => setJustCreatedSlug(null)} className="shrink-0 p-1 hover:bg-green-100 rounded" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <div className="animate-spin w-5 h-5 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : links.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No share links yet. Create one to share a snapshot with a funder.</p>
        ) : (
          <div className="space-y-2">
            {[...active, ...inactive].map(link => {
              const isRevoked = !!link.revokedAt;
              const isExpired = !isRevoked && !!link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
              const inactiveLink = isRevoked || isExpired;
              return (
                <div
                  key={link.id}
                  className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${inactiveLink ? "border-border bg-muted/20" : "border-border bg-white"}`}
                  data-testid={`share-link-${link.slug}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {link.funderLabel || "Unnamed funder"}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${inactiveLink ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                        {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {SCOPE_LABELS[link.scope]} · {link.expiresAt ? `expires ${new Date(link.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "no expiry"}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {link.viewCount} {link.viewCount === 1 ? "view" : "views"}
                      </span>
                      {!inactiveLink && <CopyShareLinkButton slug={link.slug} />}
                    </div>
                  </div>
                  {!inactiveLink && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Revoke this share link${link.funderLabel ? ` for ${link.funderLabel}` : ""}? Anyone with the link will lose access immediately.`)) {
                          revokeMutation.mutate(link.id);
                        }
                      }}
                      disabled={revokeMutation.isPending}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-60"
                      data-testid={`button-revoke-${link.slug}`}
                    >
                      <X className="w-3 h-3" /> Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {revokeMutation.isError && (
          <p className="mt-2 text-xs text-red-600 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Could not revoke that link. Please try again.
          </p>
        )}
      </div>
    </motion.div>
  );
}
