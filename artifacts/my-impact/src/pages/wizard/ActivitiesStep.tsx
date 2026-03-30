import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS, type CustomActivityDetail } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, ChevronDown, ChevronRight, PenLine, Trash2, Sparkles, Loader2, ListChecks, MessageSquare, Search, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface PreviousActivity {
  activityId: string;
  quantity: number;
  hoursPerYear: number;
}

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
type ActivityMode = "pick" | "describe";

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, interests, addActivity, removeActivity, customActivities, addCustomActivity, removeCustomActivity, activitySelection, setActivitySelection } = useWizard();
  const { data, isLoading } = useGetActivities();
  const { isLoggedIn } = useAuth();

  const [previousActivities, setPreviousActivities] = useState<PreviousActivity[] | null>(null);
  const [prefillDismissed, setPrefillDismissed] = useState(false);

  const phase = activitySelection.phase;
  const quantifyIndex = activitySelection.quantifyIndex;
  const [activityMode, setActivityMode] = useState<ActivityMode>("pick");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(activitySelection.selectedIds)
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(activitySelection.quantities);
  const [hours, setHours] = useState<Record<string, number>>(activitySelection.hours);
  const [showAll, setShowAll] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHours, setCustomHours] = useState(10);
  const [analysing, setAnalysing] = useState(false);
  const [analysed, setAnalysed] = useState<AnalysedActivity | null>(null);
  const [customQuantity, setCustomQuantity] = useState(20);
  const [analyseError, setAnalyseError] = useState("");

  // Describe mode state
  const [describeText, setDescribeText] = useState("");
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeError, setDescribeError] = useState("");

  // Pick mode search filter (pre-filled when switching from describe mode)
  const [pickSearch, setPickSearch] = useState("");

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

  // Sync selection state back to context for draft persistence
  useEffect(() => {
    setActivitySelection({
      selectedIds: Array.from(selectedIds),
      quantities,
      hours,
    });
  }, [selectedIds, quantities, hours, setActivitySelection]);

  // Fetch previous activities for logged-in returning users
  useEffect(() => {
    if (!isLoggedIn) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/impact/history`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then((data) => {
        if (!data || !data.records || data.records.length === 0) return;
        const mostRecent = data.records[0];
        const acts = mostRecent.activities;
        if (Array.isArray(acts) && acts.length > 0) {
          setPreviousActivities(acts as PreviousActivity[]);
        }
      });
  }, [isLoggedIn]);

  const preferredCategories = useMemo(() => {
    return new Set(
      interests.map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category).filter(Boolean) as string[]
    );
  }, [interests]);

  // Boost specific activities based on the user's selected interests only.
  // Situation/background no longer affects activity ranking — it only influences
  // language, framing, and report card sections (see Results.tsx).
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
      boosted.add('dofe');
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
          setHours(h => ({ ...h, [id]: activity.unit === "hour" ? (activity.defaultQuantity ?? 20) : Math.max(1, Math.round((activity.defaultQuantity ?? 1) * 2)) }));
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
    setActivitySelection({ quantifyIndex: 0, phase: "quantify" });
  };

  const handleQuantifyNext = () => {
    if (quantifyIndex < selectedList.length - 1) {
      setActivitySelection({ quantifyIndex: quantifyIndex + 1 });
    } else {
      input.activities.forEach((_, i) => removeActivity(0));
      selectedList.forEach(a => {
        const qty = quantities[a.id] ?? (a.defaultQuantity ?? 1);
        const hrs = a.unit === "hour" ? (quantities[a.id] ?? (a.defaultQuantity ?? 20)) : (hours[a.id] ?? Math.max(1, Math.round((quantities[a.id] ?? (a.defaultQuantity ?? 1)) * 2)));
        const finalQty = a.unit === "hour" ? 1 : qty;
        addActivity({ activityId: a.id, quantity: finalQty, hoursPerYear: a.unit === "hour" ? qty : hrs });
      });
      setLocation("/wizard/contributions");
    }
  };

  const handlePrefill = () => {
    if (!previousActivities || !data) return;
    const knownIds = new Set(data.activities.map(a => a.id));
    previousActivities.forEach(prev => {
      if (!knownIds.has(prev.activityId)) return;
      setSelectedIds(ids => {
        const next = new Set(ids);
        next.add(prev.activityId);
        return next;
      });
      setQuantities(q => ({ ...q, [prev.activityId]: prev.quantity }));
      setHours(h => ({ ...h, [prev.activityId]: prev.hoursPerYear }));
    });
    setPrefillDismissed(true);
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
      setAnalyseError("Couldn't analyse that activity. Try a different description.");
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

  const handleDescribeSubmit = async () => {
    if (!describeText.trim()) return;
    setDescribeLoading(true);
    setDescribeError("");

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");

      // Step 1: parse description into matched IDs + unmatched labels
      const parseRes = await fetch(`${base}/api/custom-activity/parse-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: describeText.trim() }),
      });
      if (!parseRes.ok) throw new Error("parse error");
      const { matchedIds, unmatchedLabels } = await parseRes.json() as {
        matchedIds: string[];
        unmatchedLabels: string[];
      };

      if (matchedIds.length === 0 && unmatchedLabels.length === 0) {
        setDescribeError("We couldn't match any activities from your description. Try adding more detail, or switch to picking activities manually.");
        setDescribeLoading(false);
        return;
      }

      // Step 2: pre-select matched predefined IDs
      setSelectedIds(prev => {
        const next = new Set(prev);
        matchedIds.forEach(id => {
          next.add(id);
          const activity = data?.activities.find(a => a.id === id);
          if (activity && quantities[id] === undefined) {
            setQuantities(q => ({ ...q, [id]: activity.defaultQuantity ?? 1 }));
            setHours(h => ({ ...h, [id]: activity.unit === "hour" ? (activity.defaultQuantity ?? 20) : Math.max(1, Math.round((activity.defaultQuantity ?? 1) * 2)) }));
          }
        });
        return next;
      });

      // Step 3: analyse unmatched labels in parallel
      let successfulCustomCount = 0;
      if (unmatchedLabels.slice(0, 5).length > 0) {
        const analyseResults = await Promise.all(
          unmatchedLabels.slice(0, 5).map(label =>
            fetch(`${base}/api/custom-activity/analyse`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: label }),
            }).then(r => r.ok ? r.json() as Promise<AnalysedActivity> : null).catch(() => null)
          )
        );

        analyseResults.forEach((result, i) => {
          if (!result) return;
          const label = unmatchedLabels[i];
          const activityId = `custom_${Date.now()}_${i}`;
          const { sdg, sdgColor } = sdgFromHint(result.sdgHint);
          const hrs = result.unit === "hour" ? result.defaultQuantity : Math.max(1, Math.round((result.defaultQuantity ?? 1) * 2));
          const qty = result.unit === "hour" ? 1 : result.defaultQuantity;

          const detail: CustomActivityDetail = {
            activityId,
            name: label,
            quantity: qty,
            hoursPerYear: hrs,
            valuePerUnit: result.proxyMatch?.valuePerUnit ?? 0,
            unit: result.unit,
            proxy: result.proxyMatch?.title ?? "",
            proxyYear: result.proxyMatch?.proxyYear ?? "",
            sdg,
            sdgColor,
          };
          addCustomActivity(detail);
          successfulCustomCount++;
        });
      }

      // Step 4: advance to quantify phase
      setDescribeLoading(false);

      const totalUsable = matchedIds.length + successfulCustomCount;
      if (totalUsable === 0) {
        // All downstream analyses failed — nothing usable was added
        setDescribeError("We couldn't match any activities from your description. Try adding more detail, or switch to picking activities manually.");
        return;
      }

      if (matchedIds.length > 0) {
        setActivitySelection({ quantifyIndex: 0, phase: "quantify" });
      } else {
        // Only custom activities — skip quantify
        input.activities.forEach((_, i) => removeActivity(0));
        setLocation("/wizard/contributions");
      }
    } catch {
      setDescribeError("Something went wrong while analysing your description. Please try again.");
      setDescribeLoading(false);
    }
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
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5 w-fit">
              <button
                onClick={() => {
                  if (activityMode === "describe" && describeText.trim()) {
                    setPickSearch(describeText.trim());
                  }
                  setActivityMode("pick");
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activityMode === "pick"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ListChecks className="w-4 h-4" />
                Pick activities
              </button>
              <button
                onClick={() => setActivityMode("describe")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  activityMode === "describe"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="w-4 h-4" />
                Describe what I do
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activityMode === "describe" ? (
                <motion.div
                  key="describe"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-white border border-border rounded-xl p-6 md:p-8 mb-5">
                    <h2 className="text-xl font-display font-semibold text-foreground mb-1">
                      Tell us what you do
                    </h2>
                    <p className="text-sm text-muted-foreground mb-5">
                      Describe your activities in plain English and we'll find the right matches for you.
                    </p>

                    <textarea
                      value={describeText}
                      onChange={e => { setDescribeText(e.target.value); setDescribeError(""); }}
                      placeholder="e.g. I cycle to work, help at a food bank and donate blood"
                      rows={4}
                      disabled={describeLoading}
                      className="w-full p-3 rounded-lg border border-border bg-background text-sm focus:border-primary outline-none resize-none leading-relaxed disabled:opacity-60"
                    />

                    {describeError && (
                      <div className="mt-3 px-4 py-3 rounded-lg bg-destructive/8 border border-destructive/20">
                        <p className="text-sm text-destructive">{describeError}</p>
                        <button
                          onClick={() => {
                            if (describeText.trim()) setPickSearch(describeText.trim());
                            setActivityMode("pick");
                          }}
                          className="mt-1.5 text-xs text-destructive/80 underline underline-offset-2 hover:text-destructive"
                        >
                          Switch to picking activities manually
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleDescribeSubmit}
                      disabled={!describeText.trim() || describeLoading}
                      className="mt-4 inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-all"
                      style={{ background: "#E8633A" }}
                    >
                      {describeLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                      ) : (
                        <><Sparkles className="w-4 h-4" /> Analyse my activities</>
                      )}
                    </button>
                  </div>

                  <div className="flex justify-between">
                    <button
                      onClick={() => setLocation("/wizard/actions")}
                      className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-md bg-white border border-border text-sm font-medium hover:bg-secondary transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pick"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="bg-white border border-border rounded-xl p-6 md:p-8 mb-5">
                    <h2 className="text-xl font-display font-semibold text-foreground mb-1">
                      Which of these do you already do?
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      Tick everything that applies. Don't worry about the details yet.
                      {preferredCategories.size > 0 && (
                        <span className="text-primary"> Your interests are shown first.</span>
                      )}
                    </p>

                    {/* Pre-fill prompt for returning users */}
                    {previousActivities && previousActivities.length > 0 && !prefillDismissed && (
                      <AnimatePresence>
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.25 }}
                          className="mb-4 flex items-start justify-between gap-3 px-4 py-3 rounded-lg bg-primary/8 border border-primary/20"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <RefreshCw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground leading-snug">Use your activities from last time?</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Pre-fill with your {previousActivities.length} {previousActivities.length === 1 ? 'activity' : 'activities'} from your most recent record. You can adjust the quantities afterwards.</p>
                              <button
                                type="button"
                                onClick={handlePrefill}
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                              >
                                <Check className="w-3 h-3" /> Yes, pre-fill
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPrefillDismissed(true)}
                            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                            aria-label="Dismiss"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      </AnimatePresence>
                    )}

                    {/* Search filter */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        value={pickSearch}
                        onChange={e => setPickSearch(e.target.value)}
                        placeholder="Search activities…"
                        className="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      />
                    </div>

                    {isLoading ? (
                      <div className="py-8 flex justify-center">
                        <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                      </div>
                    ) : (
                      <>
                        {pickSearch.trim() ? (
                          <div className="space-y-2 mb-3">
                            {sortedActivities.filter(a =>
                              a.shortName.toLowerCase().includes(pickSearch.toLowerCase()) ||
                              a.category.toLowerCase().includes(pickSearch.toLowerCase()) ||
                              (a.group ?? '').toLowerCase().includes(pickSearch.toLowerCase())
                            ).map(a => {
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
                                    <p className="text-xs text-muted-foreground mt-0.5">{a.group ?? a.category}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (() => {
                          const activitiesToShow = showAll ? sortedActivities : primaryActivities;
                          const groups: string[] = [];
                          activitiesToShow.forEach(a => {
                            const g = a.group ?? a.category;
                            if (!groups.includes(g)) groups.push(g);
                          });
                          return (
                            <div className="mb-3">
                              {groups.map(group => {
                                const groupActivities = activitiesToShow.filter(a => (a.group ?? a.category) === group);
                                return (
                                  <div key={group} className="mb-4">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{group}</p>
                                    <div className="space-y-2">
                                      {groupActivities.map(a => {
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
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {moreActivities.length > 0 && !showAll && !pickSearch.trim() && (
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
                                    <p className="text-xs text-muted-foreground italic">No proxy match found. This activity will count towards your volunteer hours.</p>
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
                      className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-md bg-white border border-border text-sm font-medium hover:bg-secondary transition-all"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleStartQuantify}
                      className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
                    >
                      {selectedIds.size === 0 && customActivities.length === 0
                        ? "Skip"
                        : `Next: ${selectedIds.size + customActivities.length} selected`}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                            onChange={e => {
                              const qty = Number(e.target.value);
                              setQuantities(q => ({ ...q, [currentActivity.id]: qty }));
                            }}
                            className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                          />
                          <span className="text-sm text-muted-foreground">{currentActivity.unitLabel}</span>
                        </div>
                        {currentActivity.unit === "bin" && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Most households put out around 26 bins with recyclables per year (fortnightly collection)
                          </p>
                        )}
                        <div className="mt-4">
                          <p className="text-sm font-medium text-foreground mb-2">
                            Approximate hours per year
                          </p>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="1"
                              value={hours[currentActivity.id] ?? Math.max(1, Math.round((quantities[currentActivity.id] ?? currentActivity.defaultQuantity ?? 1) * 2))}
                              onChange={e => setHours(h => ({ ...h, [currentActivity.id]: Number(e.target.value) }))}
                              className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                            />
                            <span className="text-sm text-muted-foreground">hours per year</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Used to track volunteering hours for your DofE record
                          </p>
                        </div>
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
                    onClick={() => quantifyIndex === 0 ? setActivitySelection({ phase: "select" }) : setActivitySelection({ quantifyIndex: quantifyIndex - 1 })}
                    className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-md bg-white border border-border text-sm font-medium hover:bg-secondary transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleQuantifyNext}
                    className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
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
