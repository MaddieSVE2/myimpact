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
        className="glass-card rounded-[2rem] p-6 md:p-10 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-3xl font-display font-bold mb-2">Log your activities</h2>
            <p className="text-muted-foreground">Select activities from the Social Value Engine library.</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <ActivityIcon className="w-6 h-6" />
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="bg-secondary/50 p-6 rounded-2xl border border-border mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-foreground mb-1.5">Category</label>
                <select 
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setSelectedActivityId(""); }}
                  className="w-full p-3 rounded-xl bg-white border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="">All Categories</option>
                  {data?.categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-foreground mb-1.5">Activity</label>
                <select 
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
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
                  <label className="block text-sm font-bold text-foreground mb-1.5">
                    {currentActivityObj.unitLabel || "Quantity"}
                  </label>
                  <input 
                    type="number" min="1"
                    value={quantity} onChange={e => setQuantity(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-white border border-border focus:border-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1.5">Hours per year</label>
                  <input 
                    type="number" min="1"
                    value={hours} onChange={e => setHours(Number(e.target.value))}
                    className="w-full p-3 rounded-xl bg-white border border-border focus:border-primary outline-none"
                  />
                </div>
                
                <div className="col-span-1 md:col-span-2 mt-2">
                  <div className="text-xs text-muted-foreground p-3 bg-white/60 rounded-lg flex items-center gap-2 border border-border/50">
                     <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: currentActivityObj.sdgColor }}>
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
              className="w-full mt-2 py-3 rounded-xl bg-foreground text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-foreground/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Activity
            </button>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-bold text-lg">Your Activities ({input.activities.length})</h3>
          {input.activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-white/50 rounded-xl border border-dashed border-border">
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
                    className="flex items-center justify-between p-4 bg-white rounded-xl border border-border shadow-sm group hover:border-primary/30 transition-colors"
                  >
                    <div>
                      <h4 className="font-bold text-foreground">{def?.name || "Unknown Activity"}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {act.quantity} {def?.unitLabel} • {act.hoursPerYear} hrs/yr
                      </p>
                    </div>
                    <button 
                      onClick={() => removeActivity(idx)}
                      className="p-2 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded-lg transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
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
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-border text-foreground font-bold hover:bg-muted transition-all"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <button
          onClick={() => setLocation("/wizard/contributions")}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/25"
        >
          Next Step <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
