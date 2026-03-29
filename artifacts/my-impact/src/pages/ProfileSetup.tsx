import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { INTEREST_OPTIONS } from "@/lib/wizard-context";
import { Lock, ChevronRight, Loader2 } from "lucide-react";

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

interface ProfileFormProps {
  initialSituation: string | null;
  initialInterests: string[];
  initialPostcode: string | null;
  onSave: (data: { situation: string | null; interests: string[]; postcode: string | null }) => Promise<void>;
  onSkip?: () => void;
  saving: boolean;
  isSetup?: boolean;
}

function ProfileForm({
  initialSituation,
  initialInterests,
  initialPostcode,
  onSave,
  onSkip,
  saving,
  isSetup = false,
}: ProfileFormProps) {
  const [situation, setSituation] = useState<string | null>(initialSituation);
  const [interests, setInterests] = useState<string[]>(initialInterests);
  const [postcode, setPostcode] = useState(initialPostcode ?? "");
  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  const toggleInterest = (id: string) => {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handlePostcodeChange = (val: string) => {
    setPostcode(val);
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
    await onSave({
      situation,
      interests,
      postcode: trimmed || null,
    });
  };

  return (
    <div className="space-y-8">
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
            const selected = situation === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSituation(selected ? null : opt.id)}
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
          disabled={saving || !!postcodeError}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold transition-opacity disabled:opacity-60"
          style={{ background: "#F06127" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          )}
          {isSetup ? "Save and continue" : "Save changes"}
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            disabled={saving}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProfileSetup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const returnTo = params.get("returnTo");

  const destination =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? BASE + returnTo
      : BASE + "/history";

  const { data: profileData, isLoading, isError } = useGetProfile();
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const [saving, setSaving] = useState(false);

  const handleSave = async (data: { situation: string | null; interests: string[]; postcode: string | null }) => {
    setSaving(true);
    try {
      await updateProfile({ data });
      window.location.href = destination;
    } catch {
      setSaving(false);
    }
  };

  const existing = isLoading || isError ? null : profileData?.profile ?? null;
  const isNewUser = !isLoading && !isError && profileData?.profile === null;

  const handleSkip = async () => {
    if (isNewUser) {
      try {
        await updateProfile({ data: { situation: null, interests: [], postcode: null } });
      } catch {
      }
    }
    window.location.href = destination;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12" style={{ background: "#f8fafc" }}>
      <div className="max-w-xl mx-auto">
        <Link href="/">
          <img
            src={`${import.meta.env.BASE_URL}images/myimpact.png`}
            alt="My Impact"
            className="h-10 mb-8"
          />
        </Link>

        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-border">
          <h1 className="text-2xl font-bold text-foreground mb-1">Tell us about yourself</h1>
          <p className="text-muted-foreground text-sm mb-8">
            Help us show you the most relevant content. Everything here is completely optional.
          </p>

          <ProfileForm
            initialSituation={existing?.situation ?? null}
            initialInterests={existing?.interests ?? []}
            initialPostcode={existing?.postcode ?? null}
            onSave={handleSave}
            onSkip={handleSkip}
            saving={saving}
            isSetup
          />
        </div>
      </div>
    </div>
  );
}
