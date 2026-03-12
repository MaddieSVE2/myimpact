import { useEffect } from "react";
import { Link } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { useGetSuggestions } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function Suggestions() {
  const { input, interests } = useWizard();
  const suggestionsMutation = useGetSuggestions();

  useEffect(() => {
    const interestLabels = interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean) as string[];

    suggestionsMutation.mutate({
      data: {
        currentActivities: input.activities.map(a => a.activityId),
        availableHoursPerWeek: 3,
        interests: interestLabels,
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isPending } = suggestionsMutation;

  const interestLabels = interests
    .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">Personalised for you</span>
        </div>
        <h1 className="text-2xl font-display font-semibold text-foreground mb-2">Ideas to boost your impact</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {interestLabels.length > 0
            ? <>Based on your interest in <strong>{interestLabels.join(', ')}</strong>, here are activities worth considering next year.</>
            : <>Here are some of the most impactful activities you could add next year.</>
          }
        </p>
      </div>

      {/* Suggestions list */}
      {isPending ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-white border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {data?.suggestions.map((sug, idx) => (
            <motion.div
              key={sug.activityId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.07 }}
              className="bg-white border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors group"
            >
              {/* Coloured SDG stripe */}
              <div className="flex items-stretch">
                <div className="w-1 shrink-0" style={{ backgroundColor: sug.sdgColor }} />

                <div className="flex items-center justify-between gap-4 px-5 py-4 flex-1 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded uppercase tracking-wider">{sug.category}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground leading-snug mb-1 group-hover:text-primary transition-colors">
                      {sug.activityName}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{sug.reason}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-base font-display font-semibold text-foreground whitespace-nowrap">
                      +{formatCurrency(sug.estimatedImpactPerYear)}
                    </p>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">est. per year</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="w-2.5 h-2.5" />
                      {sug.recommendedHoursPerWeek} hrs/wk
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recalculate prompt */}
      {!isPending && data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 p-5 bg-primary/5 border border-primary/15 rounded-lg text-center"
        >
          <p className="text-sm text-foreground font-medium mb-1">Ready to add some of these?</p>
          <p className="text-xs text-muted-foreground mb-4">Go back through the calculator and add new activities to see how your total social value grows.</p>
          <Link
            href="/wizard/actions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            Recalculate with new activities <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}

      <div className="mt-6 flex justify-start">
        <Link
          href="/results"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to my impact
        </Link>
      </div>
    </div>
  );
}
