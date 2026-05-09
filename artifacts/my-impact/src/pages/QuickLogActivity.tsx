import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetActivities,
  useCalculateImpact,
  useSaveImpact,
  getGetImpactHistoryQueryKey,
  type ActivityItem,
  type SelectedActivity,
  type CustomActivityInput,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Loader2,
  Search,
  Sparkles,
  PenLine,
  ListChecks,
  CalendarDays,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { INTEREST_OPTIONS } from "@/lib/wizard-context";
import {
  setChallengeContext,
  clearChallengeContext,
  consumeChallengeContextForSave,
} from "@/lib/challenge-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

const SDG_COLORS: Record<number, string> = {
  1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21",
  6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367",
  11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B",
  16: "#00689D", 17: "#19486A",
};

function sdgFromHint(hint: string): { sdg: string; sdgColor: string } {
  const m = hint.match(/SDG\s*(\d+)[:\s]+(.+)/i);
  if (m) {
    const num = parseInt(m[1], 10);
    return { sdg: m[2].trim(), sdgColor: SDG_COLORS[num] ?? "#4C9F38" };
  }
  return { sdg: hint || "Good Health and Well-Being", sdgColor: "#4C9F38" };
}

interface ProxyMatch {
  title: string;
  proxyYear: string;
  valuePerUnit: number;
  unit: string;
}
interface AnalysedActivity {
  friendlyQuestion: string;
  unit: string;
  unitLabel: string;
  defaultQuantity: number;
  sdgHint: string;
  proxyMatch: ProxyMatch | null;
}

interface ProfileResponse {
  profile: { situation?: string[]; interests?: string[]; postcode?: string | null } | null;
}

interface LocationMeta {
  region: string;
  outwardCode: string;
  lat: number;
  lng: number;
}

async function lookupPostcode(raw: string): Promise<LocationMeta | null> {
  const postcode = raw.replace(/\s+/g, "").toUpperCase();
  try {
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
  } catch {
    return null;
  }
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useChallengeIdFromQuery(): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("challenge");
    return id && id.trim() ? id : null;
  }, []);
}

type Mode = "pick" | "describe";

