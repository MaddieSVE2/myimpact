import { useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  type ReportPeriod,
  calendarPeriod,
  academicPeriod,
  customPeriod,
  currentAcademicStartYear,
  formatPeriodRange,
} from "@/lib/report-period";

interface Props {
  value: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
}

/**
 * The ONE authoritative report-period chooser, shown at the start of the
 * Full Impact Report journey. Offers this calendar year (default), last
 * calendar year, the current academic year, and a custom date range. The
 * period is never asked about again — the mid-flow date selector and the
 * save-time period modal are gone.
 */
export function ReportPeriodPicker({ value, onChange }: Props) {
  const now = new Date();
  const year = now.getFullYear();
  const acadStart = currentAcademicStartYear(now);
  const todayIso = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const presets: { id: string; short: string; period: ReportPeriod }[] = [
    { id: "cal-this", short: "This year", period: calendarPeriod(year) },
    { id: "cal-last", short: "Last year", period: calendarPeriod(year - 1) },
    {
      id: "academic",
      short: `Academic year ${acadStart}/${String((acadStart + 1) % 100).padStart(2, "0")}`,
      period: academicPeriod(acadStart),
    },
  ];

  const matchesPreset = presets.some(
    (p) => p.period.startDate === value.startDate && p.period.endDate === value.endDate && p.period.type === value.type,
  );
  const [showCustom, setShowCustom] = useState(value.type === "custom" && !matchesPreset);
  const [customStart, setCustomStart] = useState(value.type === "custom" ? value.startDate : "");
  const [customEnd, setCustomEnd] = useState(value.type === "custom" ? value.endDate : "");

  // Server-supported maximum span for a report period (year-shaped, with
  // slack). Longer selections are rejected there, so block them here too.
  const MAX_PERIOD_DAYS = 400;
  const customSpanDays = (start: string, end: string): number =>
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000;
  const customTooLong = Boolean(
    customStart && customEnd && customStart <= customEnd && customSpanDays(customStart, customEnd) > MAX_PERIOD_DAYS,
  );

  const applyCustom = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    if (start && end && start <= end && customSpanDays(start, end) <= MAX_PERIOD_DAYS) {
      onChange(customPeriod(start, end));
    }
  };

  return (
    <div data-testid="report-period-picker">
      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map((p) => {
          const isActive =
            !showCustom &&
            value.type === p.period.type &&
            value.startDate === p.period.startDate &&
            value.endDate === p.period.endDate;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setShowCustom(false);
                onChange(p.period);
              }}
              className={
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all min-h-[32px] " +
                (isActive
                  ? "bg-foreground text-white border-foreground"
                  : "bg-white text-foreground border-border hover:border-foreground/40 hover:bg-muted/30")
              }
              data-testid={`report-period-${p.id}`}
            >
              {p.short}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setShowCustom(true);
            if (customStart && customEnd && customStart <= customEnd) {
              onChange(customPeriod(customStart, customEnd));
            }
          }}
          className={
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all min-h-[32px] " +
            (showCustom
              ? "bg-foreground text-white border-foreground"
              : "bg-white text-foreground border-border hover:border-foreground/40 hover:bg-muted/30")
          }
          data-testid="report-period-custom"
        >
          Custom period
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            type="date"
            value={customStart}
            max={customEnd || todayIso}
            onChange={(e) => applyCustom(e.target.value, customEnd)}
            className="min-h-[40px] py-2 px-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            data-testid="report-period-custom-start"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => applyCustom(customStart, e.target.value)}
            className="min-h-[40px] py-2 px-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            data-testid="report-period-custom-end"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1" data-testid="report-period-summary">
        <CalendarRange className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {showCustom && customTooLong
          ? "Custom periods can cover at most about a year (400 days) — pick a shorter range"
          : showCustom && (!customStart || !customEnd || customStart > customEnd)
            ? "Pick a start and end date above"
            : `${value.label} · covers ${formatPeriodRange(value)}`}
      </p>
    </div>
  );
}
