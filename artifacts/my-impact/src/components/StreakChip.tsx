import { Flame, AlertCircle } from "lucide-react";
import type { StreakInfo } from "@workspace/api-client-react";

interface StreakChipProps {
  streak: StreakInfo;
  size?: "sm" | "md";
  showLongest?: boolean;
}

export default function StreakChip({ streak, size = "sm", showLongest = false }: StreakChipProps) {
  const { current, longest, atRisk } = streak;

  if (current === 0 && longest === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-border text-muted-foreground ${
          size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
        }`}
        aria-label="No streak yet — log an activity to start one"
      >
        <Flame className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} aria-hidden="true" />
        Start your streak
      </span>
    );
  }

  const broken = current === 0;
  const bg = broken ? "#F3F4F6" : atRisk ? "#FEF3C7" : "#FEE4D6";
  const border = broken ? "#E5E7EB" : atRisk ? "#FCD34D" : "#F06127";
  const fg = broken ? "#6B7280" : atRisk ? "#92400E" : "#9A3412";

  const label = broken
    ? `Streak broken — best ${longest} weeks`
    : atRisk
      ? `${current}-week streak (log this week to keep it!)`
      : `${current}-week streak`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: bg, borderColor: border, color: fg }}
      aria-label={label}
      title={showLongest && longest > 0 ? `Longest streak: ${longest} weeks` : undefined}
    >
      {atRisk && !broken ? (
        <AlertCircle className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} aria-hidden="true" />
      ) : (
        <Flame className={size === "md" ? "w-4 h-4" : "w-3.5 h-3.5"} aria-hidden="true" />
      )}
      {broken
        ? `Best: ${longest} ${longest === 1 ? "week" : "weeks"}`
        : `${current}-week streak`}
      {showLongest && !broken && longest > current && (
        <span className="font-normal opacity-70">· best {longest}</span>
      )}
    </span>
  );
}
