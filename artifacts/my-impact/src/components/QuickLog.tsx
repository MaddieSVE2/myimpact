import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, ArrowRight, X, Calendar } from "lucide-react";
import {
  useListRecurringTemplates,
  useConfirmRecurringTemplate,
  useGetImpactHistory,
  useListImpactYears,
  getListRecurringTemplatesQueryKey,
  getGetImpactHistoryQueryKey,
  getListImpactYearsQueryKey,
  type RecurringTemplate,
  type SelectedActivity,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useWizard } from "@/lib/wizard-context";
import { useToast } from "@/hooks/use-toast";

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

/**
 * Pick an overlay from history: for each template activity, if the user has a
 * more recent matching activity in their saved records, use that quantity/hours.
 */
function buildOverlaidActivities(
  templateActivities: SelectedActivity[],
  history: { createdAt: string; activities?: SelectedActivity[] }[] | undefined,
): SelectedActivity[] {
  if (!history || history.length === 0) return templateActivities;
  // Sort newest first
  const sorted = [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return templateActivities.map((tplAct) => {
    for (const record of sorted) {
      const match = record.activities?.find((a) => a.activityId === tplAct.activityId);
      if (match) {
        return { ...tplAct, quantity: match.quantity, hoursPerYear: match.hoursPerYear };
      }
    }
    return tplAct;
  });
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
  const { loadFromTemplate } = useWizard();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const templatesQuery = useListRecurringTemplates({
    query: { enabled: isLoggedIn, queryKey: getListRecurringTemplatesQueryKey() },
  });
  const historyQuery = useGetImpactHistory(
    { userId: user?.id ?? "" },
    {
      query: {
        enabled: isLoggedIn && !!user?.id,
        queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }),
      },
    },
  );

  const yearsQuery = useListImpactYears({
    query: { enabled: isLoggedIn, queryKey: getListImpactYearsQueryKey() },
  });

  const confirmMutation = useConfirmRecurringTemplate();

  // Confirmation prompt state: which template is awaiting a "which year?"
  // decision, and which year is currently selected in that prompt.
  const [pendingTemplate, setPendingTemplate] = useState<RecurringTemplate | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const templates = templatesQuery.data?.templates ?? [];
  const visibleTemplates = useMemo(() => {
    if (onlyDue) return templates.filter((t) => t.isDue);
    return templates;
  }, [templates, onlyDue]);

  if (!isLoggedIn) return null;
  if (templatesQuery.isLoading) return null;
  if (visibleTemplates.length === 0) return null;

  const currentYear = new Date().getFullYear();
  // Years the user already has entries in, newest first, capped at the
  // current year (habits can't be logged into the future).
  const recordYears = (yearsQuery.data?.years ?? [])
    .map((y) => y.year)
    .filter((y) => y <= currentYear)
    .sort((a, b) => b - a);

  const doConfirm = async (template: RecurringTemplate, year: number) => {
    // Ticking a habit bulk-creates one impact entry per month of the chosen
    // calendar year (remaining months for the current year, all months for a
    // past year). The wizard pre-fill flow remains as a fallback path for
    // users who want to amend before saving, but the primary action here is
    // the bulk confirm, so we don't navigate away.
    setPendingTemplate(null);
    try {
      const result = (await confirmMutation.mutateAsync({
        id: template.id,
        data: { year },
      })) as { entriesCreated?: number };
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) });
      // Refresh everything derived from impact records (dashboard totals,
      // year picker, stats) so the chosen year reflects the new activity.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/impact"),
      });
      const created = result?.entriesCreated ?? 0;
      if (created > 0) {
        toast({
          title: `Logged "${template.label}"`,
          description:
            year === currentYear
              ? `Added ${created} monthly ${created === 1 ? "entry" : "entries"} for the rest of ${year}.`
              : `Added ${created} monthly ${created === 1 ? "entry" : "entries"} to your ${year} impact record.`,
        });
      } else {
        // Nothing new created, the user already has habit entries for the
        // chosen year. Nudge them to the wizard if they want to adjust.
        const overlaid = buildOverlaidActivities(
          template.defaultActivities,
          historyQuery.data?.records,
        );
        loadFromTemplate(overlaid, template.defaultDonationsGBP ?? 0);
        toast({
          title: `"${template.label}" already logged for ${year}`,
          description: "Want to adjust an entry? Edit it from your history, or save a new one below.",
        });
        navigate("/wizard/contributions");
      }
    } catch {
      toast({
        title: "Couldn't log this habit",
        description: "Please try again, or open the wizard to log it manually.",
        variant: "destructive",
      });
    }
  };

  const handleCardTap = (template: RecurringTemplate) => {
    if (recordYears.length === 0) {
      // No impact records yet — nothing to ask about. Start their record for
      // the current year without a confusing prompt.
      void doConfirm(template, currentYear);
      return;
    }
    const defaultYear = recordYears[0] ?? currentYear;
    setSelectedYear(defaultYear);
    setPendingTemplate(template);
  };

  const isCompact = variant === "compact";

  return (
    <section className={isCompact ? "mb-4" : "mb-6"} data-testid="quick-log-section">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-3.5 h-3.5" style={{ color: "#F06127" }} aria-hidden="true" />
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {onlyDue ? "Quick log: due now" : "Your regular activities"}
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
          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-sm"
              style={{
                borderColor: template.isDue ? "#F06127" : "hsl(var(--border))",
                boxShadow: template.isDue ? "0 0 0 1px #F0612730" : undefined,
              }}
              data-testid={`quick-log-card-${template.id}`}
            >
              <button
                onClick={() => handleCardTap(template)}
                disabled={confirmMutation.isPending}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors disabled:opacity-60"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: template.isDue ? "#F06127" : "hsl(var(--muted))" }}
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
                    <span style={{ color: template.isDue ? "#F06127" : undefined, fontWeight: template.isDue ? 600 : 400 }}>
                      {dueLabel}
                    </span>
                    <span className="text-muted-foreground/50"> · </span>
                    {describeCadence(template)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              </button>

              <AnimatePresence>
                {pendingTemplate?.id === template.id && (
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
                          Add this to your {selectedYear ?? currentYear} impact record?
                        </p>
                        <button
                          onClick={() => setPendingTemplate(null)}
                          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
                          aria-label="Cancel"
                          data-testid={`quick-log-confirm-cancel-${template.id}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {recordYears.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {recordYears.map((y) => (
                            <button
                              key={y}
                              onClick={() => setSelectedYear(y)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                selectedYear === y
                                  ? "text-white border-transparent"
                                  : "bg-white text-foreground border-border hover:border-foreground/40"
                              }`}
                              style={selectedYear === y ? { background: "#F06127" } : undefined}
                              data-testid={`quick-log-year-${template.id}-${y}`}
                            >
                              {y}
                            </button>
                          ))}
                        </div>
                      )}

                      {selectedYear != null && selectedYear < currentYear && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Entries for {selectedYear} will be added as retrospective (added later).
                        </p>
                      )}

                      <button
                        onClick={() => doConfirm(template, selectedYear ?? currentYear)}
                        disabled={confirmMutation.isPending}
                        className="mt-3 w-full py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                        style={{ background: "#F06127" }}
                        data-testid={`quick-log-confirm-yes-${template.id}`}
                      >
                        Yes, add to {selectedYear ?? currentYear}
                      </button>
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
