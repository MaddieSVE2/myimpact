import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgeCheck, CheckCircle2, XCircle, ShieldCheck, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import EvidenceLightbox, { type EvidenceLightboxData } from "@/components/EvidenceLightbox";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PendingVerificationEvidence {
  id: number;
  url: string;
  mimeType: string;
}

export interface PendingVerificationLine {
  activityName: string;
  category: string | null;
  title: string | null;
  detail: string | null;
  hours: number;
  quantity: number;
  valuePerUnit: number;
  unitLabel: string;
  value: number;
}

export interface PendingVerificationValueBreakdown {
  impact: number;
  contribution: number;
  donations: number;
  personalDevelopment: number;
}

export type PendingVerificationSource = "member-submitted" | "org-attested" | "shared";

export interface PendingVerification {
  recordId: number;
  memberName: string;
  memberEmail: string | null;
  name: string;
  period: string | null;
  totalHours: number;
  totalValue: number;
  createdAt: string;
  entryDate?: string | null;
  // Present for report shares: the report's period range replaces a single
  // activity date.
  reportPeriod?: { start: string; end: string; type: string | null } | null;
  sourceReportId?: number | null;
  note?: string | null;
  source?: PendingVerificationSource;
  activityCount?: number;
  lines?: PendingVerificationLine[];
  valueBreakdown?: PendingVerificationValueBreakdown;
  evidence?: PendingVerificationEvidence[];
}

const SOURCE_LABELS: Record<PendingVerificationSource, string> = {
  "member-submitted": "Member-submitted",
  "org-attested": "Org-attested",
  "shared": "Shared from personal log",
};

