import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, TrendingUp, Users, Clock, BarChart2, MapPin, Lightbulb, GraduationCap, Briefcase, Flag, ClipboardList, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { DEMO_CHALLENGES, DEMO_PULSE_SURVEYS } from "@/lib/org-demo-mock";

const DEMO = {
  org: { name: "Demo Organisation", type: "Corporate", location: "North West, England" },
  headline: {
    totalSocialValue: 184320,
    members: 47,
    activeMembers: 32,
    totalHours: 2340,
    avgPerPerson: 5760,
    avgHoursPerPerson: 73,
  },
  valueByCategory: [
    { category: "Volunteering", value: 87200, members: 38, activities: 162, hours: 2150, sdgColor: "#C5192D" },
    { category: "Environment", value: 41600, members: 24, activities: 88, hours: 980, sdgColor: "#3F7E44" },
    { category: "Personal Dev", value: 28900, members: 19, activities: 64, hours: 540, sdgColor: "#A21942" },
    { category: "Community", value: 18400, members: 16, activities: 42, hours: 380, sdgColor: "#FD9D24" },
    { category: "Donations", value: 8220, members: 11, activities: 24, hours: 60, sdgColor: "#E5243B" },
  ],
  activities: [
    { name: "Food bank volunteering", participants: 42, hours: 860, value: 42000 },
    { name: "Youth mentoring", participants: 18, hours: 320, value: 31200 },
    { name: "Community garden", participants: 28, hours: 650, value: 24800 },
    { name: "Cycling & active travel", participants: 52, hours: 310, value: 22100 },
    { name: "Charity fundraising", participants: 35, hours: 95, value: 20400 },
    { name: "Recycling & composting", participants: 68, hours: 240, value: 14600 },
    { name: "Community events", participants: 28, hours: 155, value: 10200 },
    { name: "Litter picking", participants: 45, hours: 180, value: 8320 },
  ],
  sdgs: [
    { number: 4, label: "Quality Education", color: "#C5192D", pct: 18, members: 14, activities: 38, value: 33840 },
    { number: 10, label: "Reduced Inequalities", color: "#DD1367", pct: 16, members: 12, activities: 32, value: 30080 },
    { number: 3, label: "Good Health", color: "#4C9F38", pct: 14, members: 11, activities: 28, value: 26320 },
    { number: 1, label: "No Poverty", color: "#E5243B", pct: 12, members: 9, activities: 24, value: 22560 },
    { number: 13, label: "Climate Action", color: "#3F7E44", pct: 12, members: 10, activities: 26, value: 22560 },
    { number: 11, label: "Sustainable Cities", color: "#FD9D24", pct: 11, members: 8, activities: 22, value: 20680 },
    { number: 8, label: "Decent Work", color: "#A21942", pct: 9, members: 7, activities: 18, value: 16920 },
    { number: 2, label: "Zero Hunger", color: "#DDA63A", pct: 8, members: 6, activities: 16, value: 15040 },
  ],
  regions: [
    { region: "North West", members: 12, hours: 620, value: 47800, sroi: 8.38, pct: 26 },
    { region: "Yorkshire and The Humber", members: 9, hours: 440, value: 35700, sroi: 8.36, pct: 19 },
    { region: "West Midlands", members: 8, hours: 398, value: 31300, sroi: 8.24, pct: 17 },
    { region: "South East", members: 7, hours: 348, value: 27600, sroi: 8.30, pct: 15 },
    { region: "London", members: 5, hours: 248, value: 20300, sroi: 8.55, pct: 11 },
    { region: "South West", members: 3, hours: 148, value: 11500, sroi: 8.07, pct: 6 },
    { region: "North East", members: 3, hours: 138, value: 10120, sroi: 7.10, pct: 6 },
  ] satisfies RegionData[],
  skills: [
    { skill: "Teamwork", pct: 72 },
    { skill: "Communication", pct: 65 },
    { skill: "Problem solving", pct: 48 },
    { skill: "Leadership", pct: 31 },
    { skill: "Project management", pct: 24 },
    { skill: "Digital skills", pct: 18 },
  ],
  insights: [
    "68% of members recycle or compost regularly, the highest-participation activity across the group.",
    "Youth mentoring produces the highest social value per hour at £97.50, making it the most impactful use of member time.",
    "The top 10% of contributors generate 34% of total social value, typical for a youth charity of this size.",
    "Member engagement has grown 38% since January, driven largely by the new community garden programme.",
  ],
  volunteerProgression: {
    membersWithEmployabilitySkills: 34,
    pctWithEmployabilitySkills: 72,
    topEmployabilitySkills: [
      { skill: "Teamwork", pct: 72 },
      { skill: "Communication", pct: 65 },
      { skill: "Leadership", pct: 31 },
      { skill: "Problem solving", pct: 48 },
    ],
    membersWithMultipleRoles: 18,
    avgMonthsActive: 14,
  },
  challenges: DEMO_CHALLENGES,
  pulse: DEMO_PULSE_SURVEYS,
  monthlyTimeline: [
    { month: "Jan", value: 8200 },
    { month: "Feb", value: 11400 },
    { month: "Mar", value: 14800 },
    { month: "Apr", value: 18600 },
    { month: "May", value: 23900 },
    { month: "Jun", value: 29400 },
    { month: "Jul", value: 38700 },
    { month: "Aug", value: 47200 },
    { month: "Sep", value: 62800 },
    { month: "Oct", value: 98400 },
    { month: "Nov", value: 142600 },
    { month: "Dec", value: 184320 },
  ] satisfies MonthlyDataPoint[],
};

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

function AnimatedSkillBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
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
  return <div ref={barRef} className="h-full rounded-full bg-primary/60" style={{ width: "0%" }} />;
}

function StatCard({ icon: Icon, label, value, rawValue, decimals, prefix, sub, highlight }: {
  icon: any; label: string; value: string; rawValue?: number; decimals?: number; prefix?: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-primary text-white border-primary" : "bg-white border-border"}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${highlight ? "text-white/70" : "text-primary"}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${highlight ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-white" : "text-foreground"}`}>
        {rawValue !== undefined ? (
          <>{prefix}<AnimatedNumber value={rawValue} decimals={decimals ?? 0} formatter={decimals ? undefined : (v => value.replace(/[\d,]+/, v.toLocaleString("en-GB")))} /></>
        ) : value}
      </p>
      {sub && <p className={`text-xs mt-1 ${highlight ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

export default function OrgDemoDashboard({ hideBanner }: { hideBanner?: boolean } = {}) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const maxActivity = Math.max(...DEMO.activities.map(a => a.value));
  const socialValuePerHour = Math.round(DEMO.headline.totalSocialValue / DEMO.headline.totalHours);
  const socialValuePerHourFormatted = `£${socialValuePerHour.toLocaleString("en-GB")}`;
  const orgCostPerVolunteer = 475;
  const totalOrgCost = DEMO.headline.members * orgCostPerVolunteer;
  const sroiRatio = (DEMO.headline.totalSocialValue / totalOrgCost).toFixed(2);

  return (
    <div className="min-h-screen bg-muted/20">
      {!hideBanner && (
        <div className="sticky top-0 z-20 bg-primary/10 border-b border-primary/20 px-4 py-2.5 text-center backdrop-blur-sm">
          <p className="text-xs font-semibold text-primary">
            This is example data for illustration. Your real dashboard populates as members log their activities.
          </p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Back link */}
        <Link href="/org/register" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to registration
        </Link>

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide">Example · {DEMO.org.type}</span>
              <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">Demo data</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground leading-tight">{DEMO.org.name}: Example Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {DEMO.org.location}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Dashboard period</p>
            <p className="text-sm font-semibold text-foreground">Jan – Dec 2026</p>
          </div>
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-5 border bg-primary text-white border-primary">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-white/70" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Total social value</p>
            </div>
            <p className="text-2xl font-display font-bold text-white">
              £<AnimatedNumber value={DEMO.headline.totalSocialValue} formatter={v => v.toLocaleString("en-GB")} />
            </p>
          </div>
          <StatCard icon={BarChart2} label="SROI ratio" value={`£${sroiRatio}`} rawValue={parseFloat(sroiRatio)} decimals={2} prefix="£" sub="for every £1 invested" />
          <StatCard icon={Users} label="Members" value={String(DEMO.headline.members)} rawValue={DEMO.headline.members} sub={`${DEMO.headline.activeMembers} with saved records`} />
          <div className="rounded-xl p-5 border bg-white border-border">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total hours given</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={DEMO.headline.totalHours} formatter={v => v.toLocaleString("en-GB")} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">volunteering hours</p>
          </div>
        </div>

        {/* Impact over time */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Impact over time</SectionLabel>
          <SectionTitle>Social value accumulation, Jan to Dec 2026</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Total social value generated by members across the year, shown month by month. Data is illustrative for this demo.</p>
          <ImpactTimeline data={DEMO.monthlyTimeline} />
        </div>

        {/* SROI explainer */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>What is SROI?</SectionLabel>
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Social Return on Investment (SROI) measures how much social value is created for every £1 an organisation invests. For Demo Organisation, the estimated organisational investment (covering volunteer finding, onboarding, ongoing support, and administrative overhead) is around <strong className="text-foreground">£{orgCostPerVolunteer} per volunteer</strong>. With <strong className="text-foreground">{DEMO.headline.members} members</strong>, that gives a total investment of <strong className="text-foreground">£{totalOrgCost.toLocaleString("en-GB")}</strong>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Dividing the total social value of <strong className="text-foreground">{formatCurrency(DEMO.headline.totalSocialValue)}</strong> by that investment gives an SROI of <strong className="text-foreground">£{sroiRatio}</strong>, meaning for every <strong className="text-foreground">£1</strong> Demo Organisation invested in its volunteers, <strong className="text-foreground">£{sroiRatio} of social value</strong> was generated for the community.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Org. investment</p>
                <p className="text-3xl font-display font-bold text-foreground">£{orgCostPerVolunteer}</p>
                <p className="text-xs text-muted-foreground mt-1">per volunteer</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Per member</p>
                <p className="text-3xl font-display font-bold text-foreground">
                  £<AnimatedNumber value={DEMO.headline.avgPerPerson} formatter={v => v.toLocaleString("en-GB")} />
                </p>
                <p className="text-xs text-muted-foreground mt-1">social value generated</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Hours per member</p>
                <p className="text-3xl font-display font-bold text-foreground">
                  <AnimatedNumber value={DEMO.headline.avgHoursPerPerson} />
                </p>
                <p className="text-xs text-muted-foreground mt-1">average per year</p>
              </div>
              <div className="bg-primary/10 rounded-xl p-4 text-center">
                <p className="text-[11px] text-primary uppercase tracking-wide font-semibold mb-1">SROI</p>
                <p className="text-3xl font-display font-bold text-primary">£{sroiRatio}</p>
                <p className="text-xs text-primary/70 mt-1">for every £1 invested</p>
              </div>
            </div>
          </div>
        </div>

        {/* Social value by category */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Activity breakdown</SectionLabel>
          <SectionTitle>Social value by category</SectionTitle>
          <div className="h-[220px] mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEMO.valueByCategory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} width={40} />
                <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  {DEMO.valueByCategory.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#F06127" : i === 1 ? "#B5BE2E" : i === 2 ? "#A8C8DA" : i === 3 ? "#7E8FAD" : "#E8633A"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Activity detail table */}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top activities</p>
          <div className="space-y-2">
            {DEMO.activities.map((a, idx) => (
              <div key={a.name} className="py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground truncate min-w-0">{a.name}</p>
                  <p className="text-sm font-bold text-primary shrink-0">{formatCurrency(a.value)}</p>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden mb-2">
                  <AnimatedBar pct={(a.value / maxActivity) * 100} delay={idx * 60} />
                </div>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span><span className="font-semibold text-foreground">{a.participants}%</span> participants</span>
                  <span><span className="font-semibold text-foreground">{a.hours.toLocaleString("en-GB")}</span> hrs</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Participant % shows share of members who logged this activity. All data is anonymised.</p>
        </div>

        {/* SDG alignment, donut + ranked list to mirror live OrgDashboard */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Global goals</SectionLabel>
          <SectionTitle>UN Sustainable Development Goals (SDGs)</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Where your members' social value lands across the global goals. Sorted by share so you can see your leading contribution at a glance.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={DEMO.sdgs} dataKey="pct" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={96} paddingAngle={2} isAnimationActive>
                    {DEMO.sdgs.map((s) => (
                      <Cell key={s.number} fill={s.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: number, _n, payload) => {
                      const p = (payload as unknown as { payload: { number: number; label: string; members: number; activities: number } }).payload;
                      return [`${v}% · ${p.members} members · ${p.activities} activities`, `SDG ${p.number} ${p.label}`];
                    }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="space-y-2.5">
              {DEMO.sdgs.map((s, idx) => (
                <li key={s.number} className="flex items-center gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-md text-white text-xs font-bold inline-flex items-center justify-center" style={{ backgroundColor: s.color }}>{s.number}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                      <p className="text-xs font-bold text-foreground shrink-0">{s.pct}%</p>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct * 4}%`, backgroundColor: s.color }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {idx === 0 && <span className="font-semibold text-foreground">Leading goal · </span>}
                      {formatCurrency(s.value)} · {s.members} members · {s.activities} activities
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-[11px] text-muted-foreground mt-4">Goal alignment is calculated using the Social Value Engine methodology, which maps each volunteering activity to its primary and secondary UN Sustainable Development Goals (SDGs).</p>
        </div>

        {/* Top categories your people are active in, mirrors live OrgDashboard */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Engagement</SectionLabel>
          <SectionTitle>Top categories your people are active in</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Ranked by social value, with the people, hours and activity counts behind each one. Bar colour matches the leading SDG for that category.</p>
          <div className="space-y-3">
            {DEMO.valueByCategory.map((c, idx) => {
              const max = Math.max(1, ...DEMO.valueByCategory.map(x => x.value));
              return (
                <div key={c.category} className="py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-bold text-muted-foreground w-4 text-right">{idx + 1}.</span>
                      <p className="text-sm font-semibold text-foreground truncate">{c.category}</p>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">Top</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">{formatCurrency(c.value)}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                    <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, backgroundColor: c.sdgColor }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.members}</span> members · <span className="font-semibold text-foreground">{c.activities}</span> activities · <span className="font-semibold text-foreground">{c.hours.toLocaleString("en-GB")}</span> hrs
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regional distribution, Map */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Geographic spread</SectionLabel>
          <SectionTitle>Where your members are</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Member activity by UK region. Click any shaded area for details. Darker shading indicates higher activity concentration.</p>
          <UKRegionMap regions={DEMO.regions} />
          {/* Accessibility legend */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Region summary</p>
            <div className="space-y-2">
              {DEMO.regions.map((r) => (
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
        </div>

        {/* Skills & Development */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Skills & development</SectionLabel>
          <SectionTitle>What your members are learning</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Skills gained are self-reported by members as part of their activity logging. Percentage shows share of members reporting each skill.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {DEMO.skills.map((s, idx) => (
              <div key={s.skill} className="flex items-center gap-3">
                <div className="shrink-0">
                  <GraduationCap className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{s.skill}</p>
                    <p className="text-sm font-bold text-primary">{s.pct}%</p>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <AnimatedSkillBar pct={s.pct} delay={idx * 80} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Volunteer Progression */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Volunteer progression</SectionLabel>
          <SectionTitle>Employability evidence your members are building</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            Beyond the collective social value figure, every volunteer is building a personal My Impact record, portable proof of their contribution that goes far beyond what any reference letter can say.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-center">
              <p className="text-[11px] text-primary uppercase tracking-wide font-semibold mb-1">With employment-relevant skills</p>
              <p className="text-3xl font-display font-bold text-primary">
                <AnimatedNumber value={DEMO.volunteerProgression.pctWithEmployabilitySkills} formatter={v => `${v}%`} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">{DEMO.volunteerProgression.membersWithEmployabilitySkills} of {DEMO.headline.activeMembers} active members</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">With multiple roles</p>
              <p className="text-3xl font-display font-bold text-foreground">
                <AnimatedNumber value={DEMO.volunteerProgression.membersWithMultipleRoles} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">members evidencing 2+ activity types</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Avg. months active</p>
              <p className="text-3xl font-display font-bold text-foreground">
                <AnimatedNumber value={DEMO.volunteerProgression.avgMonthsActive} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">sustained engagement per member</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top employment-relevant skills evidenced</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-5">
            {DEMO.volunteerProgression.topEmployabilitySkills.map((s, idx) => (
              <div key={s.skill} className="flex items-center gap-3">
                <div className="shrink-0">
                  <Briefcase className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{s.skill}</p>
                    <p className="text-sm font-bold text-primary">{s.pct}%</p>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <AnimatedSkillBar pct={s.pct} delay={idx * 80} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <Briefcase className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 mb-1">Better than a reference letter</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Each volunteer's My Impact record shows calculated social value, logged hours, and evidenced skills, something they can share directly with employers or include in applications. Your organisation's investment in their development becomes visible, measurable proof rather than an unsupported claim.
              </p>
            </div>
          </div>
        </div>

        {/* Organisational challenges */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Shared goals</SectionLabel>
          <SectionTitle>Organisational challenges</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Time-bound goals your organisation is working towards together. Members see progress on their home page and can rally around the target.</p>
          <div className="space-y-3">
            {DEMO.challenges.map((c) => {
              const pct = Math.min(100, Math.max(0, Math.round(c.progressPercent)));
              const targetLabel = c.goalType === "social_value" ? formatCurrency(c.target) : `${c.target} hrs`;
              const progressLabel = c.goalType === "social_value" ? formatCurrency(c.progressTotal) : `${Math.round(c.progressTotal)} hrs`;
              const endDate = new Date(c.endDate);
              const endsLabel = `${c.hasEnded ? "Ended" : "Ends"} ${endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
              return (
                <div key={c.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Flag className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                        <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${c.hasEnded ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                          {c.hasEnded ? "Ended" : "Active"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                    </div>
                    <p className="text-xs font-bold text-foreground shrink-0">{pct}%</p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-1.5">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{progressLabel}</span> of {targetLabel} · {c.participantCount} members participating · {endsLabel}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pulse surveys */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Member voice</SectionLabel>
          <SectionTitle>Pulse check</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">30-second prompts that help you measure how members are feeling and how meaningful their work is. Anonymous by default.</p>
          <div className="space-y-3">
            {DEMO.pulse.map((p) => {
              const scheduleLabel = p.schedule === "monthly" ? "Monthly" : p.schedule === "quarterly" ? "Quarterly" : "One-off";
              const lastWindow = p.trend.length > 0 ? p.trend[p.trend.length - 1].label : "No data yet";
              return (
                <div key={p.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ClipboardList className="w-4 h-4 text-primary shrink-0" />
                        <p className="text-sm font-semibold text-foreground">{p.question}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{scheduleLabel}</span>
                        {p.anonymous && (
                          <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Anonymous
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">Latest window: {lastWindow}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-display font-bold text-foreground leading-none">{p.totals.average.toFixed(1)}<span className="text-xs text-muted-foreground"> / 5</span></p>
                      <p className="text-[10px] text-muted-foreground mt-1">{p.totals.responses} responses</p>
                    </div>
                  </div>
                  <div className="h-1.5 mt-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${(p.totals.average / 5) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Insights */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Insights</SectionLabel>
          <SectionTitle>What the data tells us</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-4">
            {DEMO.insights.map((insight, i) => (
              <div key={i} className="flex gap-3 p-4 bg-muted/20 rounded-xl">
                <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-sm text-foreground leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA strip */}
        <div className="bg-primary rounded-2xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-white">
          <div>
            <p className="text-lg font-display font-bold mb-1">Ready to see your real dashboard?</p>
            <p className="text-sm text-white/70 max-w-sm">Register your organisation, share the invite code with your members, and your dashboard populates automatically.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/org/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Register your organisation <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/org"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              Already registered? View your dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
