import { useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import {
  TrendingUp, Users, Clock, GraduationCap, Coins, Globe2,
  FileText, FileSpreadsheet, Users as UsersIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { OrgPeriodNavigator } from "@/components/OrgPeriodNavigator";
import { OrgPulseSummaryCard } from "@/components/OrgPulseSummaryCard";
import { computeSdgBreakdown, type DemoActivity } from "@/lib/org-demo-mock";
import { computeSkillsBreakdown } from "@/lib/skills";
import { BASE } from "@/lib/org-export";

export interface UniversityStats {
  totalRecords: number;
  totalUsers: number;
  totalMemberCount: number;
  totalSocialValue: number;
  totalHours: number;
  averageValuePerPerson: number;
  valueByCategory: Array<{ category: string; value: number }>;
}

interface UniversityActivity {
  id: string;
  memberId: string;
  category: string;
  activity: string;
  hours: number;
  socialValueGBP: number;
}

interface OrgUniversityDashboardProps {
  orgName: string;
  stats: UniversityStats | undefined;
  timeline: MonthlyDataPoint[];
  periodOffset: number;
  setPeriodOffset: (updater: number | ((n: number) => number)) => void;
  periodLabel: string;
  isCurrentPeriod: boolean;
  periodFrom: string;
  periodTo: string;
}

const BAR_PALETTE = ["#F06127", "#B5BE2E", "#A8C8DA", "#7E8FAD", "#E8633A", "#C5A3D0", "#8FBF9F"];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[2px] text-primary mb-3">{children}</p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-display font-bold text-foreground mb-6">{children}</h2>
  );
}

function AnimatedBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.width = "0%";
    const timer = setTimeout(() => {
      el.style.transition = "width 1s cubic-bezier(0.4,0,0.2,1)";
      el.style.width = `${pct}%`;
    }, delay);
    return () => clearTimeout(timer);
  }, [pct, delay]);
  return <div ref={barRef} className="h-full rounded-full bg-primary/30" style={{ width: "0%" }} />;
}

