import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgeCheck, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import EvidenceLightbox, { type EvidenceLightboxData } from "@/components/EvidenceLightbox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PendingVerificationEvidence {
  id: number;
  url: string;
  mimeType: string;
}

export interface PendingVerification {
  recordId: number;
  memberName: string;
  memberEmail: string | null;
  name: string;
  period: string | null;
  totalHours: number;
  totalValue: number;
  createdAt: string;
  evidence?: PendingVerificationEvidence[];
}

export function usePendingVerifications(enabled: boolean) {
  return useQuery<{ pending: PendingVerification[] }>({
    queryKey: ["org-pending-verifications"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/verifications/pending`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pending verifications");
      return res.json();
    },
  });
}

/**
 * Lightweight pending-approvals count for navigation badges. Only enable
 * for organisation managers — the endpoint 403s for everyone else.
 */
export function usePendingApprovalsCount(enabled: boolean) {
  return useQuery<{ count: number }>({
    queryKey: ["org-pending-approvals-count"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/verifications/pending-count`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pending count");
      return res.json();
    },
  });
}

export function VerificationQueue({ orgName }: { orgName: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = usePendingVerifications(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [lightbox, setLightbox] = useState<EvidenceLightboxData | null>(null);

  function invalidateAfterDecision() {
    queryClient.invalidateQueries({ queryKey: ["org-pending-verifications"] });
    queryClient.invalidateQueries({ queryKey: ["org-pending-approvals-count"] });
    queryClient.invalidateQueries({ queryKey: ["org-stats"] });
  }

  const decideMutation = useMutation({
    mutationFn: async (vars: { recordId: number; decision: "approve" | "reject"; reason?: string }) => {
      const res = await fetch(`${BASE}/api/org/verifications/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Failed to record decision");
      }
      return res.json();
    },
    onSuccess: invalidateAfterDecision,
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (recordIds: number[]) => {
      const res = await fetch(`${BASE}/api/org/verifications/bulk-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ recordIds }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Bulk approve failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSelected(new Set());
      invalidateAfterDecision();
    },
  });

  const pending = data?.pending ?? [];

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(p => p.recordId)));
  }

  function startReject(id: number) {
    setRejectingId(id);
    setRejectReason("");
  }

  function confirmReject() {
    if (rejectingId == null) return;
    decideMutation.mutate({ recordId: rejectingId, decision: "reject", reason: rejectReason.trim() || undefined });
    setRejectingId(null);
    setRejectReason("");
  }

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="verification-queue"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Pending verification</h3>
            {pending.length > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold tabular-nums"
                data-testid="pending-approvals-count"
              >
                {pending.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Review and confirm hours logged by {orgName} members. Verified hours appear with a chip on members&apos; profiles and feed into funder reports.
          </p>
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => bulkApproveMutation.mutate(Array.from(selected))}
            disabled={bulkApproveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {bulkApproveMutation.isPending ? "Approving…" : `Approve ${selected.size} selected`}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 flex justify-center">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <p className="text-xs text-red-600">Could not load the queue. Please refresh.</p>
      ) : pending.length === 0 ? (
        <div className="py-8 text-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">All caught up</p>
          <p className="text-xs text-muted-foreground">No member hours waiting for verification.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <input
              type="checkbox"
              checked={selected.size === pending.length && pending.length > 0}
              onChange={toggleAll}
              className="w-3.5 h-3.5"
              aria-label="Select all pending records"
            />
            <span className="flex-1">Member &amp; record</span>
            <span className="w-16 text-right">Hours</span>
            <span className="w-20 text-right">Value</span>
            <span className="w-44" />
          </div>
          <ul className="divide-y divide-border">
            {pending.map(p => (
              <li key={p.recordId} className="px-3 py-2.5 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(p.recordId)}
                  onChange={() => toggle(p.recordId)}
                  className="w-3.5 h-3.5"
                  aria-label={`Select ${p.memberName}'s record`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{p.memberName}</span>
                    <span className="text-muted-foreground"> · {p.period || p.name}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Logged {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {(p.evidence?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1" data-testid={`pending-evidence-${p.recordId}`}>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Evidence</span>
                      {p.evidence!.map(ev => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setLightbox({
                            url: `${BASE}${ev.url}`,
                            memberName: p.memberName,
                            activityLabel: p.period || p.name,
                            dateLabel: new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
                          })}
                          className="block w-9 h-9 rounded-md border border-border overflow-hidden hover:ring-2 hover:ring-primary/40 transition-shadow cursor-pointer"
                          title="View evidence photo"
                          data-testid={`pending-evidence-thumb-${ev.id}`}
                        >
                          <img
                            src={`${BASE}${ev.url}`}
                            alt={`Evidence photo from ${p.memberName}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="w-16 text-right text-xs text-foreground tabular-nums">{p.totalHours}</span>
                <span className="w-20 text-right text-xs font-semibold text-foreground tabular-nums">{formatCurrency(p.totalValue)}</span>
                {rejectingId === p.recordId ? (
                  <div className="w-44 flex items-center gap-1">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="bg-white flex-1 text-xs px-2 py-1 border border-border rounded focus:outline-none focus:border-primary"
                    />
                    <button onClick={confirmReject} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label="Confirm reject">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setRejectingId(null)} className="p-1 text-muted-foreground hover:bg-muted/30 rounded" aria-label="Cancel">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-44 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => decideMutation.mutate({ recordId: p.recordId, decision: "approve" })}
                      disabled={decideMutation.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold transition-colors disabled:opacity-60"
                      data-testid={`approve-record-${p.recordId}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => startReject(p.recordId)}
                      disabled={decideMutation.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors disabled:opacity-60"
                      data-testid={`reject-record-${p.recordId}`}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {decideMutation.isError && (
        <p className="text-xs text-red-600 mt-2">{(decideMutation.error as Error).message}</p>
      )}
      <EvidenceLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </motion.div>
  );
}
