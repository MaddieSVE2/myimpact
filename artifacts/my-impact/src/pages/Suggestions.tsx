import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { useWizard, INTEREST_OPTIONS } from "@/lib/wizard-context";
import { PageMeta } from "@/components/PageMeta";
import { useGetSuggestions, useGetProfile } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Clock, Sparkles, MapPin, ExternalLink, AlertCircle, ChevronDown, Loader2, Home, Compass } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useT } from "@/i18n";

interface LocalPlace {
  name: string;
  description: string;
  howToJoin: string;
  website: string | null;
  source?: "register" | "ai";
  verified?: boolean;
  registrationNumber?: string;
  registerUrl?: string;
}

interface TileLocalState {
  open: boolean;
  loading: boolean;
  error: boolean;
  places: LocalPlace[];
}

interface NearbyOpportunity {
  name: string;
  activityType: string;
  distanceMiles: number;
  description: string;
  website: string | null;
  registerUrl: string;
  registrationNumber: string;
  source: "register";
}

interface NearbyResponse {
  nearby: NearbyOpportunity[];
  location: { postcode: string; adminDistrict: string; country: string };
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

function formatActivityType(activity: string): string {
  return activity.replace(/\b\w/g, c => c.toUpperCase());
}

function formatDistance(miles: number): string {
  if (miles < 1) return "< 1 mi";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
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

export default function Suggestions() {
  const { input, interests, location, locationMeta, result } = useWizard();
  const suggestionsMutation = useGetSuggestions();
  const { data: profileData } = useGetProfile();
  const t = useT();

  // Per-tile local state: activityId → TileLocalState
  const [tileLocal, setTileLocal] = useState<Record<string, TileLocalState>>({});

  // "Near you this week" state
  const [nearbyState, setNearbyState] = useState<{
    loading: boolean;
    error: boolean;
    data: NearbyResponse | null;
  }>({ loading: false, error: false, data: null });

  const profilePostcode = profileData?.profile?.postcode?.trim() ?? "";
  const profileInterests = profileData?.profile?.interests ?? [];
  const interestsForNearby = profileInterests.length > 0 ? profileInterests : interests;

  // Derive whether the user's location is Scottish (no CC register) using the
  // same term list the API uses so register links match server-side routing.
  const adminDistrict = (locationMeta?.adminDistrict || "").toLowerCase();
  const isScottish = Array.from(SCOTTISH_TERMS).some(t => adminDistrict.includes(t));

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

  // Fetch "Near you this week" when we have a postcode in the profile
  useEffect(() => {
    if (!profilePostcode) {
      setNearbyState({ loading: false, error: false, data: null });
      return;
    }
    let cancelled = false;
    setNearbyState({ loading: true, error: false, data: null });
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    fetch(`${base}/api/local-charities/nearby`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcode: profilePostcode, interests: interestsForNearby }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("nearby failed"))))
      .then((data: NearbyResponse) => {
        if (cancelled) return;
        setNearbyState({ loading: false, error: false, data });
      })
      .catch(() => {
        if (cancelled) return;
        setNearbyState({ loading: false, error: true, data: null });
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilePostcode, interestsForNearby.join(",")]);

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
      // Prefer the resolved council name over the raw postcode so Scottish/English
      // charity register detection works correctly (e.g. "City of Edinburgh" not "EH1 1AB")
      const searchLocation = locationMeta?.adminDistrict || location?.trim();
      const res = await fetch(`${base}/api/local-charities/suggest`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: searchLocation, activityName }),
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
      <PageMeta
        title="Volunteering ideas — find ways to make a difference | My Impact"
        description="Discover volunteering, community, and social action ideas matched to your interests. Browse hundreds of ways to contribute and calculate your potential social value."
        canonical="https://myimpact.uk/suggestions"
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

