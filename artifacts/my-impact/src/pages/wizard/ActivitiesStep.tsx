import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { useGetActivities, type ActivityItem } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Trash2, Search, Activity as ActivityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ActivitiesStep() {
  const [, setLocation] = useLocation();
  const { input, addActivity, removeActivity } = useWizard();
  const { data, isLoading } = useGetActivities();
  
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [hours, setHours] = useState<number>(10);

  const filteredActivities = useMemo(() => {
    if (!data) return [];
    if (!selectedCategory) return data.activities;
    return data.activities.filter(a => a.category === selectedCategory);
  }, [data, selectedCategory]);

  const currentActivityObj = useMemo(() => {
    return data?.activities.find(a => a.id === selectedActivityId);
  }, [data, selectedActivityId]);

  const handleAdd = () => {
    if (!selectedActivityId) return;
    addActivity({
      activityId: selectedActivityId,
      quantity,
      hoursPerYear: hours
    });
    setSelectedActivityId("");
    setQuantity(1);
    setHours(10);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <StepProgress currentStep={2} />
      
      <motion.div 
        className="bg-white border border-border shadow-sm rounded-xl p-6 md:p-8 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-display font-semibold mb-2">Log your activities</h2>
            <p className="text-muted-foreground text-sm">Select activities from the Social Value Engine library.</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-primary">
            <ActivityIcon className="w-5 h-5" />
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-background p-5 rounded-lg border border-border mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
                <select 
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setSelectedActivityId(""); }}
                  className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                >
                  <option value="">All Categories</option>
                  {data?.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Activity</label>
                <select 
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full p-2.5 rounded-md bg-white border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm"
                >
                  <option value="">Select an activity...</option>
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
                className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
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
                
                <div className="col-span-1 md:col-span-2 mt-1">
                  <div className="text-xs text-muted-foreground p-2.5 bg-white rounded-md flex items-center gap-2 border border-border">
                     <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: currentActivityObj.sdgColor }}>
                        SDG
                     </span>
                     Proxy: {currentActivityObj.proxy} ({currentActivityObj.proxyYear})
                  </div>
                </div>
              </motion.div>
            )}

            <button 
              disabled={!selectedActivityId}
              onClick={handleAdd}
              className="w-full mt-2 py-2.5 rounded-md bg-foreground text-white font-medium flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Activity
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold text-base">Your Activities ({input.activities.length})</h3>
          {input.activities.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground bg-background rounded-lg border border-dashed border-border">
              No activities added yet. Add one above!
            </div>
          ) : (
            <AnimatePresence>
              {input.activities.map((act, idx) => {
                const def = data?.activities.find(a => a.id === act.activityId);
                return (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center justify-between p-3 bg-white rounded-md border border-border shadow-sm group hover:border-primary/30 transition-colors"
                  >
                    <div>
                      <h4 className="font-medium text-sm text-foreground">{def?.name || "Unknown Activity"}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {act.quantity} {def?.unitLabel} • {act.hoursPerYear} hrs/yr
                      </p>
                    </div>
                    <button 
                      onClick={() => removeActivity(idx)}
                      className="p-1.5 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
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
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-white border border-border text-sm text-foreground font-medium hover:bg-secondary transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => setLocation("/wizard/contributions")}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all shadow-sm"
        >
          Next Step <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
