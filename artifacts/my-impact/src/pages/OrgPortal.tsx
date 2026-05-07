import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart2, Users, TrendingUp, Clock, Building2, ArrowRight, KeyRound, ShieldCheck, Lock, ChevronDown, Search, Link2, Download, Calendar, HandCoins, FileSpreadsheet, Plus, X as XIcon, Copy, AlertCircle, CreditCard, Sparkles, BadgeCheck, CheckCircle2, XCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { OrgDemoButton } from "@/components/OrgDemoModal";
import { DEMO_ORG_ID } from "@/lib/org-demo-mock";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { PulseSurveysSection } from "@/components/PulseSurveysSection";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgInfo {
  id: string;
  name: string;
  type: string;
  role: string;
}

interface OrgStats {
  totalRecords: number;
  totalUsers: number;
  totalMemberCount: number;
  totalSocialValue: number;
  totalHours: number;
  averageValuePerPerson: number;
  valueByCategory: Array<{ category: string; value: number }>;
  verifiedHours: number;
  verifiedSocialValue: number;
  verifiedRecordCount: number;
}

interface PendingVerification {
  recordId: number;
  memberName: string;
  memberEmail: string | null;
  name: string;
  period: string | null;
  totalHours: number;
  totalValue: number;
  createdAt: string;
}

type PresetKey = "all" | "academic" | "calendar" | "last12";

interface DateRange {
  from: string;
  to: string;
}

function getAcademicYearRange(): DateRange {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return {
    from: `${startYear}-09-01`,
    to: `${startYear + 1}-08-31`,
  };
}

