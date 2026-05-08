import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Building2, TrendingUp, Users, Clock, BadgeCheck, Download, FileText, FileSpreadsheet,
  Globe2, Layers, AlertCircle, EyeOff,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { OrgSubNav } from "@/components/layout/OrgSubNav";
import { useT } from "@/i18n";
import {
  DEMO_ORG_ID, DEMO_INVITE_CODE, DEMO_ACTIVITIES,
  computeDemoAggregates, computeMonthlyTrend, computeSdgBreakdown, computeCategoryBreakdown,
  getRemovedMemberIds, getOrgInviteCode, SDG_BY_CATEGORY,
  type SdgBreakdownPoint,
} from "@/lib/org-demo-mock";
import { useMyOrg, hexToHslVar } from "@/lib/org-export";

function StatCard({ icon: Icon, label, value, sub, highlight, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number; sub?: string; highlight?: boolean;
  tone?: "accent";
}) {
  const accentBorder = tone === "accent" && !highlight ? "border-l-4 border-l-accent" : "";
  return (
    <div className={`rounded-xl p-5 border ${highlight ? "bg-primary text-white border-primary" : "bg-white border-border"} ${accentBorder}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${highlight ? "text-white/70" : tone === "accent" ? "text-accent" : "text-primary"}`} />
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${highlight ? "text-white/70" : "text-muted-foreground"}`}>{label}</p>
      </div>
      <p className={`text-2xl font-display font-bold ${highlight ? "text-white" : "text-foreground"}`}>
        <AnimatedNumber value={value} formatter={v => v.toLocaleString("en-GB")} />
      </p>
      {sub && <p className={`text-xs mt-1 ${highlight ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}

export default function OrgDashboard() {
  const { data: orgData, isLoading, isError } = useMyOrg();
  const [, setLocation] = useLocation();

  const isManager = orgData?.org?.role === "manager";
  const isDemoOrg = orgData?.org?.id === DEMO_ORG_ID;
  const t = useT();

  useEffect(() => {
    if (orgData?.org && isManager && !isDemoOrg) {
      setLocation("/org", { replace: true });
    }
  }, [orgData?.org, isManager, isDemoOrg, setLocation]);

  const removedIds = useMemo(
    () => isDemoOrg ? new Set(getRemovedMemberIds(DEMO_ORG_ID)) : new Set<string>(),
    [isDemoOrg],
  );
  const allActivities = useMemo(
    () => DEMO_ACTIVITIES.filter(a => !removedIds.has(a.memberId)),
    [removedIds],
  );
  const aggregates = useMemo(() => computeDemoAggregates(allActivities), [allActivities]);
  const trend = useMemo(() => computeMonthlyTrend(allActivities), [allActivities]);
  const sdgBreakdowns = useMemo(() => computeSdgBreakdown(allActivities), [allActivities]);
  const categoryBreakdown = useMemo(() => computeCategoryBreakdown(allActivities), [allActivities]);

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
  if (!isDemoOrg) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>;
  }

  const inviteCode = getOrgInviteCode(DEMO_ORG_ID, DEMO_INVITE_CODE);

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

  // Reporting period — first to last activity in dataset.
  const dates = allActivities.map(a => a.occurredAt).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];
  const periodLabel = periodFrom && periodTo
    ? `${new Date(periodFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(periodTo).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "All time";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8" style={brandStyle} data-testid="org-dashboard-root">
      {/* Publishable document header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
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
              <EyeOff className="w-3 h-3" /> Anonymised — no member is named on this page. Member-level data lives in <Link href="/org/activities" className="underline">Activities</Link>.
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

      <OrgSubNav />

      {isDemoOrg && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-6 text-xs text-amber-900">
          You're viewing the demo organisation with mock data. Invite code <span className="font-mono font-semibold">{inviteCode}</span>.
        </div>
      )}

      {/* Aggregated stats */}
      <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <StatCard icon={TrendingUp} label="Total social value" value={`£${Number(aggregates.totalSocialValue).toLocaleString("en-GB")}`} sub={`£${aggregates.verifiedSocialValue.toLocaleString("en-GB")} verified`} highlight />
        <StatCard icon={Users} label="Active members" value={aggregates.activeMembers} sub={`of ${aggregates.totalMembers} total`} />
        <StatCard icon={Clock} label="Hours logged" value={Math.round(aggregates.totalHours)} sub={`${aggregates.totalActivities} activities`} />
        <StatCard icon={BadgeCheck} label="Avg per member" value={aggregates.averagePerMember} sub="across all members" />
      </motion.div>

      {/* Trend over recent months */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Social value by month</h3>
          <span className="text-xs text-muted-foreground">(£ generated each month)</span>
        </div>
        {trend.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No activity yet.</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
                <RechartsTooltip
                  formatter={(v: number) => [`£${v.toLocaleString("en-GB")}`, "Social value"]}
                  labelFormatter={(l) => String(l)}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* SDG alignment */}
      <div className="bg-white border border-border rounded-xl p-5 mb-6" data-testid="section-sdg-alignment">
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
      </div>

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
              const sdg = SDG_BY_CATEGORY[c.category];
              return (
                <div key={c.category} className="py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors" data-testid={`category-rank-${c.category}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-bold text-muted-foreground w-4 text-right">{idx + 1}.</span>
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
                    <div className="h-full rounded-full" style={{ width: `${(c.value / max) * 100}%`, backgroundColor: sdg?.color ?? "hsl(var(--primary))" }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.members}</span> {t("orgDashboard.categoriesMembers")} · <span className="font-semibold text-foreground">{c.activities}</span> {t("orgDashboard.categoriesActivities")} · <span className="font-semibold text-foreground">{Math.round(c.hours)}</span> {t("orgDashboard.categoriesHours")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Link href="/org/activities" className="bg-white border border-border rounded-xl p-4 hover:border-primary/50 transition-colors" data-testid="card-link-activities">
          <Users className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">Activity feed</p>
          <p className="text-xs text-muted-foreground mt-0.5">Drill into every action with member names.</p>
        </Link>
        <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/50 transition-colors" data-testid="card-link-export-pdf">
          <FileText className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">Funder-ready PDF</p>
          <p className="text-xs text-muted-foreground mt-0.5">Polished impact report you can email out.</p>
        </Link>
        <Link href="/org/export" className="bg-white border border-border rounded-xl p-4 hover:border-primary/50 transition-colors" data-testid="card-link-export-csv">
          <FileSpreadsheet className="w-4 h-4 text-primary mb-1.5" />
          <p className="text-sm font-semibold text-foreground">CSV download</p>
          <p className="text-xs text-muted-foreground mt-0.5">Raw activity rows for your own analysis.</p>
        </Link>
      </div>
    </div>
  );
}
