import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, ChevronDown, ChevronRight, PenLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "select" | "quantify";

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, interests, addActivity, removeActivity } = useWizard();
  const { data, isLoading } = useGetActivities();

  const [phase, setPhase] = useState<Phase>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(input.activities.map(a => a.activityId))
  );
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [hours, setHours] = useState<Record<string, number>>({});
  const [quantifyIndex, setQuantifyIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHours, setCustomHours] = useState(10);

  const preferredCategories = useMemo(() => {
    return new Set(
      interests.map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category).filter(Boolean) as string[]
    );
  }, [interests]);

  const sortedActivities = useMemo(() => {
    if (!data) return [];
    return [...data.activities].sort((a, b) => {
      const aP = preferredCategories.has(a.category) ? 0 : 1;
      const bP = preferredCategories.has(b.category) ? 0 : 1;
      return aP - bP;
    });
  }, [data, preferredCategories]);

  const primaryActivities = sortedActivities.slice(0, 8);
  const moreActivities = sortedActivities.slice(8);

  const displayedActivities = showAll ? sortedActivities : primaryActivities;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Set defaults
        const activity = data?.activities.find(a => a.id === id);
        if (activity && quantities[id] === undefined) {
          setQuantities(q => ({ ...q, [id]: activity.defaultQuantity ?? 1 }));
          setHours(h => ({ ...h, [id]: activity.unit === "hour" ? (activity.defaultQuantity ?? 20) : 10 }));
        }
      }
      return next;
    });
  };

  // The ordered list of selected activities for the quantify phase
  const selectedList = useMemo(() => {
    return (data?.activities ?? []).filter(a => selectedIds.has(a.id));
  }, [data, selectedIds]);

  const currentActivity = selectedList[quantifyIndex];

  const handleStartQuantify = () => {
    if (selectedIds.size === 0) {
      setLocation("/wizard/contributions");
      return;
    }
    setQuantifyIndex(0);
    setPhase("quantify");
  };

  const handleQuantifyNext = () => {
    if (quantifyIndex < selectedList.length - 1) {
      setQuantifyIndex(i => i + 1);
    } else {
      // Commit all to wizard context
      // Clear existing
      input.activities.forEach((_, i) => removeActivity(0));
      selectedList.forEach(a => {
        const qty = quantities[a.id] ?? (a.defaultQuantity ?? 1);
        const hrs = a.unit === "hour" ? (quantities[a.id] ?? (a.defaultQuantity ?? 20)) : (hours[a.id] ?? 10);
        const finalQty = a.unit === "hour" ? 1 : qty;
        addActivity({ activityId: a.id, quantity: finalQty, hoursPerYear: a.unit === "hour" ? qty : hrs });
      });
      setLocation("/wizard/contributions");
    }
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    addActivity({ activityId: `custom_${Date.now()}`, quantity: 1, hoursPerYear: customHours });
    setCustomName("");
    setCustomHours(10);
    setShowCustom(false);
  };

  // Helper: is unit-based (not hours)
  const isQuantityUnit = (a: ActivityItem) => a.unit !== "hour";

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepProgress currentStep={2} />

      <AnimatePresence mode="wait">
        {phase === "select" ? (
          <motion.div
            key="select"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-white border border-border rounded-xl p-6 md:p-8 mb-5">
              <h2 className="text-xl font-display font-semibold text-foreground mb-1">
                Which of these do you already do?
              </h2>
              <p className="text-sm text-muted-foreground mb-5">
                Tick everything that applies — don't worry about the details yet.
                {preferredCategories.size > 0 && (
                  <span className="text-primary"> Your interests are shown first.</span>
                )}
              </p>

              {isLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    {displayedActivities.map(a => {
                      const selected = selectedIds.has(a.id);
                      const isPreferred = preferredCategories.has(a.category);
                      return (
                        <button
                          key={a.id}
                          onClick={() => toggleSelect(a.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
                            selected
                              ? "bg-primary/8 border-primary"
                              : isPreferred
                              ? "bg-primary/4 border-primary/20 hover:border-primary/50"
                              : "bg-white border-border hover:border-primary/30 hover:bg-muted/20"
                          )}
                        >
                          <div
                            className={cn(
                              "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                              selected ? "bg-primary border-primary" : "border-border"
                            )}
                          >
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="w-0.5 h-7 rounded-full shrink-0" style={{ backgroundColor: a.sdgColor }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-snug">{a.shortName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{a.category}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {moreActivities.length > 0 && !showAll && (
                    <button
                      onClick={() => setShowAll(true)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mb-4"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      Show {moreActivities.length} more activities
                    </button>
                  )}

                  {/* Custom activity */}
                  <div className="border-t border-border pt-4 mt-2">
                    {!showCustom ? (
                      <button
                        onClick={() => setShowCustom(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Do something else? Add it here
                      </button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                      >
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">What do you do?</label>
                          <input
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                            placeholder="e.g. Litter picking, befriending scheme, peer support…"
                            className="w-full p-2.5 rounded-md border border-border bg-background text-sm focus:border-primary outline-none"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">Hours per year</label>
                          <input
                            type="number" min="1"
                            value={customHours}
                            onChange={e => setCustomHours(Number(e.target.value))}
                            className="w-full p-2.5 rounded-md border border-border bg-background text-sm focus:border-primary outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddCustom}
                            disabled={!customName.trim()}
                            className="px-4 py-2 rounded-md bg-foreground text-white text-xs font-medium hover:bg-foreground/90 disabled:opacity-40 transition-colors"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => setShowCustom(false)}
                            className="px-4 py-2 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Custom activities already added */}
            {input.activities.filter(a => a.activityId.startsWith("custom_")).length > 0 && (
              <div className="bg-white border border-border rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom activities added</p>
                <div className="space-y-1.5">
                  {input.activities.filter(a => a.activityId.startsWith("custom_")).map((act, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-foreground font-medium">Custom activity · {act.hoursPerYear} hrs/yr</span>
                      <button onClick={() => removeActivity(input.activities.indexOf(act))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setLocation("/wizard/actions")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white border border-border text-sm font-medium hover:bg-secondary transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStartQuantify}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
              >
                {selectedIds.size === 0 ? "Skip" : `Next — ${selectedIds.size} selected`}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="quantify"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {currentActivity && (
              <>
                {/* Progress indicator */}
                <div className="flex items-center gap-1.5 mb-5">
                  {selectedList.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 rounded-full flex-1 transition-all",
                        i < quantifyIndex ? "bg-primary" : i === quantifyIndex ? "bg-primary" : "bg-muted"
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Activity {quantifyIndex + 1} of {selectedList.length}
                </p>

                <motion.div
                  key={currentActivity.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-border rounded-xl p-6 md:p-8 mb-5"
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: currentActivity.sdgColor }} />
                    <div>
                      <h2 className="text-lg font-display font-semibold text-foreground leading-snug">
                        {currentActivity.shortName}
                      </h2>
                      <span className="text-xs text-muted-foreground">{currentActivity.category}</span>
                    </div>
                  </div>

                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm font-medium text-foreground mb-3">
                      {currentActivity.friendlyQuestion}
                    </p>

                    {/* For household-based activities, just show a confirm toggle */}
                    {currentActivity.unit === "household" ? (
                      <div className="flex items-center gap-3 p-3 bg-white rounded-md border border-border">
                        <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm text-foreground">Yes, I do this</span>
                      </div>
                    ) : currentActivity.unit === "hour" ? (
                      <div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            value={quantities[currentActivity.id] ?? currentActivity.defaultQuantity ?? 20}
                            onChange={e => setQuantities(q => ({ ...q, [currentActivity.id]: Number(e.target.value) }))}
                            className="w-28 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                          />
                          <span className="text-sm text-muted-foreground">hours per year</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          That's roughly {Math.round((quantities[currentActivity.id] ?? currentActivity.defaultQuantity ?? 20) / 52 * 10) / 10} hours a week
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          value={quantities[currentActivity.id] ?? currentActivity.defaultQuantity ?? 1}
                          onChange={e => setQuantities(q => ({ ...q, [currentActivity.id]: Number(e.target.value) }))}
                          className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                        />
                        <span className="text-sm text-muted-foreground">{currentActivity.unitLabel}</span>
                      </div>
                    )}
                  </div>

                  {/* SDG note */}
                  <div className="flex items-center gap-2 mt-4">
                    <span
                      className="text-[10px] font-bold text-white px-2 py-0.5 rounded"
                      style={{ backgroundColor: currentActivity.sdgColor }}
                    >
                      SDG
                    </span>
                    <span className="text-xs text-muted-foreground">{currentActivity.sdg}</span>
                  </div>
                </motion.div>

                <div className="flex justify-between">
                  <button
                    onClick={() => quantifyIndex === 0 ? setPhase("select") : setQuantifyIndex(i => i - 1)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white border border-border text-sm font-medium hover:bg-secondary transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleQuantifyNext}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
                  >
                    {quantifyIndex < selectedList.length - 1 ? (
                      <><ChevronRight className="w-4 h-4" /> Next activity</>
                    ) : (
                      <>Done <Check className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
