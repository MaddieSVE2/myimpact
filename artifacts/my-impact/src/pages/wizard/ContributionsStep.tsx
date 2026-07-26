import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { useCalculateImpact, useCreateRecurringTemplate, getListRecurringTemplatesQueryKey } from "@workspace/api-client-react";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";
import { useT } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { TimescalePresetPicker } from "@/components/TimescalePresetPicker";
import { RecurringTemplateDialog } from "@/components/results/RecurringTemplateDialog";
import { type TimescalePresetId } from "@/lib/timescale-presets";
import { todayIso } from "@/components/quicklog/activity-shared";
import { NumberInput } from "@/components/ui/number-input";
import { CONTENT_CONTAINER } from "@/lib/layout";

export default function ContributionsStep() {
  const [, setLocation] = useLocation();
  const { input, updateInput, setResult, customActivities, entryDate, setEntryDate } = useWizard();
  const t = useT();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [donations, setDonations] = useState<number>(input.donationsGBP || 0);
  const [hours, setHours] = useState<number>(input.additionalVolunteerHours || 0);
  const [calcError, setCalcError] = useState<string | null>(null);

  const calculateMutation = useCalculateImpact();
  const createTemplateMutation = useCreateRecurringTemplate();

  const [activePreset, setActivePreset] = useState<TimescalePresetId>("today");
  const [showRecurring, setShowRecurring] = useState(false);
  const [tplLabel, setTplLabel] = useState("");
  const [tplCadence, setTplCadence] = useState<"weekly" | "fortnightly" | "monthly">("weekly");
  const [tplDay, setTplDay] = useState<number>(new Date().getDay());

  const handleOngoing = () => {
    const firstActivity = input.activities?.[0];
    setTplLabel(firstActivity ? (firstActivity as { activityName?: string }).activityName ?? "" : "");
    setShowRecurring(true);
  };

  const handleCloseRecurring = () => {
    setShowRecurring(false);
    setActivePreset("today");
    setEntryDate(todayIso());
  };

  const handleSaveRecurring = async () => {
    if (!tplLabel.trim()) return;
    try {
      await createTemplateMutation.mutateAsync({
        data: {
          label: tplLabel.trim(),
          cadence: tplCadence,
          dayOfPeriod: tplDay,
          defaultActivities: input.activities,
          defaultDonationsGBP: input.donationsGBP ?? 0,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListRecurringTemplatesQueryKey() });
      setShowRecurring(false);
      toast({
        title: "Saved as a regular activity",
        description: "You'll see a quick-log card on your home and history pages when it's due.",
      });
      setLocation("/");
    } catch {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleFinish = async () => {
    if (activePreset === "ongoing") return;
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

  const isOngoing = activePreset === "ongoing";

  return (
    <div className={`${CONTENT_CONTAINER} py-12`}>
      <StepProgress currentStep={3} />

      <motion.div
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <label className="block text-sm font-medium text-foreground mb-1">
          What date does this entry count toward?
        </label>
        <p className="text-xs text-muted-foreground mb-3">
          This date applies to the whole entry — all activities, donations and volunteering hours logged here. Today by default, backdate it for past activity.
        </p>
        <TimescalePresetPicker
          entryDate={entryDate}
          onChange={setEntryDate}
          onOngoing={handleOngoing}
          activePreset={activePreset}
          onActivePresetChange={setActivePreset}
        />
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
          disabled={calculateMutation.isPending || isOngoing}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all shadow-sm disabled:opacity-70 min-h-[44px]"
          title={isOngoing ? "Complete the recurring setup below, or choose a different date option" : undefined}
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
          setTplLabel={setTplLabel}
          setTplCadence={setTplCadence}
          setTplDay={setTplDay}
          onClose={handleCloseRecurring}
          onSave={handleSaveRecurring}
          isSaving={createTemplateMutation.isPending}
        />
      )}
    </div>
  );
}
