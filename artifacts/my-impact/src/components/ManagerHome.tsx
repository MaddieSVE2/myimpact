import { useMemo } from "react";
import { Link } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Building2, Users, Clock, TrendingUp, Trophy, ClipboardList,
  ArrowRight, BarChart2, FileSpreadsheet, Download,
} from "lucide-react";
import {
  DEMO_ORG_ID, DEMO_ACTIVITIES, DEMO_PULSE_SURVEYS, DEMO_CHALLENGES,
  computeDemoAggregates, getRemovedMemberIds,
} from "@/lib/org-demo-mock";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface OrgStatsLite {
  totalUsers: number;
  totalMemberCount: number;
  totalSocialValue: number;
  totalHours: number;
  verifiedHours: number;
  verifiedSocialValue: number;
}

interface PulseSurveyLite {
  id: string;
  question: string;
  template: string;
  archivedAt: string | null;
  createdAt: string;
}

interface PulseResultsLite {
  totals: { responses: number; average: number };
}

interface ChallengeLite {
  id: string;
  scope: "personal" | "org";
  isActive: boolean;
}

interface PulseRow {
  id: string;
  question: string;
  responses: number;
  average: number;
}

function StatCard({
  icon: Icon, label, value, sub, period,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  period?: string;
}) {
  return (
    <div
      className="bg-white border border-border rounded-xl p-4 flex flex-col gap-1.5 min-w-0"
      data-testid={`manager-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-display font-bold text-foreground leading-none">{value}</p>
      {(period || sub) && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {period && <span>{period}</span>}
          {period && sub && <span> · </span>}
          {sub && <span>{sub}</span>}
        </p>
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl p-4 h-[96px] animate-pulse">
      <div className="h-3 w-20 bg-muted rounded mb-3" />
      <div className="h-6 w-16 bg-muted rounded mb-2" />
      <div className="h-2 w-24 bg-muted rounded" />
    </div>
  );
}

function PulseSkeleton() {
  return (
    <div className="bg-white border border-border rounded-xl p-5 animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 bg-muted/50 rounded" />
        ))}
      </div>
    </div>
  );
}

function formatGBP(v: number): string {
  if (v >= 10000) return `£${Math.round(v).toLocaleString("en-GB")}`;
  return `£${v.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

interface ManagerHomeProps {
  orgId: string;
  orgName: string;
  firstName: string | null;
}

export function ManagerHome({ orgId, orgName, firstName }: ManagerHomeProps) {
  const isDemo = orgId === DEMO_ORG_ID;

  // ── Live stats (skipped for demo org which has no server data) ──
  const liveStatsQuery = useQuery<OrgStatsLite>({
    queryKey: ["manager-home-org-stats", orgId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/impact/org-stats`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isDemo,
    retry: false,
  });

  const liveChallengesQuery = useQuery<{ challenges: ChallengeLite[] }>({
    queryKey: ["manager-home-challenges", orgId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/mine`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isDemo,
    retry: false,
  });

  const liveSurveysQuery = useQuery<{ surveys: PulseSurveyLite[] }>({
    queryKey: ["manager-home-surveys", orgId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isDemo,
    retry: false,
  });

  const recentSurveyIds = useMemo(() => {
    const list = liveSurveysQuery.data?.surveys ?? [];
    return list
      .filter(s => !s.archivedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 3)
      .map(s => s.id);
  }, [liveSurveysQuery.data?.surveys]);

  const liveSurveyResultsQueries = useQueries({
    queries: recentSurveyIds.map(id => ({
      queryKey: ["manager-home-survey-results", orgId, id],
      queryFn: async (): Promise<PulseResultsLite> => {
        const res = await fetch(`${BASE}/api/org/surveys/${id}/results`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
      retry: false,
    })),
  });

  // ── Build display rows: stats + pulse rows from either demo or live data ──
  const isStatsLoading = !isDemo && liveStatsQuery.isLoading;
  const isStatsError = !isDemo && liveStatsQuery.isError;
  const isChallengesError = !isDemo && liveChallengesQuery.isError;
  const isPulseLoading =
    !isDemo && (liveSurveysQuery.isLoading
      || liveSurveyResultsQueries.some(q => q.isLoading && recentSurveyIds.length > 0));
  const isPulseError = !isDemo && (liveSurveysQuery.isError
    || liveSurveyResultsQueries.some(q => q.isError));

  let membersValue = "—";
  let membersSub: string | undefined;
  let hoursValue = "—";
  let hoursSub: string | undefined;
  let valueValue = "—";
  let valueSub: string | undefined;
  let challengesValue = "—";

  let periodLabel = "All time";

  if (isDemo) {
    const removedIds = new Set(getRemovedMemberIds(DEMO_ORG_ID));
    const acts = DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId));
    const agg = computeDemoAggregates(acts);
    const dates = acts.map(a => a.occurredAt).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    if (from && to) {
      const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      periodLabel = `${fmt(from)} – ${fmt(to)}`;
    }
    membersValue = String(agg.activeMembers);
    membersSub = `of ${agg.totalMembers} total`;
    hoursValue = Math.round(agg.totalHours).toLocaleString("en-GB");
    hoursSub = `${agg.totalActivities} activities`;
    valueValue = formatGBP(agg.totalSocialValue);
    valueSub = `${formatGBP(agg.verifiedSocialValue)} verified`;
    challengesValue = String(DEMO_CHALLENGES.filter(c => c.isActive && c.scope === "org").length);
  } else {
    if (liveStatsQuery.data) {
      const s = liveStatsQuery.data;
      membersValue = String(s.totalUsers);
      membersSub = `of ${s.totalMemberCount} total`;
      hoursValue = Math.round(s.verifiedHours || s.totalHours).toLocaleString("en-GB");
      if (s.totalHours > 0) hoursSub = `${Math.round(s.totalHours).toLocaleString("en-GB")} total`;
      valueValue = formatGBP(s.totalSocialValue);
      if (s.verifiedSocialValue > 0) valueSub = `${formatGBP(s.verifiedSocialValue)} verified`;
    }
    if (liveChallengesQuery.data) {
      const active = liveChallengesQuery.data.challenges.filter(
        c => c.isActive && c.scope === "org",
      ).length;
      challengesValue = String(active);
    }
  }

  // Pulse rows
  let pulseRows: PulseRow[] = [];
  if (isDemo) {
    pulseRows = DEMO_PULSE_SURVEYS
      .filter(s => !s.archivedAt)
      .slice(0, 3)
      .map(s => ({
        id: s.id,
        question: s.question,
        responses: s.totals.responses,
        average: s.totals.average,
      }));
  } else if (liveSurveysQuery.data) {
    const list = liveSurveysQuery.data.surveys
      .filter(s => !s.archivedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 3);
    pulseRows = list.map((s, i) => {
      const r = liveSurveyResultsQueries[i]?.data;
      return {
        id: s.id,
        question: s.question,
        responses: r?.totals.responses ?? 0,
        average: r?.totals.average ?? 0,
      };
    });
  }

  return (
    <div data-testid="manager-home" style={{ background: "var(--brand-cream)" }}>
      {/* Hero */}
      <section style={{ padding: "clamp(32px, 5vw, 56px) 5% 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-4 text-[11px] font-semibold uppercase tracking-wider"
               style={{ background: "rgba(232,99,58,0.10)", color: "var(--brand-orange)" }}>
            <Building2 className="w-3.5 h-3.5" /> Organisation manager
          </div>
          <h1
            className="mi-fraunces"
            data-testid="manager-welcome-heading"
            style={{
              fontSize: "clamp(34px, 5.5vw, 54px)",
              fontWeight: 900, color: "var(--brand-dark)",
              lineHeight: 1.05, letterSpacing: -1.5, margin: 0,
            }}
          >
            Welcome back{firstName ? `, ` : ""}
            {firstName && <span style={{ color: "var(--brand-orange)", fontStyle: "italic" }}>{firstName}</span>}
            <span>.</span>
          </h1>
          <p
            data-testid="manager-welcome-subline"
            style={{ marginTop: 10, fontSize: "clamp(15px, 1.6vw, 18px)", color: "#5b6770", lineHeight: 1.5 }}
          >
            Here's how <strong style={{ color: "var(--brand-dark)" }}>{orgName}</strong> is doing.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
            <Link
              href="/org/dashboard"
              data-testid="manager-cta-dashboard"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "10px 18px", borderRadius: 10, background: "var(--brand-orange)",
                color: "white", fontSize: 14, fontWeight: 700, textDecoration: "none",
              }}
            >
              <BarChart2 className="w-4 h-4" /> Open full dashboard
            </Link>
            <Link
              href="/org/activities"
              data-testid="manager-link-activities"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "10px 16px", borderRadius: 10, background: "white",
                color: "var(--brand-dark)", fontSize: 13, fontWeight: 600,
                border: "1px solid #e5e7eb", textDecoration: "none",
              }}
            >
              <Users className="w-4 h-4" /> Activities
            </Link>
            <Link
              href="/org/challenges"
              data-testid="manager-link-challenges"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "10px 16px", borderRadius: 10, background: "white",
                color: "var(--brand-dark)", fontSize: 13, fontWeight: 600,
                border: "1px solid #e5e7eb", textDecoration: "none",
              }}
            >
              <Trophy className="w-4 h-4" /> Challenges
            </Link>
            <Link
              href="/org/export"
              data-testid="manager-link-export"
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "10px 16px", borderRadius: 10, background: "white",
                color: "var(--brand-dark)", fontSize: 13, fontWeight: 600,
                border: "1px solid #e5e7eb", textDecoration: "none",
              }}
            >
              <Download className="w-4 h-4" /> Export
            </Link>
          </div>
        </div>
      </section>

      {/* Quick stats */}
      <section style={{ padding: "0 5% 12px" }} data-testid="manager-quick-stats">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {isStatsLoading ? (
              <>
                <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
              </>
            ) : isStatsError ? (
              <div className="sm:col-span-2 lg:col-span-4 bg-white border border-border rounded-xl p-4 text-xs text-muted-foreground"
                   data-testid="manager-stats-error">
                Couldn't load quick stats right now.
              </div>
            ) : (
              <>
                <StatCard icon={Users} label="Members contributing" value={membersValue} sub={membersSub} period={periodLabel} />
                <StatCard icon={Clock} label="Verified hours" value={hoursValue} sub={hoursSub} period={periodLabel} />
                <StatCard icon={TrendingUp} label="Social value" value={valueValue} sub={valueSub} period={periodLabel} />
                <StatCard
                  icon={Trophy}
                  label="Active challenges"
                  value={isChallengesError ? "—" : challengesValue}
                  sub={isChallengesError ? "Couldn't load" : undefined}
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* Pulse + cross-link strip */}
      <section style={{ padding: "12px 5% clamp(28px, 4vw, 48px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2" data-testid="manager-pulse-card">
              {isPulseLoading ? (
                <PulseSkeleton />
              ) : isPulseError ? (
                <div className="bg-white border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Pulse updates</h3>
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="manager-pulse-error">
                    Couldn't load Pulse right now.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Pulse updates</h3>
                    </div>
                    <Link
                      href="/org/pulse"
                      data-testid="manager-link-pulse-all"
                      className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View all Pulse results <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                  {pulseRows.length === 0 ? (
                    <div className="py-3" data-testid="manager-pulse-empty">
                      <p className="text-sm text-foreground mb-1">No pulses yet.</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Run a 30-second check-in to hear how members are feeling.
                      </p>
                      <Link
                        href="/org/pulse"
                        data-testid="manager-link-pulse-create"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90"
                      >
                        Create a Pulse <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {pulseRows.map(row => (
                        <li
                          key={row.id}
                          className="flex items-center justify-between gap-3 py-2.5"
                          data-testid={`manager-pulse-row-${row.id}`}
                        >
                          <p className="text-sm text-foreground truncate min-w-0 flex-1">{row.question}</p>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-display font-bold text-foreground leading-none">
                              {row.responses > 0 ? row.average.toFixed(1) : "—"}
                              <span className="text-[10px] font-semibold text-muted-foreground ml-1">/ 5</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {row.responses} {row.responses === 1 ? "response" : "responses"}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <Link
              href="/org/export"
              data-testid="manager-card-export"
              className="bg-white border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all flex flex-col"
            >
              <FileSpreadsheet className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-semibold text-foreground">Export & report</p>
              <p className="text-xs text-muted-foreground mt-1 flex-1">
                Download CSV, PDF and impact summaries for {orgName}.
              </p>
              <span className="text-xs font-semibold text-primary mt-3 inline-flex items-center gap-1">
                Open Export <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ManagerHomeSkeleton() {
  return (
    <div data-testid="manager-home-skeleton" style={{ background: "var(--brand-cream)" }}>
      <section style={{ padding: "clamp(32px, 5vw, 56px) 5% 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }} className="animate-pulse">
          <div className="h-5 w-44 bg-muted rounded-full mb-4" />
          <div className="h-10 w-2/3 bg-muted rounded mb-3" />
          <div className="h-4 w-1/2 bg-muted rounded mb-6" />
          <div className="h-10 w-48 bg-muted rounded" />
        </div>
      </section>
      <section style={{ padding: "0 5% 12px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
          </div>
        </div>
      </section>
      <section style={{ padding: "12px 5% clamp(28px, 4vw, 48px)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <PulseSkeleton />
        </div>
      </section>
    </div>
  );
}
