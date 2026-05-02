import { useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, ArrowRight, X, Calendar } from "lucide-react";
import {
  useListRecurringTemplates,
  useConfirmRecurringTemplate,
  useGetImpactHistory,
  getListRecurringTemplatesQueryKey,
  getGetImpactHistoryQueryKey,
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

  const confirmMutation = useConfirmRecurringTemplate();

  const templates = templatesQuery.data?.templates ?? [];
  const visibleTemplates = useMemo(() => {
    if (onlyDue) return templates.filter((t) => t.isDue);
    return templates;
  }, [templates, onlyDue]);

  if (!isLoggedIn) return null;
  if (templatesQuery.isLoading) return null;
  if (visibleTemplates.length === 0) return null;

  const handleConfirm = async (template: RecurringTemplate) => {
    const overlaid = buildOverlaidActivities(
      template.defaultActivities,
      historyQuery.data?.records,
    );
    loadFromTemplate(overlaid, template.defaultDonationsGBP ?? 0);

    // Mark the current scheduled occurrence confirmed before navigating away.
    // Failure here shouldn't block the wizard — confirmation is a UX hint
    // (it stops the card showing as "due"), not a data-integrity step.
    try {
      await confirmMutation.mutateAsync({ id: template.id });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
    } catch {
      // best-effort
    }

    navigate("/wizard/contributions");
    toast({
      title: `Logging "${template.label}"`,
      description: "We've pre-filled your usual values. Adjust them if needed and save.",
    });
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
                onClick={() => handleConfirm(template)}
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
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
