import { useQuery } from "@tanstack/react-query";
import { getGetAnnualRecapQueryKey } from "@workspace/api-client-react";
import type { ReportResult } from "@/components/results/ReportActions";
import { apiJson } from "@/lib/api";


export interface YearResult {
  year: number;
  recordCount: number;
  result: ReportResult;
}

/**
 * A year's entries as one report (PDF, PNG and share card), with the same
 * reconciled total as the recap. The key sits under the recap's, so anything
 * that refreshes the recap after a save, edit or delete refreshes this too.
 */
export function useYearResult(year: number, enabled = true) {
  return useQuery<YearResult>({
    queryKey: [...getGetAnnualRecapQueryKey(year), "year-result"],
    queryFn: async () => {
      return apiJson(`/api/impact/year-result/${year}`, { errorMessage: "Could not load the year" });
    },
    enabled,
  });
}

/** Copy for a year's report, e.g. "Calendar year 2026 so far" on the PDF cover. */
export function yearReportCopy(year: number, totalValue: string) {
  const current = year === new Date().getFullYear();
  return {
    coveredPeriod: current ? `Calendar year ${year} so far` : `Calendar year ${year}`,
    shareText: current
      ? `I've generated ${totalValue} in social value so far this year. Find out what yours is:`
      : `I generated ${totalValue} in social value in ${year}. Find out what yours is:`,
    fileStem: `my-impact-${year}`,
  };
}
