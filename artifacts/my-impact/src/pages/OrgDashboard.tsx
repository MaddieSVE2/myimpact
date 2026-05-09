import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, TrendingUp, Users, Clock, BadgeCheck, Download, FileText, FileSpreadsheet,
  Globe2, Layers, AlertCircle, EyeOff, BarChart2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Settings, Calendar, Check,
} from "lucide-react";
import {
  Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ImpactTimeline, type MonthlyDataPoint } from "@/components/ImpactTimeline";
import { OrgPulseSummaryCard } from "@/components/OrgPulseSummaryCard";
import { useT } from "@/i18n";
import {
  DEMO_ORG_ID, DEMO_INVITE_CODE, DEMO_ACTIVITIES,
  computeDemoAggregates, computeMonthlyTrend, computeSdgBreakdown, computeCategoryBreakdown,
  getRemovedMemberIds, getOrgInviteCode, SDG_BY_CATEGORY,
  type SdgBreakdownPoint, type ActivityCategory,
} from "@/lib/org-demo-mock";
import { useMyOrg, hexToHslVar, DEFAULT_SROI_COST_PER_VOLUNTEER, BASE } from "@/lib/org-export";
import {
  getPeriodBounds, detectPeriodType, activityInPeriod,
  SUMMARY_PERIOD_PRESETS, type SummaryPeriodType,
} from "@/lib/summaryPeriod";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function StatCard({ icon: Icon, label, value, sub, highlight, tone, prefix, decimals }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub?: string; highlight?: boolean;
  tone?: "accent"; prefix?: string; decimals?: number;
}) {
  const accentBorder = tone === "accent" && !highlight ? "border-l-4 border-l-accent" : "";
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-primary text-white border-primary" : "bg-white border-border"} ${accentBorder}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${highlight ? "text-white/70" : tone === "accent" ? "text-accent" : "text-primary"}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${highlight ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-white" : "text-foreground"}`}>
        {prefix}<AnimatedNumber value={value} decimals={decimals ?? 0} formatter={decimals ? undefined : v => v.toLocaleString("en-GB")} />
      </p>
      {sub && <p className={`text-xs mt-1 ${highlight ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

const DEMO_SUMMARY_YEAR_START_KEY = "demo-org-summary-year-start";

// Max days per month — Feb uses 29 (leap-year-safe; rejects 30/31).
const MONTH_MAX_DAYS: Record<string, number> = {
  "01": 31, "02": 29, "03": 31, "04": 30, "05": 31, "06": 30,
  "07": 31, "08": 31, "09": 30, "10": 31, "11": 30, "12": 31,
};

export default function OrgDashboard() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const queryClient = useQueryClient();

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;
  const t = useT();

  // ── Period setting: persisted in localStorage for demo org, from API for real orgs ──
  const [summaryYearStart, setSummaryYearStart] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(DEMO_SUMMARY_YEAR_START_KEY);
      if (saved && /^\d{2}-\d{2}$/.test(saved)) return saved;
    }
    return "01-01";
  });
  const [periodOffset, setPeriodOffset] = useState(0);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [customMonth, setCustomMonth] = useState(() => {
    const parts = summaryYearStart.split("-");
    return parts[0] ?? "01";
  });
  const [customDay, setCustomDay] = useState(() => {
    const parts = summaryYearStart.split("-");
    return parts[1] ?? "01";
  });
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodSaved, setPeriodSaved] = useState(false);

  // Sync summaryYearStart from API response when org data loads (real org case)
  useEffect(() => {
    if (orgData?.org?.summaryYearStart && !isDemoOrg) {
      setSummaryYearStart(orgData.org.summaryYearStart);
      const parts = orgData.org.summaryYearStart.split("-");
      setCustomMonth(parts[0] ?? "01");
      setCustomDay(parts[1] ?? "01");
    }
  }, [orgData?.org?.summaryYearStart, isDemoOrg]);

  // ── Period bounds ──
  // For the demo org we anchor the reference date to May 2026 so that
  // offset=0 maps to the Jan–Dec 2026 period and offset=-1 maps to 2025.
  const DEMO_REFERENCE_DATE = new Date("2026-05-09T12:00:00Z");
  const periodBounds = useMemo(
    () => getPeriodBounds(summaryYearStart, periodOffset, isDemoOrg ? DEMO_REFERENCE_DATE : undefined),
    [summaryYearStart, periodOffset, isDemoOrg],
  );
  const isCurrentPeriod = periodOffset >= 0;

  // ── Period type derived from summaryYearStart ──
  const periodType = detectPeriodType(summaryYearStart);

  // ── Activity filtering ──
  const removedIds = useMemo(
    () => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(),
    [isDemoOrg],
  );
  const baseActivities = useMemo(
    () => DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId)),
    [removedIds],
  );
  const allActivities = useMemo(
    () => baseActivities.filter(a => activityInPeriod(a.occurredAt, periodBounds)),
    [baseActivities, periodBounds],
  );
  // ── Demo org derived data ──
  const demoAggregates = useMemo(() => computeDemoAggregates(allActivities), [allActivities]);
  const demoTrend = useMemo(() => computeMonthlyTrend(allActivities), [allActivities]);
  const sdgBreakdowns = useMemo(() => computeSdgBreakdown(allActivities), [allActivities]);
  const demoCategoryBreakdown = useMemo(() => computeCategoryBreakdown(allActivities), [allActivities]);
  const activitiesByCategory = useMemo(() => {
    const map = new Map<ActivityCategory, typeof allActivities>();
    for (const a of allActivities) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return map;
  }, [allActivities]);

  // ── Real org data (fetched when not demo org) ──
  // The server reads summaryYearStart from the DB and uses periodOffset to
  // compute the canonical period window, filtering by entryDate.
  const { data: realStats } = useQuery({
    queryKey: ["org-stats", periodOffset, summaryYearStart],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/impact/org-stats?periodOffset=${periodOffset}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load org stats");
      return res.json() as Promise<{
        totalRecords: number; totalUsers: number; totalMemberCount: number;
        totalSocialValue: number; totalHours: number; averageValuePerPerson: number;
        verifiedValue?: number; verifiedRecords?: number;
        valueByCategory: Array<{ category: string; value: number }>;
      }>;
    },
    enabled: !isDemoOrg && !!orgData?.org,
  });

  const { data: realMonthly } = useQuery({
    queryKey: ["org-monthly", periodOffset, summaryYearStart],
    queryFn: async () => {
      const res = await fetch(
        `${BASE}/api/org/stats/monthly?periodOffset=${periodOffset}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load monthly stats");
      return res.json() as Promise<{ monthly: Array<{ month: string; value: number }> }>;
    },
    enabled: !isDemoOrg && !!orgData?.org,
  });

  // ── Unified stats (demo or real) ──
  const sroiCostPerVolunteer = orgData?.org?.sroiCostPerVolunteer ?? DEFAULT_SROI_COST_PER_VOLUNTEER;
  const sroiBreakdown = orgData?.org?.sroiCostBreakdown ?? null;
  const sroiBreakdownLines = sroiBreakdown
    ? ([
        { key: "recruitment", label: "Recruitment", value: sroiBreakdown.recruitment },
        { key: "onboarding",  label: "Onboarding",  value: sroiBreakdown.onboarding },
        { key: "support",     label: "Support",     value: sroiBreakdown.support },
        { key: "admin",       label: "Admin",       value: sroiBreakdown.admin },
      ] as const).filter(l => typeof l.value === "number")
    : [];

  const headlineStats = isDemoOrg
    ? {
        totalSocialValue: demoAggregates.totalSocialValue,
        verifiedSocialValue: demoAggregates.verifiedSocialValue,
        totalMembers: demoAggregates.totalMembers,
        activeMembers: demoAggregates.activeMembers,
        totalHours: Math.round(demoAggregates.totalHours),
        totalActivities: demoAggregates.totalActivities,
        averagePerMember: demoAggregates.averagePerMember,
      }
    : {
        totalSocialValue: realStats?.totalSocialValue ?? 0,
        verifiedSocialValue: realStats?.verifiedValue ?? 0,
        totalMembers: realStats?.totalMemberCount ?? 0,
        activeMembers: realStats?.totalUsers ?? 0,
        totalHours: Math.round(realStats?.totalHours ?? 0),
        totalActivities: realStats?.totalRecords ?? 0,
        averagePerMember: realStats?.averageValuePerPerson ?? 0,
      };

  const totalInvestment = headlineStats.totalMembers * sroiCostPerVolunteer;
  const sroiRatio = totalInvestment > 0 ? headlineStats.totalSocialValue / totalInvestment : 0;

  const timelineData = useMemo<MonthlyDataPoint[]>(() => {
    if (isDemoOrg) return demoTrend.map(p => ({ month: p.label.split(" ")[0]!, value: p.value }));
    return realMonthly?.monthly ?? [];
  }, [isDemoOrg, demoTrend, realMonthly]);

  const categoryBreakdown = isDemoOrg
    ? demoCategoryBreakdown
    : (realStats?.valueByCategory ?? []).map(({ category, value }) => ({
        category: category as ActivityCategory,
        value,
        members: 0,
        activities: 0,
        hours: 0,
      }));

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (c: string) => setExpandedCats(prev => {
    const n = new Set(prev);
    if (n.has(c)) n.delete(c); else n.add(c);
    return n;
  });

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }
  if (isError) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-base font-semibold mb-1">Could not load your organisation</p>
      <p className="text-sm text-muted-foreground">Please refresh the page or try again in a moment.</p>
    </div>;
  }
  if (!orgData?.org) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
      <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
    </div>;
  }
  if (!isManager) {
    return <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-base font-semibold mb-2">Manager access required</p>
      <p className="text-sm text-muted-foreground">The organisation dashboard is only available to your organisation manager.</p>
      <Link href="/org" className="text-primary text-sm underline mt-3 inline-block">Back to your organisation page</Link>
    </div>;
  }

  const inviteCode = isDemoOrg ? getOrgInviteCode(DEMO_ORG_ID, DEMO_INVITE_CODE) : null;

  // Apply org branding via Tailwind's HSL CSS variables on a wrapper div.
  // Demo org is intentionally never branded.
  const branding = isDemoOrg ? null : orgData.org.branding ?? null;
  const brandStyle: React.CSSProperties = {};
  const primaryHsl = hexToHslVar(branding?.brandPrimary ?? null);
  const accentHsl  = hexToHslVar(branding?.brandAccent  ?? null);
  if (primaryHsl) {
    (brandStyle as Record<string, string>)["--primary"] = primaryHsl;
    (brandStyle as Record<string, string>)["--ring"]    = primaryHsl;
  }
  if (accentHsl) {
    (brandStyle as Record<string, string>)["--accent"] = accentHsl;
  }
  const orgLogoUrl = branding?.logoUrl ?? null;

  // Period label derived from the period helper (matches the selected window exactly).
  const periodLabel = periodBounds.label;

  // ── Period settings: save to API (real org) or localStorage (demo org) ──
  async function savePeriodSetting(newStart: string) {
    setSavingPeriod(true);
    try {
      if (isDemoOrg) {
        localStorage.setItem(DEMO_SUMMARY_YEAR_START_KEY, newStart);
      } else {
        const res = await fetch(`${BASE}/api/org/my/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ summaryYearStart: newStart }),
        });
        if (!res.ok) throw new Error("Failed to save");
        queryClient.invalidateQueries({ queryKey: ["my-org"] });
      }
      setSummaryYearStart(newStart);
      setPeriodOffset(0);
      setPeriodSaved(true);
      setTimeout(() => setPeriodSaved(false), 2000);
    } finally {
      setSavingPeriod(false);
    }
  }

  function handlePeriodTypeSelect(type: Exclude<SummaryPeriodType, "custom">) {
    const preset = SUMMARY_PERIOD_PRESETS[type];
    const [m, d] = preset.summaryYearStart.split("-");
    setCustomMonth(m ?? "01");
    setCustomDay(d ?? "01");
    void savePeriodSetting(preset.summaryYearStart);
  }

  function handleCustomSave() {
    const mm = customMonth.padStart(2, "0");
    const dd = customDay.padStart(2, "0");
    const newStart = `${mm}-${dd}`;
    void savePeriodSetting(newStart);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" style={brandStyle} data-testid="org-dashboard-root">
      {/* Publishable document header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt={`${orgData.org.name} logo`}
              className="w-12 h-12 rounded-md object-contain bg-white border border-border p-1"
              data-testid="org-header-logo"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-display font-semibold text-foreground">{orgData.org.name}</h1>
              {isDemoOrg && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Demo data</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              Impact summary · {periodLabel}
            </p>
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5 mt-1">
              <EyeOff className="w-3 h-3" /> Anonymised, no member is named on this page. Member-level data lives in <Link href="/org/activities" className="underline">Activities</Link>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/org/export"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
            data-testid="button-open-export"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </Link>
        </div>
      </div>

      {/* Period navigation row */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {/* Year navigator: prev / period label / next */}
        <div className="flex items-center gap-1" data-testid="period-navigator">
          <button
            type="button"
            onClick={() => setPeriodOffset(o => o - 1)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Previous period"
            data-testid="period-prev"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground px-1 min-w-[11rem] text-center" data-testid="period-label">
            {periodBounds.label}
          </span>
          <button
            type="button"
            onClick={() => setPeriodOffset(o => o + 1)}
            disabled={isCurrentPeriod}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next period"
            data-testid="period-next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {periodOffset !== 0 && (
            <button
              type="button"
              onClick={() => setPeriodOffset(0)}
              className="ml-1 text-[11px] font-semibold text-primary hover:underline"
              data-testid="period-reset"
            >
              Current
            </button>
          )}
        </div>

        {/* Summary period settings toggle */}
        <button
          type="button"
          onClick={() => setShowPeriodSettings(s => !s)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showPeriodSettings ? "bg-primary/10 border-primary/30 text-primary" : "bg-white border-border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}
          aria-expanded={showPeriodSettings}
          data-testid="period-settings-toggle"
        >
          <Calendar className="w-3.5 h-3.5" />
          Summary period
          <Settings className="w-3 h-3 opacity-60" />
        </button>
      </div>

      {/* Collapsible period settings panel */}
      <AnimatePresence>
        {showPeriodSettings && (
          <motion.div
            key="period-settings"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-4"
            data-testid="period-settings-panel"
          >
            <div className="bg-white border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Summary period</h3>
                <span className="text-xs text-muted-foreground">Choose the year boundary for all metrics on this dashboard.</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {(Object.keys(SUMMARY_PERIOD_PRESETS) as Array<Exclude<SummaryPeriodType, "custom">>).map(type => {
                  const preset = SUMMARY_PERIOD_PRESETS[type];
                  const isActive = periodType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handlePeriodTypeSelect(type)}
                      disabled={savingPeriod}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${isActive ? "border-primary bg-primary/5 text-foreground" : "border-border bg-muted/20 text-foreground hover:border-primary/40"}`}
                      data-testid={`period-type-${type}`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isActive ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                        {isActive && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className="font-medium">{preset.label}</span>
                    </button>
                  );
                })}
                {/* Custom option */}
                <button
                  type="button"
                  onClick={() => {
                    if (periodType !== "custom") {
                      setCustomMonth("01");
                      setCustomDay("01");
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors sm:col-span-2 ${periodType === "custom" ? "border-primary bg-primary/5 text-foreground" : "border-border bg-muted/20 text-foreground hover:border-primary/40"}`}
                  data-testid="period-type-custom"
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${periodType === "custom" ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                    {periodType === "custom" && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="font-medium">Custom start date</span>
                </button>
              </div>
              {/* Custom month/day picker — always visible so the start date can be adjusted freely */}
              <div className="flex items-end gap-2 pt-2 border-t border-border/50">
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Month</label>
                    <select
                      value={customMonth}
                      onChange={e => {
                        const newMonth = e.target.value;
                        setCustomMonth(newMonth);
                        const maxDays = MONTH_MAX_DAYS[newMonth] ?? 31;
                        if (parseInt(customDay, 10) > maxDays) {
                          setCustomDay(String(maxDays).padStart(2, "0"));
                        }
                      }}
                      className="text-sm border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      data-testid="custom-month-select"
                    >
                      {[
                        ["01","January"],["02","February"],["03","March"],["04","April"],
                        ["05","May"],["06","June"],["07","July"],["08","August"],
                        ["09","September"],["10","October"],["11","November"],["12","December"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground mb-1">Day</label>
                    <select
                      value={customDay}
                      onChange={e => setCustomDay(e.target.value)}
                      className="text-sm border border-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                      data-testid="custom-day-select"
                    >
                      {Array.from({ length: MONTH_MAX_DAYS[customMonth] ?? 31 }, (_, i) => String(i + 1).padStart(2, "0")).map(d => (
                        <option key={d} value={d}>{Number(d)}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleCustomSave}
                    disabled={savingPeriod}
                    className="px-3 py-1.5 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    data-testid="custom-period-save"
                  >
                    {savingPeriod ? "Saving…" : "Apply"}
                  </button>
                  {periodSaved && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isDemoOrg && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-6 text-xs text-amber-900">
          You're viewing the demo organisation with mock data. Invite code <span className="font-mono font-semibold">{inviteCode}</span>.
        </div>
      )}

      {/* Aggregated stats */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <StatCard icon={TrendingUp} label="Total social value" value={headlineStats.totalSocialValue} prefix="£" sub={`£${headlineStats.verifiedSocialValue.toLocaleString("en-GB")} verified`} highlight />
        <StatCard icon={BarChart2} label={t("orgDashboard.sroiCardLabel")} value={sroiRatio} prefix="£" decimals={2} sub={t("orgDashboard.sroiCardSub")} />
        <StatCard icon={Users} label="Active members" value={headlineStats.activeMembers} sub={`of ${headlineStats.totalMembers} total`} />
        <StatCard icon={Clock} label="Hours logged" value={headlineStats.totalHours} sub={`${headlineStats.totalActivities} activities`} />
      </motion.div>
      <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <StatCard icon={BadgeCheck} label="Avg per member" value={headlineStats.averagePerMember} prefix="£" sub={t("orgDashboard.avgPerMemberSub")} />
        <StatCard icon={Clock} label={t("orgDashboard.avgHoursPerMember")} value={headlineStats.totalMembers ? Math.round(headlineStats.totalHours / headlineStats.totalMembers) : 0} sub={t("orgDashboard.avgHoursPerMemberSub")} />
      </motion.div>

      {/* SROI explainer */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-sroi-explainer">
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.sroiTitle")}</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4 items-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("orgDashboard.sroiBody", {
              costPerVolunteer: `£${sroiCostPerVolunteer.toLocaleString("en-GB")}`,
              members: headlineStats.totalMembers,
              totalInvestment: `£${totalInvestment.toLocaleString("en-GB")}`,
              socialValue: `£${headlineStats.totalSocialValue.toLocaleString("en-GB")}`,
              ratio: `£${sroiRatio.toFixed(2)}`,
            })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="bg-muted/30 rounded-lg p-3 text-center group relative"
              title={sroiBreakdownLines.length > 0
                ? sroiBreakdownLines.map(l => `${l.label}: £${(l.value as number).toLocaleString("en-GB")}`).join(" · ")
                : undefined}
              data-testid="card-sroi-cost-per-volunteer"
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("orgDashboard.sroiOrgInvestmentLabel")}</p>
              <p className="text-xl font-display font-bold text-foreground" data-testid="text-sroi-cost-per-volunteer">£{sroiCostPerVolunteer.toLocaleString("en-GB")}</p>
              <p className="text-[10px] text-muted-foreground">{t("orgDashboard.sroiOrgInvestmentSub")}</p>
              {sroiBreakdownLines.length > 0 && (
                <table className="w-full mt-2 text-[10px]" data-testid="table-sroi-breakdown">
                  <tbody>
                    {sroiBreakdownLines.map(l => (
                      <tr key={l.key}>
                        <td className="py-0.5 pr-1 text-left text-muted-foreground">{l.label}</td>
                        <td className="py-0.5 text-right font-semibold text-foreground" data-testid={`sroi-breakdown-${l.key}`}>£{(l.value as number).toLocaleString("en-GB")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("orgDashboard.sroiTotalInvestmentLabel")}</p>
              <p className="text-xl font-display font-bold text-foreground">£{totalInvestment.toLocaleString("en-GB")}</p>
              <p className="text-[10px] text-muted-foreground">{t("orgDashboard.sroiTotalInvestmentSub")}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("orgDashboard.sroiSocialValueLabel")}</p>
              <p className="text-xl font-display font-bold text-foreground">£{headlineStats.totalSocialValue.toLocaleString("en-GB")}</p>
              <p className="text-[10px] text-muted-foreground">{t("orgDashboard.sroiSocialValueSub")}</p>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-[10px] text-primary uppercase tracking-wide font-semibold mb-0.5">{t("orgDashboard.sroiRatioLabel")}</p>
              <p className="text-xl font-display font-bold text-primary">£{sroiRatio.toFixed(2)}</p>
              <p className="text-[10px] text-primary/70">{t("orgDashboard.sroiRatioSub")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pulse summary — donut + sparkline aggregate of active surveys */}
      <OrgPulseSummaryCard isDemoOrg={isDemoOrg} />

      {/* Trend over the year — line/area chart matches the public charity-example dashboard */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-monthly-trend">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.monthlyTrendTitle")}</h3>
          <span className="text-xs text-muted-foreground">{t("orgDashboard.monthlyTrendSubtitle")}</span>
        </div>
        {timelineData.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">{t("orgDashboard.monthlyTrendEmpty")}</p>
        ) : (
          <ImpactTimeline data={timelineData} />
        )}
      </div>

      {/* SDG alignment — based on demo activity breakdown; real orgs see categories only */}
      {isDemoOrg && <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-sdg-alignment">
        <div className="flex items-center gap-2 mb-1">
          <Globe2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.sdgTitle")}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("orgDashboard.sdgSubtitle")}</p>
        {sdgBreakdowns.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("orgDashboard.sdgEmpty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sdgBreakdowns}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={86}
                    paddingAngle={2}
                    isAnimationActive
                  >
                    {sdgBreakdowns.map((s) => (
                      <Cell key={s.number} fill={s.color} stroke="#fff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(v: number, _n, payload) => {
                      const p = (payload as unknown as { payload: SdgBreakdownPoint }).payload;
                      return [`£${v.toLocaleString("en-GB")} · ${p.pct}%`, `SDG ${p.number} ${p.label}`];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="space-y-2" data-testid="list-sdg-ranked">
              {sdgBreakdowns.map((s, idx) => (
                <li key={s.number} className="flex items-center gap-3" data-testid={`sdg-rank-${s.number}`}>
                  <span className="shrink-0 w-7 h-7 rounded-md text-white text-xs font-bold inline-flex items-center justify-center" style={{ backgroundColor: s.color }}>
                    {s.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{s.label}</p>
                      <p className="text-xs font-bold text-foreground shrink-0">{s.pct}%</p>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {idx === 0 && <span className="font-semibold text-foreground">{t("orgDashboard.sdgLeading")} · </span>}
                      £{s.value.toLocaleString("en-GB")} · <span data-testid={`sdg-members-${s.number}`}>{s.members}</span> {t("orgDashboard.sdgMembers")} · {s.activities} {t("orgDashboard.sdgActivities")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>}

      {/* Top categories */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-top-categories">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orgDashboard.categoriesTitle")}</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{t("orgDashboard.categoriesSubtitle")}</p>
        {categoryBreakdown.every(c => c.value === 0) ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t("orgDashboard.categoriesEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {categoryBreakdown.map((c, idx) => {
              const max = Math.max(1, ...categoryBreakdown.map(x => x.value));
              // SDG mapping and per-activity drill-down are demo-only — real org
              // data arrives as aggregate category totals without individual rows.
              const sdg = isDemoOrg ? SDG_BY_CATEGORY[c.category] : undefined;
              const items = isDemoOrg ? (() => {
                // Aggregate raw demo rows by activity name for the drill-down list.
                const grouped = new Map<string, { name: string; participants: Set<string>; hours: number; value: number }>();
                for (const a of (activitiesByCategory.get(c.category) ?? [])) {
                  const g = grouped.get(a.activity) ?? { name: a.activity, participants: new Set<string>(), hours: 0, value: 0 };
                  g.participants.add(a.memberId);
                  g.hours += a.hours;
                  g.value += a.socialValueGBP;
                  grouped.set(a.activity, g);
                }
                return Array.from(grouped.values()).sort((a, b) => b.value - a.value);
              })() : [];
              const expanded = expandedCats.has(c.category);
              const visible = expanded ? items : items.slice(0, 3);
              const barColor = sdg?.color ?? "hsl(var(--primary))";
              return (
                <div
                  key={c.category}
                  className="py-2 px-3 rounded-lg border border-transparent hover:bg-muted/20 hover:border-primary/30 hover:shadow-sm transition-all"
                  data-testid={`category-rank-${c.category}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-bold text-muted-foreground w-4 text-right">{idx + 1}.</span>
                      {sdg && (
                        <span
                          className="shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-white rounded px-1.5 py-0.5"
                          style={{ backgroundColor: sdg.color }}
                          title={`SDG ${sdg.number} · ${sdg.label}`}
                        >SDG {sdg.number}</span>
                      )}
                      <p className="text-sm font-semibold text-foreground truncate">{c.category}</p>
                      {idx === 0 && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          {t("orgDashboard.categoriesLeading")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">£{c.value.toLocaleString("en-GB")}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                    <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, backgroundColor: barColor }} />
                  </div>
                  {isDemoOrg && (
                    <p className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.members}</span> {t("orgDashboard.categoriesMembers")} · <span className="font-semibold text-foreground">{c.activities}</span> {t("orgDashboard.categoriesActivities")} · <span className="font-semibold text-foreground">{Math.round(c.hours)}</span> {t("orgDashboard.categoriesHours")}
                    </p>
                  )}
                  {items.length > 0 && (
                    <ul className="mt-2 divide-y divide-border/60 border border-border/60 rounded-md bg-muted/10">
                      {visible.map(g => (
                        <li key={g.name} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11px]">
                          <span className="font-medium text-foreground truncate">{g.name}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {g.participants.size}p · {g.hours}h · <span className="font-semibold text-foreground">£{g.value.toLocaleString("en-GB")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {items.length > 3 && (
                    <button
                      type="button"
                      onClick={() => toggleCat(c.category)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      data-testid={`category-toggle-${c.category}`}
                    >
                      {expanded
                        ? <>{t("orgDashboard.categoriesShowLess")} <ChevronUp className="w-3 h-3" /></>
                        : <>{t("orgDashboard.categoriesShowMore", { count: items.length })} <ChevronDown className="w-3 h-3" /></>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Link href="/org/activities" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-activities">
          <Users className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">{t("orgDashboard.crossLinkActivitiesTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("orgDashboard.crossLinkActivitiesSub")}</p>
        </Link>
        <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-export-pdf">
          <FileText className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">{t("orgDashboard.crossLinkPdfTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("orgDashboard.crossLinkPdfSub")}</p>
        </Link>
        <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all" data-testid="card-link-export-csv">
          <FileSpreadsheet className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">{t("orgDashboard.crossLinkCsvTitle")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("orgDashboard.crossLinkCsvSub")}</p>
        </Link>
      </div>
    </div>
  );
}
