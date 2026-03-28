import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS, type CustomActivityDetail } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, ChevronDown, ChevronRight, PenLine, Trash2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Standard SDG colours (1-indexed by SDG number)
const SDG_COLORS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21",
  6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367",
  11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B",
  16: "#00689D", 17: "#19486A",
};

function sdgFromHint(hint: string): { sdg: string; sdgColor: string } {
  const m = hint.match(/SDG\s*(\d+)[:\s]+(.+)/i);
  if (m) {
    const num = parseInt(m[1], 10);
    return { sdg: m[2].trim(), sdgColor: SDG_COLORS[num] ?? "#4C9F38" };
  }
  return { sdg: hint || "Good Health and Well-Being", sdgColor: "#4C9F38" };
}

interface ProxyMatch {
  title: string;
  proxyYear: string;
  valuePerUnit: number;
  unit: string;
}

interface AnalysedActivity {
  friendlyQuestion: string;
  unit: string;
  unitLabel: string;
  defaultQuantity: number;
  sdgHint: string;
  proxyMatch: ProxyMatch | null;
}

type Phase = "select" | "quantify";

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, interests, addActivity, removeActivity, customActivities, addCustomActivity, removeCustomActivity } = useWizard();
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
  const [analysing, setAnalysing] = useState(false);
  const [analysed, setAnalysed] = useState<AnalysedActivity | null>(null);
  const [customQuantity, setCustomQuantity] = useState(20);
  const [analyseError, setAnalyseError] = useState("");

  // Session calculator (gap 2 fix)
  const [showSessionCalc, setShowSessionCalc] = useState(false);
  const [sessionHrs, setSessionHrs] = useState(2);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(1);
  const [weeksPerYear, setWeeksPerYear] = useState(40);

  // Reset session calc when moving to a new activity
  useEffect(() => {
    setShowSessionCalc(false);
    setSessionHrs(2);
    setSessionsPerWeek(1);
    setWeeksPerYear(40);
  }, [quantifyIndex]);

  const preferredCategories = useMemo(() => {
    return new Set(
      interests.map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category).filter(Boolean) as string[]
    );
  }, [interests]);

  // Certain interests should boost specific activities regardless of category
  const boostedActivityIds = useMemo(() => {
    const boosted = new Set<string>();
    if (interests.includes('older_people') || interests.includes('caring')) {
      boosted.add('family_caring');
      boosted.add('elderly_visiting');
      boosted.add('helping_neighbours');
      boosted.add('befriending');
    }
    if (interests.includes('sport')) {
      boosted.add('sports_coaching');
    }
    if (interests.includes('community')) {
      boosted.add('community_garden');
      boosted.add('food_bank');
      boosted.add('helping_neighbours');
    }
    if (interests.includes('young_people') || interests.includes('education')) {
      boosted.add('dofe_bronze');
      boosted.add('dofe_silver');
      boosted.add('dofe_gold');
      boosted.add('school_fundraising');
    }
    if (interests.includes('community') || interests.includes('employment') || interests.includes('education')) {
      boosted.add('job_club');
    }
    if (interests.includes('military')) {
      boosted.add('military_community_reconstruction');
      boosted.add('military_population_liaison');
      boosted.add('military_personnel_training');
      boosted.add('military_first_aid');
      boosted.add('military_logistics');
      boosted.add('veterans_breakfast');
      boosted.add('youth_mentoring');
      boosted.add('employability_coaching');
      boosted.add('job_club');
    }
    if (interests.includes('career_break')) {
      boosted.add('career_break_childcare');
      boosted.add('career_break_eldercare');
      boosted.add('career_break_school_liaison');
      boosted.add('career_break_medical_coordination');
      boosted.add('family_caring');
      boosted.add('elderly_visiting');
      boosted.add('befriending');
      boosted.add('helping_neighbours');
    }
    return boosted;
  }, [interests]);

  const sortedActivities = useMemo(() => {
    if (!data) return [];
    return [...data.activities].sort((a, b) => {
      const aScore = boostedActivityIds.has(a.id) ? 0 : preferredCategories.has(a.category) ? 1 : 2;
      const bScore = boostedActivityIds.has(b.id) ? 0 : preferredCategories.has(b.category) ? 1 : 2;
      return aScore - bScore;
    });
  }, [data, preferredCategories, boostedActivityIds]);

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
        const activity = data?.activities.find(a => a.id === id);
        if (activity && quantities[id] === undefined) {
          setQuantities(q => ({ ...q, [id]: activity.defaultQuantity ?? 1 }));
          setHours(h => ({ ...h, [id]: activity.unit === "hour" ? (activity.defaultQuantity ?? 20) : 10 }));
        }
      }
      return next;
    });
  };

  const selectedList = useMemo(() => {
    return (data?.activities ?? []).filter(a => selectedIds.has(a.id));
  }, [data, selectedIds]);

  const currentActivity = selectedList[quantifyIndex];

  const handleStartQuantify = () => {
    if (selectedIds.size === 0 && customActivities.length === 0) {
      setLocation("/wizard/contributions");
      return;
    }
    if (selectedIds.size === 0) {
      // Only custom activities — skip standard quantify
      input.activities.forEach((_, i) => removeActivity(0));
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

  const analyseActivity = async () => {
    if (!customName.trim()) return;
    setAnalysing(true);
    setAnalyseError("");
    setAnalysed(null);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/custom-activity/analyse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customName.trim() }),
      });
      if (!res.ok) throw new Error("API error");
      const data: AnalysedActivity = await res.json();
      setAnalysed(data);
      setCustomQuantity(data.defaultQuantity);
    } catch {
      setAnalyseError("Couldn't analyse that activity — try a different description.");
    } finally {
      setAnalysing(false);
    }
  };

  const handleAddCustom = () => {
    if (!customName.trim() || !analysed) return;
    const activityId = `custom_${Date.now()}`;
    const { sdg, sdgColor } = sdgFromHint(analysed.sdgHint);
    const hrs = analysed.unit === "hour" ? customQuantity : customHours;
    const qty = analysed.unit === "hour" ? 1 : customQuantity;

    const detail: CustomActivityDetail = {
      activityId,
      name: customName.trim(),
      quantity: qty,
      hoursPerYear: hrs,
      valuePerUnit: analysed.proxyMatch?.valuePerUnit ?? 0,
      unit: analysed.unit,
      proxy: analysed.proxyMatch?.title ?? "",
      proxyYear: analysed.proxyMatch?.proxyYear ?? "",
      sdg,
      sdgColor,
    };

    addCustomActivity(detail);
    setCustomName("");
    setCustomHours(10);
    setAnalysed(null);
    setCustomQuantity(20);
    setShowCustom(false);
  };

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

                  {/* Zero-state encouragement */}
                  {selectedIds.size === 0 && customActivities.length === 0 && !isLoading && (
                    <div className="mb-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/15">
                      <p className="text-sm text-foreground font-medium mb-0.5">Nothing ticked yet? That's okay.</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        You can still see your potential impact and find ideas near you. Or use the custom builder below to describe what you do.
                      </p>
                    </div>
                  )}

                  {/* Custom activity */}
                  <div className="border-t border-border pt-4 mt-2">
                    {!showCustom ? (
                      <button
                        onClick={() => setShowCustom(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/4 transition-all"
                      >
                        <PenLine className="w-4 h-4" />
                        Don't see yours? Describe it here
                      </button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                      >
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">What do you do?</label>
                          <div className="flex gap-2">
                            <input
                              value={customName}
                              onChange={e => { setCustomName(e.target.value); setAnalysed(null); setAnalyseError(""); }}
                              onKeyDown={e => e.key === "Enter" && !analysed && analyseActivity()}
                              placeholder="e.g. Litter picking, befriending scheme, peer support…"
                              className="flex-1 p-2.5 rounded-md border border-border bg-background text-sm focus:border-primary outline-none"
                              autoFocus
                              disabled={analysing}
                            />
                            {!analysed && (
                              <button
                                onClick={analyseActivity}
                                disabled={!customName.trim() || analysing}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white disabled:opacity-40 transition-all shrink-0"
                                style={{ background: "#E8633A" }}
                              >
                                {analysing ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
                                ) : (
                                  <><Sparkles className="w-3.5 h-3.5" /> Analyse</>
                                )}
                              </button>
                            )}
                          </div>
                          {analyseError && (
                            <p className="text-xs text-destructive mt-1.5">{analyseError}</p>
                          )}
                        </div>

                        {analysed && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-muted/30 rounded-lg p-4 space-y-3"
                          >
                            <div className="flex items-start gap-2">
                              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#E8633A" }} />
                              <p className="text-sm font-medium text-foreground leading-snug">{analysed.friendlyQuestion}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              {analysed.unit === "pound" ? (
                                <div className="flex items-center border border-border rounded-md bg-white focus-within:border-primary">
                                  <span className="pl-2.5 pr-1 text-base font-semibold text-foreground">£</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={customQuantity}
                                    onChange={e => setCustomQuantity(Number(e.target.value))}
                                    className="w-20 py-2.5 pr-2.5 bg-transparent text-base font-semibold text-center focus:outline-none"
                                  />
                                </div>
                              ) : (
                                <input
                                  type="number"
                                  min="1"
                                  value={customQuantity}
                                  onChange={e => setCustomQuantity(Number(e.target.value))}
                                  className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                                />
                              )}
                              <span className="text-sm text-muted-foreground">{analysed.unitLabel}</span>
                            </div>

                            {/* Proxy match badge */}
                            {analysed.proxyMatch && (
                              <div className="flex items-start gap-2 bg-white border border-border rounded-md p-3">
                                <div className="shrink-0 w-1.5 h-full min-h-[1.5rem] rounded-full mt-0.5" style={{ backgroundColor: sdgFromHint(analysed.sdgHint).sdgColor }} />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Social Value Match</p>
                                  <p className="text-xs text-foreground font-medium leading-snug">{analysed.proxyMatch.title}</p>
                                  <p className="text-xs text-primary font-bold mt-1">
                                    £{analysed.proxyMatch.valuePerUnit.toLocaleString()} per {analysed.proxyMatch.unit}
                                    {analysed.proxyMatch.proxyYear && <span className="text-muted-foreground font-normal"> · {analysed.proxyMatch.proxyYear}</span>}
                                  </p>
                                </div>
                              </div>
                            )}

                            {!analysed.proxyMatch && (
                              <p className="text-xs text-muted-foreground italic">No proxy match found — this activity will count towards your volunteer hours.</p>
                            )}

                            {analysed.sdgHint && (
                              <p className="text-xs text-muted-foreground">Aligns with {analysed.sdgHint}</p>
                            )}
                          </motion.div>
                        )}

                        <div className="flex gap-2">
                          {analysed ? (
                            <button
                              onClick={handleAddCustom}
                              className="px-4 py-2 rounded-md bg-foreground text-white text-xs font-medium hover:bg-foreground/90 transition-colors"
                            >
                              Add activity
                            </button>
                          ) : null}
                          <button
                            onClick={() => { setShowCustom(false); setAnalysed(null); setCustomName(""); setAnalyseError(""); }}
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
            {customActivities.length > 0 && (
              <div className="bg-white border border-border rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom activities added</p>
                <div className="space-y-2">
                  {customActivities.map(act => (
                    <div key={act.activityId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: act.sdgColor }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{act.name}</p>
                          {act.valuePerUnit > 0 ? (
                            <p className="text-xs text-primary">£{act.valuePerUnit.toLocaleString()}/{act.unit} · {act.hoursPerYear} hrs/yr</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">{act.hoursPerYear} hrs/yr</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeCustomActivity(act.activityId)}
                        className="text-muted-foreground hover:text-destructive shrink-0 ml-3"
                      >
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
                {selectedIds.size === 0 && customActivities.length === 0
                  ? "Skip"
                  : `Next — ${selectedIds.size + customActivities.length} selected`}
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
                <div className="flex items-center gap-1.5 mb-5">
                  {selectedList.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 rounded-full flex-1 transition-all",
                        i <= quantifyIndex ? "bg-primary" : "bg-muted"
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
                        {!showSessionCalc ? (
                          <button
                            type="button"
                            onClick={() => setShowSessionCalc(true)}
                            className="mt-2 text-xs text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
                          >
                            Calculate from sessions instead
                          </button>
                        ) : (
                          <div className="mt-3 bg-white border border-border rounded-md p-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Sessions per year</p>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <input
                                type="number" min="0.5" step="0.5"
                                value={sessionHrs}
                                onChange={e => {
                                  const v = Number(e.target.value);
                                  setSessionHrs(v);
                                  setQuantities(q => ({ ...q, [currentActivity.id]: Math.round(v * sessionsPerWeek * weeksPerYear) }));
                                }}
                                className="w-16 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              />
                              <span className="text-muted-foreground text-xs">hrs/session ×</span>
                              <input
                                type="number" min="1"
                                value={sessionsPerWeek}
                                onChange={e => {
                                  const v = Number(e.target.value);
                                  setSessionsPerWeek(v);
                                  setQuantities(q => ({ ...q, [currentActivity.id]: Math.round(sessionHrs * v * weeksPerYear) }));
                                }}
                                className="w-14 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              />
                              <span className="text-muted-foreground text-xs">×</span>
                              <input
                                type="number" min="1" max="52"
                                value={weeksPerYear}
                                onChange={e => {
                                  const v = Number(e.target.value);
                                  setWeeksPerYear(v);
                                  setQuantities(q => ({ ...q, [currentActivity.id]: Math.round(sessionHrs * sessionsPerWeek * v) }));
                                }}
                                className="w-14 p-1.5 rounded border border-border text-sm font-semibold text-center focus:border-primary outline-none"
                              />
                              <span className="text-muted-foreground text-xs">weeks =</span>
                              <span className="font-bold text-foreground text-sm">
                                {Math.round(sessionHrs * sessionsPerWeek * weeksPerYear)} hrs/yr
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
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
                        {currentActivity.unit === "bin" && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Most households put out around 26 bins with recyclables per year (fortnightly collection)
                          </p>
                        )}
                      </div>
                    )}
                  </div>

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
