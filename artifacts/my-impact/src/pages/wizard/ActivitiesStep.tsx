import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Trash2, Activity as ActivityIcon } from "lucide-react";

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, interests, addActivity, removeActivity } = useWizard();
  const { data, isLoading } = useGetActivities();

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [hours, setHours] = useState<number>(10);

  // Map selected interests to categories for prioritisation
  const preferredCategories = useMemo(() => {
    return interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category)
      .filter(Boolean) as string[];
  }, [interests]);

  const filteredActivities = useMemo(() => {
    if (!data) return [];
    let acts = selectedCategory
      ? data.activities.filter(a => a.category === selectedCategory)
      : data.activities;

    // Sort preferred categories first
    if (preferredCategories.length > 0 && !selectedCategory) {
      acts = [...acts].sort((a, b) => {
        const aPreferred = preferredCategories.includes(a.category) ? 0 : 1;
        const bPreferred = preferredCategories.includes(b.category) ? 0 : 1;
        return aPreferred - bPreferred;
      });
    }
    return acts;
  }, [data, selectedCategory, preferredCategories]);

  const currentActivityObj = useMemo(
    () => data?.activities.find(a => a.id === selectedActivityId),
    [data, selectedActivityId]
  );

  const handleAdd = () => {
    if (!selectedActivityId) return;
    addActivity({ activityId: selectedActivityId, quantity, hoursPerYear: hours });
    setSelectedActivityId("");
    setQuantity(1);
    setHours(10);
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
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-display font-semibold text-foreground mb-1">Log your activities</h2>
            <p className="text-sm text-muted-foreground">
              Select from the Social Value Engine proxy library.
              {preferredCategories.length > 0 && (
                <span className="text-primary"> Showing your interests first.</span>
              )}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-primary shrink-0">
            <ActivityIcon className="w-4 h-4" />
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-background p-4 rounded-lg border border-border mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
                <select
                  value={selectedCategory}
                  onChange={e => { setSelectedCategory(e.target.value); setSelectedActivityId(""); }}
                  className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                >
                  <option value="">All categories</option>
                  {data?.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Activity</label>
                <select
                  value={selectedActivityId}
                  onChange={e => setSelectedActivityId(e.target.value)}
                  className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                >
                  <option value="">Select an activity…</option>
                  {filteredActivities.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {currentActivityObj && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    {currentActivityObj.unitLabel || "Quantity"}
                  </label>
                  <input
                    type="number" min="1"
                    value={quantity} onChange={e => setQuantity(Number(e.target.value))}
                    className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Hours per year</label>
                  <input
                    type="number" min="1"
                    value={hours} onChange={e => setHours(Number(e.target.value))}
                    className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary outline-none text-sm"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <div className="text-xs text-muted-foreground p-2.5 bg-white rounded-md flex items-center gap-2 border border-border">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: currentActivityObj.sdgColor }}>
                      SDG
                    </span>
                    Proxy: {currentActivityObj.proxy} ({currentActivityObj.proxyYear}) · Powered by the Social Value Engine
                  </div>
                </div>
              </motion.div>
            )}

            <button
              disabled={!selectedActivityId}
              onClick={handleAdd}
              className="w-full py-2.5 rounded-md bg-foreground text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add activity
            </button>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Your activities ({input.activities.length})
          </h3>
          {input.activities.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground bg-background rounded-lg border border-dashed border-border">
              No activities added yet — add one above.
            </div>
          ) : (
            <AnimatePresence>
              {input.activities.map((act, idx) => {
                const def = data?.activities.find(a => a.id === act.activityId);
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between p-3 bg-white rounded-md border border-border group hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {def && (
                        <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: def.sdgColor }} />
                      )}
                      <div>
                        <h4 className="text-sm font-medium text-foreground">{def?.name || "Unknown activity"}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {act.quantity} {def?.unitLabel} · {act.hoursPerYear} hrs/yr
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeActivity(idx)}
                      className="p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </motion.div>

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
