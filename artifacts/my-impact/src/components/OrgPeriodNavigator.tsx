import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  periodOffset: number;
  setPeriodOffset: (fn: number | ((prev: number) => number)) => void;
  label: string;
  isCurrentPeriod: boolean;
}

export function OrgPeriodNavigator({ periodOffset, setPeriodOffset, label, isCurrentPeriod }: Props) {
  return (
    <div className="flex items-center rounded-lg border border-border bg-white" data-testid="period-navigator">
      <button
        type="button"
        onClick={() => setPeriodOffset(o => o - 1)}
        className="p-1.5 rounded-l-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Previous period"
        data-testid="period-prev"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <span
        className="text-xs font-semibold text-foreground px-3 min-w-[9rem] text-center border-x border-border py-1.5 leading-tight"
        data-testid="period-label"
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => setPeriodOffset(o => o + 1)}
        disabled={isCurrentPeriod}
        className="p-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next period"
        data-testid="period-next"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      {periodOffset !== 0 && (
        <button
          type="button"
          onClick={() => setPeriodOffset(0)}
          className="text-[10px] font-semibold text-primary hover:underline px-2 border-l border-border py-1.5 rounded-r-lg"
          data-testid="period-reset"
        >
          Current
        </button>
      )}
    </div>
  );
}
