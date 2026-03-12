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
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-foreground">
          <Lightbulb className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-semibold text-foreground">Next Steps</h1>
          <p className="text-muted-foreground text-sm">Personalised ideas to boost your social value.</p>
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white border border-border p-6 rounded-xl h-48 animate-pulse" />
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
              className="bg-white border border-border rounded-xl overflow-hidden group shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-1.5 w-full" style={{ backgroundColor: sug.sdgColor }} />
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-background text-foreground border border-border">
                    {sug.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" /> {sug.recommendedHoursPerWeek} hrs/wk
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                  {sug.activityName}
                </h3>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  {sug.reason}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">Estimated Impact</p>
                    <p className="text-lg font-display font-semibold text-foreground">
                      +{formatCurrency(sug.estimatedImpactPerYear)}<span className="text-xs text-muted-foreground font-sans font-normal">/yr</span>
                    </p>
                  </div>
                  <button className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center hover:border-primary hover:text-primary transition-colors text-muted-foreground">
                    <Star className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <Link href="/results" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to My Impact
        </Link>
      </div>
    </div>
  );
}
