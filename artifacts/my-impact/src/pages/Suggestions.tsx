import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useLocation as useWouterLocation } from "wouter";
import { useWizard, INTEREST_OPTIONS, CHARITY_SEED_KEY } from "@/lib/wizard-context";
import { PageMeta } from "@/components/PageMeta";
import { useGetSuggestions, useGetProfile } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Sparkles, MapPin, ExternalLink, AlertCircle, ChevronDown, Loader2, Home, Compass, Repeat, Globe, PlusCircle, ThumbsUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/i18n";

interface LocalPlace {
  name: string;
  description: string;
  howToJoin: string;
  website?: string;
  source?: "ai";
  verified?: boolean;
  registrationNumber?: string;
  recruitingVolunteers?: boolean;
  /** Community thumbs-up count, shared across all users viewing this area. */
  votes?: number;
  /** Whether the signed-in user has thumbs-upped this charity. */
  voted?: boolean;
}

interface PremappedResponse {
  status: "ready" | "pending" | "failed";
  location: { postcode: string; localAuthority: string; country: string };
  categories: Array<{ category: string; places: LocalPlace[] }>;
}

function GoVoSearchCard({ postcode }: { postcode: string }) {
  return (
    <a
      href={`https://govo.org/search?postcode=${encodeURIComponent(postcode)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 bg-white border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">Search GoVo</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Browse live volunteering listings near {postcode}
        </p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
    </a>
  );
}

function VolunteerScotlandSearchCard() {
  return (
    <a
      href="https://www.volunteerscotland.net/volunteer/"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 bg-white border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">Search Volunteer Scotland</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          Browse volunteering opportunities across Scotland
        </p>
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
    </a>
  );
}

/**
 * One suggested local charity. Tapping the row expands a small detail view
 * that emphasises the website / how-to-join info and offers a shortcut to
 * log an activity with this charity pre-filled in the wizard.
 */
function PlaceCard({
  place,
  areaLabel,
  localAuthority,
  profilePostcode,
  isScottish,
}: {
  place: LocalPlace;
  areaLabel: string;
  localAuthority: string;
  profilePostcode: string;
  isScottish: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useWouterLocation();

  // Community thumbs-up — optimistic local state, synced with the server response
  const [vote, setVote] = useState({ votes: place.votes ?? 0, voted: place.voted ?? false });
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteNotice, setVoteNotice] = useState<"signin" | "demo" | "error" | null>(null);

  const handleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (voteBusy || !localAuthority) return;
    setVoteNotice(null);
    const prev = vote;
    // Optimistic toggle
    setVote({ voted: !prev.voted, votes: Math.max(0, prev.votes + (prev.voted ? -1 : 1)) });
    setVoteBusy(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/local-charities/vote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          localAuthority,
          registrationNumber: place.registrationNumber,
          name: place.name,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { voted: boolean; votes: number };
        setVote({ voted: data.voted, votes: data.votes });
      } else {
        setVote(prev);
        if (res.status === 401) setVoteNotice("signin");
        else if (res.status === 403) setVoteNotice("demo");
        else setVoteNotice("error");
      }
    } catch {
      setVote(prev);
      setVoteNotice("error");
    } finally {
      setVoteBusy(false);
    }
  };

  const handleLogActivity = () => {
    try {
      sessionStorage.setItem(
        CHARITY_SEED_KEY,
        JSON.stringify({ name: place.name, description: place.description })
      );
    } catch {
      // ignore storage errors — the wizard still opens, just unseeded
    }
    navigate("/wizard/activities");
  };

  return (
    <div className="bg-white border border-border rounded-lg overflow-hidden">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex-1 min-w-0 text-left px-3 py-2.5 hover:bg-muted/40 transition-colors"
          data-testid={`place-card-${place.name}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-xs font-semibold text-foreground leading-snug">{place.name}</p>
                {place.verified ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ✓ Verified charity
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    Suggested
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{place.description}</p>
            </div>
            <ChevronDown
              className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
              aria-hidden="true"
            />
          </div>
        </button>
        <button
          type="button"
          onClick={handleVote}
          disabled={voteBusy}
          aria-pressed={vote.voted}
          title={vote.voted ? "Remove your thumbs-up" : "Thumbs-up: good match for this area"}
          className={`shrink-0 mr-3 mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors ${
            vote.voted
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-white text-muted-foreground hover:text-foreground hover:border-foreground/30"
          }`}
          data-testid={`place-vote-${place.name}`}
        >
          <ThumbsUp className="w-3 h-3" fill={vote.voted ? "currentColor" : "none"} aria-hidden="true" />
          <span data-testid={`place-vote-count-${place.name}`}>{vote.votes}</span>
        </button>
      </div>
      {voteNotice && (
        <p className="px-3 pb-2 text-[10px] text-muted-foreground" data-testid={`place-vote-notice-${place.name}`}>
          {voteNotice === "signin" ? (
            <>
              <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
                Sign in
              </Link>{" "}
              to rate charities.
            </>
          ) : voteNotice === "demo" ? (
            <>Demo accounts can't vote — sign in with your own account to rate charities.</>
          ) : (
            <>Couldn't save your vote. Please try again.</>
          )}
        </p>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border" />
            <div className="px-3 py-3 space-y-3">
              {place.recruitingVolunteers && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-sky-50 text-sky-700 border border-sky-200"
                  data-testid={`place-recruiting-${place.name}`}
                >
                  <Sparkles className="w-3 h-3" aria-hidden="true" /> Looking for volunteers
                </span>
              )}

              {/* How to join — emphasised */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                  How to get involved
                </p>
                <p className="text-xs text-foreground leading-relaxed">{place.howToJoin}</p>
              </div>

              {place.verified && place.registrationNumber && (
                <p className="text-[10px] text-muted-foreground/70">
                  Registered charity no. {place.registrationNumber}
                </p>
              )}

              {/* Primary actions */}
              <div className="flex flex-wrap gap-1.5">
                {place.website ? (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#E8633A" }}
                    data-testid={`place-website-${place.name}`}
                  >
                    <Globe className="w-3 h-3" /> Visit website <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${areaLabel} volunteer charity`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#E8633A" }}
                  >
                    <Globe className="w-3 h-3" /> Find their website <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleLogActivity}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors"
                  data-testid={`place-log-${place.name}`}
                >
                  <PlusCircle className="w-3 h-3" /> Log activity with this charity
                </button>
              </div>

              {/* Secondary links */}
              <div className="flex flex-wrap gap-1.5">
                {place.website && (
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${areaLabel} volunteer charity`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-border bg-white hover:border-foreground/30 transition-all text-muted-foreground hover:text-foreground"
                  >
                    Search online <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {!isScottish && (
                  <a
                    href={`https://register-of-charities.charitycommission.gov.uk/charity-search?q=${encodeURIComponent(place.name)}${profilePostcode ? `&postcode=${encodeURIComponent(profilePostcode)}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all text-emerald-700"
                  >
                    Check register <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SCOTTISH_TERMS = new Set([
  "aberdeen", "aberdeenshire", "angus", "argyll", "bute", "clackmannanshire",
  "dumfries", "galloway", "dundee", "east ayrshire", "east dunbartonshire",
  "east lothian", "east renfrewshire", "edinburgh", "eilean siar", "falkirk",
  "fife", "glasgow", "highland", "highlands", "inverclyde", "midlothian",
  "moray", "north ayrshire", "north lanarkshire", "orkney", "perth", "kinross",
  "renfrewshire", "scottish borders", "shetland", "south ayrshire",
  "south lanarkshire", "stirling", "west dunbartonshire", "west lothian", "scotland",
]);

// Short plural noun per catalogue unit, used to build "26 bins/year"-style labels
const UNIT_PLURALS: Record<string, string> = {
  bin: "bins",
  tree: "trees",
  mile_per_year: "miles",
  session: "sessions",
  bag: "bags",
  person: "people",
  young_person: "young people",
  event: "events",
  participant: "participants",
  week: "weeks",
  child: "children",
  child_week: "child weeks",
  donation: "donations",
  workshop: "workshops",
};

function effortLabel(sug: { unit?: string; defaultQuantity?: number; recommendedHoursPerWeek: number }): string {
  const { unit, defaultQuantity } = sug;
  if (!unit || unit === "hour" || defaultQuantity == null) {
    return `${sug.recommendedHoursPerWeek} hrs/wk`;
  }
  if (unit === "household") {
    return "household activity";
  }
  const noun = UNIT_PLURALS[unit] ?? unit.replace(/_/g, " ") + "s";
  return `${defaultQuantity} ${noun}/year`;
}

export default function Suggestions() {
  const { input, interests, location, locationMeta, result } = useWizard();
  const suggestionsMutation = useGetSuggestions();
  const { data: profileData } = useGetProfile();
  const t = useT();

  // Which tiles have their local-places panel open
  const [openTiles, setOpenTiles] = useState<Record<string, boolean>>({});

  // Pre-mapped local charity results, loaded once per postcode
  const [premapped, setPremapped] = useState<{
    loading: boolean;
    error: boolean;
    data: PremappedResponse | null;
  }>({ loading: false, error: false, data: null });

  const profilePostcode = profileData?.profile?.postcode?.trim() ?? "";

  // Derive whether the user's location is Scottish (no CC register). Prefer
  // the authoritative country from the pre-mapped lookup, fall back to the
  // wizard's resolved council name.
  const adminDistrict = (locationMeta?.adminDistrict || "").toLowerCase();
  const isScottish = premapped.data
    ? premapped.data.location.country.toLowerCase() === "scotland"
    : Array.from(SCOTTISH_TERMS).some(term => adminDistrict.includes(term));

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

  // Load pre-mapped local charity results as soon as we know the postcode.
  // Results are generated ahead of time server-side, so this is instant when
  // the user's local authority has been seen before.
  useEffect(() => {
    if (!profilePostcode) {
      setPremapped({ loading: false, error: false, data: null });
      return;
    }
    let cancelled = false;
    setPremapped({ loading: true, error: false, data: null });
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/local-charities/premapped?postcode=${encodeURIComponent(profilePostcode)}`, {
      credentials: "include",
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("premapped failed"))))
      .then((data: PremappedResponse) => {
        if (cancelled) return;
        setPremapped({ loading: false, error: false, data });
      })
      .catch(() => {
        if (cancelled) return;
        setPremapped({ loading: false, error: true, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [profilePostcode]);

  const placesByCategory = useMemo(() => {
    const map = new Map<string, LocalPlace[]>();
    for (const entry of premapped.data?.categories ?? []) {
      map.set(entry.category, entry.places);
    }
    return map;
  }, [premapped.data]);

  const localAuthority = premapped.data?.location.localAuthority ?? "";

  const handleToggleLocal = useCallback((activityId: string) => {
    setOpenTiles(prev => ({ ...prev, [activityId]: !prev[activityId] }));
  }, []);

  const { data, isPending, isError } = suggestionsMutation;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <PageMeta
        title="Volunteering ideas — find ways to make a difference | My Impact"
        description="Discover volunteering, community, and social action ideas matched to your interests. Browse hundreds of ways to contribute and calculate your potential social value."
        noIndex={true}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary uppercase tracking-widest">{t("suggestions.eyebrow")}</span>
        </div>
        <h1 className="text-2xl font-display font-semibold text-foreground mb-2">{t("suggestions.title")}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {interestLabels.length > 0
            ? <>{t("suggestions.basedOnInterest")} <strong>{interestLabels.join(', ')}</strong>{t("suggestions.basedOnInterestSuffix")}</>
            : <>{t("suggestions.noInterestIntro")}</>
          }
        </p>
      </div>

      {/* Live opportunity search links */}
      {profileData ? (
        !profilePostcode ? (
          <div className="mb-6 flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-dashed border-border bg-muted/40">
            <div className="flex items-center gap-2 min-w-0">
              <Compass className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground leading-snug">
                Add your postcode to see opportunities near you.
              </p>
            </div>
            <Link
              href="/profile"
              className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80 whitespace-nowrap"
            >
              Add postcode →
            </Link>
          </div>
        ) : (
          <div className="mb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4" style={{ color: "#E8633A" }} aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-foreground">Search live opportunities</h2>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {localAuthority
                    ? `Live listings near ${localAuthority}`
                    : `Live listings near ${profilePostcode}`}
                </p>
              </div>
              <Link
                href="/profile"
                className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                Change postcode
              </Link>
            </div>
            <div className="space-y-2">
              <GoVoSearchCard postcode={profilePostcode} />
              {isScottish && <VolunteerScotlandSearchCard />}
            </div>
          </div>
        )
      ) : null}

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
          <span>{t("suggestions.loadError")}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.suggestions.map((sug, idx) => {
            const isOpen = openTiles[sug.activityId] ?? false;
            const places = placesByCategory.get(sug.category) ?? null;
            const areaLabel = localAuthority || location || profilePostcode;

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

                      {/* "See what's near you" toggle — results are pre-mapped, so opening is instant */}
                      <button
                        onClick={() => handleToggleLocal(sug.activityId)}
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
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-base font-display font-semibold text-foreground whitespace-nowrap">
                        +{formatCurrency(sug.estimatedImpactPerYear)}
                      </p>
                      <p className="text-[10px] text-muted-foreground whitespace-nowrap">est. per year</p>
                      <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                        {!sug.unit || sug.unit === "hour" ? (
                          <Clock className="w-2.5 h-2.5" />
                        ) : (
                          <Repeat className="w-2.5 h-2.5" />
                        )}
                        {effortLabel(sug)}
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
                          {areaLabel ? `Near ${areaLabel}` : "Near you"}
                        </p>

                        {!profilePostcode ? (
                          <p className="text-xs text-muted-foreground py-2">
                            <Link
                              href="/profile"
                              className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/70 transition-colors"
                            >
                              Add your postcode
                            </Link>{" "}
                            to see charities near you for this activity.
                          </p>
                        ) : premapped.loading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading local charities…
                          </div>
                        ) : premapped.error || premapped.data?.status === "failed" ? (
                          <div className="space-y-2 py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              Couldn't load local suggestions right now. Try the live searches instead:
                            </div>
                            <GoVoSearchCard postcode={profilePostcode} />
                            {isScottish && <VolunteerScotlandSearchCard />}
                          </div>
                        ) : premapped.data?.status === "pending" ? (
                          <div className="space-y-2 py-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              Finding local charities for your area — check back soon. Meanwhile, try the live searches:
                            </div>
                            <GoVoSearchCard postcode={profilePostcode} />
                            {isScottish && <VolunteerScotlandSearchCard />}
                          </div>
                        ) : !places || places.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">
                            No specific local groups found.{" "}
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`${sug.activityName} ${areaLabel} volunteer charity`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-foreground/70 transition-colors"
                            >
                              Search online <ExternalLink className="w-2.5 h-2.5" />
                            </a>{" "}
                            for "{sug.activityName} {areaLabel}".
                          </p>
                        ) : (
                          places.map((place, pi) => (
                            <PlaceCard
                              key={pi}
                              place={place}
                              areaLabel={areaLabel}
                              localAuthority={localAuthority}
                              profilePostcode={profilePostcode}
                              isScottish={isScottish}
                            />
                          ))
                        )}

                        {places && places.length > 0 && !premapped.loading && !premapped.error && premapped.data?.status === "ready" && (
                          <p className="text-[10px] text-muted-foreground/60 pt-1">
                            AI-suggested and checked against the official charity registers. Always verify before contacting.
                          </p>
                        )}
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
