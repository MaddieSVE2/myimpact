import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Sparkles, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetImpactHistoryQueryKey,
  type SelectedActivity,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

// On the user's first visit on/after 1 January, the API tells us whether
// they have habits worth carrying forward. The modal lists each ongoing
// habit with a checkbox so the user can confirm, untick, or skip — and
// then the server bulk-creates one entry per calendar month for the new
// year. Dismissing without confirming is sticky for the rest of the
// browser session so we don't pester the user repeatedly.

interface RolloverHabit {
  templateId: number;
  label: string;
  defaultDonationsGBP: number;
  defaultActivities: SelectedActivity[];
}

interface RolloverState {
  shouldShow: boolean;
  priorYear: number | null;
  priorYearTotalValue: number | null;
  priorYearTotalHours: number | null;
  currentYear: number;
  habits: RolloverHabit[];
}

const DISMISS_KEY = "mi_year_rollover_dismissed_at";

export function YearRolloverModal() {
  const { isLoggedIn, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [state, setState] = useState<RolloverState | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const dismissedAt = window.sessionStorage.getItem(DISMISS_KEY);
        if (dismissedAt) return;
        const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${BASE}/api/impact/year-rollover`, { credentials: "include" });
        if (!res.ok) return;
        const json: RolloverState = await res.json();
        if (cancelled || !json.shouldShow) return;
        setState(json);
        setConfirmedIds(new Set(json.habits.map(h => h.templateId)));
        setOpen(true);
      } catch {
        // best-effort — don't block app load on rollover prompt
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const dismiss = () => {
    try { window.sessionStorage.setItem(DISMISS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setOpen(false);
  };

  const toggleHabit = (id: number) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!state) return;
    setSubmitting(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/impact/year-rollover`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedTemplateIds: Array.from(confirmedIds) }),
      });
      if (!res.ok) throw new Error("rollover failed");
      const json = await res.json() as { entriesCreated: number; year: number };
      queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) });
      queryClient.invalidateQueries({ queryKey: ["impact-years", user?.id ?? ""] });
      if (json.entriesCreated > 0) {
        toast({
          title: `Welcome to ${json.year}!`,
          description: `Carried ${confirmedIds.size} ${confirmedIds.size === 1 ? "habit" : "habits"} forward — ${json.entriesCreated} monthly entries added.`,
        });
      } else {
        toast({ title: `Welcome to ${json.year}!`, description: "Nothing carried over this year — log your first activity whenever you're ready." });
      }
      dismiss();
    } catch {
      toast({ title: "Couldn't carry habits forward", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !state) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={dismiss}
      data-testid="year-rollover-modal"
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md mx-auto p-6 shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:bg-muted/40"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
          <Calendar className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1">
          Welcome to {state.currentYear}!
        </h2>
        {state.priorYear != null && state.priorYearTotalValue != null && (
          <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" aria-hidden="true" />
            In {state.priorYear} you generated <strong className="text-foreground">{formatCurrency(state.priorYearTotalValue)}</strong> of social value.
          </p>
        )}
        <p className="text-sm text-foreground mb-4">
          Carry your ongoing habits into the new year? We'll add a monthly entry for each one — you can edit or remove them anytime.
        </p>

        {state.habits.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-5 italic">
            You don't have any saved habits yet. Click "Get started" to begin logging activities for {state.currentYear}.
          </p>
        ) : (
          <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
            {state.habits.map(h => {
              const checked = confirmedIds.has(h.templateId);
              return (
                <label
                  key={h.templateId}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 cursor-pointer"
                  data-testid={`rollover-habit-${h.templateId}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleHabit(h.templateId)}
                    className="mt-1 w-4 h-4 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{h.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {h.defaultActivities.length} {h.defaultActivities.length === 1 ? "activity" : "activities"}
                      {h.defaultDonationsGBP > 0 && ` · £${h.defaultDonationsGBP.toLocaleString()} donations`}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={dismiss}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 px-4 py-3 min-h-[44px] rounded-lg text-sm font-bold text-white transition-all disabled:opacity-60"
            style={{ background: "#F06127" }}
            data-testid="button-rollover-confirm"
          >
            {submitting ? "Saving…" : state.habits.length === 0 ? "Get started" : "Carry forward"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