export default function QuickLogActivity() {
  const [, setLocation] = useLocation();
  const { isLoggedIn, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const t = useT();
  const queryClient = useQueryClient();
  const challengeId = useChallengeIdFromQuery();

  // Capture origin once on mount so we can return the user to where they
  // came from after a successful save (falls back to home).
  const returnPathRef = useRef<string>("/");
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const fromParam = params.get("from");
      // Only accept safe internal app routes — reject protocol-relative
      // (e.g. "//evil.com") and absolute URLs.
      if (
        fromParam &&
        fromParam.startsWith("/") &&
        !fromParam.startsWith("//") &&
        !fromParam.startsWith("/log")
      ) {
        returnPathRef.current = fromParam;
        return;
      }
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.origin === window.location.origin && url.pathname && !url.pathname.startsWith("/log")) {
          returnPathRef.current = url.pathname + url.search;
        }
      }
    } catch {
      /* ignore — keep "/" fallback */
    }
  }, []);

  // Persist challenge context for this flow so post-save navigation can refresh
  // org prompts/challenge progress. When no challenge param is present we
  // defensively clear any stale context from an abandoned earlier flow so an
  // unrelated quick-log save does not trigger challenge-mode behaviour
  // (mirrors ActionsStep).
  useEffect(() => {
    if (challengeId) {
      setChallengeContext(challengeId);
    } else {
      clearChallengeContext();
    }
  }, [challengeId]);

  const challengeQuery = useQuery<{ challenge?: { id: string; name: string } }>({
    queryKey: ["challenge-banner", challengeId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${challengeId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!challengeId,
    retry: false,
  });

  // Profile gate — fetch once and decide whether the user can use the
  // quick logger or needs the full wizard.
  const profileQuery = useQuery<ProfileResponse>({
    queryKey: ["profile", "quick-log"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/profile`, { credentials: "include" });
      if (!res.ok) return { profile: null };
      return res.json();
    },
    enabled: isLoggedIn,
    retry: false,
  });

  // Auth gate — signed-out users go to the full wizard (per task spec),
  // not the login page, so guests can still log via the calculator flow.
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      const target = challengeId ? `/wizard/actions?challenge=${challengeId}` : "/wizard/actions";
      setLocation(target);
    }
  }, [authLoading, isLoggedIn, challengeId, setLocation]);

  const profile = profileQuery.data?.profile;

  // Resolve postcode → region/lat/lng if the profile already has one. The
  // quick-log flow does NOT require a postcode — we just attach location
  // metadata when it's available so dashboards can map the entry. Missing
  // postcode/interests no longer redirect the user to the full wizard.
  const [locationMeta, setLocationMetaLocal] = useState<LocationMeta | null>(null);
  useEffect(() => {
    if (!profile?.postcode) return;
    const raw = profile.postcode.trim();
    if (!raw || !UK_POSTCODE_RE.test(raw)) return;
    let cancelled = false;
    lookupPostcode(raw).then((meta) => {
      if (!cancelled && meta) setLocationMetaLocal(meta);
    });
    return () => { cancelled = true; };
  }, [profile?.postcode]);

  const interests = useMemo(() => profile?.interests ?? [], [profile?.interests]);

  // Activities list + sort by interests
  const activitiesQuery = useGetActivities();
  const preferredCategories = useMemo(() => {
    return new Set(
      interests.map(id => INTEREST_OPTIONS.find(o => o.id === id)?.category).filter(Boolean) as string[]
    );
  }, [interests]);

  const sortedActivities = useMemo(() => {
    const list = activitiesQuery.data?.activities ?? [];
    return [...list].sort((a, b) => {
      const aScore = preferredCategories.has(a.category) ? 0 : 1;
      const bScore = preferredCategories.has(b.category) ? 0 : 1;
      return aScore - bScore;
    });
  }, [activitiesQuery.data, preferredCategories]);

  // ── State ──
  const [mode, setMode] = useState<Mode>("pick");
  const [pickSearch, setPickSearch] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [entryDate, setEntryDate] = useState<string>(todayIso());

  // Describe mode
  const [describeText, setDescribeText] = useState("");
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeError, setDescribeError] = useState("");
  const [analysed, setAnalysed] = useState<{ name: string; analysed: AnalysedActivity } | null>(null);

  // Reset quantity when picking a different activity. Hours are derived
  // from quantity at submit-time so there's no separate hours state to
  // keep in sync with the user's edits.
  useEffect(() => {
    if (selectedActivity) {
      setQuantity(selectedActivity.defaultQuantity ?? 1);
    }
  }, [selectedActivity]);

  useEffect(() => {
    if (analysed) {
      setQuantity(analysed.analysed.defaultQuantity);
    }
  }, [analysed]);

  const filteredActivities = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return sortedActivities.slice(0, 12);
    return sortedActivities.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.shortName.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [sortedActivities, pickSearch]);

  const analyseActivity = async () => {
    if (!describeText.trim()) return;
    setDescribeLoading(true);
    setDescribeError("");
    setAnalysed(null);
    try {
      const res = await fetch(`${BASE}/api/custom-activity/analyse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: describeText.trim() }),
      });
      if (!res.ok) throw new Error("analyse_failed");
      const data: AnalysedActivity = await res.json();
      setAnalysed({ name: describeText.trim(), analysed: data });
    } catch {
      setDescribeError("Couldn't analyse that activity. Try a different description.");
    } finally {
      setDescribeLoading(false);
    }
  };

  const calcMutation = useCalculateImpact();
  const saveMutation = useSaveImpact();
  // Synchronous in-flight guard: React state/`isPending` flips on the next
  // render, leaving a small window where a fast double-tap can fire two
  // saves before the disabled-button state is committed. A ref flips
  // immediately and blocks the second invocation.
  const submittingRef = useRef(false);
  const submitting = calcMutation.isPending || saveMutation.isPending;

  const canSubmit =
    !!entryDate &&
    ((mode === "pick" && !!selectedActivity) || (mode === "describe" && !!analysed));

  const handleSubmit = async () => {
    if (!canSubmit || submitting || submittingRef.current) return;
    submittingRef.current = true;

    let activities: SelectedActivity[] = [];
    let customActivities: CustomActivityInput[] = [];
    let description = "Quick log";

    if (mode === "pick" && selectedActivity) {
      const isHourUnit = selectedActivity.unit === "hour";
      const isHousehold = selectedActivity.unit === "household";
      // For hour-unit activities the wizard normalises to quantity=1 and
      // puts the entered hours into hoursPerYear; mirror that here so
      // valuation matches the wizard exactly.
      const enteredQty = isHousehold ? 1 : Math.max(1, Number(quantity) || 1);
      const qty = isHourUnit ? 1 : enteredQty;
      // Quick log only exposes ONE quantity field. Derive hoursPerYear
      // deterministically from the visible quantity so the saved value
      // always reflects what the user actually entered (mirrors the
      // describe-mode formula). Households default to 1 hour.
      const hrs = isHourUnit
        ? enteredQty
        : isHousehold
          ? 1
          : Math.max(1, Math.round(enteredQty * 2));
      activities = [{
        activityId: selectedActivity.id,
        quantity: qty,
        hoursPerYear: hrs,
      }];
      description = `Quick log: ${selectedActivity.shortName}`;
    } else if (mode === "describe" && analysed) {
      const a = analysed.analysed;
      const { sdg, sdgColor } = sdgFromHint(a.sdgHint);
      const isHourUnit = a.unit === "hour";
      const qty = Math.max(1, Number(quantity) || a.defaultQuantity || 1);
      const hrs = isHourUnit ? qty : Math.max(1, Math.round(qty * 2));
      const customId = `custom_${Date.now()}`;
      customActivities = [{
        activityId: customId,
        name: analysed.name,
        quantity: isHourUnit ? 1 : qty,
        hoursPerYear: hrs,
        valuePerUnit: a.proxyMatch?.valuePerUnit ?? 0,
        unit: a.unit,
        proxy: a.proxyMatch?.title ?? "",
        proxyYear: a.proxyMatch?.proxyYear ?? "",
        sdg,
        sdgColor,
      }];
      description = `Quick log: ${analysed.name}`;
    }

    try {
      const calcResult = await calcMutation.mutateAsync({
        data: {
          description,
          activities,
          customActivities: customActivities.length > 0 ? customActivities : undefined,
          donationsGBP: 0,
          additionalVolunteerHours: 0,
        },
      });

      await saveMutation.mutateAsync({
        data: {
          userId: user?.id ?? "",
          name: "My Impact Record",
          entryDate,
          impactResult: calcResult,
          activities,
          customActivities: customActivities.length > 0 ? customActivities : undefined,
          donationsGBP: 0,
          additionalVolunteerHours: 0,
          ...(locationMeta ? {
            region: locationMeta.region,
            outwardCode: locationMeta.outwardCode,
            lat: locationMeta.lat,
            lng: locationMeta.lng,
          } : {}),
        },
      });

      toast({
        title: "Activity logged",
        description: "Your activity has been added to your impact record.",
      });

      // Refresh dashboard/history caches so totals reflect the new entry
      // immediately when the user lands back on their origin page. We use
      // the generated history query key plus the project's bespoke keys
      // for the journal sidebar and the History page year/YoY widgets.
      queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["journal-recent"] });
      queryClient.invalidateQueries({ queryKey: ["impact-years", user?.id ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["impact-yoy", user?.id ?? ""] });

      // Honour challenge attribution: clear context, refresh org/challenge
      // caches, and route home so updated progress is visible (mirrors
      // Results.handleSave). For non-challenge flows, return the user to
      // their originating page.
      const challengeContext = consumeChallengeContextForSave();
      if (challengeContext) {
        queryClient.invalidateQueries({ queryKey: ["org-prompts"] });
        queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
        queryClient.invalidateQueries({ queryKey: ["challenge", challengeContext] });
      }
      setLocation(returnPathRef.current || "/");
    } catch (err) {
      const apiErr = err as { status?: number; data?: { error?: string } };
      if (apiErr?.status === 409 && apiErr?.data?.error === "habit_entry_conflict") {
        toast({
          title: "Already logged this month",
          description: "You already have a habit entry for this month. Open your history to edit it.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Couldn't save",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      submittingRef.current = false;
    }
  };

  // ── Render ──
  if (authLoading || (isLoggedIn && profileQuery.isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const challenge = challengeQuery.data?.challenge;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10" data-testid="quick-log-activity-page">
      <button
        type="button"
        onClick={() => setLocation(returnPathRef.current || "/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-1">
        Quick log
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Add one activity to your record — pick what you did, how much, and when.
      </p>

      {challenge && (
        <div
          className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200"
          data-testid="quick-log-challenge-banner"
        >
          <Trophy className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm text-foreground">
            Logging this will count toward <strong>{challenge.name}</strong>.
          </span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted mb-5">
        <button
          type="button"
          onClick={() => { setMode("pick"); setAnalysed(null); }}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "pick" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          data-testid="quick-log-mode-pick"
        >
          <ListChecks className="w-3.5 h-3.5" /> Pick
        </button>
        <button
          type="button"
          onClick={() => { setMode("describe"); setSelectedActivity(null); }}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "describe" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
          data-testid="quick-log-mode-describe"
        >
          <PenLine className="w-3.5 h-3.5" /> Describe
        </button>
      </div>

      {/* Pick mode */}
      {mode === "pick" && (
        <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5">
          {!selectedActivity ? (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={pickSearch}
                  onChange={e => setPickSearch(e.target.value)}
                  placeholder="Search activities…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
                  data-testid="quick-log-pick-search"
                />
              </div>
              {activitiesQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  {filteredActivities.map(act => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setSelectedActivity(act)}
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors"
                      data-testid={`quick-log-activity-option-${act.id}`}
                    >
                      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: act.sdgColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{act.shortName}</p>
                        <p className="text-xs text-muted-foreground truncate">{act.category}</p>
                      </div>
                    </button>
                  ))}
                  {filteredActivities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No activities match "{pickSearch}". Try Describe mode instead.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <ActivityQuantityPanel
              activity={selectedActivity}
              quantity={quantity}
              setQuantity={setQuantity}
              onChange={() => setSelectedActivity(null)}
            />
          )}
        </div>
      )}

      {/* Describe mode */}
      {mode === "describe" && (
        <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5">
          {!analysed ? (
            <>
              <label className="block text-sm font-medium text-foreground mb-2">
                Describe what you did
              </label>
              <textarea
                value={describeText}
                onChange={e => setDescribeText(e.target.value)}
                placeholder="e.g. Helped at the local food bank for 3 hours"
                rows={3}
                className="w-full p-3 rounded-md bg-white border border-border text-sm focus:border-primary outline-none resize-none"
                data-testid="quick-log-describe-text"
              />
              {describeError && (
                <p className="text-xs text-destructive mt-2">{describeError}</p>
              )}
              <button
                type="button"
                onClick={analyseActivity}
                disabled={!describeText.trim() || describeLoading}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="quick-log-describe-analyse"
              >
                {describeLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Analyse</>
                )}
              </button>
            </>
          ) : (
            <CustomQuantityPanel
              name={analysed.name}
              analysed={analysed.analysed}
              quantity={quantity}
              setQuantity={setQuantity}
              onChange={() => { setAnalysed(null); setDescribeText(""); }}
            />
          )}
        </div>
      )}

      {/* Date */}
      <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground" /> When did you do this?
        </label>
        <input
          type="date"
          value={entryDate}
          max={todayIso()}
          onChange={e => {
            const v = e.target.value;
            if (!v) return;
            const max = todayIso();
            // Defensively clamp future dates that bypass the picker UI
            // (mobile browsers sometimes ignore the max attribute).
            setEntryDate(v > max ? max : v);
          }}
          className="w-full md:w-auto px-3 py-2.5 rounded-md bg-white border border-border text-sm focus:border-primary outline-none"
          data-testid="quick-log-entry-date"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Defaults to today. You can backdate to any past date.
        </p>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => setLocation(returnPathRef.current || "/")}
          className="px-4 py-3 min-h-[44px] rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="quick-log-submit"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <><Check className="w-4 h-4" /> Log it</>
          )}
        </button>
      </div>
    </div>
  );
}

interface ActivityQuantityPanelProps {
  activity: ActivityItem;
  quantity: number;
  setQuantity: (n: number) => void;
  onChange: () => void;
}

function quantityFieldLabel(activity: ActivityItem): string {
  switch (activity.unit) {
    case "hour": return "Hours spent";
    case "session": return "Sessions";
    case "person":
    case "young_person":
    case "participant": return "People helped";
    case "child": return "Children";
    case "tree": return "Trees";
    case "bin": return "Bins";
    case "bag": return "Bags";
    case "event": return "Events";
    case "donation": return "Donations";
    case "mile_per_year": return "Miles";
    case "week": return "Weeks";
    default: return activity.unitLabel || "Quantity";
  }
}

function ActivityQuantityPanel({
  activity,
  quantity,
  setQuantity,
  onChange,
}: ActivityQuantityPanelProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: activity.sdgColor }} />
          <div className="min-w-0">
            <h2 className="text-base font-display font-semibold text-foreground leading-snug truncate">
              {activity.shortName}
            </h2>
            <span className="text-xs text-muted-foreground">{activity.category}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 shrink-0"
        >
          Change
        </button>
      </div>

      <div className="bg-muted/30 rounded-lg p-4">
        {activity.unit === "household" ? (
          <div className="flex items-center gap-3 p-3 bg-white rounded-md border border-border">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-foreground">Yes, I do this for my household</span>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {quantityFieldLabel(activity)}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="w-28 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
                data-testid="quick-log-quantity"
              />
              <span className="text-sm text-muted-foreground">{activity.unitLabel}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <span
          className="text-[10px] font-bold text-white px-2 py-0.5 rounded"
          style={{ backgroundColor: activity.sdgColor }}
        >
          SDG
        </span>
        <span className="text-xs text-muted-foreground">{activity.sdg}</span>
      </div>
    </motion.div>
  );
}

interface CustomQuantityPanelProps {
  name: string;
  analysed: AnalysedActivity;
  quantity: number;
  setQuantity: (n: number) => void;
  onChange: () => void;
}

function CustomQuantityPanel({ name, analysed, quantity, setQuantity, onChange }: CustomQuantityPanelProps) {
  const { sdg, sdgColor } = sdgFromHint(analysed.sdgHint);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-1 h-10 rounded-full shrink-0" style={{ backgroundColor: sdgColor }} />
          <div className="min-w-0">
            <h2 className="text-base font-display font-semibold text-foreground leading-snug truncate">{name}</h2>
            <span className="text-xs text-muted-foreground">Custom activity</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 shrink-0"
        >
          Change
        </button>
      </div>

      <div className="bg-muted/30 rounded-lg p-4">
        <div className="flex items-start gap-2 mb-3">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#E8633A" }} />
          <p className="text-sm font-medium text-foreground leading-snug">{analysed.friendlyQuestion}</p>
        </div>

        {analysed.unit === "pound" ? (
          <div className="flex items-center border border-border rounded-md bg-white focus-within:border-primary w-fit">
            <span className="pl-2.5 pr-1 text-base font-semibold text-foreground">£</span>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-20 py-2.5 pr-2.5 bg-transparent text-base font-semibold text-center focus:outline-none"
              data-testid="quick-log-quantity"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-24 p-2.5 rounded-md bg-white border border-border text-base font-semibold text-center focus:border-primary outline-none"
              data-testid="quick-log-quantity"
            />
            <span className="text-sm text-muted-foreground">{analysed.unitLabel}</span>
          </div>
        )}

        {analysed.proxyMatch ? (
          <div className="flex items-start gap-2 bg-white border border-border rounded-md p-3 mt-3">
            <div className="shrink-0 w-1.5 min-h-[1.5rem] rounded-full mt-0.5" style={{ backgroundColor: sdgColor }} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Closest proxy match</p>
              <p className="text-xs text-foreground font-medium leading-snug">{analysed.proxyMatch.title}</p>
              <p className="text-xs text-primary font-bold mt-1">
                £{analysed.proxyMatch.valuePerUnit.toLocaleString()} per {analysed.proxyMatch.unit}
                {analysed.proxyMatch.proxyYear && (
                  <span className="text-muted-foreground font-normal"> · {analysed.proxyMatch.proxyYear}</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic mt-2">
            No proxy match found — this activity will count towards your volunteer hours but not your social value total.
          </p>
        )}
      </div>

      {analysed.sdgHint && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: sdgColor }}>SDG</span>
          <span className="text-xs text-muted-foreground">{sdg}</span>
        </div>
      )}
    </motion.div>
  );
}
