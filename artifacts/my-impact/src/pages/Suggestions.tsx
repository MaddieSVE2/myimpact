import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { useGetSuggestions } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Sparkles, MapPin, ExternalLink, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LocalCharity {
  name: string;
  description: string;
  category: string;
  url: string;
  howToGetInvolved: string;
}

const CATEGORY_COLOURS: Record<string, string> = {
  Environment: "#B5BE2E",
  Education:   "#7E8FAD",
  Health:      "#E8633A",
  Community:   "#A8C8DA",
};

export default function Suggestions() {
  const { input, interests, location } = useWizard();
  const suggestionsMutation = useGetSuggestions();

  const [localCharities, setLocalCharities] = useState<LocalCharity[]>([]);
  const [charitiesLoading, setCharitiesLoading] = useState(false);
  const [charitiesError, setCharitiesError] = useState(false);

  const interestLabels = interests
    .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
    .filter(Boolean) as string[];

  useEffect(() => {
    suggestionsMutation.mutate({
      data: {
        currentActivities: input.activities.map(a => a.activityId),
        availableHoursPerWeek: 3,
        interests: interestLabels,
      }
    });

    // Fetch local charities if we have a location
    if (location?.trim()) {
      setCharitiesLoading(true);
      setCharitiesError(false);
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      fetch(`${base}/api/local-charities/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: location.trim(), interests: interestLabels }),
      })
        .then(r => r.json())
        .then(data => setLocalCharities(data.charities ?? []))
        .catch(() => setCharitiesError(true))
        .finally(() => setCharitiesLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isPending } = suggestionsMutation;

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

      {/* Activity suggestions */}
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

      {/* Local charities section */}
      {location?.trim() && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10"
        >
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4" style={{ color: "#E8633A" }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#E8633A" }}>
              Near {location}
            </span>
          </div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-1">
            Local organisations to get involved with
          </h2>
          <p className="text-sm text-muted-foreground mb-5">
            These organisations are active in your area and aligned with your interests.
            <span className="ml-1 text-[11px]">AI-suggested — always verify before contacting.</span>
          </p>

          {charitiesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-white border border-border rounded-lg animate-pulse" />
              ))}
            </div>
          ) : charitiesError ? (
            <div className="flex items-center gap-2 p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Couldn't load local suggestions right now — try again later.
            </div>
          ) : localCharities.length === 0 ? null : (
            <div className="space-y-3">
              {localCharities.map((c, idx) => {
                const colour = CATEGORY_COLOURS[c.category] ?? "#7E8FAD";
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.08 }}
                    className="bg-white border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-stretch">
                      <div className="w-1 shrink-0" style={{ backgroundColor: colour }} />
                      <div className="px-5 py-4 flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                                style={{ background: `${colour}22`, color: colour }}
                              >
                                {c.category}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold text-foreground leading-snug mb-1">
                              {c.name}
                            </h3>
                            <p className="text-xs text-muted-foreground leading-relaxed mb-2">{c.description}</p>
                            <p className="text-xs text-foreground/70 italic">{c.howToGetInvolved}</p>
                          </div>
                          {c.url && (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border hover:border-foreground/30 hover:bg-muted/30 transition-all text-muted-foreground hover:text-foreground"
                            >
                              Visit <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
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
