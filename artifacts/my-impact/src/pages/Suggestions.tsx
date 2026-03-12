import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { useGetSuggestions } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Lightbulb, ArrowLeft, Star, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Suggestions() {
  const { input } = useWizard();
  const suggestionsMutation = useGetSuggestions();
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!hasLoaded) {
      suggestionsMutation.mutate({
        data: {
          currentActivities: input.activities.map(a => a.activityId),
          availableHoursPerWeek: 5,
        }
      });
      setHasLoaded(true);
    }
  }, [hasLoaded, input.activities, suggestionsMutation]);

  const { data, isPending } = suggestionsMutation;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-10">
        <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center text-accent-foreground shadow-inner">
          <Lightbulb className="w-7 h-7 text-accent" fill="currentColor" />
        </div>
        <div>
          <h1 className="text-4xl font-display font-black text-foreground">Next Steps</h1>
          <p className="text-muted-foreground text-lg">Personalised ideas to boost your social value.</p>
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-6 rounded-3xl h-48 animate-pulse bg-white/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data?.suggestions.map((sug, idx) => (
            <motion.div 
              key={sug.activityId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="glass-card rounded-[2rem] overflow-hidden group"
            >
              <div className="h-2 w-full" style={{ backgroundColor: sug.sdgColor }} />
              <div className="p-6 md:p-8">
                <div className="flex justify-between items-start mb-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-secondary text-secondary-foreground border border-border">
                    {sug.category}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-bold text-muted-foreground">
                    <Clock className="w-4 h-4" /> {sug.recommendedHoursPerWeek} hrs/wk
                  </span>
                </div>
                
                <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                  {sug.activityName}
                </h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {sug.reason}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Estimated Impact</p>
                    <p className="text-xl font-display font-black text-primary">
                      +{formatCurrency(sug.estimatedImpactPerYear)}<span className="text-sm text-muted-foreground font-sans">/yr</span>
                    </p>
                  </div>
                  <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                    <Star className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-12 flex justify-center">
        <Link href="/results" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold transition-colors">
          <ArrowLeft className="w-5 h-5" /> Back to My Impact
        </Link>
      </div>
    </div>
  );
}
