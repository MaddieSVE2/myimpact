export function ScoreIndicator({ average }: { average: number | null }) {
  if (average === null) return null;
  const color =
    average <= 2
      ? "bg-red-500"
      : average < 3.5
        ? "bg-amber-400"
        : "bg-emerald-500";
  const label =
    average <= 2 ? "Low score" : average < 3.5 ? "Mid score" : "Good score";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`}
      title={`Latest average: ${average.toFixed(1)} / 5 — ${label}`}
      aria-label={label}
    />
  );
}
