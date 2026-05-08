import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { BASE } from "@/lib/org-export";

interface PulseSummarySurvey {
  id: string;
  archivedAt: string | null;
}
interface PulseSummaryResults {
  totals: { responses: number; average: number };
}

export function OrgPulseSummaryCard() {
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

  return (
    <div className="bg-white border border-border rounded-xl p-5 mb-4" data-testid="section-pulse-summary">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("orgDashboard.pulseSummaryTitle")}</h3>
      </div>
      {!hasAny ? (
        <p className="text-xs text-muted-foreground">{t("orgDashboard.pulseSummaryNone")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryActive")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-active">{activeIds.length}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryResponses")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-responses">{totals.responses}</p>
          </div>
          <div className="rounded-lg bg-muted/30 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("orgDashboard.pulseSummaryAverage")}</p>
            <p className="text-lg font-display font-bold text-foreground mt-0.5" data-testid="pulse-summary-average">
              {totals.responses > 0 ? `${avg.toFixed(1)} / 5` : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
