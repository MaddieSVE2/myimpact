import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, TrendingUp, Users, Clock, BarChart2, MapPin, Lightbulb, GraduationCap, Briefcase, Flag, ClipboardList, Lock } from "lucide-react";
import { scrollContentToTop } from "@/lib/scroll-utils";
import { formatAxisCurrency, formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { DEMO_PULSE_SURVEYS } from "@/lib/org-demo-mock";

const BASE_DEMO = {
  org: { name: "Demo Organisation", type: "Corporate", location: "North West, England" },
  headline: {
    totalSocialValue: 73700,
    members: 47,
    activeMembers: 28,
    totalHours: 940,
    avgPerPerson: 2632,
    avgHoursPerPerson: 34,
  },
  valueByCategory: [
    { category: "Volunteering", value: 34800, members: 30, activities: 65, hours: 860, sdgColor: "#C5192D" },
    { category: "Environment", value: 16600, members: 18, activities: 35, hours: 390, sdgColor: "#3F7E44" },
    { category: "Personal Dev", value: 11600, members: 15, activities: 26, hours: 220, sdgColor: "#A21942" },
    { category: "Community", value: 7400, members: 13, activities: 17, hours: 150, sdgColor: "#FD9D24" },
    { category: "Donations", value: 3300, members: 9, activities: 10, hours: 25, sdgColor: "#E5243B" },
  ],
  activities: [
    { name: "Food bank volunteering", participants: 35, hours: 340, value: 16800 },
    { name: "Youth mentoring", participants: 14, hours: 130, value: 12500 },
    { name: "Community garden", participants: 22, hours: 260, value: 9900 },
    { name: "Cycling & active travel", participants: 40, hours: 125, value: 8800 },
    { name: "Charity fundraising", participants: 28, hours: 40, value: 8200 },
    { name: "Recycling & composting", participants: 55, hours: 95, value: 5800 },
    { name: "Community events", participants: 22, hours: 60, value: 4100 },
    { name: "Litter picking", participants: 36, hours: 72, value: 3300 },
  ],
  sdgs: [
    { number: 4, label: "Quality Education", color: "#C5192D", pct: 18, members: 11, activities: 15, value: 13500 },
    { number: 10, label: "Reduced Inequalities", color: "#DD1367", pct: 16, members: 9, activities: 13, value: 12000 },
    { number: 3, label: "Good Health", color: "#4C9F38", pct: 14, members: 9, activities: 11, value: 10500 },
    { number: 1, label: "No Poverty", color: "#E5243B", pct: 12, members: 7, activities: 10, value: 9000 },
    { number: 13, label: "Climate Action", color: "#3F7E44", pct: 12, members: 8, activities: 10, value: 9000 },
    { number: 11, label: "Sustainable Cities", color: "#FD9D24", pct: 11, members: 7, activities: 9, value: 8300 },
    { number: 8, label: "Decent Work", color: "#A21942", pct: 9, members: 6, activities: 7, value: 6800 },
    { number: 2, label: "Zero Hunger", color: "#DDA63A", pct: 8, members: 5, activities: 6, value: 6000 },
  ],
  regions: [
    { region: "North West", members: 12, hours: 248, value: 19200, sroi: 8.38, pct: 26 },
    { region: "Yorkshire and The Humber", members: 9, hours: 176, value: 14300, sroi: 8.36, pct: 19 },
    { region: "West Midlands", members: 8, hours: 160, value: 12500, sroi: 8.24, pct: 17 },
    { region: "South East", members: 7, hours: 140, value: 11000, sroi: 8.30, pct: 15 },
    { region: "London", members: 5, hours: 100, value: 8100, sroi: 8.55, pct: 11 },
    { region: "South West", members: 3, hours: 60, value: 4600, sroi: 8.07, pct: 6 },
    { region: "North East", members: 3, hours: 55, value: 4000, sroi: 7.10, pct: 6 },
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
    "Youth mentoring produces the highest social value per hour at £96.15, making it the most impactful use of member time.",
    "The top 10% of contributors generate 34% of total social value, typical for a corporate volunteering programme.",
    "Member engagement is up 22% since January, driven largely by the new community garden programme launched in March.",
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
  // Targets and head counts are scaled per example organisation, so each
  // description is written from the scaled figures.
  challenges: [
    {
      id: "demo-ch-001", name: "Spring community sprint",
      describe: (target: number, _people: number) => `Hit ${formatCurrency(target)} of Community-category social value before the end of June.`,
      goalType: "social_value" as const, target: 3000, progressTotal: 2150, progressPercent: 72,
      participantCount: 12, startDate: "2026-04-01T00:00:00.000Z", endDate: "2026-06-30T23:59:59.000Z",
      hasEnded: false, isActive: true,
    },
    {
      id: "demo-ch-002", name: "Environmental hours",
      describe: (target: number, _people: number) => `A combined goal across all members to log ${target.toLocaleString("en-GB")} hours of environmental work this quarter.`,
      goalType: "hours" as const, target: 150, progressTotal: 92, progressPercent: 61,
      participantCount: 11, startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-07-31T23:59:59.000Z",
      hasEnded: false, isActive: true,
    },
    {
      id: "demo-ch-003", name: "Reading mentor month",
      describe: (_target: number, people: number) => `Get ${people.toLocaleString("en-GB")} members signed up as weekly reading mentors at local primary schools.`,
      goalType: "social_value" as const, target: 1500, progressTotal: 870, progressPercent: 58,
      participantCount: 7, startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-31T23:59:59.000Z",
      hasEnded: false, isActive: true,
    },
    {
      id: "demo-ch-004", name: "Winter fundraising drive",
      describe: (target: number, _people: number) => `Reach ${formatCurrency(target)} of fundraising activity across the organisation.`,
      goalType: "social_value" as const, target: 5000, progressTotal: 5240, progressPercent: 100,
      participantCount: 18, startDate: "2025-12-01T00:00:00.000Z", endDate: "2026-02-28T23:59:59.000Z",
      hasEnded: true, isActive: false,
    },
  ],
  pulse: DEMO_PULSE_SURVEYS,
  monthlyTimeline: [
    { month: "Jan", value: 7200 },
    { month: "Feb", value: 16400 },
    { month: "Mar", value: 31600 },
    { month: "Apr", value: 51200 },
    { month: "May", value: 73700 },
  ] satisfies MonthlyDataPoint[],
};

type SharedDemoType = "charity" | "corporate" | "public";

// Estimated cost to the organisation of recruiting, onboarding and
// supporting one member, used for the SROI figures.
const ORG_COST_PER_MEMBER = 475;

// Every example shows over £1m of social value. Each headline is internally
// consistent: avgPerPerson and avgHoursPerPerson are the totals divided by
// activeMembers, and the breakdowns are scaled to add up to the totals.
const DEMO_VARIANTS: Record<SharedDemoType, {
  org: { name: string; type: string; location: string };
  headline: typeof BASE_DEMO.headline;
  insights: (activeMembers: string) => string[];
}> = {
  charity: {
    org: { name: "Community Action Network", type: "Charity", location: "UK-wide" },
    headline: {
      totalSocialValue: 2008700,
      members: 1460,
      activeMembers: 1286,
      totalHours: 29580,
      avgPerPerson: 1562,
      avgHoursPerPerson: 23,
    },
    insights: (activeMembers) => [
      `${activeMembers} people have logged activity this year, with food support and community outreach attracting the broadest participation.`,
      "Youth mentoring produces the highest social value per hour, making it a strong candidate for further programme investment.",
      "Environmental projects are growing fastest, with participation up 24% since January.",
      "Regular activity across seven UK regions gives the charity strong evidence for funders and annual reporting.",
    ],
  },
  corporate: {
    org: { name: "Northstar Group", type: "Corporate", location: "UK offices" },
    headline: {
      totalSocialValue: 3503500,
      members: 2368,
      activeMembers: 2024,
      totalHours: 56670,
      avgPerPerson: 1731,
      avgHoursPerPerson: 28,
    },
    insights: (activeMembers) => [
      `${activeMembers} employees have participated this year, with team volunteering days driving the strongest uptake.`,
      "Skills-based mentoring creates the highest social value per hour across the programme.",
      "Participation is strongest in the North West and London offices, highlighting an opportunity to expand regional campaigns.",
      "Employee engagement has risen 19% since the spring community challenge launched.",
    ],
  },
  public: {
    org: { name: "Rivermere Council", type: "Public Sector", location: "Rivermere, England" },
    headline: {
      totalSocialValue: 1617700,
      members: 1180,
      activeMembers: 971,
      totalHours: 27190,
      avgPerPerson: 1666,
      avgHoursPerPerson: 28,
    },
    insights: (activeMembers) => [
      `${activeMembers} staff and community partners have logged activity across neighbourhood programmes this year.`,
      "Food support and youth mentoring deliver the strongest measured social value.",
      "Environmental participation is spread across every district, supporting place-based reporting.",
      "Community challenge participation is highest where local teams coordinate shared activity days.",
    ],
  },
};

// Scales `values` so they add up to exactly `total`; rounding drift goes on
// the largest item so a breakdown always matches its headline figure.
function scaleToTotal(values: number[], total: number): number[] {
  const sum = values.reduce((s, v) => s + v, 0);
  const scaled = values.map(v => Math.round((v / sum) * total));
  const drift = total - scaled.reduce((s, v) => s + v, 0);
  scaled[scaled.indexOf(Math.max(...scaled))] += drift;
  return scaled;
}

function roundToNearest(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

function getDemoData(type: SharedDemoType) {
  const variant = DEMO_VARIANTS[type];
  const { totalSocialValue, members, activeMembers, totalHours } = variant.headline;
  const valueScale = totalSocialValue / BASE_DEMO.headline.totalSocialValue;
  const memberScale = members / BASE_DEMO.headline.members;
  const hoursScale = totalHours / BASE_DEMO.valueByCategory.reduce((s, c) => s + c.hours, 0);
  const scaleCount = (value: number, factor: number) => Math.max(1, Math.round(value * factor));

  const categoryValues = scaleToTotal(BASE_DEMO.valueByCategory.map(c => c.value), totalSocialValue);
  const categoryHours = scaleToTotal(BASE_DEMO.valueByCategory.map(c => c.hours), totalHours);
  const sdgValues = scaleToTotal(BASE_DEMO.sdgs.map(s => s.value), totalSocialValue);
  const regionMembers = scaleToTotal(BASE_DEMO.regions.map(r => r.members), members);
  const regionHours = scaleToTotal(BASE_DEMO.regions.map(r => r.hours), totalHours);
  const regionValues = scaleToTotal(BASE_DEMO.regions.map(r => r.value), totalSocialValue);

  return {
    ...BASE_DEMO,
    org: variant.org,
    headline: variant.headline,
    valueByCategory: BASE_DEMO.valueByCategory.map((item, i) => ({
      ...item,
      value: categoryValues[i]!,
      members: scaleCount(item.members, memberScale),
      activities: scaleCount(item.activities, valueScale),
      hours: categoryHours[i]!,
    })),
    // `participants` is a percentage of members, so it is not scaled.
    activities: BASE_DEMO.activities.map(item => ({
      ...item,
      hours: scaleCount(item.hours, hoursScale),
      value: Math.round(item.value * valueScale),
    })),
    sdgs: BASE_DEMO.sdgs.map((item, i) => ({
      ...item,
      members: scaleCount(item.members, memberScale),
      activities: scaleCount(item.activities, valueScale),
      value: sdgValues[i]!,
    })),
    regions: BASE_DEMO.regions.map((item, i) => ({
      ...item,
      members: regionMembers[i]!,
      hours: regionHours[i]!,
      value: regionValues[i]!,
      sroi: Math.round((regionValues[i]! / (regionMembers[i]! * ORG_COST_PER_MEMBER)) * 100) / 100,
    })),
    insights: variant.insights(activeMembers.toLocaleString("en-GB")),
    volunteerProgression: {
      ...BASE_DEMO.volunteerProgression,
      membersWithEmployabilitySkills: Math.round(activeMembers * 0.72),
      membersWithMultipleRoles: Math.round(activeMembers * 0.38),
    },
    challenges: BASE_DEMO.challenges.map(item => {
      const target = item.goalType === "hours"
        ? roundToNearest(item.target * hoursScale, 50)
        : roundToNearest(item.target * valueScale, 1000);
      const participantCount = scaleCount(item.participantCount, memberScale);
      return {
        ...item,
        target,
        progressTotal: Math.round(target * (item.progressTotal / item.target)),
        participantCount,
        description: item.describe(target, participantCount),
      };
    }),
    monthlyTimeline: BASE_DEMO.monthlyTimeline.map((item, index, rows) => ({
      ...item,
      value: Math.round(totalSocialValue * ((index + 1) / rows.length)),
    })),
  };
}

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
        <Icon className={`w-4 h-4 ${highlight ? "text-white/90" : "text-primary"}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${highlight ? "text-white/90" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-white" : "text-foreground"}`}>
        {rawValue !== undefined ? (
          <>{prefix}<AnimatedNumber value={rawValue} decimals={decimals ?? 0} formatter={decimals ? undefined : (v => value.replace(/[\d,]+/, v.toLocaleString("en-GB")))} /></>
        ) : value}
      </p>
      {sub && <p className={`text-xs mt-1 ${highlight ? "text-white/90" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

export default function OrgDemoDashboard({
  hideBanner,
  demoType = "charity",
}: {
  hideBanner?: boolean;
  demoType?: SharedDemoType;
} = {}) {
  useEffect(() => { scrollContentToTop(); }, []);
  const DEMO = getDemoData(demoType);
  const maxActivity = Math.max(...DEMO.activities.map(a => a.value));
  const orgCostPerVolunteer = ORG_COST_PER_MEMBER;
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

      <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
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
            <p className="text-sm font-semibold text-foreground">Jan – May 2026</p>
          </div>
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-5 border bg-primary text-white border-primary">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-white/90" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/90">Total social value</p>
            </div>
            <p className="text-2xl font-display font-bold text-white">
              £<AnimatedNumber value={DEMO.headline.totalSocialValue} formatter={v => v.toLocaleString("en-GB")} />
            </p>
          </div>
          <StatCard icon={BarChart2} label="SROI ratio" value={`£${sroiRatio}`} rawValue={parseFloat(sroiRatio)} decimals={2} prefix="£" sub="for every £1 invested" />
          <StatCard icon={Users} label="Members" value={String(DEMO.headline.members)} rawValue={DEMO.headline.members} sub={`${DEMO.headline.activeMembers.toLocaleString("en-GB")} with saved records`} />
          <div className="rounded-xl p-5 border bg-white border-border">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total hours given</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={DEMO.headline.totalHours} formatter={v => v.toLocaleString("en-GB")} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">hours contributed</p>
          </div>
        </div>

        {/* Impact over time */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Impact over time</SectionLabel>
          <SectionTitle>Social value accumulation, Jan to May 2026</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Total social value generated by members Jan–May 2026. Data is illustrative for this demo.</p>
          <ImpactTimeline data={DEMO.monthlyTimeline} />
        </div>

        {/* SROI explainer */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>What is SROI?</SectionLabel>
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Social Return on Investment (SROI) measures how much social value is created for every £1 an organisation invests. For {DEMO.org.name}, the estimated organisational investment (covering member recruitment, onboarding, ongoing support, and administrative overhead) is around <strong className="text-foreground">£{orgCostPerVolunteer} per member</strong>. With <strong className="text-foreground">{DEMO.headline.members.toLocaleString("en-GB")} members</strong>, that gives a total investment of <strong className="text-foreground">£{totalOrgCost.toLocaleString("en-GB")}</strong>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Dividing the total social value of <strong className="text-foreground">{formatCurrency(DEMO.headline.totalSocialValue)}</strong> by that investment gives an SROI of <strong className="text-foreground">£{sroiRatio}</strong>, meaning for every <strong className="text-foreground">£1</strong> {DEMO.org.name} invested in its members, <strong className="text-foreground">£{sroiRatio} of social value</strong> was generated for the community.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Org. investment</p>
                <p className="text-3xl font-display font-bold text-foreground">£{orgCostPerVolunteer}</p>
                <p className="text-xs text-muted-foreground mt-1">per member</p>
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
                <p className="text-xs text-primary mt-1">for every £1 invested</p>
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
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={formatAxisCurrency} width={40} />
                <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  {DEMO.valueByCategory.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "var(--brand-orange-bright)" : i === 1 ? "#B5BE2E" : i === 2 ? "#A8C8DA" : i === 3 ? "#7E8FAD" : "var(--brand-orange)"} />
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
            <div className="h-64" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer={false}>
                  <Pie data={DEMO.sdgs} dataKey="pct" nameKey="label" cx="50%" cy="50%" innerRadius={56} outerRadius={96} paddingAngle={2} isAnimationActive rootTabIndex={-1}>
                    {DEMO.sdgs.map((s) => (
                      <Cell
                        key={s.number}
                        fill={s.color}
                        stroke="#fff"
                        strokeWidth={2}
                        aria-label={`SDG ${s.number} ${s.label}: ${s.pct}%`}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: number, _n, payload) => {
                      const p = (payload as unknown as { payload: { number: number; label: string; members: number; activities: number } }).payload;
                      return [`${v}% · ${p.members.toLocaleString("en-GB")} members · ${p.activities.toLocaleString("en-GB")} activities`, `SDG ${p.number} ${p.label}`];
                    }}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="space-y-2.5">
              {DEMO.sdgs.map((s, idx) => (
                <li key={s.number} className="flex items-center gap-3">
                  <span
                    className={`shrink-0 w-7 h-7 rounded-md text-xs font-bold inline-flex items-center justify-center ${s.number === 11 ? "text-foreground" : "text-white"}`}
                    style={{ backgroundColor: s.color }}
                  >
                    {s.number}
                  </span>
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
                      {formatCurrency(s.value)} · {s.members.toLocaleString("en-GB")} members · {s.activities.toLocaleString("en-GB")} activities
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
                    <span className="font-semibold text-foreground">{c.members.toLocaleString("en-GB")}</span> members · <span className="font-semibold text-foreground">{c.activities.toLocaleString("en-GB")}</span> activities · <span className="font-semibold text-foreground">{c.hours.toLocaleString("en-GB")}</span> hrs
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
                    <p className="text-xs text-muted-foreground">{r.members.toLocaleString("en-GB")} members</p>
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

        {/* Member Progression */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Member progression</SectionLabel>
          <SectionTitle>Employability evidence your members are building</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            Beyond the collective social value figure, every member is building a personal My Impact record, portable proof of their contribution that goes far beyond what any reference letter can say.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-center">
              <p className="text-[11px] text-primary uppercase tracking-wide font-semibold mb-1">With employment-relevant skills</p>
              <p className="text-3xl font-display font-bold text-primary">
                <AnimatedNumber value={DEMO.volunteerProgression.pctWithEmployabilitySkills} formatter={v => `${v}%`} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">{DEMO.volunteerProgression.membersWithEmployabilitySkills.toLocaleString("en-GB")} of {DEMO.headline.activeMembers.toLocaleString("en-GB")} active members</p>
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
                Each member's My Impact record shows calculated social value, logged hours, and evidenced skills, something they can share directly with employers or include in applications. Your organisation's investment in their development becomes visible, measurable proof rather than an unsupported claim.
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
              const targetLabel = c.goalType === "social_value" ? formatCurrency(c.target) : `${c.target.toLocaleString("en-GB")} hrs`;
              const progressLabel = c.goalType === "social_value" ? formatCurrency(c.progressTotal) : `${Math.round(c.progressTotal).toLocaleString("en-GB")} hrs`;
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
                    <span className="font-semibold text-foreground">{progressLabel}</span> of {targetLabel} · {c.participantCount.toLocaleString("en-GB")} members participating · {endsLabel}
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
                      <p className="text-[10px] text-muted-foreground mt-1">{p.totals.responses.toLocaleString("en-GB")} responses</p>
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
            <p className="text-sm text-white/90 max-w-sm">Register your organisation, share the invite code with your members, and your dashboard populates automatically.</p>
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