function getCalendarYearRange(): DateRange {
  const year = new Date().getFullYear();
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function getLast12MonthsRange(): DateRange {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function useMyOrg() {
  return useQuery<{ org: OrgInfo | null }>({
    queryKey: ["my-org"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useOrgStats(enabled: boolean, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();

  return useQuery<OrgStats>({
    queryKey: ["org-stats", from, to],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/impact/org-stats${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useOrgMonthly(enabled: boolean, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<{ monthly: MonthlyDataPoint[] }>({
    queryKey: ["org-monthly", from, to],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/stats/monthly${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useOrgRegions(enabled: boolean, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<{ regions: RegionData[] }>({
    queryKey: ["org-regions", from, to],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/stats/regions${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function useJoinLink(enabled: boolean) {
  return useQuery<{ orgId: string; inviteCode: string; orgName: string }>({
    queryKey: ["org-join-link"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/my-join-link`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });
}

function usePendingVerifications(enabled: boolean) {
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

function VerificationQueue({ orgName }: { orgName: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = usePendingVerifications(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-pending-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["org-stats"] });
    },
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
      queryClient.invalidateQueries({ queryKey: ["org-pending-verifications"] });
      queryClient.invalidateQueries({ queryKey: ["org-stats"] });
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
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Pending verification</h3>
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
                      className="flex-1 text-xs px-2 py-1 border border-border rounded focus:outline-none focus:border-primary"
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
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => startReject(p.recordId)}
                      disabled={decideMutation.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold transition-colors disabled:opacity-60"
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
    </motion.div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

interface OrgListItem {
  id: string;
  name: string;
}

function useOrgList() {
  return useQuery<{ orgs: OrgListItem[] }>({
    queryKey: ["org-list"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/list`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load organisations");
      return res.json();
    },
  });
}

function OrgSelector({ selected, onSelect }: { selected: OrgListItem | null; onSelect: (org: OrgListItem) => void }) {
  const { data, isLoading } = useOrgList();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const orgs = data?.orgs ?? [];
  const filtered = search.trim()
    ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border text-sm bg-white focus:outline-none focus:border-primary transition-colors"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {isLoading ? "Loading organisations…" : selected ? selected.name : "Search for your organisation…"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to filter…"
              className="flex-1 text-sm outline-none bg-transparent"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-2.5 text-sm text-muted-foreground">No organisations found</li>
            ) : (
              filtered.map(org => (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(org); setOpen(false); setSearch(""); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors ${selected?.id === org.id ? "text-primary font-semibold" : "text-foreground"}`}
                  >
                    {org.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function JoinOrgPanel() {
  const [code, setCode] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<OrgListItem | null>(null);
  const [step, setStep] = useState<"entry" | "consent" | "joined">("entry");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fromInviteLink, setFromInviteLink] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOrgId = params.get("orgId");
    const urlCode = params.get("inviteCode");
    if (urlCode && urlOrgId) {
      setFromInviteLink(true);
      setCode(urlCode.toUpperCase());
      fetch(`${BASE}/api/org/list`, { credentials: "include" })
        .then(r => r.json())
        .then((data: { orgs: OrgListItem[] }) => {
          const found = data.orgs.find(o => o.id === urlOrgId);
          if (found) setSelectedOrg(found);
        })
        .catch(() => {});
    } else {
      if (urlCode) setCode(urlCode.toUpperCase());
      if (urlOrgId) {
        fetch(`${BASE}/api/org/list`, { credentials: "include" })
          .then(r => r.json())
          .then((data: { orgs: OrgListItem[] }) => {
            const found = data.orgs.find(o => o.id === urlOrgId);
            if (found) setSelectedOrg(found);
          })
          .catch(() => {});
      }
    }
  }, []);

  const validateMutation = useMutation({
    mutationFn: async ({ inviteCode, orgId }: { inviteCode: string; orgId: string }) => {
      const res = await fetch(`${BASE}/api/org/validate-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invalid invite code");
      return data as { ok: boolean; orgName: string };
    },
    onSuccess: (data) => {
      setOrgName(data.orgName);
      setStep("consent");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  useEffect(() => {
    if (fromInviteLink && selectedOrg && code && step === "entry" && !validateMutation.isPending) {
      validateMutation.mutate({ inviteCode: code, orgId: selectedOrg.id });
    }
  }, [fromInviteLink, selectedOrg, code]);

  const joinMutation = useMutation({
    mutationFn: async ({ inviteCode, orgId }: { inviteCode: string; orgId: string }) => {
      const res = await fetch(`${BASE}/api/org/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to join");
      return data as { ok: boolean; orgName: string; alreadyMember: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-org"] });
      queryClient.invalidateQueries({ queryKey: ["org-stats"] });
      setStep("joined");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (step === "joined") {
    return (
      <motion.div className="bg-white border border-border rounded-xl p-8 text-center" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-6 h-6 text-green-600" />
        </div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-2">You've joined {orgName}</h2>
        <p className="text-sm text-muted-foreground mb-6">Your activity data will now contribute to the organisation dashboard. The page will refresh to show your organisation's impact.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          View dashboard
        </button>
      </motion.div>
    );
  }

  if (step === "consent") {
    return (
      <motion.div className="bg-white border border-border rounded-xl overflow-hidden" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-display font-semibold text-foreground mb-1">Join {orgName}?</h2>
          <p className="text-sm text-muted-foreground">Before you confirm, here's exactly what will and won't be shared:</p>
        </div>
        <div className="px-6 pb-4 space-y-2">
          {[
            { shared: true, label: "Your total social value (£ amount)" },
            { shared: true, label: "Activity breakdown by category" },
            { shared: true, label: "Total volunteer hours" },
            { shared: false, label: "Your journal entries" },
            { shared: false, label: "Your personal notes and ideas" },
            { shared: false, label: "Your name or any identifying information" },
          ].map(({ shared, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${shared ? "bg-green-100" : "bg-red-50"}`}>
                {shared
                  ? <span className="text-green-600 text-xs font-bold">✓</span>
                  : <Lock className="w-2.5 h-2.5 text-red-400" />
                }
              </div>
              <span className="text-sm text-foreground">{shared ? "Shared" : "Not shared"}: {label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border px-6 py-4 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-4">Your data is anonymised: the organisation sees totals and categories, never individual names or accounts.</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep("entry"); setError(null); }}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => joinMutation.mutate({ inviteCode: code, orgId: selectedOrg!.id })}
              disabled={joinMutation.isPending}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {joinMutation.isPending ? "Joining..." : "Yes, join organisation"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      </motion.div>
    );
  }

  const canSubmit = !!selectedOrg && code.trim().length > 0 && !validateMutation.isPending;

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="text-base font-display font-semibold text-foreground">Join your organisation</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Select your organisation and then enter the invite code provided by your admin.</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Your organisation</label>
            <OrgSelector
              selected={selectedOrg}
              onSelect={(org) => { setSelectedOrg(org); setError(null); }}
            />
          </div>

          {selectedOrg && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              <label className="block text-xs font-medium text-foreground mb-1.5">Invite code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setError(null); }}
                  placeholder="e.g. CHARITY-ABC123"
                  className="flex-1 px-3 py-2.5 rounded-lg border border-border text-sm font-mono uppercase focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => { if (canSubmit) validateMutation.mutate({ inviteCode: code, orgId: selectedOrg.id }); }}
                  disabled={!canSubmit}
                  className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {validateMutation.isPending ? "Checking..." : "Next"}
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-5">
        <p className="text-sm font-medium text-foreground mb-1">Is your organisation not on My Impact yet?</p>
        <p className="text-xs text-muted-foreground mb-3">Register your organisation to get a dashboard and invite code for your members.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/org/register"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Register your organisation <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <OrgDemoButton className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors" />
        </div>
      </div>
    </motion.div>
  );
}

function PeriodSelector({
  preset,
  from,
  to,
  onPresetChange,
  onFromChange,
  onToChange,
}: {
  preset: PresetKey;
  from: string;
  to: string;
  onPresetChange: (key: PresetKey) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const presets: Array<{ key: PresetKey; label: string }> = [
    { key: "all", label: "All time" },
    { key: "academic", label: "This academic year" },
    { key: "calendar", label: "This calendar year" },
    { key: "last12", label: "Last 12 months" },
  ];

  return (
    <div className="bg-white border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Reporting period</span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPresetChange(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              preset === p.key
                ? "bg-primary text-white border-primary"
                : "bg-white text-foreground border-border hover:border-primary/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-8">From</label>
          <input
            type="date"
            value={from}
            onChange={e => { onFromChange(e.target.value); }}
            className="px-2 py-1.5 rounded-lg border border-border text-xs focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-8">To</label>
          <input
            type="date"
            value={to}
            onChange={e => { onToChange(e.target.value); }}
            className="px-2 py-1.5 rounded-lg border border-border text-xs focus:outline-none focus:border-primary"
          />
        </div>
      </div>
    </div>
  );
}

function CopyJoinLinkButton({ orgId, inviteCode }: { orgId: string; inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("orgId", orgId);
    url.searchParams.set("inviteCode", inviteCode);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors bg-white"
    >
      <Link2 className="w-3.5 h-3.5" />
      {copied ? "Copied!" : "Copy join link"}
    </button>
  );
}

interface MatchRate {
  id: string;
  hourlyRate: number | null;
  donationMultiplier: number | null;
  monthlyCapPerMember: number | null;
  onlyVerifiedHours: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

interface MatchSummary {
  totalCommitment: number;
  totalHoursMatched: number;
  totalDonationsMatched: number;
  matchedRecordsCount: number;
  matchedMembersCount: number;
  monthly: Array<{ month: string; value: number }>;
}

function useMatchRates(enabled: boolean) {
  return useQuery<{ rates: MatchRate[] }>({
    queryKey: ["org-match-rates"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/match/rates`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load match rates");
      return res.json();
    },
  });
}

function useMatchSummary(enabled: boolean, from: string, to: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<MatchSummary>({
    queryKey: ["org-match-summary", from, to],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/match/summary${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load match summary");
      return res.json();
    },
  });
}

function formatRateLine(r: MatchRate): string {
  const parts: string[] = [];
  if (r.hourlyRate !== null && r.hourlyRate > 0) parts.push(`£${r.hourlyRate.toFixed(2)} per hour`);
  if (r.donationMultiplier !== null && r.donationMultiplier > 0) parts.push(`${r.donationMultiplier}× donations`);
  if (parts.length === 0) parts.push("No multipliers set");
  if (r.monthlyCapPerMember !== null) parts.push(`£${r.monthlyCapPerMember.toFixed(2)}/member/month cap`);
  return parts.join(" · ");
}

function MatchProgrammeSection({ from, to }: { from: string; to: string }) {
  const queryClient = useQueryClient();
  const { data: ratesData, isLoading: ratesLoading } = useMatchRates(true);
  const { data: summary, isLoading: summaryLoading } = useMatchSummary(true, from, to);
  const [showForm, setShowForm] = useState(false);
  const [hourlyRate, setHourlyRate] = useState("");
  const [donationMultiplier, setDonationMultiplier] = useState("");
  const [monthlyCap, setMonthlyCap] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const rates = ratesData?.rates ?? [];
  const activeRate = rates.find(r => r.effectiveTo === null) ?? null;
  const pastRates = rates.filter(r => r.effectiveTo !== null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/org/match/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          hourlyRate: hourlyRate.trim() === "" ? null : Number(hourlyRate),
          donationMultiplier: donationMultiplier.trim() === "" ? null : Number(donationMultiplier),
          monthlyCapPerMember: monthlyCap.trim() === "" ? null : Number(monthlyCap),
          effectiveFrom: new Date(effectiveFrom).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-match-rates"] });
      queryClient.invalidateQueries({ queryKey: ["org-match-summary"] });
      setShowForm(false);
      setHourlyRate("");
      setDonationMultiplier("");
      setMonthlyCap("");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/org/match/rates/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ effectiveTo: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to end");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-match-rates"] });
      queryClient.invalidateQueries({ queryKey: ["org-match-summary"] });
    },
  });

  function handleDownloadCsv() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    window.open(`${BASE}/api/org/match/csv${qs ? `?${qs}` : ""}`, "_blank");
  }

  // Preview impact for the new rate
  const previewExample = (() => {
    const h = hourlyRate.trim() === "" ? 0 : Number(hourlyRate);
    const d = donationMultiplier.trim() === "" ? 0 : Number(donationMultiplier);
    if ((!Number.isFinite(h) || h <= 0) && (!Number.isFinite(d) || d <= 0)) return null;
    const exampleHours = 10;
    const exampleDonation = 50;
    const matched = exampleHours * (Number.isFinite(h) ? h : 0) + exampleDonation * (Number.isFinite(d) ? d : 0);
    return { matched, exampleHours, exampleDonation };
  })();

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <HandCoins className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Match programme</h3>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Multiply what your members log. Set a £ amount per hour and/or a multiplier on donations. Historic match amounts are locked using the rate active when each record was logged.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors bg-white"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total commitment</p>
          <p className="text-xl font-display font-bold text-foreground">
            {summaryLoading ? "…" : formatCurrency(summary?.totalCommitment ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">across selected period</p>
        </div>
        <div className="bg-muted/20 border border-border rounded-lg p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Matched records</p>
          <p className="text-xl font-display font-bold text-foreground">
            {summaryLoading ? "…" : (summary?.matchedRecordsCount ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{summary?.matchedMembersCount ?? 0} members matched</p>
        </div>
        <div className="bg-muted/20 border border-border rounded-lg p-4 col-span-2 md:col-span-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Breakdown</p>
          <p className="text-xs text-foreground">
            <span className="font-semibold">{formatCurrency(summary?.totalHoursMatched ?? 0)}</span> hours match
          </p>
          <p className="text-xs text-foreground">
            <span className="font-semibold">{formatCurrency(summary?.totalDonationsMatched ?? 0)}</span> donations match
          </p>
        </div>
      </div>

      {/* Active rate */}
      <div className="border border-border rounded-lg p-4 mb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Current rate</p>
            {ratesLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : activeRate ? (
              <>
                <p className="text-sm font-medium text-foreground">{formatRateLine(activeRate)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Active since {new Date(activeRate.effectiveFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active match rate. Set one below to start matching.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeRate && !showForm && (
              <button
                type="button"
                onClick={() => endMutation.mutate()}
                disabled={endMutation.isPending}
                className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
              >
                {endMutation.isPending ? "Ending…" : "End rate"}
              </button>
            )}
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {activeRate ? "Update rate" : "Set rate"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-primary/30 rounded-lg p-4 mb-3 bg-primary/[0.03]"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">{activeRate ? "Update match rate" : "Set match rate"}</p>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="p-1 rounded text-muted-foreground hover:bg-muted/30"
              aria-label="Cancel"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeRate && (
            <p className="text-[11px] text-muted-foreground mb-3">
              The current rate will be end-dated at the new effective date. Past matches are not changed.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">£ per hour</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                placeholder="e.g. 5.00"
                className="w-full px-2.5 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">Donation multiplier</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={donationMultiplier}
                onChange={e => setDonationMultiplier(e.target.value)}
                placeholder="e.g. 1.0 = double"
                className="w-full px-2.5 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-foreground mb-1">Monthly cap / member</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={monthlyCap}
                onChange={e => setMonthlyCap(e.target.value)}
                placeholder="optional"
                className="w-full px-2.5 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-[11px] font-medium text-foreground mb-1">Effective from</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border border-border text-sm focus:outline-none focus:border-primary"
            />
          </div>

          {previewExample && (
            <div className="bg-white border border-border rounded-md p-3 mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Preview</p>
              <p className="text-xs text-foreground">
                A member who logs <span className="font-semibold">{previewExample.exampleHours} hours</span> and <span className="font-semibold">£{previewExample.exampleDonation} in donations</span> would receive{" "}
                <span className="font-bold text-primary">{formatCurrency(previewExample.matched)}</span> matched.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : activeRate ? "Replace rate" : "Save rate"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Past rates */}
      {pastRates.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/20">
            Past rates ({pastRates.length})
          </summary>
          <ul className="divide-y divide-border">
            {pastRates.map(r => (
              <li key={r.id} className="px-4 py-2.5 text-xs">
                <p className="text-foreground">{formatRateLine(r)}</p>
                <p className="text-muted-foreground mt-0.5">
                  {new Date(r.effectiveFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {" "}–{" "}
                  {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "now"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </motion.div>
  );
}


// ── Billing & plan section ──────────────────────────────────────────────────
// Shows the org's current tier, payment status, and entry points to
// upgrade / manage / cancel via Stripe Checkout + Billing Portal. Hidden
// behind the same `pricingPublic` flag as the public pricing page so it can
// be staged before go-live without confusing existing customers.

interface SubscriptionSnapshot {
  orgId: string;
  orgName: string;
  tier: "free" | "team" | "org" | "enterprise";
  tierName: string;
  status: string;
  source: "override" | "subscription" | "default";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  enforcing: boolean;
  features: {
    memberCap: number | null;
    shareLinkCap: number | null;
    matchProgramme: boolean;
    brandedReports: boolean;
    regionalAnalytics: boolean;
    webhookApi: boolean;
    sso: boolean;
    prioritySupport: boolean;
  };
}

interface TiersSummary {
  pricingPublic: boolean;
  stripeConfigured: boolean;
}

function BillingSection() {
  const [error, setError] = useState<string | null>(null);

  const { data: tiersInfo } = useQuery<TiersSummary>({
    queryKey: ["billing-tiers-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/tiers`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return { pricingPublic: json.pricingPublic, stripeConfigured: json.stripeConfigured };
    },
  });

  const { data: sub, isLoading } = useQuery<SubscriptionSnapshot>({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/subscription`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load subscription");
      return res.json();
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/billing/portal`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not open billing portal");
      return json as { url: string };
    },
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: Error) => setError(e.message),
  });

  // Hide entirely until pricing is public OR an override is in effect (so
  // design partners can preview without exposing the section to everyone).
  if (!tiersInfo?.pricingPublic && sub?.source !== "override") return null;

  if (isLoading || !sub) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <p className="text-xs text-muted-foreground">Loading plan…</p>
      </div>
    );
  }

  const isPaid = sub.tier !== "free" && sub.tier !== "enterprise";
  const showPaymentWarning = sub.status === "past_due" || sub.status === "unpaid";

  return (
    <motion.div
      className="bg-white border border-border rounded-xl p-5 mb-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      data-testid="billing-section"
    >
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Plan & billing</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-display font-semibold text-foreground">{sub.tierName}</p>
            <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
              sub.status === "active" || sub.status === "trialing"
                ? "bg-green-100 text-green-700"
                : showPaymentWarning
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
            }`}>
              {sub.status}
            </span>
            {sub.source === "override" && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                staff override
              </span>
            )}
          </div>
          {sub.currentPeriodEnd && (
            <p className="text-xs text-muted-foreground mt-1">
              {sub.cancelAtPeriodEnd ? "Cancels on " : "Renews on "}
              {new Date(sub.currentPeriodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isPaid && (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              data-testid="button-view-pricing"
            >
              <Sparkles className="w-3.5 h-3.5" />
              See plans
            </Link>
          )}
          {isPaid && (
            <button
              type="button"
              onClick={() => { setError(null); portalMutation.mutate(); }}
              disabled={portalMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-60"
              data-testid="button-manage-billing"
            >
              {portalMutation.isPending ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>
      </div>

      {showPaymentWarning && (
        <div className="px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2 mb-3">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            We couldn't take your last payment. Please update your card in the billing portal — your plan will be downgraded if it stays unpaid.
          </span>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="px-3 py-2 rounded-lg bg-muted/30">
          <p className="text-muted-foreground uppercase tracking-wider">Member cap</p>
          <p className="font-semibold text-foreground mt-0.5">
            {sub.features.memberCap === null ? "Unlimited" : sub.features.memberCap.toLocaleString("en-GB")}
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-muted/30">
          <p className="text-muted-foreground uppercase tracking-wider">Share links</p>
          <p className="font-semibold text-foreground mt-0.5">
            {sub.features.shareLinkCap === null ? "Unlimited" : sub.features.shareLinkCap.toLocaleString("en-GB")}
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-muted/30">
          <p className="text-muted-foreground uppercase tracking-wider">SSO</p>
          <p className="font-semibold text-foreground mt-0.5">
            {sub.features.sso ? "Included" : "—"}
          </p>
        </div>
        <div className="px-3 py-2 rounded-lg bg-muted/30">
          <p className="text-muted-foreground uppercase tracking-wider">API & webhooks</p>
          <p className="font-semibold text-foreground mt-0.5">
            {sub.features.webhookApi ? "Included" : "—"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}


function DownloadPdfButton({ from, to }: { from: string; to: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(`${BASE}/api/org/report-pdf${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const errMsg = data !== null && typeof data === "object" && "error" in data && typeof (data as Record<string, unknown>).error === "string"
          ? (data as Record<string, unknown>).error as string
          : "Failed to generate report";
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "org-impact-report.pdf";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        <Download className="w-3.5 h-3.5" />
        {loading ? "Generating…" : "Download PDF"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}


export default function OrgPortal() {
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const inOrg = !!orgData?.org;
  const isManager = orgData?.org?.role === "manager";
  const [, setLocation] = useLocation();

  // Demo org managers always land on the new mock-data dashboard.
  useEffect(() => {
    if (inOrg && isManager && orgData?.org?.id === DEMO_ORG_ID) {
      setLocation("/org/dashboard", { replace: true });
    }
  }, [inOrg, isManager, orgData?.org?.id, setLocation]);

  const [preset, setPreset] = useState<PresetKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function getDateRange(): { from: string; to: string } {
    if (preset === "academic") return getAcademicYearRange();
    if (preset === "calendar") return getCalendarYearRange();
    if (preset === "last12") return getLast12MonthsRange();
    return { from: customFrom, to: customTo };
  }

  const { from, to } = getDateRange();

  const { data: stats, isLoading: statsLoading, isError: statsError } = useOrgStats(inOrg && isManager, from, to);
  const { data: monthlyData, isLoading: monthlyLoading } = useOrgMonthly(inOrg && isManager, from, to);
  const { data: regionsData, isLoading: regionsLoading } = useOrgRegions(inOrg && isManager, from, to);
  const { data: joinLinkData } = useJoinLink(inOrg && isManager);

  function handlePresetChange(key: PresetKey) {
    setPreset(key);
    if (key !== "all") {
      setCustomFrom("");
      setCustomTo("");
    }
  }

  if (orgLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <h1 className="text-2xl font-display font-semibold text-foreground">
              {inOrg ? orgData!.org!.name : "Organisation portal"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {inOrg ? "Anonymous aggregate impact across your members." : "Connect to your organisation or register a new one."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inOrg && (
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold capitalize">{orgData!.org!.type}</span>
          )}
          {inOrg && isManager && joinLinkData && (
            <CopyJoinLinkButton orgId={joinLinkData.orgId} inviteCode={joinLinkData.inviteCode} />
          )}
          {inOrg && isManager && (
            <DownloadPdfButton from={from} to={to} />
          )}
        </div>
      </div>

      {!inOrg ? (
        <JoinOrgPanel />
      ) : !isManager ? (
        <motion.div
          className="bg-white border border-border rounded-xl p-8 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <ShieldCheck className="w-10 h-10 text-primary/40 mx-auto mb-4" />
          <p className="text-base font-display font-semibold text-foreground mb-1">
            You're a member of {orgData!.org!.name}
          </p>
          <p className="text-sm text-muted-foreground">
            Organisation analytics, reports, and the join link are only available to your organisation manager. Contact them if you need access.
          </p>
        </motion.div>
      ) : statsLoading ? (
        <div className="py-16 flex justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : statsError ? (
        <div className="bg-white border border-border rounded-xl py-12 text-center">
          <p className="text-sm font-medium text-foreground mb-1">Could not load dashboard data</p>
          <p className="text-xs text-muted-foreground">Please try refreshing the page.</p>
        </div>
      ) : stats ? (
        <>
          <PeriodSelector
            preset={preset}
            from={preset === "all" ? customFrom : from}
            to={preset === "all" ? customTo : to}
            onPresetChange={handlePresetChange}
            onFromChange={(v) => { setCustomFrom(v); setPreset("all"); }}
            onToChange={(v) => { setCustomTo(v); setPreset("all"); }}
          />

          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-primary border border-primary rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-white/70" />
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wider">Total social value</p>
              </div>
              <p className="text-2xl font-display font-bold text-white">
                £<AnimatedNumber value={stats.totalSocialValue} formatter={v => v.toLocaleString("en-GB")} />
              </p>
            </div>
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</p>
              </div>
              <p className="text-2xl font-display font-bold text-foreground">
                <AnimatedNumber value={stats.totalMemberCount} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">{stats.totalUsers} with saved records</p>
            </div>
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg per person</p>
              </div>
              <p className="text-2xl font-display font-bold text-foreground">
                £<AnimatedNumber value={stats.averageValuePerPerson} formatter={v => v.toLocaleString("en-GB")} />
              </p>
            </div>
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total hours given</p>
              </div>
              <p className="text-2xl font-display font-bold text-foreground">
                <AnimatedNumber value={Math.round(stats.totalHours)} formatter={v => v.toLocaleString("en-GB")} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <BadgeCheck className="w-3 h-3 inline-block mr-1 text-green-600" aria-hidden="true" />
                {Math.round(stats.verifiedHours ?? 0).toLocaleString("en-GB")} verified
              </p>
            </div>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck className="w-4 h-4 text-green-600" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verified social value</p>
              </div>
              <p className="text-2xl font-display font-bold text-foreground">
                £{(stats.verifiedSocialValue ?? 0).toLocaleString("en-GB")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Across {stats.verifiedRecordCount ?? 0} attested {stats.verifiedRecordCount === 1 ? "record" : "records"} — funder-ready
              </p>
            </div>
            <div className="bg-white border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck className="w-4 h-4 text-green-600" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Verified hours</p>
              </div>
              <p className="text-2xl font-display font-bold text-foreground">
                {Math.round(stats.verifiedHours ?? 0).toLocaleString("en-GB")}
                <span className="text-sm font-normal text-muted-foreground"> / {Math.round(stats.totalHours).toLocaleString("en-GB")} total</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Hours attested by your organisation</p>
            </div>
          </motion.div>

          <VerificationQueue orgName={orgData!.org!.name} />

          <BillingSection />

          <PulseSurveysSection />

          <MatchProgrammeSection from={from} to={to} />

          {/* Impact over time */}
          <motion.div
            className="bg-white border border-border rounded-xl p-5 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <h3 className="text-sm font-semibold text-foreground mb-1">Impact over time</h3>
            <p className="text-xs text-muted-foreground mb-4">Social value generated by your members, grouped by month for the selected period.</p>
            <ImpactTimeline data={monthlyData?.monthly ?? []} isLoading={monthlyLoading} />
          </motion.div>

          {stats.valueByCategory.length > 0 && (
            <motion.div
              className="bg-white border border-border rounded-xl p-5 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="text-sm font-semibold text-foreground mb-1">Social value by category</h3>
              <p className="text-xs text-muted-foreground mb-4">All data is anonymised: no individual names are shown.</p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.valueByCategory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(1)}k`} />
                    <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" fill="#F06127" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Regional map */}
          <motion.div
            className="bg-white border border-border rounded-xl p-5 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <h3 className="text-sm font-semibold text-foreground mb-1">Where your members are</h3>
            <p className="text-xs text-muted-foreground mb-4">Member activity by UK region. Click any shaded area for details.</p>
            {regionsLoading ? (
              <div className="h-[360px] flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (regionsData?.regions?.length ?? 0) > 0 ? (
              <>
                <UKRegionMap regions={regionsData!.regions} />
                <div className="mt-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Region summary</p>
                  <div className="space-y-2">
                    {regionsData!.regions.map(r => (
                      <div key={r.region} className="flex items-center gap-3">
                        <div className="w-28 shrink-0">
                          <p className="text-sm font-medium text-foreground">{r.region}</p>
                          <p className="text-xs text-muted-foreground">{r.members} members</p>
                        </div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${r.pct}%` }} />
                        </div>
                        <p className="w-8 text-right text-sm font-semibold text-foreground shrink-0">{r.pct}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-center">
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">No regional data yet</p>
                  <p className="text-xs text-muted-foreground max-w-xs">Regional data will appear as members with postcodes log their activities.</p>
                </div>
              </div>
            )}
          </motion.div>

          {stats.totalUsers === 0 && (
            <motion.div
              className="bg-muted/30 border border-border rounded-xl p-5 mb-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <p className="text-sm font-medium text-foreground mb-1">No saved records yet</p>
              <p className="text-xs text-muted-foreground">Your dashboard will populate as members complete the wizard and save their impact. Share the invite code with your team to get started.</p>
            </motion.div>
          )}

          <motion.div
            className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start justify-between gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Want the full Organisation tier?</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">Cohort analytics, challenge tools, branded reports, data export, and multi-programme views, from £2,500/year.</p>
            </div>
            <a
              href="mailto:hello@myimpact.uk?subject=MyImpact Organisation tier"
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Get in touch <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}
