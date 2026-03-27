import { useState } from "react";
import { X, TrendingUp, Users, BarChart2, Clock, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

const DEMO_STATS = {
  orgName: "Riverside Youth Trust",
  type: "charity",
  totalMemberCount: 47,
  totalUsers: 32,
  totalSocialValue: 184320,
  averageValuePerPerson: 5760,
  totalHours: 2340,
  valueByCategory: [
    { category: "Volunteering", value: 87200 },
    { category: "Environment", value: 41600 },
    { category: "Personal Dev", value: 28900 },
    { category: "Community", value: 18400 },
    { category: "Donations", value: 8220 },
  ],
};

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="bg-muted/20 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-primary font-semibold mb-0.5 uppercase tracking-wide">Example · charity</p>
          <h3 className="text-lg font-display font-semibold text-foreground">{DEMO_STATS.orgName}</h3>
          <p className="text-xs text-muted-foreground">Anonymous aggregate impact across your members.</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">Demo</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={TrendingUp} label="Total social value" value={formatCurrency(DEMO_STATS.totalSocialValue)} />
        <StatCard icon={Users} label="Members" value={String(DEMO_STATS.totalMemberCount)} sub={`${DEMO_STATS.totalUsers} with saved records`} />
        <StatCard icon={BarChart2} label="Avg per person" value={formatCurrency(DEMO_STATS.averageValuePerPerson)} />
        <StatCard icon={Clock} label="Total hours" value={DEMO_STATS.totalHours.toLocaleString("en-GB")} sub="volunteering hours" />
      </div>

      <div className="bg-white border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-foreground mb-0.5">Social value by category</p>
        <p className="text-[11px] text-muted-foreground mb-3">All data is anonymised — no individual names shown.</p>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DEMO_STATS.valueByCategory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
              <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" fill="#F06127" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

interface OrgDemoModalProps {
  open: boolean;
  onClose: () => void;
}

export function OrgDemoModal({ open, onClose }: OrgDemoModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <p className="text-sm font-semibold text-foreground">Example organisation dashboard</p>
            <p className="text-xs text-muted-foreground">What your dashboard looks like once members start tracking their impact</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <DashboardPreview />
          <p className="text-[11px] text-muted-foreground text-center mt-4 leading-relaxed">
            Sample data for illustration only. Your actual dashboard populates as members calculate and save their social value.
          </p>
        </div>
      </div>
    </div>
  );
}

export function OrgDemoButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"}
        style={style}
      >
        <Eye className="w-3.5 h-3.5" />
        View example dashboard
      </button>
      <OrgDemoModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
