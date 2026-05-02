import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart2, Users, TrendingUp, Clock, Building2, ArrowRight, KeyRound, ShieldCheck, Lock, ChevronDown, Search, Link2, Download, Calendar, HandCoins, FileSpreadsheet, Plus, X as XIcon, Share2, Eye, X, Copy, Check, AlertCircle, Webhook, Code2, Trash2, CreditCard, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { OrgDemoButton } from "@/components/OrgDemoModal";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { OrgSsoConfigPanel } from "@/components/OrgSsoConfig";
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

// ===========================================================================
// Developer (API + Webhooks) section. Only rendered for org managers.
// ===========================================================================

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

function DeveloperApiSection() {
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
              This is the only time you'll see <strong>{revealedKey.label}</strong>. Store it somewhere secret — you won't be able to retrieve it again.
            </p>
            <CopyableCode value={revealedKey.rawKey} label="API key" />
            <div className="text-right mt-2">
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="text-xs font-medium text-amber-900 hover:underline"
              >
                I've copied it — dismiss
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
                I've copied it — dismiss
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
              <li><code className="font-mono">member.joined</code> — a user joined your org</li>
              <li><code className="font-mono">hours.logged</code> — a member logged hours via the app</li>
              <li><code className="font-mono">hours.attested</code> — hours pushed via your API key</li>
              <li><code className="font-mono">hours.verified</code> — hours marked verified</li>
              <li><code className="font-mono">milestone.earned</code> — member earned a milestone</li>
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

interface ShareLink {
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

function CopyShareLinkButton({ slug }: { slug: string }) {
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

function ShareLinkManager() {
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

export default function OrgPortal() {
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const inOrg = !!orgData?.org;
  const isManager = orgData?.org?.role === "manager";

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
          <OrgSsoConfigPanel orgId={orgData!.org!.id} />

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
              <p className="text-xs text-muted-foreground mt-1">volunteering hours</p>
            </div>
          </motion.div>

          <BillingSection />

          <PulseSurveysSection />

          <MatchProgrammeSection from={from} to={to} />

          <DeveloperApiSection />

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

          <ShareLinkManager />

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
