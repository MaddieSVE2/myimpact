import { useState, useMemo } from "react";
import { getPeriodBounds, type PeriodBounds } from "@/lib/summaryPeriod";

const DEMO_REF = new Date("2026-05-09T12:00:00Z");
const STORAGE_KEY = "org-period-offset";

export function useOrgPeriod(summaryYearStart: string, isDemoOrg: boolean): {
  periodOffset: number;
  setPeriodOffset: (fn: number | ((prev: number) => number)) => void;
  periodBounds: PeriodBounds;
  isCurrentPeriod: boolean;
  periodFrom: string;
  periodTo: string;
} {
  const [periodOffset, _set] = useState<number>(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      return s !== null ? parseInt(s, 10) : 0;
    } catch {
      return 0;
    }
  });

  const setPeriodOffset = (fn: number | ((prev: number) => number)) => {
    _set(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      try { sessionStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const periodBounds: PeriodBounds = useMemo(
    () => getPeriodBounds(summaryYearStart, periodOffset, isDemoOrg ? DEMO_REF : undefined),
    [summaryYearStart, periodOffset, isDemoOrg],
  );

  const isCurrentPeriod = periodOffset >= 0;

  // YYYY-MM-DD strings for date inputs (inclusive start, inclusive end)
  const periodFrom = periodBounds.start.toISOString().slice(0, 10);
  const periodTo = new Date(periodBounds.end.getTime() - 86400000).toISOString().slice(0, 10);

  return { periodOffset, setPeriodOffset, periodBounds, isCurrentPeriod, periodFrom, periodTo };
}
