import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { StepProgress } from "@/components/wizard/StepProgress";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Plus, CheckCircle, Loader2, RotateCcw, History, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";
import { useT } from "@/i18n";

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

const SITUATION_OPTION_IDS = [
  "volunteer",
  "job_seeking",
  "student",
  "apprenticeship",
  "career_break",
  "armed_forces",
  "something_else",
] as const;

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
    adminDistrict: (r.admin_district ?? r.admin_county ?? r.region ?? "") as string,
  };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useChallengeIdFromQuery(): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("challenge");
    return id && id.trim() ? id : null;
  }, []);
}

const CHALLENGE_CONTEXT_KEY = "wizard:challenge-context";

function ChallengeContextBanner() {
  const challengeId = useChallengeIdFromQuery();
  // Persist for the duration of the wizard so Results can redirect back home
  // and refresh the prompts after save. If the user enters the wizard without
  // a challenge query param, defensively clear any stale context from an
  // abandoned earlier flow so an unrelated save does not trigger a
  // challenge-mode redirect.
  useEffect(() => {
    try {
      if (challengeId) {
        window.sessionStorage.setItem(CHALLENGE_CONTEXT_KEY, challengeId);
      } else {
        window.sessionStorage.removeItem(CHALLENGE_CONTEXT_KEY);
      }
    } catch {
      // ignore
    }
  }, [challengeId]);
  const { data } = useQuery<{ challenge?: { id: string; name: string } }>({
    queryKey: ["challenge-banner", challengeId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${challengeId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!challengeId,
    retry: false,
  });
  if (!challengeId || !data?.challenge) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200"
      data-testid="challenge-context-banner"
    >
      <Trophy className="w-4 h-4 text-primary shrink-0" />
      <span className="text-sm text-foreground">
        Logging this will count toward <strong>{data.challenge.name}</strong>.
      </span>
    </motion.div>
  );
}

export default function ActionsStep() {
  const [, setLocation] = useLocation();
  const {
    location, interests, customInterest, careerBreak, situations,
    setLocation: setWizardLocation, toggleInterest,
    setCustomInterest, setCareerBreak, toggleSituation, seedFromProfile, updateInput, setLocationMeta,
    hasDraft, clearDraft,
  } = useWizard();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const t = useT();

  const [showCustom, setShowCustom] = useState(!!customInterest);
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'found' | 'error'>('idle');
  const [resolvedRegion, setResolvedRegion] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const profileSeeded = useRef(false);

  // Pre-fill from profile for logged-in users (only when no draft is active)
  useEffect(() => {
    if (authLoading || !isLoggedIn || hasDraft || profileSeeded.current) return;
    profileSeeded.current = true;
    fetch(`${BASE}/api/profile`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then((data) => {
        if (!data || !data.profile) return;
        const rawSituation = data.profile.situation;
        const loadedSituations: string[] = Array.isArray(rawSituation)
          ? rawSituation.filter(Boolean)
          : (typeof rawSituation === "string" && rawSituation ? [rawSituation] : []);
        const hasAnyData = data.profile.postcode || (data.profile.interests ?? []).length > 0 || loadedSituations.length > 0;
        // Only seed when the profile actually has data. Seeding an empty
        // profile would wipe anything the user typed while the fetch was
        // in flight (the fetch resolves after mount, racing fast typers).
        if (hasAnyData) {
          seedFromProfile({
            postcode: data.profile.postcode ?? null,
            interests: data.profile.interests ?? [],
            situations: loadedSituations,
          });
          setProfileLoaded(true);
        }
      });
  }, [authLoading, isLoggedIn, hasDraft, seedFromProfile]);

  // When draft is cleared, reset UI-only state and allow profile re-seed
  useEffect(() => {
    if (!hasDraft) {
      setShowCustom(false);
      setLookupState('idle');
      setResolvedRegion(null);
      setProfileLoaded(false);
      profileSeeded.current = false;
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

  const handleCareerBreakChange = (checked: boolean) => {
    setCareerBreak(checked);
    // For guest users (not logged in), keep legacy careerBreak-only behavior
    // For logged-in users, careerBreak is toggled via the situations pill
    if (!isLoggedIn) return;
    if (checked && !situations.includes('career_break')) {
      toggleSituation('career_break');
    } else if (!checked && situations.includes('career_break')) {
      toggleSituation('career_break');
    }
  };

  const handleNext = async () => {
    const interestLabels = interests
      .map(id => INTEREST_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean)
      .join(', ');
    const allInterests = [interestLabels, customInterest].filter(Boolean).join(', ');
    const description = location
      ? `I live in ${location} and care most about: ${allInterests || 'making a positive difference'}.`
      : `I care most about: ${allInterests || 'making a positive difference'}.`;
    updateInput({ description });

    track(ANALYTICS_EVENTS.WIZARD_STEP_COMPLETE, {
      step: "actions",
      hasLocation: !!location,
      interestCount: interests.length,
    });

    // Silently auto-save profile if logged in
    if (isLoggedIn) {
      const postcode = location.trim() || null;
      // For guests without situations, fall back to careerBreak checkbox
      const situationsToSave = situations.length > 0
        ? situations
        : (careerBreak ? ['career_break'] : []);
      fetch(`${BASE}/api/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation: situationsToSave,
          interests,
          postcode,
        }),
      }).catch(() => {});
    }

    setLocation("/wizard/activities");
  };

  const canProceed = location.trim().length > 0 || interests.length > 0 || customInterest.trim().length > 0 || careerBreak || situations.length > 0;

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
            <span>{t("wizard.resumingLast")}</span>
          </div>
          <button
            type="button"
            onClick={clearDraft}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t("wizard.startFresh")}
          </button>
        </motion.div>
      )}

      <ChallengeContextBanner />

      {!hasDraft && profileLoaded && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-muted/40 border border-border"
        >
          <CheckCircle className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm text-muted-foreground">{t("wizard.profilePrefilled")}</span>
        </motion.div>
      )}

      <motion.div
        className="bg-white border border-border rounded-xl p-6 md:p-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xl font-display font-semibold text-foreground mb-1">{t("wizard.aboutYou")}</h2>
        <p className="text-sm text-muted-foreground mb-8">
          {t("wizard.aboutYouDesc")}
        </p>

        {/* Situation, only shown to logged-in users */}
        {isLoggedIn && (
          <div className="mb-8">
            <label className="block text-sm font-medium text-foreground mb-1">
              {t("wizard.mySituation")} <span className="text-muted-foreground font-normal">{t("common.optional")}</span>
            </label>
            <p className="text-xs text-muted-foreground mb-3">{t("wizard.situationHelp")}</p>
            <div className="flex flex-wrap gap-2">
              {SITUATION_OPTION_IDS.map(id => {
                const selected = situations.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleSituation(id)}
                    aria-pressed={selected}
                    className={cn(
                      "px-3.5 py-2.5 min-h-[44px] rounded-full text-sm border transition-all duration-150 select-none",
                      selected
                        ? "bg-primary text-white border-primary font-medium"
                        : "bg-white text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
                    )}
                  >
                    {t(`wizard.situations.${id}` as any)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-foreground mb-0.5">
            {t("wizard.iLiveIn")}
          </label>
          <p className="text-xs text-muted-foreground mb-3">{t("wizard.iLiveInHelp")}</p>
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
              placeholder={t("wizard.postcodePlaceholder")}
              className="w-full pl-9 pr-4 py-3 min-h-[44px] rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div className="mt-1.5 h-5">
            {lookupState === 'loading' && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("wizard.lookingUpPostcode")}
              </span>
            )}
            {lookupState === 'found' && resolvedRegion && (
              <span className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle className="w-3.5 h-3.5" /> {resolvedRegion}
              </span>
            )}
            {lookupState === 'error' && (
              <span className="text-xs text-muted-foreground">{t("wizard.postcodeNotFound")}</span>
            )}
          </div>
        </div>

        {/* Interest chips */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("wizard.thingsICareAbout")}
          </label>
          <p className="text-xs text-muted-foreground mb-4">
            {t("wizard.thingsICareAboutHelp")}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {INTEREST_OPTIONS.filter(option => option.id !== 'military' || situations.includes('armed_forces')).map(option => {
              const selected = interests.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleInterest(option.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-full text-sm border transition-all duration-150 select-none",
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
              {t("wizard.addYourOwn")}
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
                placeholder={t("wizard.customInterestPlaceholder")}
                className="w-full px-4 py-3 min-h-[44px] rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                autoFocus
              />
            </motion.div>
          )}
        </div>

        {/* Career break checkbox, hidden when situation picker covers it */}
        {(!isLoggedIn || !situations.includes('career_break')) && (
          <div className="pt-4 border-t border-border">
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={careerBreak}
                  onChange={e => handleCareerBreakChange(e.target.checked)}
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
                  {t("wizard.onCareerBreak")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t("wizard.onCareerBreakDesc")}
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="flex justify-end pt-6">
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("wizard.nextAddActivities")} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
