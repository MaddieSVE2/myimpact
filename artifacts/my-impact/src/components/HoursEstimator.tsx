import { useId } from "react";
import { NumberInput } from "@/components/ui/number-input";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  YEAR_SHARE_PRESETS,
  activeCount,
  annualHours,
  basisFromAnnual,
  changePeriod,
  isShortPeriod,
  withCustomCount,
  type HoursBasis,
  type HoursPeriod,
  type YearShare,
} from "@/lib/hours-estimate";

const PERIODS: HoursPeriod[] = ["week", "month", "year"];

interface HoursEstimatorProps {
  /** Annual hours. */
  value: number;
  /** How the person answered; left unset until they change something. */
  basis?: HoursBasis;
  /** The figure the question opens with before anyone has answered it. */
  startingValue?: number;
  /** Weeks the report covers, when it isn't a whole year. */
  reportWeeks?: number;
  onChange: (annual: number, basis: HoursBasis) => void;
  testId?: string;
}

/**
 * Asks for hours by the week, month or year and reports the annual figure.
 * Weekly and monthly answers also say how much of the year they cover, unless
 * the report covers only part of a year: then they run for all of it, and the
 * figure reported is the total for that period.
 */
export function HoursEstimator({ value, basis, startingValue = 0, reportWeeks, onChange, testId = "hours-estimator" }: HoursEstimatorProps) {
  const t = useT();
  const shareGroup = useId();
  const current = basis ?? basisFromAnnual(value, startingValue, reportWeeks);
  const short = reportWeeks !== undefined && isShortPeriod(reportWeeks);
  const countKey = current.period === "month" ? "months" : "weeks";

  const update = (next: HoursBasis) => onChange(annualHours(next), next);

  const shareOption = (id: YearShare, label: string, detail?: string) => (
    <label
      key={id}
      className={cn(
        "flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors bg-white",
        current.share === id ? "border-primary" : "border-border hover:border-primary/40",
      )}
      data-testid={`${testId}-share-${id}`}
    >
      <input
        type="radio"
        name={shareGroup}
        className="mt-0.5 accent-[hsl(var(--primary))]"
        checked={current.share === id}
        onChange={() => update({ ...current, share: id })}
      />
      <span className="text-sm text-foreground leading-snug">
        {label}
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-3">
        <NumberInput
          min="0"
          step="0.5"
          value={current.amount}
          onChange={e => update({ ...current, amount: Number(e.target.value) || 0 })}
          aria-label={t("wizard.hours")}
          className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
          data-testid={`${testId}-amount`}
        />
        <span className="text-sm text-muted-foreground">{t("wizard.hours")}</span>
        <div className="inline-flex rounded-md border border-border bg-white overflow-hidden">
          {PERIODS.map(period => (
            <button
              key={period}
              type="button"
              aria-pressed={current.period === period}
              onClick={() => {
                if (period !== current.period) onChange(value, changePeriod(current, value, period));
              }}
              className={cn(
                "px-3 py-2 text-sm min-h-[44px] transition-colors",
                current.period === period
                  ? "bg-primary text-white font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
              data-testid={`${testId}-period-${period}`}
            >
              {t(short && period === "year" ? "wizard.hoursEstimate.period.total" : `wizard.hoursEstimate.period.${period}`)}
            </button>
          ))}
        </div>
      </div>

      {current.period !== "year" && !short && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-foreground mb-2">
            {t("wizard.hoursEstimate.shareQuestion")}
          </legend>
          {YEAR_SHARE_PRESETS.map(preset =>
            shareOption(
              preset.id,
              t(`wizard.hoursEstimate.share.${preset.id}`),
              t(`wizard.hoursEstimate.${countKey}`, { count: preset[countKey] }),
            ),
          )}
          {shareOption("custom", t("wizard.hoursEstimate.share.custom"))}
          {current.share === "custom" && (
            <div className="flex items-center gap-2 pl-7 pt-1">
              <NumberInput
                min="1"
                max={current.period === "month" ? "12" : "52"}
                value={activeCount(current)}
                onChange={e => update(withCustomCount(current, Number(e.target.value) || 0))}
                aria-label={t(`wizard.hoursEstimate.${countKey}Label`)}
                className="w-20 p-2 rounded-md bg-white border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                data-testid={`${testId}-custom-count`}
              />
              <span className="text-sm text-muted-foreground">{t(`wizard.hoursEstimate.${countKey}Label`)}</span>
            </div>
          )}
        </fieldset>
      )}

      {current.period !== "year" && value > 0 && (
        <p className="text-sm font-semibold text-foreground" data-testid={`${testId}-total`}>
          {t(
            short
              ? (value === 1 ? "wizard.hoursEstimate.periodTotalOne" : "wizard.hoursEstimate.periodTotal")
              : (value === 1 ? "wizard.hoursEstimate.totalOne" : "wizard.hoursEstimate.total"),
            { hours: value.toLocaleString("en-GB") },
          )}
        </p>
      )}
    </div>
  );
}
