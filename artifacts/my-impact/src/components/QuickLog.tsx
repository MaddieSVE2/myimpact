import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, ArrowRight, X, Calendar, Pencil, Check } from "lucide-react";
import {
  useListRecurringTemplates,
  useLogRecurringOccurrence,
  useSkipRecurringOccurrence,
  getListRecurringTemplatesQueryKey,
  getGetImpactHistoryQueryKey,
  type RecurringTemplate,
  type SelectedActivity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { NumberInput } from "@/components/ui/number-input";
import { LocationPicker, describeLocation, type ActivityLocationValue } from "@/components/quicklog/LocationPicker";
import { todayIso } from "@/components/quicklog/activity-shared";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export function describeCadence(template: Pick<RecurringTemplate, "cadence" | "dayOfPeriod">): string {
  if (template.cadence === "monthly") {
    return `Monthly · ${template.dayOfPeriod}${ordinalSuffix(template.dayOfPeriod)}`;
  }
  const day = DAY_NAMES[template.dayOfPeriod] ?? "Sunday";
  if (template.cadence === "fortnightly") return `Every other ${day}`;
  return `Every ${day}`;
}

/** "this week" / "this fortnight" / "this month" for the due question. */
export function cadencePeriodWord(cadence: RecurringTemplate["cadence"]): string {
  if (cadence === "monthly") return "this month";
  if (cadence === "fortnightly") return "this fortnight";
  return "this week";
}

/** Per-occurrence hours from the template's occurrence defaults. */
export function occurrenceHours(template: Pick<RecurringTemplate, "occurrenceActivities">): number {
  return (template.occurrenceActivities ?? []).reduce(
    (sum, a) => sum + (Number(a.hoursPerYear) || 0),
    0,
  );
}

function formatDueLabel(template: RecurringTemplate): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(template.nextDueDate);
  next.setHours(0, 0, 0, 0);
  const diffDays = Math.round((next.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (template.isDue) return "Due to log now";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  return next.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

interface QuickLogProps {
  /**
   * If true, only show templates that are currently due. Useful on Home where
   * we don't want to surface non-actionable schedule cards.
   * If false, show all templates with their next-due date as context.
   */
  onlyDue?: boolean;
  variant?: "default" | "compact";
  showManageLink?: boolean;
}

export function QuickLog({ onlyDue = false, variant = "default", showManageLink = false }: QuickLogProps) {
  const { isLoggedIn, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const templatesQuery = useListRecurringTemplates({
    query: { enabled: isLoggedIn, queryKey: getListRecurringTemplatesQueryKey() },
  });

  const logMutation = useLogRecurringOccurrence();
  const skipMutation = useSkipRecurringOccurrence();

  // Which template's occurrence prompt is open, plus editable overrides.
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editHours, setEditHours] = useState<number>(1);
  const [editDate, setEditDate] = useState<string>(todayIso());
  const [editLocation, setEditLocation] = useState<ActivityLocationValue | null>(null);
  const [duplicateFor, setDuplicateFor] = useState<string | null>(null);

  const templates = templatesQuery.data?.templates ?? [];
  const visibleTemplates = useMemo(() => {
    if (onlyDue) return templates.filter((t) => t.isDue);
    return templates;
  }, [templates, onlyDue]);

  if (!isLoggedIn) return null;
  if (templatesQuery.isLoading) return null;
  if (visibleTemplates.length === 0) return null;

  const invalidateAfterLog = () => {
    queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) });
    // Refresh everything derived from impact records (dashboard totals,
    // year picker, stats) so totals reflect the new occurrence.
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/impact"),
    });
  };

  const closePrompt = () => {
    setOpenTemplateId(null);
    setEditing(false);
    setDuplicateFor(null);
  };

  const openPrompt = (template: RecurringTemplate) => {
    // The Yes/Edit/Skip prompt only exists for a due occurrence — forecasts
    // and future occurrences are never loggable from here.
    if (!template.isDue) return;
    setOpenTemplateId(template.id);
    setEditing(false);
    setDuplicateFor(null);
    setEditHours(Math.max(1, occurrenceHours(template)));
    setEditDate((template.dueOccurrenceDate ?? new Date().toISOString()).slice(0, 10));
    setEditLocation((template.usualLocation as ActivityLocationValue | null) ?? null);
  };

  /**
   * Build the per-occurrence activities to log. When the user edited hours,
   * scale the first activity's hours to match (templates are typically
   * single-activity); other activities keep their defaults.
   */
  const buildActivities = (template: RecurringTemplate, useEdits: boolean): SelectedActivity[] => {
    const base = (template.occurrenceActivities ?? []) as SelectedActivity[];
    if (!useEdits || base.length === 0) return base;
    const defaultTotal = Math.max(1, occurrenceHours(template));
    return base.map((a, i) =>
      i === 0
        ? { ...a, hoursPerYear: Math.max(0, Math.round((a.hoursPerYear / defaultTotal) * editHours)) || editHours }
        : a,
    );
  };

  const doLog = async (template: RecurringTemplate, opts?: { useEdits?: boolean; force?: boolean }) => {
    try {
      const result = await logMutation.mutateAsync({
        id: template.id,
        data: {
          ...(opts?.useEdits
            ? {
                occurrenceDate: editDate,
                activities: buildActivities(template, true),
                ...(editLocation ? { location: editLocation } : {}),
              }
            : {}),
          ...(opts?.force ? { force: true } : {}),
        },
      });
      invalidateAfterLog();
      closePrompt();
      const when = new Date(result.record.entryDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
      toast({
        title: `Logged "${template.label}"`,
        description: `Added one entry for ${when} to your current impact record — ${result.record.totalHours} ${result.record.totalHours === 1 ? "hour" : "hours"} of actual impact.`,
      });
    } catch (err) {
      const apiErr = err as { status?: number; data?: { error?: string } };
      if (apiErr?.status === 409 && apiErr?.data?.error === "occurrence_already_logged") {
        setDuplicateFor(template.id);
        return;
      }
      toast({
        title: "Couldn't log this activity",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const doSkip = async (template: RecurringTemplate) => {
    try {
      await skipMutation.mutateAsync({ id: template.id });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      closePrompt();
      toast({
        title: `Skipped ${cadencePeriodWord(template.cadence)}`,
        description: "Nothing was logged. We'll remind you next time.",
      });
    } catch {
      toast({ title: "Couldn't skip", description: "Please try again.", variant: "destructive" });
    }
  };

  const isCompact = variant === "compact";
  const pending = logMutation.isPending || skipMutation.isPending;

  return (
    <section className={isCompact ? "mb-4" : "mb-6"} data-testid="quick-log-section">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-3.5 h-3.5" style={{ color: "var(--brand-orange-bright)" }} aria-hidden="true" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {onlyDue ? "Quick Log shortcut due" : "Your saved Quick Log shortcuts"}
          </p>
        </div>
        {showManageLink && (
          <Link href="/settings" className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Manage
          </Link>
        )}
      </div>

      <div className={isCompact ? "grid gap-2" : "grid gap-2.5 sm:grid-cols-2"}>
        {visibleTemplates.map((template) => {
          const dueLabel = formatDueLabel(template);
          const hours = occurrenceHours(template);
          const locationLabel = describeLocation(template.usualLocation as ActivityLocationValue | null);
          const summaryParts = [
            hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null,
            locationLabel,
          ].filter(Boolean);
          const isOpen = openTemplateId === template.id;
          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm"
              style={{
                borderColor: template.isDue ? "var(--brand-orange-bright)" : "hsl(var(--border))",
                boxShadow: template.isDue ? "0 0 0 1px color-mix(in srgb, var(--brand-orange-bright) 19%, transparent)" : undefined,
              }}
              data-testid={`quick-log-card-${template.id}`}
            >
              <button
                onClick={() => (isOpen ? closePrompt() : openPrompt(template))}
                disabled={pending || !template.isDue}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                  template.isDue ? "hover:bg-muted/20 disabled:opacity-60" : "cursor-default"
                }`}
                aria-disabled={!template.isDue}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: template.isDue ? "var(--brand-orange-bright)" : "hsl(var(--muted))" }}
                  aria-hidden="true"
                >
                  <Calendar
                    className="w-4 h-4"
                    style={{ color: template.isDue ? "white" : "hsl(var(--muted-foreground))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{template.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span style={{ color: template.isDue ? "var(--brand-orange-bright)" : undefined, fontWeight: template.isDue ? 600 : 400 }}>
                      {dueLabel}
                    </span>
                    <span className="text-muted-foreground/50"> · </span>
                    {describeCadence(template)}
                  </p>
                </div>
                {template.isDue && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                )}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border/60 bg-muted/20"
                    data-testid={`quick-log-confirm-${template.id}`}
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground font-medium">
                          Use your {template.label.toLowerCase()} shortcut for {cadencePeriodWord(template.cadence)}?
                        </p>
                        <button
                          onClick={closePrompt}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
                          aria-label="Cancel"
                          data-testid={`quick-log-confirm-cancel-${template.id}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {summaryParts.length > 0 && !editing && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid={`quick-log-summary-${template.id}`}>
                          {summaryParts.join(" · ")}
                        </p>
                      )}

                      {editing && (
                        <div className="mt-3 space-y-3" data-testid={`quick-log-edit-${template.id}`}>
                          <div>
                            <label className="block text-[11px] font-medium text-foreground mb-1">Hours this time</label>
                            <NumberInput
                              min="0"
                              value={editHours}
                              onChange={(e) => setEditHours(Number(e.target.value))}
                              className="bg-white w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-foreground/20"
                              data-testid={`quick-log-edit-hours-${template.id}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-foreground mb-1">Date</label>
                            <input
                              type="date"
                              value={editDate}
                              max={todayIso()}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="bg-white w-full px-3 py-2 text-sm border border-border rounded-md"
                              data-testid={`quick-log-edit-date-${template.id}`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-foreground mb-1">Where?</label>
                            <LocationPicker value={editLocation} onChange={setEditLocation} />
                          </div>
                        </div>
                      )}

                      {duplicateFor === template.id ? (
                        <div className="mt-3" data-testid={`quick-log-duplicate-${template.id}`}>
                          <p className="text-xs text-foreground">
                            Looks like this occurrence is already logged for that date. Log it anyway?
                          </p>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => void doLog(template, { useEdits: editing, force: true })}
                              disabled={pending}
                              className="flex-1 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                              style={{ background: "var(--brand-orange-bright)" }}
                              data-testid={`quick-log-force-${template.id}`}
                            >
                              Log anyway
                            </button>
                            <button
                              onClick={closePrompt}
                              className="flex-1 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30"
                            >
                              Never mind
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => void doLog(template, { useEdits: editing })}
                            disabled={pending}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
                            style={{ background: "var(--brand-orange-bright)" }}
                            data-testid={`quick-log-confirm-yes-${template.id}`}
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            {editing ? "Log it" : "Yes, log it"}
                          </button>
                          {!editing && (
                            <button
                              onClick={() => setEditing(true)}
                              disabled={pending}
                              className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 inline-flex items-center gap-1.5 disabled:opacity-60"
                              data-testid={`quick-log-edit-button-${template.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => void doSkip(template)}
                            disabled={pending}
                            className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted/30 disabled:opacity-60"
                            data-testid={`quick-log-skip-${template.id}`}
                          >
                            Skip
                          </button>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground mt-2">
                        Logging adds one entry to your current impact record. Skipping logs nothing.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
