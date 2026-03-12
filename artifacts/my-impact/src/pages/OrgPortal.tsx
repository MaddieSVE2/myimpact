import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { BarChart2, Users, TrendingUp, Clock, Building2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

interface OrgStats {
  totalRecords: number;
  totalUsers: number;
  totalSocialValue: number;
  totalHours: number;
  averageValuePerPerson: number;
  valueByCategory: Array<{ category: string; value: number }>;
  recentActivity: Array<{ date: string; value: number; count: number }>;
}

function useOrgStats() {
  return useQuery<OrgStats>({
    queryKey: ["org-stats"],
    queryFn: async () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/impact/org-stats`);
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

export default function OrgPortal() {
  const { data, isLoading, isError } = useOrgStats();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary" />
            <h1 className="text-2xl font-display font-semibold text-foreground">Organisation portal</h1>
          </div>
          <p className="text-sm text-muted-foreground">Aggregate impact overview across all participants.</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Preview</span>
      </div>
      {isLoading ? (
        <div className="py-16 flex justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <div className="bg-white border border-border rounded-xl py-12 text-center">
          <p className="text-sm font-medium text-foreground mb-1">Could not load data</p>
          <p className="text-xs text-muted-foreground">Make sure the API server is running.</p>
        </div>
      ) : data ? (
        <>
          {/* Stat tiles */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <StatCard icon={TrendingUp} label="Total social value" value={formatCurrency(data.totalSocialValue)} />
            <StatCard icon={Users} label="Participants" value={String(data.totalUsers)} sub={`${data.totalRecords} records`} />
            <StatCard icon={BarChart2} label="Avg per person" value={formatCurrency(data.averageValuePerPerson)} />
            <StatCard icon={Clock} label="Total hours given" value={`${Math.round(data.totalHours).toLocaleString("en-GB")}`} sub="volunteering hours" />
          </motion.div>

          {/* Category breakdown */}
          {data.valueByCategory.length > 0 && (
            <motion.div
              className="bg-white border border-border rounded-xl p-5 mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">Social value by category</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.valueByCategory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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

          {/* Upgrade prompt */}
          <motion.div
            className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start justify-between gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Want the full Organisation tier?</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">The full portal includes cohort analytics, challenge tools, branded reports, data export, and multi-programme views — from £2,500/year.</p>
            </div>
            <a
              href="mailto:hello@socialvalueengine.com?subject=MyImpact Organisation tier"
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
