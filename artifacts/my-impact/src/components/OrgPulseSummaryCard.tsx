import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { BASE } from "@/lib/org-export";
import { computeDemoPulseSummary, DEMO_PULSE_SURVEYS } from "@/lib/org-demo-mock";

interface PulseSummarySurvey {
  id: string;
  archivedAt: string | null;
}
interface PulseSummaryResults {
  totals: { responses: number; average: number };
  trend?: Array<{ windowKey: string; label: string; average: number; count: number }>;
}

export function OrgPulseSummaryCard({ isDemoOrg = false }: { isDemoOrg?: boolean } = {}) {
  if (isDemoOrg) {
    return <DemoOrgPulseSummaryCard />;
  }
  return <LiveOrgPulseSummaryCard />;
}

function LiveOrgPulseSummaryCard() {
  const t = useT();
  const { data: surveysData } = useQuery<{ surveys: PulseSummarySurvey[] }>({
    queryKey: ["org-surveys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/surveys`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const activeIds = useMemo(
    () => (surveysData?.surveys ?? []).filter(s => !s.archivedAt).map(s => s.id),
    [surveysData?.surveys],
  );
  const resultsQueries = useQueries({
    queries: activeIds.map(id => ({
      queryKey: ["org-survey-results", id],
      queryFn: async (): Promise<PulseSummaryResults> => {
        const res = await fetch(`${BASE}/api/org/surveys/${id}/results`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed");
        return res.json();
      },
    })),
  });
  const totals = resultsQueries.reduce(
    (acc, q) => {
      const r = q.data;
      if (!r) return acc;
      acc.responses += r.totals.responses;
      acc.weighted += r.totals.average * r.totals.responses;
      return acc;
    },
    { responses: 0, weighted: 0 },
  );
  const avg = totals.responses > 0 ? totals.weighted / totals.responses : 0;
  const hasAny = activeIds.length > 0;

  // Aggregate trend across active surveys by windowKey
  const trendPoints = useMemo(() => {
    const buckets = new Map<string, { label: string; weighted: number; count: number }>();
    for (const q of resultsQueries) {
      const trend = q.data?.trend;
      if (!trend) continue;
      for (const w of trend) {
        const b = buckets.get(w.windowKey) ?? { label: w.label, weighted: 0, count: 0 };
        b.weighted += w.average * w.count;
        b.count += w.count;
        b.label = w.label;
        buckets.set(w.windowKey, b);
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({ key, label: v.label, value: v.count > 0 ? v.weighted / v.count : 0 }));
  }, [resultsQueries]);

  // Donut ring (average / 5)
  const ringSize = 84;
  const ringStroke = 10;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, avg / 5));
  const dash = circumference * pct;
  const showDonut = hasAny && totals.responses > 0;

  // Sparkline
  const sparkW = 200;
  const sparkH = 56;
  const padX = 4;
  const padY = 6;
  const sparkPoints = trendPoints.length > 0
    ? trendPoints.map((p, i) => {
        const x = padX + (i * (sparkW - padX * 2)) / Math.max(1, trendPoints.length - 1);
        const y = sparkH - padY - ((p.value - 1) / 4) * (sparkH - padY * 2);
        return [x, y] as const;
      })
    : [];
  const sparkPath = sparkPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const sparkArea = sparkPoints.length > 0
    ? `${sparkPath} L${sparkPoints[sparkPoints.length - 1][0].toFixed(1)},${sparkH - padY} L${sparkPoints[0][0].toFixed(1)},${sparkH - padY} Z`
    : "";
  const lastPoint = sparkPoints[sparkPoints.length - 1];

  return (
    <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="section-pulse-summary">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.pulseSummaryTitle")}</h3>
      </div>
      {!hasAny ? (
        <p className="text-xs text-muted-foreground">{t("orgDashboard.pulseSummaryNone")}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-4 items-center">
          <div className="flex items-center justify-center">
            <div className="relative" style={{ width: ringSize, height: ringSize }}>
              <svg width={ringSize} height={ringSize} className="-rotate-90">
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={ringStroke} fill="none" />
                {showDonut && (
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={radius}
                    stroke="hsl(var(--primary))"
                    strokeWidth={ringStroke}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-base font-display font-bold text-foreground leading-none" data-testid="pulse-summary-average">
                  {showDonut ? avg.toFixed(1) : "—"}
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">/ 5</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-[180px]">
            <div className="rounded-lg bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryActive")}</p>
              <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-active">{activeIds.length}</p>
            </div>
            <div className="rounded-lg bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryResponses")}</p>
              <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-responses">{totals.responses}</p>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseTrendLabel")}</p>
              {trendPoints.length > 0 && (
                <p className="text-[10px] text-muted-foreground">{trendPoints[0].label} → {trendPoints[trendPoints.length - 1].label}</p>
              )}
            </div>
            {sparkPoints.length > 0 ? (
              <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" className="w-full" data-testid="pulse-summary-trend-chart">
                <path d={sparkArea} fill="hsl(var(--primary))" opacity={0.12} />
                <path d={sparkPath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {lastPoint && <circle cx={lastPoint[0]} cy={lastPoint[1]} r={3} fill="hsl(var(--primary))" />}
              </svg>
            ) : (
              <p className="text-xs text-muted-foreground py-2">{t("orgDashboard.pulseTrendEmpty")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DemoOrgPulseSummaryCard() {
  const t = useT();
  const summary = computeDemoPulseSummary();
  // Build a unified monthly trend by averaging the latest reading from each
  // active survey across the most recent shared windows. We use up to the
  // last 6 trend points per survey, then aggregate by window key.
  const trendPoints = useMemo(() => {
    const buckets = new Map<string, { label: string; weighted: number; count: number }>();
    for (const s of DEMO_PULSE_SURVEYS) {
      if (s.archivedAt) continue;
      for (const w of s.trend) {
        const b = buckets.get(w.windowKey) ?? { label: w.label, weighted: 0, count: 0 };
        b.weighted += w.average * w.count;
        b.count += w.count;
        b.label = w.label;
        buckets.set(w.windowKey, b);
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, v]) => ({ key, label: v.label, value: v.count > 0 ? v.weighted / v.count : 0 }));
  }, []);

  // Donut ring (average / 5)
  const ringSize = 84;
  const ringStroke = 10;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, summary.average / 5));
  const dash = circumference * pct;

  // Sparkline
  const sparkW = 200;
  const sparkH = 56;
  const padX = 4;
  const padY = 6;
  const minV = 1;
  const maxV = 5;
  const sparkPoints = trendPoints.length > 0
    ? trendPoints.map((p, i) => {
        const x = padX + (i * (sparkW - padX * 2)) / Math.max(1, trendPoints.length - 1);
        const y = sparkH - padY - ((p.value - minV) / (maxV - minV)) * (sparkH - padY * 2);
        return [x, y] as const;
      })
    : [];
  const sparkPath = sparkPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const sparkArea = sparkPoints.length > 0
    ? `${sparkPath} L${sparkPoints[sparkPoints.length - 1][0].toFixed(1)},${sparkH - padY} L${sparkPoints[0][0].toFixed(1)},${sparkH - padY} Z`
    : "";
  const lastPoint = sparkPoints[sparkPoints.length - 1];

  return (
    <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="section-pulse-summary">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.pulseSummaryTitle")}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[auto_auto_1fr] gap-4 items-center">
        {/* Donut ring */}
        <div className="flex items-center justify-center">
          <div className="relative" style={{ width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} className="-rotate-90">
              <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={ringStroke} fill="none" />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="hsl(var(--primary))"
                strokeWidth={ringStroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-base font-display font-bold text-foreground leading-none" data-testid="pulse-summary-average">
                {summary.responses > 0 ? summary.average.toFixed(1) : "—"}
              </p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">/ 5</p>
            </div>
          </div>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 gap-2 min-w-[180px]">
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryActive")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-active">{summary.active}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryResponses")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-responses">{summary.responses}</p>
          </div>
        </div>

        {/* Sparkline trend */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseTrendLabel")}</p>
            {trendPoints.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{trendPoints[0].label} → {trendPoints[trendPoints.length - 1].label}</p>
            )}
          </div>
          {sparkPoints.length > 0 ? (
            <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none" className="w-full" data-testid="pulse-summary-trend-chart">
              <path d={sparkArea} fill="hsl(var(--primary))" opacity={0.12} />
              <path d={sparkPath} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {lastPoint && <circle cx={lastPoint[0]} cy={lastPoint[1]} r={3} fill="hsl(var(--primary))" />}
            </svg>
          ) : (
            <p className="text-xs text-muted-foreground py-2">{t("orgDashboard.pulseTrendEmpty")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
