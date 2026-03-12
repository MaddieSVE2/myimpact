import { useState } from "react";
import { useLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ActionsStep() {
  const [, setLocation] = useLocation();
  const {
    location, interests, customInterest,
    setLocation: setWizardLocation, toggleInterest,
    setCustomInterest, updateInput,
  } = useWizard();

  const [localLocation, setLocalLocation] = useState(location);
  const [localCustom, setLocalCustom] = useState(customInterest);
  const [showCustom, setShowCustom] = useState(false);

  const handleNext = () => {
    setWizardLocation(localLocation);
    setCustomInterest(localCustom);

    const interestLabels = interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    const allInterests = [interestLabels, localCustom].filter(Boolean).join(', ');
    const description = localLocation
      ? `I live in ${localLocation} and care most about: ${allInterests || 'making a positive difference'}.`
      : `I care most about: ${allInterests || 'making a positive difference'}.`;
    updateInput({ description });
    setLocation("/wizard/activities");
  };

  const canProceed = localLocation.trim().length > 0 || interests.length > 0 || localCustom.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <StepProgress currentStep={1} />

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
          <label className="block text-sm font-medium text-foreground mb-3">
            I live in&hellip;
          </label>
          <div className="relative max-w-xs">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={localLocation}
              onChange={e => setLocalLocation(e.target.value)}
              placeholder="e.g. Manchester, London…"
              className="w-full pl-9 pr-4 py-2.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
        </div>

        {/* Interest chips */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">
            I am most conscious about&hellip;
          </label>
          <p className="text-xs text-muted-foreground mb-4">
            Select all that apply — we'll use this to personalise your activities and suggestions.
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
                value={localCustom}
                onChange={e => setLocalCustom(e.target.value)}
                placeholder="e.g. Refugee support, domestic violence, prison reform…"
                className="w-full px-4 py-2.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                autoFocus
              />
            </motion.div>
          )}
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
