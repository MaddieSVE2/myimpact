import { useState, useEffect } from "react";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { INTEREST_OPTIONS } from "@/lib/wizard-context";
import { Lock, ChevronRight, Loader2, Check, AlertCircle } from "lucide-react";

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

  const [situation, setSituation] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [postcode, setPostcode] = useState("");
  const [postcodeError, setPostcodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [savedSituation, setSavedSituation] = useState<string[]>([]);
  const [savedInterests, setSavedInterests] = useState<string[]>([]);
  const [savedPostcode, setSavedPostcode] = useState("");

  useEffect(() => {
    if (!isLoading && profileData !== undefined) {
      const p = profileData.profile;
      const sit = p?.situation ?? [];
      const ints = p?.interests ?? [];
      const pc = p?.postcode ?? "";
      setSituation(sit);
      setInterests(ints);
      setPostcode(pc);
      setSavedSituation(sit);
      setSavedInterests(ints);
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
    try {
      await updateProfile({ data: { situation, interests, postcode: trimmed || null } });
      await refetch();
      setSaved(true);
      setDirty(false);
      setSavedSituation(situation);
      setSavedInterests(interests);
      setSavedPostcode(trimmed || "");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setSituation(savedSituation);
    setInterests(savedInterests);
    setPostcode(savedPostcode);
    setPostcodeError(null);
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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">My profile</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Update your profile at any time. This information helps us personalise your experience.
      </p>

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
                      ? { background: "#F06127", borderColor: "#F06127", color: "white" }
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
            {INTEREST_OPTIONS.map(opt => {
              const selected = interests.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleInterest(opt.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={
                    selected
                      ? { background: "#F06127", borderColor: "#F06127", color: "white" }
                      : { background: "white", borderColor: "#d1d5db", color: "#374151" }
                  }
                >
                  <span aria-hidden="true">{opt.emoji}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>
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
            className="w-full max-w-xs px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#F06127]/40 focus:border-[#F06127]"
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
            style={{ background: "#F06127" }}
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
      </div>
    </div>
  );
}
