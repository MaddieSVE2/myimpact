import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart2, Users, TrendingUp, Clock, Building2, ArrowRight, KeyRound, ShieldCheck, Lock } from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgInfo {
  id: string;
  name: string;
  type: string;
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

function useOrgStats(enabled: boolean) {
  return useQuery<OrgStats>({
    queryKey: ["org-stats"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/impact/org-stats`, { credentials: "include" });
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

function JoinOrgPanel() {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"entry" | "consent" | "joined">("entry");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const validateMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      const res = await fetch(`${BASE}/api/org/validate-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode }),
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

  const joinMutation = useMutation({
    mutationFn: async (inviteCode: string) => {
      const res = await fetch(`${BASE}/api/org/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode }),
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
          <p className="text-xs text-muted-foreground mb-4">Your data is anonymised — the organisation sees totals and categories, never individual names or accounts.</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep("entry"); setError(null); }}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => joinMutation.mutate(code)}
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

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="text-base font-display font-semibold text-foreground">Join your organisation</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Enter the invite code provided by your organisation to connect your impact data to their dashboard.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(null); }}
            placeholder="e.g. CHARITY-ABC123"
            className="flex-1 px-3 py-2.5 rounded-lg border border-border text-sm font-mono uppercase focus:outline-none focus:border-primary"
          />
          <button
            onClick={() => { if (code.trim()) validateMutation.mutate(code); }}
            disabled={!code.trim() || validateMutation.isPending}
            className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {validateMutation.isPending ? "Checking..." : "Next"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-5">
        <p className="text-sm font-medium text-foreground mb-1">Is your organisation not on My Impact yet?</p>
        <p className="text-xs text-muted-foreground mb-3">Register your organisation to get a dashboard and invite code for your members.</p>
        <Link
          href="/org/register"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          Register your organisation <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}

export default function OrgPortal() {
  const { data: orgData, isLoading: orgLoading } = useMyOrg();
  const inOrg = !!orgData?.org;
  const { data: stats, isLoading: statsLoading, isError: statsError } = useOrgStats(inOrg);

  if (orgLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
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
        {inOrg && (
          <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold capitalize">{orgData!.org!.type}</span>
        )}
      </div>

      {!inOrg ? (
        <JoinOrgPanel />
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
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <StatCard icon={TrendingUp} label="Total social value" value={formatCurrency(stats.totalSocialValue)} />
            <StatCard icon={Users} label="Members" value={String(stats.totalMemberCount)} sub={`${stats.totalUsers} with saved records`} />
            <StatCard icon={BarChart2} label="Avg per person" value={formatCurrency(stats.averageValuePerPerson)} />
            <StatCard icon={Clock} label="Total hours given" value={`${Math.round(stats.totalHours).toLocaleString("en-GB")}`} sub="volunteering hours" />
          </motion.div>

          {stats.valueByCategory.length > 0 && (
            <motion.div
              className="bg-white border border-border rounded-xl p-5 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="text-sm font-semibold text-foreground mb-1">Social value by category</h3>
              <p className="text-xs text-muted-foreground mb-4">All data is anonymised — no individual names are shown.</p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.valueByCategory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(1)}k`} />
                    <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" fill="#F06127" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

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
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">Cohort analytics, challenge tools, branded reports, data export, and multi-programme views — from £2,500/year.</p>
            </div>
            <a
              href="mailto:maddie@socialvalueengine.com?subject=MyImpact Organisation tier"
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
