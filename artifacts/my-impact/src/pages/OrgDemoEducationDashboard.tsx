import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, TrendingUp, Users, Clock, BarChart2, GraduationCap, Lightbulb, Award, BookOpen, Coins } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { UKRegionMap, type RegionData } from "@/components/UKRegionMap";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";

const DEMO = {
  org: { name: "Northfield University — Student Services", type: "University", location: "Midlands, England" },
  headline: {
    totalSocialValue: 218650,
    members: 312,
    activeMembers: 247,
    totalHours: 3820,
    avgPerPerson: 885,
    avgHoursPerPerson: 15,
    studentsWithEvidencedActivity: 247,
    pctWithEvidence: 79,
  },
  valueByCategory: [
    { category: "Volunteering", value: 84300 },
    { category: "Personal Dev", value: 62100 },
    { category: "Community", value: 38400 },
    { category: "Leadership", value: 21850 },
    { category: "Environment", value: 12000 },
  ],
  activities: [
    { name: "Duke of Edinburgh (Gold / Silver)", participants: 38, hours: 920, value: 58400 },
    { name: "Peer tutoring & mentoring", participants: 52, hours: 760, value: 47200 },
    { name: "Society treasurer / committee role", participants: 44, hours: 540, value: 36100 },
    { name: "Sports team captain", participants: 29, hours: 480, value: 28800 },
    { name: "Charity fundraising events", participants: 61, hours: 320, value: 22600 },
    { name: "Community volunteering", participants: 57, hours: 450, value: 18300 },
    { name: "Environmental projects", participants: 33, hours: 210, value: 7250 },
  ],
  topSkills: [
    { skill: "Teamwork", pct: 78 },
    { skill: "Communication", pct: 71 },
    { skill: "Leadership", pct: 54 },
    { skill: "Problem solving", pct: 49 },
    { skill: "Project management", pct: 41 },
    { skill: "Time management", pct: 38 },
    { skill: "Digital skills", pct: 27 },
    { skill: "Public speaking", pct: 22 },
  ],
  activityByYear: [
    { year: "Year 1", students: 68, value: 51200 },
    { year: "Year 2", students: 104, value: 86400 },
    { year: "Year 3", students: 75, value: 81050 },
  ],
  employabilitySignals: {
    studentsWithLeadershipRole: 102,
    studentsWithCommunityActivity: 189,
    studentsWithAward: 84,
    avgActivitiesLogged: 3.8,
  },
  insights: [
    "79% of registered students have logged at least one activity — giving them portable evidence to include in UCAS statements or graduate applications.",
    "Peer tutoring delivers the highest social value per hour at £62.10, while also being the activity most cited by students in employability reflections.",
    "Students who log a leadership role (society committee, team captain) average 2.4× more hours of logged activity than those who do not.",
    "Year 2 students generate the highest total social value, driven by higher uptake of structured programmes like Duke of Edinburgh Gold.",
  ],
  regions: [
    { region: "West Midlands", members: 96, hours: 1180, value: 67300, sroi: 1.48, pct: 31 },
    { region: "East Midlands", members: 68, hours: 836, value: 47700, sroi: 1.48, pct: 22 },
    { region: "Yorkshire and The Humber", members: 46, hours: 565, value: 32000, sroi: 1.46, pct: 15 },
    { region: "London", members: 40, hours: 492, value: 27900, sroi: 1.47, pct: 13 },
    { region: "South East", members: 31, hours: 380, value: 21700, sroi: 1.47, pct: 10 },
    { region: "North West", members: 21, hours: 258, value: 14700, sroi: 1.47, pct: 7 },
    { region: "South West", members: 10, hours: 109, value: 7350, sroi: 1.55, pct: 3 },
  ] satisfies RegionData[],
  monthlyTimeline: [
    { month: "Jan", value: 7200 },
    { month: "Feb", value: 14600 },
    { month: "Mar", value: 24100 },
    { month: "Apr", value: 36800 },
    { month: "May", value: 52400 },
    { month: "Jun", value: 74900 },
    { month: "Jul", value: 91200 },
    { month: "Aug", value: 107500 },
    { month: "Sep", value: 132800 },
    { month: "Oct", value: 158200 },
    { month: "Nov", value: 186400 },
    { month: "Dec", value: 218650 },
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

export default function OrgDemoEducationDashboard({ hideBanner }: { hideBanner?: boolean } = {}) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const maxActivity = Math.max(...DEMO.activities.map(a => a.value));
  const socialValuePerHour = Math.round(DEMO.headline.totalSocialValue / DEMO.headline.totalHours);

  return (
    <div className="min-h-screen bg-muted/20">
      {!hideBanner && (
        <div className="sticky top-0 z-20 bg-primary/10 border-b border-primary/20 px-4 py-2.5 text-center backdrop-blur-sm">
          <p className="text-xs font-semibold text-primary">
            This is example data for illustration. Your real dashboard populates as students log their activities.
          </p>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <Link href="/org/register" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to registration
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold uppercase tracking-wide">Example · {DEMO.org.type}</span>
              <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">Demo data</span>
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground leading-tight">{DEMO.org.name}: Example Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" /> {DEMO.org.location}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Dashboard period</p>
            <p className="text-sm font-semibold text-foreground">Jan – Dec 2025</p>
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
          <div className="rounded-xl p-5 border bg-white border-border">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Social value per hour</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              £<AnimatedNumber value={socialValuePerHour} />/hr
            </p>
            <p className="text-xs mt-1 text-muted-foreground">of social value per student hour invested</p>
          </div>
          <div className="rounded-xl p-5 border bg-white border-border">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Students registered</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={DEMO.headline.members} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">{DEMO.headline.activeMembers} actively logging</p>
          </div>
          <div className="rounded-xl p-5 border bg-white border-border">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total hours given</p>
            </div>
            <p className="text-2xl font-display font-bold text-foreground">
              <AnimatedNumber value={DEMO.headline.totalHours} formatter={v => v.toLocaleString("en-GB")} />
            </p>
            <p className="text-xs mt-1 text-muted-foreground">across all activities</p>
          </div>
        </div>

        {/* Impact over time */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Impact over time</SectionLabel>
          <SectionTitle>Social value accumulation — Jan to Dec 2025</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Total social value generated by students across the academic year, shown month by month. Data is illustrative for this demo.</p>
          <ImpactTimeline data={DEMO.monthlyTimeline} />
        </div>

        {/* Employability signals */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Graduate outcomes</SectionLabel>
          <SectionTitle>Employability evidence at a glance</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">
            These headline figures give Student Services a quick picture of how well-prepared your cohort is for graduate applications, UCAS statements, and accreditation returns.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-center">
              <p className="text-[11px] text-primary uppercase tracking-wide font-semibold mb-1">With leadership role</p>
              <p className="text-3xl font-display font-bold text-primary">
                <AnimatedNumber value={DEMO.employabilitySignals.studentsWithLeadershipRole} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">students with records</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Community activity</p>
              <p className="text-3xl font-display font-bold text-foreground">
                <AnimatedNumber value={DEMO.employabilitySignals.studentsWithCommunityActivity} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">students with records</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Award / programme</p>
              <p className="text-3xl font-display font-bold text-foreground">
                <AnimatedNumber value={DEMO.employabilitySignals.studentsWithAward} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">students with records</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Avg activities logged</p>
              <p className="text-3xl font-display font-bold text-foreground">{DEMO.employabilitySignals.avgActivitiesLogged}</p>
              <p className="text-xs text-muted-foreground mt-1">per active student</p>
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

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Top activities</p>
          <div className="space-y-2">
            {DEMO.activities.map((a, idx) => (
              <div key={a.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{a.name}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <AnimatedBar pct={(a.value / maxActivity) * 100} delay={idx * 60} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-muted-foreground">students</p>
                  <p className="text-sm font-semibold text-foreground">{a.participants}%</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-muted-foreground">hours</p>
                  <p className="text-sm font-semibold text-foreground">{a.hours.toLocaleString("en-GB")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-muted-foreground">social value</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(a.value)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Participant % shows share of registered students who logged this activity. All data is anonymised.</p>
        </div>

        {/* Activity by year of study */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Cohort breakdown</SectionLabel>
          <SectionTitle>Activity by year of study</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Student engagement and social value contribution broken down by academic year. Helps identify where intervention or encouragement is most needed.</p>
          <div className="h-[180px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DEMO.activityByYear} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} width={40} />
                <RechartsTooltip formatter={(v: number) => [formatCurrency(v), "Social Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900} animationEasing="ease-out">
                  {DEMO.activityByYear.map((_, i) => (
                    <Cell key={i} fill={i === 1 ? "#F06127" : "#A8C8DA"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {DEMO.activityByYear.map(y => (
              <div key={y.year} className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{y.year}</p>
                <p className="text-xl font-display font-bold text-foreground">
                  <AnimatedNumber value={y.students} />
                </p>
                <p className="text-xs text-muted-foreground">students active</p>
              </div>
            ))}
          </div>
        </div>

        {/* Regional map */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Geographic spread</SectionLabel>
          <SectionTitle>Where your students are based</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Student activity by UK region. Click any shaded area for details. Darker shading indicates higher activity concentration.</p>
          <UKRegionMap regions={DEMO.regions} />
          <div className="mt-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Region summary</p>
            <div className="space-y-2">
              {DEMO.regions.map((r) => (
                <div key={r.region} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <p className="text-sm font-medium text-foreground">{r.region}</p>
                    <p className="text-xs text-muted-foreground">{r.members} students</p>
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

        {/* Skills */}
        <div className="bg-white border border-border rounded-xl p-6">
          <SectionLabel>Skills & development</SectionLabel>
          <SectionTitle>Top skills your students are building</SectionTitle>
          <p className="text-sm text-muted-foreground -mt-4 mb-6">Skills are self-reported by students as part of their activity logging. Percentage shows share of active students who have logged this skill — directly relevant to employability and UCAS personal statements.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {DEMO.topSkills.map((s, idx) => (
              <div key={s.skill} className="flex items-center gap-3">
                <div className="shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
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
            <p className="text-sm text-white/70 max-w-sm">Register your institution, share the invite code with your students, and your dashboard populates automatically — no extra staff workload.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              href="/org/register"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-primary text-sm font-bold hover:bg-white/90 transition-colors"
            >
              Register your institution <ArrowRight className="w-4 h-4" />
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