const SOURCE_BADGE_CLASSES: Record<PendingVerificationSource, string> = {
  "member-submitted": "bg-blue-50 text-blue-700 border border-blue-200",
  "org-attested": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "shared": "bg-amber-50 text-amber-700 border border-amber-200",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// e.g. "Volunteering · Mentoring — 2 activities"
function summaryLine(p: PendingVerification): string | null {
  const lines = p.lines ?? [];
  if (lines.length === 0) return null;
  const names = Array.from(new Set(lines.map(l => l.activityName))).slice(0, 2);
  const suffix = lines.length > 1 ? ` — ${lines.length} activities` : "";
  const more = new Set(lines.map(l => l.activityName)).size > 2 ? "…" : "";
  return `${names.join(" · ")}${more}${suffix}`;
}

function lineFormula(l: PendingVerificationLine): string {
  if (l.valuePerUnit <= 0) return "No standard rate";
  const rate = l.valuePerUnit % 1 === 0 ? `£${l.valuePerUnit.toFixed(0)}` : `£${l.valuePerUnit.toFixed(2)}`;
  const unit = l.unitLabel.toLowerCase();
  const isHourBased = unit.includes("hr") || unit.includes("hour");
  const qty = isHourBased ? l.hours : l.quantity;
  return `${qty.toLocaleString("en-GB")} ${isHourBased ? "hrs" : l.unitLabel} × ${rate}${isHourBased ? "/hr" : ""}`;
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

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
            <h3 className="text-sm font-semibold text-foreground">Organisation approvals</h3>
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
            Review and confirm submissions by {orgName} members. Approved submissions appear with a chip on members&apos; profiles and feed into funder reports.
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
            {bulkApproveMutation.isPending ? "Approving…" : `Approve ${selected.size} selected submissions`}
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
            {pending.map(p => {
              const isOpen = expanded.has(p.recordId);
              const summary = summaryLine(p);
              const loggedLabel = formatDate(p.createdAt);
              const activityLabel = p.period || p.name;
              const vb = p.valueBreakdown;
              const breakdownParts = vb
                ? ([
                    { label: "Impact", value: vb.impact },
                    { label: "Contribution", value: vb.contribution },
                    { label: "Donations", value: vb.donations },
                    { label: "Personal development", value: vb.personalDevelopment },
                  ].filter(x => x.value > 0))
                : [];
              const rejectControls = rejectingId === p.recordId ? (
                <div className="w-full sm:w-44 flex items-center gap-1">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="bg-white flex-1 min-w-0 text-xs px-2 py-1 border border-border rounded focus:outline-none focus:border-primary"
                  />
                  <button onClick={confirmReject} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label="Confirm reject">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setRejectingId(null)} className="p-1 text-muted-foreground hover:bg-muted/30 rounded" aria-label="Cancel">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => decideMutation.mutate({ recordId: p.recordId, decision: "approve" })}
                    disabled={decideMutation.isPending}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold transition-colors disabled:opacity-60"
                    data-testid={`approve-record-${p.recordId}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve submission
                  </button>
                  <button
                    type="button"
                    onClick={() => startReject(p.recordId)}
                    disabled={decideMutation.isPending}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors disabled:opacity-60"
                    data-testid={`reject-record-${p.recordId}`}
                  >
                    <XCircle className="w-3.5 h-3.5" /> Decline submission
                  </button>
                </div>
              );
              return (
                <li key={p.recordId} className="px-3 py-2.5 text-sm" data-testid={`pending-row-${p.recordId}`}>
                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    <input
                      type="checkbox"
                      checked={selected.has(p.recordId)}
                      onChange={() => toggle(p.recordId)}
                      className="w-3.5 h-3.5"
                      aria-label={`Select ${p.memberName}'s record`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpand(p.recordId)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                      aria-expanded={isOpen}
                      data-testid={`expand-record-${p.recordId}`}
                    >
                      <p className="text-sm text-foreground truncate">
                        <span className="font-medium">{p.memberName}</span>
                        <span className="text-muted-foreground"> · {activityLabel}</span>
                      </p>
                      {summary && (
                        <p className="text-[11px] text-foreground/80 truncate" data-testid={`pending-summary-${p.recordId}`}>
                          {summary}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Logged {loggedLabel}
                        {(p.evidence?.length ?? 0) > 0 && <span> · {p.evidence!.length} evidence photo{p.evidence!.length === 1 ? "" : "s"}</span>}
                      </p>
                    </button>
                    <span className="w-16 text-right text-xs text-foreground tabular-nums">{p.totalHours}</span>
                    <span className="w-20 text-right text-xs font-semibold text-foreground tabular-nums">{formatCurrency(p.totalValue)}</span>
                    <div className="w-full sm:w-auto flex items-center justify-end gap-1.5 order-last sm:order-none">
                      {rejectControls}
                      <button
                        type="button"
                        onClick={() => toggleExpand(p.recordId)}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground"
                        aria-label={isOpen ? "Hide details" : "Show details"}
                        aria-expanded={isOpen}
                        data-testid={`toggle-details-${p.recordId}`}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-2 ml-6 pl-3 border-l-2 border-primary/20 space-y-3" data-testid={`pending-detail-${p.recordId}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {p.source && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SOURCE_BADGE_CLASSES[p.source]}`}>
                            {SOURCE_LABELS[p.source]}
                          </span>
                        )}
                        {p.reportPeriod ? (
                          <span data-testid={`pending-report-period-${p.recordId}`}>
                            Reporting period: <span className="text-foreground">{formatDate(p.reportPeriod.start)} – {formatDate(p.reportPeriod.end)}</span>
                          </span>
                        ) : (
                          p.entryDate && <span>Activity date: <span className="text-foreground">{formatDate(p.entryDate)}</span></span>
                        )}
                        <span>Logged: <span className="text-foreground">{loggedLabel}</span></span>
                        {p.memberEmail && <span className="truncate">{p.memberEmail}</span>}
                      </div>
                      {p.note && (
                        <p className="text-[11px] text-muted-foreground italic" data-testid={`pending-note-${p.recordId}`}>Member note: “{p.note}”</p>
                      )}

                      {(p.lines?.length ?? 0) > 0 && (
                        <ul className="space-y-1.5">
                          {p.lines!.map((l, idx) => (
                            <li key={idx} className="text-xs">
                              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                <p className="text-foreground">
                                  <span className="font-medium">{l.title || l.activityName}</span>
                                  {l.title && l.title !== l.activityName && <span className="text-muted-foreground"> · {l.activityName}</span>}
                                  {l.category && <span className="text-muted-foreground"> · {l.category}</span>}
                                </p>
                                <p className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                  {lineFormula(l)}
                                  {l.value > 0 && <span className="text-foreground font-semibold"> = {formatCurrency(l.value)}</span>}
                                </p>
                              </div>
                              {l.detail && <p className="text-[11px] text-muted-foreground italic mt-0.5">"{l.detail}"</p>}
                            </li>
                          ))}
                        </ul>
                      )}

                      {breakdownParts.length > 0 && (
                        <div data-testid={`pending-value-breakdown-${p.recordId}`}>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Value breakdown</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                            {breakdownParts.map(part => (
                              <span key={part.label} className="text-muted-foreground">
                                {part.label}: <span className="text-foreground font-semibold tabular-nums">{formatCurrency(part.value)}</span>
                              </span>
                            ))}
                            <span className="text-muted-foreground">
                              Total: <span className="text-foreground font-semibold tabular-nums">{formatCurrency(p.totalValue)}</span>
                            </span>
                          </div>
                        </div>
                      )}

                      {(p.evidence?.length ?? 0) > 0 && (
                        <div data-testid={`pending-evidence-${p.recordId}`}>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Evidence ({p.evidence!.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {p.evidence!.map(ev => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setLightbox({
                                  url: `${BASE}${ev.url}`,
                                  memberName: p.memberName,
                                  activityLabel,
                                  dateLabel: loggedLabel,
                                })}
                                className="block w-14 h-14 rounded-md border border-border overflow-hidden hover:ring-2 hover:ring-primary/40 transition-shadow cursor-pointer"
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
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
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
