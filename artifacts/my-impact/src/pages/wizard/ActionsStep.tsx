import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Plus, CheckCircle, Loader2, RotateCcw, History } from "lucide-react";
import { cn } from "@/lib/utils";

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

async function lookupPostcode(raw: string) {
  const postcode = raw.replace(/\s+/g, "").toUpperCase();
  const res = await fetch(`https://api.postcodes.io/postcodes/${postcode}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status !== 200 || !json.result) return null;
  const r = json.result;
  return {
    region: (r.region ?? r.nuts ?? r.admin_county ?? r.parliamentary_constituency ?? "") as string,
    outwardCode: (r.outcode ?? postcode.slice(0, postcode.length - 3)) as string,
    lat: r.latitude as number,
    lng: r.longitude as number,
  };
}

export default function ActionsStep() {
  const [, setLocation] = useLocation();
  const {
    location, interests, customInterest, careerBreak,
    setLocation: setWizardLocation, toggleInterest,
    setCustomInterest, setCareerBreak, updateInput, setLocationMeta,
    hasDraft, clearDraft,
  } = useWizard();

  const [showCustom, setShowCustom] = useState(!!customInterest);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'error'>('idle');
  const [resolvedRegion, setResolvedRegion] = useState<string | null>(null);

  // When draft is cleared, reset UI-only state
  useEffect(() => {
    if (!hasDraft) {
      setShowCustom(false);
      setLookupState('idle');
      setResolvedRegion(null);
    }
  }, [hasDraft]);

  const handleLocationBlur = async () => {
    const val = location.trim();
    if (!val || !UK_POSTCODE_RE.test(val)) {
      setLookupState('idle');
      setResolvedRegion(null);
      setLocationMeta(null);
      return;
    }
    setLookupState('loading');
    try {
      const meta = await lookupPostcode(val);
      if (meta && meta.region) {
        setResolvedRegion(meta.region);
        setLocationMeta(meta);
        setLookupState('found');
      } else {
        setLookupState('error');
        setLocationMeta(null);
      }
    } catch {
      setLookupState('error');
      setLocationMeta(null);
    }
  };

  const handleNext = () => {
    const interestLabels = interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    const allInterests = [interestLabels, customInterest].filter(Boolean).join(', ');
    const description = location
      ? `I live in ${location} and care most about: ${allInterests || 'making a positive difference'}.`
      : `I care most about: ${allInterests || 'making a positive difference'}.`;
    updateInput({ description });
    setLocation("/wizard/activities");
  };

  const canProceed = location.trim().length > 0 || interests.length > 0 || customInterest.trim().length > 0 || careerBreak;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepProgress currentStep={1} />

      {hasDraft && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-primary/8 border border-primary/20"
        >
          <div className="flex items-center gap-2 text-sm text-foreground">
            <History className="w-4 h-4 text-primary shrink-0" />
            <span>Resuming your last session</span>
          </div>
          <button
            type="button"
            onClick={clearDraft}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Start fresh
          </button>
        </motion.div>
      )}

      <motion.div
        className="bg-white border border-border rounded-xl p-6 md:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xl font-display font-semibold text-foreground mb-1">About you</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Help us personalise your experience. Just a couple of quick questions.
        </p>

        {/* Location */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-foreground mb-0.5">
            I live in&hellip;
          </label>
          <p className="text-xs text-muted-foreground mb-3">We use this to recommend nearby activities.</p>
          <div className="relative max-w-xs">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={location}
              onChange={e => {
                setWizardLocation(e.target.value);
                setLookupState('idle');
                setResolvedRegion(null);
                setLocationMeta(null);
              }}
              onBlur={handleLocationBlur}
              placeholder="e.g. Manchester, M1, SW1A 2AA…"
              className="w-full pl-9 pr-4 py-2.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div className="mt-1.5 h-5">
            {lookupState === 'loading' && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up postcode…
              </span>
            )}
            {lookupState === 'found' && resolvedRegion && (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle className="w-3.5 h-3.5" /> {resolvedRegion}
              </span>
            )}
            {lookupState === 'error' && (
              <span className="text-xs text-muted-foreground">Postcode not found. Try a town or city name instead.</span>
            )}
          </div>
        </div>

        {/* Interest chips */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">
            Things I care about&hellip;
          </label>
          <p className="text-xs text-muted-foreground mb-4">
            Select all that apply. We'll use this to personalise your activities and suggestions.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {INTEREST_OPTIONS.map(option => {
              const selected = interests.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleInterest(option.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm border transition-all duration-150 select-none",
                    selected
                      ? "bg-primary text-white border-primary font-medium"
                      : "bg-white text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                  )}
                >
                  <span>{option.emoji}</span>
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Custom interest */}
          {!showCustom ? (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Something else? Add your own
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-3"
            >
              <input
                type="text"
                value={customInterest}
                onChange={e => setCustomInterest(e.target.value)}
                placeholder="e.g. Refugee support, domestic violence, prison reform…"
                className="w-full px-4 py-2.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                autoFocus
              />
            </motion.div>
          )}
        </div>

        {/* Career break checkbox */}
        <div className="pt-4 border-t border-border">
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <div className="relative mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={careerBreak}
                onChange={e => setCareerBreak(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                  careerBreak
                    ? "bg-primary border-primary"
                    : "bg-white border-border group-hover:border-primary/50"
                )}
              >
                {careerBreak && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground leading-snug">
                I'm currently on a career break / returning to work
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                We'll highlight how your activities build transferable skills and help you frame this period on your CV.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end pt-6">
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next: Add activities <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
