import { useState, useEffect } from "react";
import { useGetProfile, useUpdateProfile, useAckStreakMilestone } from "@workspace/api-client-react";
import {
  INTEREST_OPTIONS,
  CUSTOM_INTEREST_CATEGORIES,
  buildCustomInterestCategoryMap,
  hasCustomInterest,
  inferCustomInterestCategory,
  normalizeCustomInterest,
  type CustomInterestCategory,
  type CustomInterestCategoryMap,
} from "@/lib/wizard-context";
import { Lock, ChevronRight, Loader2, Check, AlertCircle, Plus, X } from "lucide-react";
import RecapBanner from "@/components/RecapBanner";
import StreakChip from "@/components/StreakChip";
import StreakCelebration from "@/components/StreakCelebration";
import { useAuth } from "@/lib/auth-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");


const SITUATION_OPTIONS = [
  { id: "volunteer", label: "I volunteer" },
  { id: "job_seeking", label: "I'm job seeking" },
  { id: "student", label: "I'm a student" },
  { id: "career_break", label: "Career break" },
  { id: "armed_forces", label: "Armed forces / veteran" },
  { id: "something_else", label: "Something else" },
];

const POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export default function Profile() {
  const { data: profileData, isLoading, isError, refetch } = useGetProfile();
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const { mutateAsync: ackMilestone } = useAckStreakMilestone();
  const { user } = useAuth();
  const gamificationEnabled = user?.gamificationEnabled ?? true;
  const [celebrationMilestone, setCelebrationMilestone] = useState<number | null>(null);

  const [situation, setSituation] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [customInterestCategories, setCustomInterestCategories] = useState<CustomInterestCategoryMap>({});
  const [customInterestInput, setCustomInterestInput] = useState("");
  const [customInterestError, setCustomInterestError] = useState<string | null>(null);
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [savedSituation, setSavedSituation] = useState<string[]>([]);
  const [savedInterests, setSavedInterests] = useState<string[]>([]);
  const [savedCustomInterests, setSavedCustomInterests] = useState<string[]>([]);
  const [savedCustomInterestCategories, setSavedCustomInterestCategories] = useState<CustomInterestCategoryMap>({});
  const [savedPostcode, setSavedPostcode] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!gamificationEnabled) return;
    const streak = profileData?.streak;
    if (!streak) return;
    const lastAcked = streak.lastAckedMilestone ?? 0;
    const reached = [4, 12, 26, 52].filter((m) => streak.current >= m && m > lastAcked);
    if (reached.length === 0) return;
    const milestone = reached[reached.length - 1];
    setCelebrationMilestone(milestone);
    ackMilestone({ data: { milestone } })
      .then(() => refetch())
      .catch(() => {});
  }, [profileData?.streak, ackMilestone, refetch, gamificationEnabled]);

  useEffect(() => {
    if (!isLoading && profileData !== undefined) {
      const p = profileData.profile;
      const sit = p?.situation ?? [];
      const ints = p?.interests ?? [];
      const customInts = p?.customInterests ?? [];
      const categoryMap = buildCustomInterestCategoryMap(customInts, p?.customInterestCategories as CustomInterestCategoryMap | undefined);
      const pc = p?.postcode ?? "";
      setSituation(sit);
      setInterests(ints);
      setCustomInterests(customInts);
      setCustomInterestCategories(categoryMap);
      setPostcode(pc);
      setSavedSituation(sit);
      setSavedInterests(ints);
      setSavedCustomInterests(customInts);
      setSavedCustomInterestCategories(categoryMap);
      setSavedPostcode(pc);
      setDirty(false);
    }
  }, [isLoading, profileData]);

  const toggleInterest = (id: string) => {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
    setDirty(true);
    setSaved(false);
  };

  const toggleSituation = (id: string) => {
    setSituation(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
    setDirty(true);
    setSaved(false);
  };

  const addCustomInterest = () => {
    const value = normalizeCustomInterest(customInterestInput);
    if (!value || value.length > 100 || hasCustomInterest(customInterests, value)) {
      setCustomInterestError("Enter a unique interest of up to 100 characters.");
      return;
    }
    setCustomInterests(prev => [...prev, value]);
    setCustomInterestCategories(prev => ({ ...prev, [value]: inferCustomInterestCategory(value) }));
    setCustomInterestInput("");
    setCustomInterestError(null);
    setSaveError(null);
    setDirty(true);
    setSaved(false);
  };

  const removeCustomInterest = (value: string) => {
    setCustomInterests(prev => prev.filter(item => item !== value));
    setCustomInterestCategories(prev => {
      const { [value]: _removed, ...rest } = prev;
      return rest;
    });
    setCustomInterestError(null);
    setSaveError(null);
    setDirty(true);
    setSaved(false);
  };

  const handlePostcodeChange = (val: string) => {
    setPostcode(val);
    setDirty(true);
    setSaved(false);
    if (val.trim() && !POSTCODE_REGEX.test(val.trim())) {
      setPostcodeError("Please enter a valid UK postcode (e.g. SW1A 1AA)");
    } else {
      setPostcodeError(null);
    }
  };

  const handleSave = async () => {
    const trimmed = postcode.trim();
    if (trimmed && !POSTCODE_REGEX.test(trimmed)) {
      setPostcodeError("Please enter a valid UK postcode (e.g. SW1A 1AA)");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({ data: { situation, interests, customInterests, customInterestCategories, postcode: trimmed || null } });
      await refetch();
      setSaved(true);
      setDirty(false);
      setSavedSituation(situation);
      setSavedInterests(interests);
      setSavedCustomInterests(customInterests);
      setSavedCustomInterestCategories(customInterestCategories);
      setSavedPostcode(trimmed || "");
    } catch {
      setSaved(false);
      setSaveError("Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setSituation(savedSituation);
    setInterests(savedInterests);
    setCustomInterests(savedCustomInterests);
    setCustomInterestCategories(savedCustomInterestCategories);
    setCustomInterestInput("");
    setPostcode(savedPostcode);
    setPostcodeError(null);
    setCustomInterestError(null);
    setSaveError(null);
    setDirty(false);
    setSaved(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Could not load your profile.</p>
        <button
          onClick={() => refetch()}
          className="text-sm text-primary underline hover:text-primary/80"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {gamificationEnabled && (
        <StreakCelebration milestone={celebrationMilestone} onDismiss={() => setCelebrationMilestone(null)} />
      )}
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">My profile</h1>
        {gamificationEnabled && profileData?.streak && (
          <StreakChip streak={profileData.streak} size="md" showLongest />
        )}
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Update your profile at any time. This information helps us personalise your experience.
      </p>

      <div className="mb-6">
        <RecapBanner variant="card" />
      </div>

      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-border space-y-8">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
          <Lock className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-blue-700 leading-relaxed">
            This is private and only used to personalise your experience. We will never share your information.
          </p>
        </div>

        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">Your situation <span className="text-muted-foreground font-normal">(optional)</span></h3>
          <div className="flex flex-wrap gap-2">
            {SITUATION_OPTIONS.map(opt => {
              const selected = situation.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleSituation(opt.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={
                    selected
                      ? { background: "var(--brand-orange-bright)", borderColor: "var(--brand-orange-bright)", color: "white" }
                      : { background: "white", borderColor: "#d1d5db", color: "#374151" }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3">Your interests <span className="text-muted-foreground font-normal">(optional)</span></h3>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.filter(opt => opt.id !== 'military' || situation.includes('armed_forces')).map(opt => {
              const selected = interests.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleInterest(opt.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={
                    selected
                      ? { background: "var(--brand-orange-bright)", borderColor: "var(--brand-orange-bright)", color: "white" }
                      : { background: "white", borderColor: "#d1d5db", color: "#374151" }
                  }
                >
                  <span aria-hidden="true">{opt.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {customInterests.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3" data-testid="profile-custom-interests">
              {customInterests.map(value => (
                <span key={value} className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-primary bg-primary/10 pl-3 pr-1 py-1 text-sm text-foreground">
                  <span>{value}</span>
                  <select
                    value={customInterestCategories[value] ?? ""}
                    onChange={event => {
                      setCustomInterestCategories(prev => ({
                        ...prev,
                        [value]: (event.target.value || null) as CustomInterestCategory | null,
                      }));
                      setDirty(true);
                      setSaved(false);
                    }}
                    className="min-h-[36px] rounded-md border border-primary/30 bg-white px-2 text-xs text-foreground"
                    aria-label={`Activity category for ${value}`}
                  >
                    <option value="">No category</option>
                    {CUSTOM_INTEREST_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeCustomInterest(value)} className="p-1.5 rounded-full hover:bg-primary/15" aria-label={`Remove ${value}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-3 max-w-lg">
            <input
              type="text"
              value={customInterestInput}
              onChange={e => { setCustomInterestInput(e.target.value); setCustomInterestError(null); }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomInterest(); } }}
              maxLength={100}
              placeholder="Add another interest"
              className="flex-1 min-w-0 bg-white px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[var(--brand-orange-bright)]"
            />
            <button type="button" onClick={addCustomInterest} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          {customInterestError && <p className="mt-1.5 text-xs text-red-600" role="alert">{customInterestError}</p>}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-foreground mb-1">Your postcode <span className="text-muted-foreground font-normal">(optional)</span></h3>
          <p className="text-xs text-muted-foreground mb-3">Used to show you relevant local content</p>
          <input
            type="text"
            value={postcode}
            onChange={e => handlePostcodeChange(e.target.value)}
            placeholder="e.g. SW1A 1AA"
            maxLength={8}
            className="bg-white w-full max-w-xs px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[var(--brand-orange-bright)]"
            aria-describedby={postcodeError ? "postcode-error" : undefined}
          />
          {postcodeError && (
            <p id="postcode-error" className="mt-1.5 text-xs text-red-600">{postcodeError}</p>
          )}
        </section>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || !dirty || !!postcodeError}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--brand-orange-bright)" }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Check className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            )}
            {saved ? "Saved!" : "Save changes"}
          </button>
          {dirty && !saving && (
            <button
              onClick={handleDiscard}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted/30 transition-colors"
            >
              Discard changes
            </button>
          )}
        </div>
        {saveError && <p className="text-sm text-red-600" role="alert">{saveError}</p>}
      </div>
    </div>
  );
}
