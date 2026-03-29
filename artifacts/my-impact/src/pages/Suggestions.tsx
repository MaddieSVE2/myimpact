import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { useGetSuggestions } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Sparkles, MapPin, ExternalLink, AlertCircle, ChevronDown, Loader2, Home } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface LocalPlace {
  name: string;
  description: string;
  howToJoin: string;
}

interface TileLocalState {
  open: boolean;
  loading: boolean;
  error: boolean;
  places: LocalPlace[];
}

export default function Suggestions() {
  const { input, interests, location, result } = useWizard();
  const suggestionsMutation = useGetSuggestions();

  // Per-tile local state: activityId → TileLocalState
  const [tileLocal, setTileLocal] = useState<Record<string, TileLocalState>>({});

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleLocal = useCallback(async (activityId: string, activityName: string) => {
    // If already open, collapse
    if (tileLocal[activityId]?.open) {
      setTileLocal(prev => ({ ...prev, [activityId]: { ...prev[activityId], open: false } }));
      return;
    }

    // If already fetched, just open
    if (tileLocal[activityId]?.places.length) {
      setTileLocal(prev => ({ ...prev, [activityId]: { ...prev[activityId], open: true } }));
      return;
    }

    // Start fetch
    setTileLocal(prev => ({
      ...prev,
      [activityId]: { open: true, loading: true, error: false, places: [] },
    }));

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/local-charities/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: location?.trim(), activityName }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      setTileLocal(prev => ({
        ...prev,
        [activityId]: { open: true, loading: false, error: false, places: data.places ?? [] },
      }));
    } catch {
      setTileLocal(prev => ({
        ...prev,
        [activityId]: { open: true, loading: false, error: true, places: [] },
      }));
    }
  }, [tileLocal, location]);

  const { data, isPending, isError } = suggestionsMutation;
  const hasLocation = Boolean(location?.trim());

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">Ideas for you</span>
        </div>
        <h1 className="text-2xl font-display font-semibold text-foreground mb-2">What difference could you make?</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {interestLabels.length > 0
            ? <>Based on your interest in <strong>{interestLabels.join(', ')}</strong>, here are activities worth considering, each with an estimated social value.</>
            : <>Not sure where to start? Here are some of the most impactful things you could do, with the social value each one creates.</>
          }
        </p>
      </div>

      {/* Activity suggestion tiles */}
      {isPending ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-white border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Could not load suggestions. Please try again later.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.suggestions.map((sug, idx) => {
            const local = tileLocal[sug.activityId];
            const isOpen = local?.open ?? false;

            return (
              <motion.div
                key={sug.activityId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.07 }}
                className="bg-white border border-border rounded-lg overflow-hidden transition-colors"
                style={{ borderColor: isOpen ? "rgba(232,99,58,0.35)" : undefined }}
              >
                {/* Main tile row */}
                <div className="flex items-stretch">
                  <div className="w-1 shrink-0" style={{ backgroundColor: sug.sdgColor }} />
                  <div className="flex items-center justify-between gap-4 px-5 py-4 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded uppercase tracking-wider">
                          {sug.category}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground leading-snug mb-1">
                        {sug.activityName}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{sug.reason}</p>

                      {/* "See what's near you" button — only if location captured */}
                      {hasLocation && (
                        <button
                          onClick={() => handleToggleLocal(sug.activityId, sug.activityName)}
                          className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold transition-all"
                          style={{ color: "#E8633A" }}
                        >
                          <MapPin className="w-3 h-3" />
                          {isOpen ? "Hide local places" : `See what's near you`}
                          <ChevronDown
                            className="w-3 h-3 transition-transform"
                            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                          />
                        </button>
                      )}
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

                {/* Expandable local places panel */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="local"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border mx-5" />
                      <div className="px-5 py-4 space-y-3" style={{ background: "#FDF8F5" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#E8633A" }}>
                          Near {location}
                        </p>

                        {local?.loading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Finding local organisations…
                          </div>
                        ) : local?.error ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Couldn't load local suggestions right now.
                          </div>
                        ) : local?.places.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            No specific local groups found. Try searching online for "{sug.activityName} {location}".
                          </p>
                        ) : (
                          local.places.map((place, pi) => (
                            <div key={pi} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground leading-snug">{place.name}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{place.description}</p>
                                <p className="text-[11px] text-foreground/60 mt-0.5 italic">{place.howToJoin}</p>
                              </div>
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${location}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-border bg-white hover:border-foreground/30 transition-all text-muted-foreground hover:text-foreground"
                              >
                                Search online <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          ))
                        )}

                        <p className="text-[10px] text-muted-foreground/60 pt-1">AI-suggested. Always verify before contacting.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
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

      <div className="mt-6 flex items-center gap-4">
        {result ? (
          <Link
            href="/results"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to my impact
          </Link>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Back to home
          </Link>
        )}
        <Link
          href="/wizard/actions"
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Calculate my actual impact <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