      {/* Near you this week */}
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
                  <h2 className="text-sm font-semibold text-foreground">Near you this week</h2>
                </div>
                {nearbyState.data?.location.adminDistrict && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Charities operating in {nearbyState.data.location.adminDistrict}
                  </p>
                )}
              </div>
              <Link
                href="/profile"
                className="text-[11px] text-muted-foreground hover:text-foreground whitespace-nowrap"
              >
                Change postcode
              </Link>
            </div>

            {nearbyState.loading ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 bg-white border border-border rounded-lg">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Finding opportunities near {profilePostcode}…
                </div>
                <GoVoSearchCard postcode={profilePostcode} />
              </div>
            ) : nearbyState.error ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-4 bg-white border border-border rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Couldn't load nearby opportunities right now.
                </div>
                <GoVoSearchCard postcode={profilePostcode} />
              </div>
            ) : nearbyState.data && nearbyState.data.nearby.length > 0 ? (
              <div className="space-y-2">
                {nearbyState.data.nearby.map((n, i) => (
                  <motion.a
                    key={n.registrationNumber}
                    href={n.website ?? n.registerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="block bg-white border border-border rounded-lg px-4 py-3 hover:border-foreground/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-semibold text-foreground leading-snug truncate">{n.name}</p>
                          <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            ✓ Registered
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                          <span className="px-1.5 py-0.5 rounded bg-muted font-medium uppercase tracking-wider">
                            {formatActivityType(n.activityType)}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="w-2.5 h-2.5" />
                            {formatDistance(n.distanceMiles)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{n.description}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                    </div>
                  </motion.a>
                ))}
                {nearbyState.data.location.country === "Scotland" && <VolunteerScotlandSearchCard />}
                <GoVoSearchCard postcode={profilePostcode} />
                <p className="text-[10px] text-muted-foreground/70 pt-1">
                  Sorted by distance from {nearbyState.data.location.postcode}. Results from the official UK charity register.
                </p>
              </div>
            ) : nearbyState.data ? (
              <div className="space-y-2">
                <div className="p-4 bg-white border border-border rounded-lg">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We couldn't find any registered charities matching your interests within 30 miles of {profilePostcode} right now. Browse the broader suggestions below for more ideas.
                  </p>
                </div>
                {nearbyState.data.location.country === "Scotland" && <VolunteerScotlandSearchCard />}
                <GoVoSearchCard postcode={profilePostcode} />
              </div>
            ) : null}
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

                      {/* "See what's near you" button, only if location captured */}
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
                            No specific local groups found.{" "}
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`${sug.activityName} ${location} volunteer charity`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:text-foreground/70 transition-colors"
                            >
                              Search online <ExternalLink className="w-2.5 h-2.5" />
                            </a>{" "}
                            for "{sug.activityName} {location}".
                          </p>
                        ) : (
                          local.places.map((place, pi) => (
                            <div key={pi} className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <p className="text-xs font-semibold text-foreground leading-snug">{place.name}</p>
                                  {place.source === "register" ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      ✓ Registered charity
                                    </span>
                                  ) : place.verified ? (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      ✓ Verified charity
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                      Suggested
                                    </span>
                                  )}
                                </div>
                                {(place.source === "register" || place.verified) && place.registrationNumber && (
                                  <p className="text-[10px] text-muted-foreground/70 mb-0.5">
                                    Reg. no. {place.registrationNumber}
                                  </p>
                                )}
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{place.description}</p>
                                <p className="text-[11px] text-foreground/60 mt-0.5 italic">{place.howToJoin}</p>
                              </div>
                              <div className="shrink-0 flex flex-col gap-1 items-end">
                                {place.source === "register" && place.registerUrl && (
                                  <a
                                    href={place.registerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all text-emerald-700"
                                  >
                                    Register page <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                {place.source !== "register" && (
                                  <a
                                    href={place.website ?? `https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${location} volunteer charity`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-border bg-white hover:border-foreground/30 transition-all text-muted-foreground hover:text-foreground"
                                  >
                                    {place.website ? "Visit website" : "Search online"} <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                {place.source !== "register" && !isScottish && (
                                  <a
                                    href={`https://register-of-charities.charitycommission.gov.uk/charity-search?q=${encodeURIComponent(place.name)}${profilePostcode ? `&postcode=${encodeURIComponent(profilePostcode)}` : ""}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-all text-emerald-700"
                                  >
                                    Check register <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                {place.source === "register" && place.website && place.website !== place.registerUrl && (
                                  <a
                                    href={place.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-border bg-white hover:border-foreground/30 transition-all text-muted-foreground hover:text-foreground"
                                  >
                                    Website <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))
                        )}

                        {local?.places && local.places.length > 0 && (
                          <p className="text-[10px] text-muted-foreground/60 pt-1">
                            {local.places[0]?.source === "register"
                              ? "Results from the official UK charity register."
                              : "AI-suggested. Always verify before contacting."}
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