export default function OrgUniversityDashboard({
  orgName, stats, timeline,
  periodOffset, setPeriodOffset, periodLabel, isCurrentPeriod,
  periodFrom, periodTo,
}: OrgUniversityDashboardProps) {
  const { data: activitiesData, isLoading: activitiesLoading } = useQuery<{ activities: UniversityActivity[] }>({
    queryKey: ["org-activities", periodFrom, periodTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (periodFrom) params.set("from", periodFrom);
      if (periodTo) params.set("to", periodTo);
      const res = await fetch(`${BASE}/api/org/activities?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activities");
      return res.json();
    },
  });

  const activities = activitiesData?.activities ?? [];

  const totalSocialValue = stats?.totalSocialValue ?? 0;
  const totalHours = Math.round(stats?.totalHours ?? 0);
  const totalMembers = stats?.totalMemberCount ?? 0;
  const activeMembers = stats?.totalUsers ?? 0;
  const totalActivities = stats?.totalRecords ?? 0;
  const socialValuePerHour = totalHours > 0 ? Math.round(totalSocialValue / totalHours) : 0;

  const valueByCategory = useMemo(
    () => [...(stats?.valueByCategory ?? [])].sort((a, b) => b.value - a.value),
    [stats?.valueByCategory],
  );

  // Top activities: aggregate live records by activity name, top 7 by value.
  const topActivities = useMemo(() => {
    const grouped = new Map<string, { name: string; participants: Set<string>; hours: number; value: number }>();
    for (const a of activities) {
      const g = grouped.get(a.activity) ?? { name: a.activity, participants: new Set<string>(), hours: 0, value: 0 };
      g.participants.add(a.memberId);
      g.hours += a.hours;
      g.value += a.socialValueGBP;
      grouped.set(a.activity, g);
    }
    return Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [activities]);

  const maxActivityValue = Math.max(1, ...topActivities.map(a => a.value));

  // SDG alignment derived from the category of each live record.
  const sdgBreakdowns = useMemo(
    () => computeSdgBreakdown(activities as unknown as DemoActivity[]),
    [activities],
  );

  // Skills inferred from the type of each logged activity.
  const skillsBreakdown = useMemo(() => computeSkillsBreakdown(activities), [activities]);

  return (
    <div className="min-h-screen bg-muted/20" data-testid="org-university-dashboard-root">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide" data-testid="badge-org-type">
                  University
                </span>
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground leading-tight" data-testid="text-org-name">{orgName}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Impact summary · {periodLabel}
              </p>
            </div>
          </div>
          <OrgPeriodNavigator
            periodOffset={periodOffset}
            setPeriodOffset={setPeriodOffset}
            label={periodLabel}
            isCurrentPeriod={isCurrentPeriod}
          />
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-5 border bg-primary text-white border-primary" data-testid="card-total-social-value">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-white/70" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total social value</p>
            </div>
            <p className="text-2xl font-display font-bold text-white">
              £<AnimatedNumber value={totalSocialValue} formatter={v => v.toLocaleString("en-GB")} />
            </p>
          </div>
          <div className="rounded-xl p-5 border bg-white border-border" data-testid="card-value-per-hour">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Social value per hour</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              £<AnimatedNumber value={socialValuePerHour} />/hr
            </p>
            <p className="text-xs mt-1 text-muted-foreground">of social value per student hour</p>
          </div>
          <div className="rounded-xl p-5 border bg-white border-border" data-testid="card-students-registered">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Students registered</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={totalMembers} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">{activeMembers} actively logging</p>
          </div>
          <div className="rounded-xl p-5 border bg-white border-border" data-testid="card-total-hours">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total hours given</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={totalHours} formatter={v => v.toLocaleString("en-GB")} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">{totalActivities} activities logged</p>
          </div>
        </div>

        {/* Impact over time */}
        <div className="bg-white border border-border rounded-xl p-6" data-testid="section-monthly-trend">
          <SectionLabel>Impact over time</SectionLabel>
          <SectionTitle>Social value accumulation, {periodLabel}</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            Total social value generated by your students across the period, shown month by month.
          </p>
          {timeline.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">No activity has been logged in this period yet.</p>
          ) : (
            <ImpactTimeline data={timeline} />
          )}
        </div>

        {/* Pulse summary */}
        <OrgPulseSummaryCard />

        {/* Social value by category + top activities */}
        <div className="bg-white border border-border rounded-xl p-6" data-testid="section-category-breakdown">
          <SectionLabel>Activity breakdown</SectionLabel>
          <SectionTitle>Social value by category</SectionTitle>
          {valueByCategory.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">No activity has been logged in this period yet.</p>
          ) : (
            <div className="h-[220px] mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueByCategory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} width={40} />
                  <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
                    {valueByCategory.map((_, i) => (
                      <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top activities</p>
          {activitiesLoading ? (
            <div className="py-6 flex justify-center">
              <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : topActivities.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-4 text-center">No activities logged in this period yet.</p>
          ) : (
            <div className="space-y-2" data-testid="list-top-activities">
              {topActivities.map((a, idx) => (
                <div key={a.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors" data-testid={`top-activity-${idx}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <AnimatedBar pct={(a.value / maxActivityValue) * 100} delay={idx * 60} />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">students</p>
                    <p className="text-sm font-semibold text-foreground">{a.participants.size}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">hours</p>
                    <p className="text-sm font-semibold text-foreground">{Math.round(a.hours).toLocaleString("en-GB")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">social value</p>
                    <p className="text-sm font-bold text-primary">{formatCurrency(a.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">All data is anonymised. Member-level detail lives in <Link href="/org/activities" className="underline">Activities</Link>.</p>
        </div>

        {/* Skills & development */}
        <div className="bg-white border border-border rounded-xl p-6" data-testid="section-skills-development">
          <SectionLabel>Skills &amp; development</SectionLabel>
          <SectionTitle>Top skills your students are building</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            Skills are inferred from the types of activities students log. The percentage shows the share of actively logging students building each skill, directly relevant to employability and personal statements.
          </p>
          {activitiesLoading ? (
            <div className="py-6 flex justify-center">
              <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : skillsBreakdown.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">No activity has been logged in this period yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4" data-testid="list-top-skills">
              {skillsBreakdown.map((s, idx) => (
                <div key={s.skill} className="flex items-center gap-3" data-testid={`skill-row-${idx}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{s.skill}</p>
                      <p className="text-sm font-bold text-foreground shrink-0">{s.pct}%</p>
                    </div>
                    <div className="h-2 mt-1.5 rounded-full bg-muted overflow-hidden">
                      <AnimatedBar pct={s.pct} delay={idx * 80} />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {s.students} students · {s.hours.toLocaleString("en-GB")} hours · {s.activities} activities
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SDG alignment */}
        <div className="bg-white border border-border rounded-xl p-6" data-testid="section-sdg-alignment">
          <SectionLabel>Global goals</SectionLabel>
          <SectionTitle>UN Sustainable Development Goals (SDGs)</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            Where your students' activity lands across the global goals, based on the category of each logged activity.
          </p>
          {sdgBreakdowns.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-6 text-center">No activity has been logged in this period yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sdgBreakdowns} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={96} paddingAngle={2} isAnimationActive>
                      {sdgBreakdowns.map((s) => (
                        <Cell key={s.number} fill={s.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(v: number, _n, payload) => {
                        const p = (payload as unknown as { payload: { number: number; label: string; pct: number } }).payload;
                        return [`£${v.toLocaleString("en-GB")} · ${p.pct}%`, `SDG ${p.number} ${p.label}`];
                      }}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ol className="space-y-2" data-testid="list-sdg-ranked">
                {sdgBreakdowns.map((s, idx) => (
                  <li key={s.number} className="flex items-center gap-3" data-testid={`sdg-rank-${s.number}`}>
                    <span className="shrink-0 w-7 h-7 rounded-md text-white text-[13px] font-bold inline-flex items-center justify-center" style={{ backgroundColor: s.color }}>
                      {s.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-foreground truncate">{s.label}</p>
                        <p className="text-[13px] font-bold text-foreground shrink-0">{s.pct}%</p>
                      </div>
                      <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {idx === 0 && <span className="font-semibold text-foreground">Leading · </span>}
                        £{s.value.toLocaleString("en-GB")} · {s.members} students · {s.activities} activities
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Cross-links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/org/activities" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-activities">
            <UsersIcon className="w-4 h-4 text-primary mb-1.5" />
            <p className="text-sm font-semibold text-foreground">Browse activities</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">See every logged activity and who took part.</p>
          </Link>
          <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-export-pdf">
            <FileText className="w-4 h-4 text-primary mb-1.5" />
            <p className="text-sm font-semibold text-foreground">Export a PDF report</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">A shareable impact summary for stakeholders.</p>
          </Link>
          <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-export-csv">
            <FileSpreadsheet className="w-4 h-4 text-primary mb-1.5" />
            <p className="text-sm font-semibold text-foreground">Download CSV data</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Raw activity data for your own analysis.</p>
          </Link>
        </div>

        <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
          <Globe2 className="w-3.5 h-3.5" /> Figures update live as students log activities.
        </p>
      </div>
    </div>
  );
}
