import { motion } from "framer-motion";
import { Repeat } from "lucide-react";

export function RecurringTemplateDialog({
  tplLabel,
  tplCadence,
  tplDay,
  setTplLabel,
  setTplCadence,
  setTplDay,
  onClose,
  onSave,
  isSaving,
}: {
  tplLabel: string;
  tplCadence: "weekly" | "fortnightly" | "monthly";
  tplDay: number;
  setTplLabel: (v: string) => void;
  setTplCadence: (v: "weekly" | "fortnightly" | "monthly") => void;
  setTplDay: (v: number) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      data-testid="recurring-template-dialog"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-auto p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#F0612718" }}>
            <Repeat className="w-4 h-4" style={{ color: "#F06127" }} aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Make this a regular activity?</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          We'll show a one-tap "quick log" card on your home and history pages when it's next due.
        </p>

        <label className="block text-xs font-medium text-foreground mb-1.5">Label</label>
        <input
          value={tplLabel}
          onChange={(e) => setTplLabel(e.target.value)}
          placeholder="e.g. Tuesday food bank shift"
          className="bg-white w-full px-3 py-2.5 mb-4 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-foreground/20"
          data-testid="recurring-template-label-input"
        />

        <label className="block text-xs font-medium text-foreground mb-1.5">How often?</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {(["weekly", "fortnightly", "monthly"] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setTplCadence(c);
                if (c === "monthly" && tplDay > 28) setTplDay(1);
                if ((c === "weekly" || c === "fortnightly") && tplDay > 6) setTplDay(new Date().getDay());
              }}
              className="px-3 py-2 rounded-md text-xs font-medium border transition-all capitalize"
              style={tplCadence === c
                ? { background: "#213547", color: "white", borderColor: "#213547" }
                : { background: "white", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }
              }
            >
              {c}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-foreground mb-1.5">
          {tplCadence === "monthly" ? "Day of month" : "Day of week"}
        </label>
        {tplCadence === "monthly" ? (
          <select
            value={tplDay}
            onChange={(e) => setTplDay(parseInt(e.target.value, 10))}
            className="bg-white w-full px-3 py-2.5 mb-5 text-sm border border-border rounded-md"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{`Day ${d}`}</option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-7 gap-1 mb-5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <button
                key={i}
                onClick={() => setTplDay(i)}
                className="px-2 py-2 rounded-md text-xs font-medium border transition-all"
                style={tplDay === i
                  ? { background: "#213547", color: "white", borderColor: "#213547" }
                  : { background: "white", color: "hsl(var(--foreground))", borderColor: "hsl(var(--border))" }
                }
                aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
              >
                {d}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
          >
            Not now
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || !tplLabel.trim()}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60"
            style={{ background: "#F06127" }}
            data-testid="recurring-template-save-button"
          >
            {isSaving ? "Saving…" : "Make it regular"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
