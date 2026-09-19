import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, Sparkles, Loader2, AlertCircle, Repeat, CalendarRange } from "lucide-react";
import { useCalculateImpact, useCreateRecurringTemplate, getListRecurringTemplatesQueryKey } from "@workspace/api-client-react";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";
import { useT } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { RecurringTemplateDialog } from "@/components/results/RecurringTemplateDialog";
import { formatPeriodRange } from "@/lib/report-period";
import { NumberInput } from "@/components/ui/number-input";
import { LocationPicker } from "@/components/quicklog/LocationPicker";
import { CONTENT_CONTAINER } from "@/lib/layout";

export default function ContributionsStep() {
  const [, setLocation] = useLocation();
  const { input, updateInput, setResult, customActivities, reportPeriod, editRecordId, activityLocation, setActivityLocation } = useWizard();
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [donations, setDonations] = useState<number>(input.donationsGBP || 0);
  const [hours, setHours] = useState<number>(input.additionalVolunteerHours || 0);
  const [calcError, setCalcError] = useState<string | null>(null);

  const calculateMutation = useCalculateImpact();
  const createTemplateMutation = useCreateRecurringTemplate();

  const [showRecurring, setShowRecurring] = useState(false);
  const [tplLabel, setTplLabel] = useState("");
  const [tplCadence, setTplCadence] = useState<"weekly" | "fortnightly" | "monthly">("weekly");
  const [tplDay, setTplDay] = useState<number>(new Date().getDay());
  const [tplHours, setTplHours] = useState<number>(1);

  const OCCURRENCES_PER_YEAR = { weekly: 52, fortnightly: 26, monthly: 12 } as const;

  const handleOngoing = () => {
    const firstActivity = input.activities?.[0];
    setTplLabel(firstActivity ? (firstActivity as { activityName?: string }).activityName ?? "" : "");
    // Suggest per-occurrence hours from the annual amounts entered so far.
    const annualHours = (input.activities ?? []).reduce(
      (sum, a) => sum + (Number((a as { hoursPerYear?: number }).hoursPerYear) || 0),
      0,
    );
    setTplHours(Math.max(1, Math.round(annualHours / OCCURRENCES_PER_YEAR[tplCadence])));
    setShowRecurring(true);
  };

  const handleCloseRecurring = () => {
    setShowRecurring(false);
  };

  const handleSaveRecurring = async () => {
    if (!tplLabel.trim()) return;
    // Per-occurrence defaults: what ONE occurrence looks like. Quantities are
    // scaled down from the annual inputs; the user-entered "usual hours" is
    // spread across the first activity (templates are typically one activity).
    const n = OCCURRENCES_PER_YEAR[tplCadence];
    const occurrenceActivities = (input.activities ?? []).map((a, i) => {
      const act = a as { activityId: string; quantity: number; hoursPerYear: number };
      return {
        ...act,
        quantity: Math.max(1, Math.round((Number(act.quantity) || 0) / n)),
        hoursPerYear: i === 0 ? Math.max(0, tplHours) : Math.max(0, Math.round((Number(act.hoursPerYear) || 0) / n)),
      };
    });
    try {
      await createTemplateMutation.mutateAsync({
        data: {
          label: tplLabel.trim(),
          cadence: tplCadence,
          dayOfPeriod: tplDay,
          defaultActivities: input.activities,
          defaultDonationsGBP: input.donationsGBP ?? 0,
          occurrenceActivities,
          occurrenceDonationsGBP: (input.donationsGBP ?? 0) / n,
          ...(activityLocation ? { usualLocation: activityLocation } : {}),
        },
      });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      setShowRecurring(false);
      toast({
        title: "Shortcut saved",
        description: "You'll see a Quick Log shortcut on your home and history pages when it's due.",
      });
      setLocation("/");
    } catch {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleFinish = async () => {
    setCalcError(null);
    const finalInput = {
      ...input,
      donationsGBP: donations,
      additionalVolunteerHours: hours,
      customActivities,
    };
    updateInput({ donationsGBP: donations, additionalVolunteerHours: hours });

    try {
      const res = await calculateMutation.mutateAsync({ data: finalInput as any });
      setResult(res);
      track(ANALYTICS_EVENTS.WIZARD_STEP_COMPLETE, {
        step: "contributions",
        hasDonations: donations > 0,
        hasExtraHours: hours > 0,
      });
      setLocation("/results");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("common.error");
      setCalcError(msg);
    }
  };

  return (
    <div className={`${CONTENT_CONTAINER} py-12`}>
      <StepProgress currentStep={3} />

      {/* The report's period was chosen ONCE at the start of the journey —
          shown here as a read-only reminder, never asked about again. Edits
          of an existing entry keep that entry's original period, so the
          banner is hidden for them. */}
      {!editRecordId && (
        <motion.div
          className="mb-6 flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-muted/40 border border-border"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="wizard-period-banner"
        >
          <span className="flex items-center gap-2 text-sm text-foreground">
            <CalendarRange className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <span>
              Reporting period: <strong>{reportPeriod.label}</strong>
              <span className="text-muted-foreground"> · {formatPeriodRange(reportPeriod)}</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setLocation("/wizard/actions")}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors shrink-0"
            data-testid="wizard-period-change"
          >
            Change
          </button>
        </motion.div>
      )}

      <motion.div
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="wizard-loose-location"
      >
        <label className="block text-sm font-medium text-foreground mb-1">
          Where did this mostly happen? <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          A town, postcode area, "online" or "multiple locations" is plenty — you can skip this entirely.
        </p>
        <LocationPicker value={activityLocation} onChange={setActivityLocation} />
      </motion.div>

      <motion.div 
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-foreground mb-6">
          <Heart className="w-6 h-6 text-primary" />
        </div>
        
        <h2 className="text-xl font-display font-semibold mb-2">{t("wizard.additionalContributions")}</h2>
        <p className="text-muted-foreground mb-8 text-sm">
          {t("wizard.additionalContributionsDesc")}
        </p>

        <div className="space-y-4">
          <div className="bg-background p-5 rounded-lg border border-border">
            <label className="block text-sm font-medium text-foreground mb-1">
              {t("wizard.charitableDonations")}
            </label>
            <p className="text-xs text-muted-foreground mb-3">{t("wizard.charitableDonationsDesc")}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground font-medium">£</span>
              <NumberInput min="0"
                value={donations}
                onChange={e => setDonations(Number(e.target.value))}
                className="w-full min-h-[44px] py-3 pl-8 pr-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="bg-background p-5 rounded-lg border border-border">
            <label className="block text-sm font-medium text-foreground mb-1">
              {t("wizard.generalVolunteerHours")}
            </label>
            <p className="text-xs text-muted-foreground mb-3">{t("wizard.generalVolunteerHoursDesc")}</p>
            <div className="relative">
              <NumberInput min="0"
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                className="w-full min-h-[44px] py-3 px-3 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{t("wizard.hours")}</span>
            </div>
          </div>
        </div>

        {/* "Ongoing" is a route into recurring-activity setup — an attribute
            of the activity, never a substitute for the report period. */}
        <button
          type="button"
          onClick={handleOngoing}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="wizard-ongoing-link"
        >
          <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
          Do this regularly? Save as a Quick Log shortcut
        </button>

      </motion.div>

      {calcError && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{calcError}</span>
        </div>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={() => setLocation("/wizard/activities")}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-white border border-border text-sm text-foreground font-medium hover:bg-secondary transition-all min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" /> {t("common.back")}
        </button>
        <button
          onClick={handleFinish}
          disabled={calculateMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all shadow-sm disabled:opacity-70 min-h-[44px]"
        >
          {calculateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("wizard.calculating")}</>
          ) : (
            <><Sparkles className="w-4 h-4" /> {t("wizard.revealMyImpact")}</>
          )}
        </button>
      </div>

      {showRecurring && (
        <RecurringTemplateDialog
          tplLabel={tplLabel}
          tplCadence={tplCadence}
          tplDay={tplDay}
          tplHours={tplHours}
          setTplLabel={setTplLabel}
          setTplCadence={setTplCadence}
          setTplDay={setTplDay}
          setTplHours={setTplHours}
          onClose={handleCloseRecurring}
          onSave={handleSaveRecurring}
          isSaving={createTemplateMutation.isPending}
        />
      )}
    </div>
  );
}
