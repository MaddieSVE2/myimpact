import { Repeat, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TIMESCALE_PRESETS,
  resolvePresetDate,
  currentTermLabel,
  lastTermLabel,
  type TimescalePresetId,
} from "@/lib/timescale-presets";
import { formatDisplayDate } from "@/components/quicklog/activity-shared";

interface Props {
  entryDate: string;
  onChange: (iso: string) => void;
  onOngoing: () => void;
  /** Controlled active preset — parent owns and resets this. */
  activePreset: TimescalePresetId;
  onActivePresetChange: (id: TimescalePresetId) => void;
}

/**
 * Shared date-preset chip row used on the wizard Contributions step and the
 * Quick Log page. Renders friendly preset buttons, highlights the active one,
 * shows the resolved human-readable date, and reveals the raw date picker when
 * "Custom date" is chosen.
 *
 * Fully controlled: `activePreset` and `onActivePresetChange` are provided by
 * the parent so parents can block one-off submission while "Ongoing" is active
 * and reset the picker when the recurring dialog is dismissed.
 */
export function TimescalePresetPicker({
  entryDate,
  onChange,
  onOngoing,
  activePreset,
  onActivePresetChange,
}: Props) {
  const now = new Date();
  const today = (() => {
    const d = now;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  function handlePreset(id: TimescalePresetId) {
    if (id === "ongoing") {
      onActivePresetChange("ongoing");
      onOngoing();
      return;
    }
    if (id === "custom") {
      onActivePresetChange("custom");
      return;
    }
    const resolved = resolvePresetDate(id, now);
    if (resolved) {
      onActivePresetChange(id);
      onChange(resolved);
    }
  }

  function getTooltip(id: TimescalePresetId): string | undefined {
    if (id === "this_term") return currentTermLabel(now);
    if (id === "last_term") return lastTermLabel(now);
    return undefined;
  }

  const resolvedDate =
    activePreset !== "ongoing" && activePreset !== "custom"
      ? resolvePresetDate(activePreset, now)
      : null;

  const showPicker = activePreset === "custom";

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {TIMESCALE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          const tooltip = getTooltip(preset.id);
          const isOngoing = preset.id === "ongoing";
          return (
            <button
              key={preset.id}
              type="button"
              title={tooltip}
              onClick={() => handlePreset(preset.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all min-h-[32px]",
                isActive
                  ? "bg-foreground text-white border-foreground"
                  : "bg-white text-foreground border-border hover:border-foreground/40 hover:bg-muted/30",
              )}
              data-testid={`preset-${preset.id}`}
            >
              {isOngoing && <Repeat className="w-3 h-3" aria-hidden="true" />}
              {preset.label}
            </button>
          );
        })}
      </div>

      {showPicker && (
        <div className="mt-2 mb-2">
          <input
            type="date"
            value={entryDate}
            max={today}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const clamped = v > today ? today : v;
              onChange(clamped);
            }}
            className="w-full min-h-[44px] py-3 px-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
            data-testid="preset-custom-date-input"
          />
        </div>
      )}

      {activePreset !== "ongoing" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {activePreset === "custom"
            ? entryDate
              ? `Entry dated ${formatDisplayDate(entryDate)}`
              : "Pick a date above"
            : resolvedDate
            ? `Entry dated ${formatDisplayDate(resolvedDate)}`
            : ""}
        </p>
      )}

      {activePreset === "ongoing" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
          <Repeat className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Set up a recurring schedule below — or pick another option to log a single entry
        </p>
      )}
    </div>
  );
}
