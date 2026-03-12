import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Trash2, Check, ChevronDown, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

// Expanded inline editor for a picked activity
function ActivityEditor({
  activity,
  onAdd,
  onCancel,
}: {
  activity: ActivityItem;
  onAdd: (qty: number, hours: number) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState(1);
  const [hours, setHours] = useState(10);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-2 p-4 bg-muted/40 rounded-lg border border-border space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{activity.unitLabel || "Quantity"}</label>
          <input
            type="number" min="1" value={qty}
            onChange={e => setQty(Number(e.target.value))}
            className="w-full p-2 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Hours per year</label>
          <input
            type="number" min="1" value={hours}
            onChange={e => setHours(Number(e.target.value))}
            className="w-full p-2 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onAdd(qty, hours)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add to my list
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, interests, addActivity, removeActivity } = useWizard();
  const { data, isLoading } = useGetActivities();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customHours, setCustomHours] = useState(10);
  const [customDesc, setCustomDesc] = useState("");

  // Map selected interests to categories for prioritisation
  const preferredCategories = useMemo(() => {
    return interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category)
      .filter(Boolean) as string[];
  }, [interests]);

  const sortedActivities = useMemo(() => {
    if (!data) return [];
    let acts = categoryFilter
      ? data.activities.filter(a => a.category === categoryFilter)
      : data.activities;

    if (preferredCategories.length > 0 && !categoryFilter) {
      acts = [...acts].sort((a, b) => {
        const aP = preferredCategories.includes(a.category) ? 0 : 1;
        const bP = preferredCategories.includes(b.category) ? 0 : 1;
        return aP - bP;
      });
    }
    return acts;
  }, [data, categoryFilter, preferredCategories]);

  const addedIds = new Set(input.activities.map(a => a.activityId));

  const handleSelectActivity = (a: ActivityItem) => {
    if (addedIds.has(a.id)) return;
    setExpandedId(prev => (prev === a.id ? null : a.id));
  };

  const handleAdd = (activityId: string, qty: number, hours: number) => {
    addActivity({ activityId, quantity: qty, hoursPerYear: hours });
    setExpandedId(null);
  };

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    addActivity({
      activityId: `custom_${Date.now()}`,
      quantity: 1,
      hoursPerYear: customHours,
    });
    setCustomName("");
    setCustomHours(10);
    setCustomDesc("");
    setShowCustom(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepProgress currentStep={2} />

      <motion.div
        className="bg-white border border-border rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xl font-display font-semibold text-foreground mb-1">Log your activities</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Select from the library below — tap any activity to log it.
          {preferredCategories.length > 0 && (
            <span className="text-primary"> Your interests are shown first.</span>
          )}
        </p>

        {/* Category filter tabs */}
        {!isLoading && data && (
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setCategoryFilter("")}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                !categoryFilter ? "bg-primary text-white border-primary" : "bg-white text-foreground border-border hover:border-primary/50"
              )}
            >
              All
            </button>
            {data.categories.map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(f => f === c ? "" : c)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  categoryFilter === c
                    ? "bg-primary text-white border-primary"
                    : preferredCategories.includes(c)
                    ? "bg-primary/10 text-primary border-primary/30 hover:border-primary"
                    : "bg-white text-foreground border-border hover:border-primary/50"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Activity list */}
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {sortedActivities.map(a => {
              const isAdded = addedIds.has(a.id);
              const isExpanded = expandedId === a.id;
              const isPreferred = preferredCategories.includes(a.category);

              return (
                <div key={a.id}>
                  <button
                    onClick={() => handleSelectActivity(a)}
                    disabled={isAdded}
                    className={cn(
                      "w-full text-left flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-all",
                      isAdded
                        ? "bg-green-50 border-green-200 cursor-default"
                        : isExpanded
                        ? "bg-primary/5 border-primary"
                        : isPreferred
                        ? "bg-primary/5 border-primary/20 hover:border-primary/50"
                        : "bg-white border-border hover:border-primary/40 hover:bg-muted/20"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-1 h-6 rounded-full shrink-0"
                        style={{ backgroundColor: a.sdgColor }}
                      />
                      <div className="min-w-0">
                        <p className={cn("text-sm font-medium truncate", isAdded ? "text-green-700" : "text-foreground")}>
                          {a.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{a.category}</p>
                      </div>
                    </div>
                    {isAdded ? (
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", isExpanded && "rotate-180")} />
                    )}
                  </button>

                  <AnimatePresence>
                    {isExpanded && !isAdded && (
                      <ActivityEditor
                        activity={a}
                        onAdd={(qty, hrs) => handleAdd(a.id, qty, hrs)}
                        onCancel={() => setExpandedId(null)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* Custom activity */}
        <div className="border-t border-border pt-4">
          <button
            onClick={() => setShowCustom(o => !o)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
          >
            <PenLine className="w-4 h-4" />
            Can't find your activity? Add it manually
          </button>
          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-3"
              >
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Activity name</label>
                  <input
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="e.g. Litter picking in the park"
                    className="w-full p-2.5 rounded-md border border-border bg-background text-sm focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Brief description (optional)</label>
                  <input
                    value={customDesc}
                    onChange={e => setCustomDesc(e.target.value)}
                    placeholder="What do you do? Who does it benefit?"
                    className="w-full p-2.5 rounded-md border border-border bg-background text-sm focus:border-primary outline-none"
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
                <button
                  onClick={handleAddCustom}
                  disabled={!customName.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-white text-xs font-medium hover:bg-foreground/90 transition-colors disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Add custom activity
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Added activities summary */}
      {input.activities.length > 0 && (
        <motion.div
          className="bg-white border border-border rounded-xl p-5 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Your activities ({input.activities.length})
          </h3>
          <div className="space-y-2">
            <AnimatePresence>
              {input.activities.map((act, idx) => {
                const def = data?.activities.find(a => a.id === act.activityId);
                const isCustom = act.activityId.startsWith("custom_");
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {def && <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: def.sdgColor }} />}
                      {isCustom && <div className="w-1 h-6 rounded-full shrink-0 bg-muted-foreground/30" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {def?.name || "Custom activity"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {act.quantity} {def?.unitLabel || "entry"} · {act.hoursPerYear} hrs/yr
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeActivity(idx)}
                      className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 rounded transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={() => setLocation("/wizard/actions")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white border border-border text-sm text-foreground font-medium hover:bg-secondary transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => setLocation("/wizard/contributions")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
