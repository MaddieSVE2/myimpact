import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetActivities,
  useCalculateImpact,
  useSaveImpact,
  useGetImpactHistory,
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
  Trophy,
  History,
  AlertTriangle,
  CalendarDays,
  PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { INTEREST_OPTIONS } from "@/lib/wizard-context";
import {
  setChallengeContext,
  clearChallengeContext,
  consumeChallengeContextForSave,
} from "@/lib/challenge-context";
import { NumberInput } from "@/components/ui/number-input";
import { CONTENT_CONTAINER } from "@/lib/layout";
import { LocationPicker, describeLocation, type ActivityLocationValue } from "@/components/quicklog/LocationPicker";
import { todayIso, formatDisplayDate } from "@/components/quicklog/activity-shared";
import { ShareWithOrgPrompt } from "@/components/ShareWithOrgPrompt";
import { useMyOrg } from "@/lib/org-export";
import type { ImpactResult } from "@workspace/api-client-react";

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
  fullValuePerUnit?: number;
  deflationFactor?: number;
  deflationNote?: string | null;
  horizon?: string;
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

/** One "log again" candidate derived from the user's saved history. */
interface RecentActivityEntry {
  activity: ActivityItem;
  /** The visible quantity to pre-fill (hours for hour-unit activities). */
  usualQuantity: number;
  /** The location saved with the most recent occurrence, if any. */
  location: ActivityLocationValue | null;
  lastDate: string | null;
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

type DuplicateInfo = {
  kind: "possible_duplicate" | "habit_entry_conflict";
  existingRecordId: string | null;
};

export default function QuickLogActivity() {
  const [, setLocation] = useLocation();
  const { isLoggedIn, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
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
      // Only accept safe internal app routes, reject protocol-relative
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
      /* ignore, keep "/" fallback */
    }
  }, []);

  // Persist challenge context for this flow so post-save navigation can refresh
  // org prompts/challenge progress. When no challenge param is present we
  // defensively clear any stale context from an abandoned earlier flow.
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

  // Profile is only used to rank the activity catalogue by the user's
  // interests. NOTE: the user's home postcode is deliberately NOT used for
  // the activity location — location is asked explicitly, never inferred.
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

  // Auth gate, signed-out users go to the full wizard, not the login page,
  // so guests can still log via the calculator flow.
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      const target = challengeId ? `/wizard/actions?challenge=${challengeId}` : "/wizard/actions";
      setLocation(target);
    }
  }, [authLoading, isLoggedIn, challengeId, setLocation]);

  const profile = profileQuery.data?.profile;
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

  // History feeds "recent activities / log again" and the usual-location chip.
  const historyQuery = useGetImpactHistory(
    { userId: user?.id ?? "" },
    {
      query: {
        enabled: isLoggedIn && !!user?.id,
        queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }),
      },
    },
  );

  const activityById = useMemo(() => {
    const map = new Map<string, ActivityItem>();
    for (const a of activitiesQuery.data?.activities ?? []) map.set(a.id, a);
    return map;
  }, [activitiesQuery.data]);

  type HistRecord = {
    entryDate?: string | null;
    kind?: string | null;
    location?: ActivityLocationValue | null;
    activities?: SelectedActivity[];
  };

  const { recentActivities, usualLocation } = useMemo(() => {
    const records = (historyQuery.data?.records ?? []) as unknown as HistRecord[];
    // Records arrive newest-first. Quick-log occurrences are the strongest
    // "you did this recently" signal, so scan them before estimate records.
    const ordered = [
      ...records.filter(r => r.kind === "quick_log"),
      ...records.filter(r => r.kind !== "quick_log"),
    ];
    const seen = new Set<string>();
    const recents: RecentActivityEntry[] = [];
    let usual: ActivityLocationValue | null = null;
    for (const r of records) {
      if (!usual && r.location && (r.location.mode === "in_person" ? describeLocation(r.location) : true)) {
        usual = r.location;
      }
    }
    for (const r of ordered) {
      for (const a of r.activities ?? []) {
        if (seen.has(a.activityId)) continue;
        const item = activityById.get(a.activityId);
        if (!item) continue;
        seen.add(a.activityId);
        recents.push({
          activity: item,
          usualQuantity: item.unit === "hour"
            ? Math.max(1, Math.round(a.hoursPerYear || a.quantity || 1))
            : Math.max(1, Math.round(a.quantity || 1)),
          location: r.location ?? null,
          lastDate: r.entryDate ?? null,
        });
        if (recents.length >= 4) break;
      }
      if (recents.length >= 4) break;
    }
    return { recentActivities: recents, usualLocation: usual };
  }, [historyQuery.data, activityById]);

  // ── State: the four questions ──
  const [mode, setMode] = useState<Mode>("pick");
  const [pickSearch, setPickSearch] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [entryDate, setEntryDate] = useState<string>(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activityLocation, setActivityLocation] = useState<ActivityLocationValue | null>(null);
  const quantityTouchedRef = useRef(false);

  // Describe mode ("Something else")
  const [describeText, setDescribeText] = useState("");
  const [describeLoading, setDescribeLoading] = useState(false);
  const [describeError, setDescribeError] = useState("");
  const [analysed, setAnalysed] = useState<{ name: string; analysed: AnalysedActivity } | null>(null);

  // Post-save confirmation + duplicate prompt
  const [savedYear, setSavedYear] = useState<number | null>(null);
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);
  const [savedResult, setSavedResult] = useState<ImpactResult | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  // Inline org sharing (explicit-submission orgs): the member decides on the
  // logging screen, and the confirmation simply states what happened.
  // Evidence-required orgs keep the review flow (photos can't be attached here).
  const { data: myOrgData } = useMyOrg();
  const myOrg = myOrgData?.org ?? null;
  const canShareInline =
    !!myOrg &&
    myOrg.dataSharingMode === "explicit_submission" &&
    myOrg.role !== "manager" &&
    myOrg.membershipStatus === "active" &&
    (myOrg.evidencePolicy ?? "optional") !== "required";
  const [shareWithOrg, setShareWithOrg] = useState(false);
  const [sharedOrgName, setSharedOrgName] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState<string | null>(null);
  // Snapshot of whether the inline share choice was actually offered when the
  // user submitted — the org query can resolve mid-save, and eligibility
  // changing under our feet must not alter the confirmation branching.
  const [inlineShareOffered, setInlineShareOffered] = useState(false);

  // Reset quantity when picking a different activity, unless a "Log again"
  // pre-fill just set the usual amount.
  useEffect(() => {
    if (selectedActivity && !quantityTouchedRef.current) {
      setQuantity(1);
    }
    quantityTouchedRef.current = false;
  }, [selectedActivity]);

  useEffect(() => {
    if (analysed) {
      setQuantity(Math.max(1, analysed.analysed.defaultQuantity || 1));
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

  /**
   * "Log again": pre-fill activity, usual amount, usual location and today's
   * date so the user only has to confirm. (The previous org-sharing
   * preference hook lives here too once per-record sharing prompts exist —
   * sharing is currently governed by org consent, so there is nothing to
   * carry over yet.)
   */
  const handleLogAgain = (entry: RecentActivityEntry) => {
    setMode("pick");
    setAnalysed(null);
    quantityTouchedRef.current = true;
    setSelectedActivity(entry.activity);
    setQuantity(entry.usualQuantity);
    setEntryDate(todayIso());
    setShowDatePicker(false);
    setActivityLocation(entry.location ?? usualLocation ?? null);
    setDuplicate(null);
  };

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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.code === "ai_unavailable" ? "ai_unavailable" : "analyse_failed");
      }
      const data: AnalysedActivity = await res.json();
      setAnalysed({ name: describeText.trim(), analysed: data });
    } catch (err) {
      setDescribeError(
        err instanceof Error && err.message === "ai_unavailable"
          ? "Our analysis service is having a moment. Please try again shortly."
          : "Couldn't analyse that activity. Try adding a bit more detail, like what you do and who it helps.",
      );
    } finally {
      setDescribeLoading(false);
    }
  };

  const calcMutation = useCalculateImpact();
  const saveMutation = useSaveImpact();
  // Synchronous in-flight guard: React state/`isPending` flips on the next
  // render, leaving a small window where a fast double-tap can fire two
  // saves before the disabled-button state is committed.
  const submittingRef = useRef(false);
  const submitting = calcMutation.isPending || saveMutation.isPending;

  const canSubmit =
    !!entryDate &&
    ((mode === "pick" && !!selectedActivity) || (mode === "describe" && !!analysed));

  const handleSubmit = async (opts?: { force?: boolean }) => {
    if (!canSubmit || submitting || submittingRef.current) return;
    submittingRef.current = true;
    setDuplicate(null);

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
      // Pound-unit entries are money, not time — no derived volunteer hours.
      const hrs = isHourUnit ? qty : a.unit === "pound" ? 0 : Math.max(1, Math.round(qty * 2));
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

    // Flat location columns power the dashboard maps. Share only the general
    // area (outward code / region) at this level; the precise venue label
    // stays inside the structured location.
    const flatLocation = (() => {
      if (!activityLocation || activityLocation.mode !== "in_person") return {};
      const postcode = activityLocation.postcode ?? "";
      const outward = UK_POSTCODE_RE.test(postcode)
        ? postcode.replace(/\s+/g, "").toUpperCase().slice(0, -3)
        : postcode.replace(/\s+/g, "").toUpperCase() || undefined;
      return {
        ...(activityLocation.region ? { region: activityLocation.region } : {}),
        ...(outward ? { outwardCode: outward } : {}),
        ...(activityLocation.lat != null ? { lat: activityLocation.lat } : {}),
        ...(activityLocation.lng != null ? { lng: activityLocation.lng } : {}),
      };
    })();

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

      const saved = (await saveMutation.mutateAsync({
        data: {
          userId: user?.id ?? "",
          name: "My Impact Record",
          entryDate,
          // Quick Log saves are per-occurrence actuals: quantities are stored
          // as-is (never annualised) and reconciled against any annual
          // estimate of the same activity/year in yearly totals.
          kind: "quick_log" as const,
          impactResult: calcResult,
          activities,
          customActivities: customActivities.length > 0 ? customActivities : undefined,
          donationsGBP: 0,
          additionalVolunteerHours: 0,
          ...(activityLocation ? { location: activityLocation } : {}),
          ...flatLocation,
          ...(opts?.force ? { force: true } : {}),
        },
      })) as { id?: number | string | null; reportingYear?: number | null };

      // Refresh dashboard/history caches so totals reflect the new entry
      // immediately when the user lands back on their origin page.
      queryClient.invalidateQueries({ queryKey: getGetImpactHistoryQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["journal-recent"] });
      queryClient.invalidateQueries({ queryKey: ["impact-years", user?.id ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["impact-yoy", user?.id ?? ""] });

      // Honour challenge attribution: clear context and refresh org/challenge
      // caches so updated progress is visible.
      const challengeContext = consumeChallengeContextForSave();
      if (challengeContext) {
        queryClient.invalidateQueries({ queryKey: ["org-prompts"] });
        queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
        queryClient.invalidateQueries({ queryKey: ["challenge", challengeContext] });
      }

      // Post-save confirmation: the entry auto-associates with the calendar
      // year of its date. A date the server can't associate still saves —
      // reportingYear is simply null and we confirm the save plainly.
      const year = saved?.reportingYear
        ?? (Number.isFinite(parseInt(entryDate.slice(0, 4), 10)) ? parseInt(entryDate.slice(0, 4), 10) : null);
      setSavedYear(year);
      // Keep the saved record id and result so the confirmation screen can
      // offer/inform about org sharing (ShareWithOrgPrompt).
      const numericId = saved?.id != null ? Number(saved.id) : NaN;
      setSavedRecordId(Number.isFinite(numericId) ? numericId : null);
      setSavedResult(calcResult);

      // Inline org share: the member opted in on the logging screen, so
      // submit the saved record to the org now. A share failure never blocks
      // the save — the confirmation offers the review flow as a fallback.
      setSharedOrgName(null);
      setShareFailed(null);
      // Eligibility snapshot at submit time: only share (and only suppress
      // the confirmation prompt) based on what was actually offered.
      const offeredNow = canShareInline;
      setInlineShareOffered(offeredNow);
      if (shareWithOrg && offeredNow && myOrg && Number.isFinite(numericId)) {
        const sharedActivityId =
          activities[0]?.activityId ?? customActivities[0]?.activityId ?? null;
        if (sharedActivityId) {
          try {
            const res = await fetch(`${BASE}/api/org/member-submit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                sourceReportId: numericId,
                activities: [{ activityId: sharedActivityId }],
              }),
            });
            if (res.ok) {
              setSharedOrgName(myOrg.name);
              queryClient.invalidateQueries({ queryKey: ["org-prompts"] });
            } else {
              const data = await res.json().catch(() => ({}));
              // Already shared = idempotent success, never a retry prompt.
              if ((data as { code?: string }).code === "already_shared") {
                setSharedOrgName(myOrg.name);
              } else {
                setShareFailed(myOrg.name);
              }
            }
          } catch {
            setShareFailed(myOrg.name);
          }
        }
      }
      setShowSaved(true);
    } catch (err) {
      const apiErr = err as { status?: number; data?: { error?: string; existingRecordId?: string } };
      if (apiErr?.status === 409 && (apiErr?.data?.error === "possible_duplicate" || apiErr?.data?.error === "habit_entry_conflict")) {
        setDuplicate({
          kind: apiErr.data.error as DuplicateInfo["kind"],
          existingRecordId: apiErr.data.existingRecordId ?? null,
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

  const resetForAnother = () => {
    setShowSaved(false);
    setSavedYear(null);
    setSavedRecordId(null);
    setSavedResult(null);
    setSelectedActivity(null);
    setAnalysed(null);
    setDescribeText("");
    setMode("pick");
    setPickSearch("");
    setQuantity(1);
    setEntryDate(todayIso());
    setShowDatePicker(false);
    setActivityLocation(null);
    setDuplicate(null);
    setShareWithOrg(false);
    setSharedOrgName(null);
    setShareFailed(null);
    setInlineShareOffered(false);
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
  const isToday = entryDate === todayIso();

  if (showSaved) {
    return (
      <div className={`${CONTENT_CONTAINER} py-16`} data-testid="quick-log-activity-page">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-border rounded-xl p-8 text-center max-w-lg mx-auto"
          data-testid="quick-log-saved-confirmation"
        >
          <div
            className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: "var(--brand-orange-bright)" }}
          >
            <PartyPopper className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground mb-1">
            {savedYear != null ? `Added to My Impact ${savedYear}` : "Activity saved"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {savedYear != null
              ? `Your entry for ${formatDisplayDate(entryDate)} has been added to your impact record: My Impact ${savedYear}${sharedOrgName ? `, and shared with ${sharedOrgName}` : ""}. Great job!`
              : `Your entry has been saved to your history${sharedOrgName ? ` and shared with ${sharedOrgName}` : ""}.`}
          </p>
          {shareFailed && savedRecordId != null && (
            <div
              className="mb-6 text-left rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
              data-testid="quick-log-share-failed"
            >
              <p className="text-sm text-foreground">
                Your entry was saved, but we couldn't share it with {shareFailed} automatically.{" "}
                <button
                  type="button"
                  onClick={() => setLocation(`/org/share-report/${savedRecordId}`)}
                  className="font-semibold text-primary hover:underline"
                >
                  Review &amp; share it here
                </button>
                .
              </p>
            </div>
          )}
          {!inlineShareOffered && (
            <div className="text-left">
              <ShareWithOrgPrompt result={savedResult} saved entryDate={entryDate} savedRecordId={savedRecordId} />
            </div>
          )}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setLocation(returnPathRef.current || "/")}
              className="px-5 py-3 min-h-[44px] rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
              data-testid="quick-log-saved-done"
            >
              Back to home
            </button>
            <button
              type="button"
              onClick={resetForAnother}
              className="px-5 py-3 min-h-[44px] rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors"
              data-testid="quick-log-saved-log-another"
            >
              Log something else
            </button>
            <button
              type="button"
              onClick={() => setLocation("/history")}
              className="px-5 py-3 min-h-[44px] rounded-md text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              View history
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`${CONTENT_CONTAINER} py-10`} data-testid="quick-log-activity-page">
      <button
        type="button"
        onClick={() => setLocation(returnPathRef.current || "/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-1">
        Log an activity
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Just did something? Record what you did, how much, when and where.
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

      {/* 1 — What did you do? */}
      <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Step 1</p>
        <h2 className="text-base font-display font-semibold text-foreground mb-4">What did you do?</h2>

        {mode === "pick" && !selectedActivity && (
          <>
            {recentActivities.length > 0 && (
              <div className="mb-4" data-testid="quick-log-recent">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent activities</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {recentActivities.map(entry => (
                    <button
                      key={entry.activity.id}
                      type="button"
                      onClick={() => handleLogAgain(entry)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-foreground/40 bg-white text-left transition-colors"
                      data-testid={`quick-log-recent-${entry.activity.id}`}
                    >
                      <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: entry.activity.sdgColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{entry.activity.shortName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Usually {entry.usualQuantity} {entry.activity.unit === "hour" ? (entry.usualQuantity === 1 ? "hour" : "hours") : entry.activity.unitLabel}
                        </p>
                      </div>
                      <span
                        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white"
                        style={{ background: "var(--brand-orange-bright)" }}
                      >
                        <History className="w-3 h-3" aria-hidden="true" /> Log again
                      </span>
                    </button>
                  ))}
                </div>
                <div className="h-px bg-border my-4" />
              </div>
            )}

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
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
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
                    No activities match "{pickSearch}". Try "Something else" below.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setMode("describe"); setSelectedActivity(null); }}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid="quick-log-mode-describe"
            >
              <PenLine className="w-3.5 h-3.5" /> Something else — describe what you did
            </button>
          </>
        )}

        {mode === "pick" && selectedActivity && (
          <ActivityQuantityPanel
            activity={selectedActivity}
            quantity={quantity}
            setQuantity={setQuantity}
            onChange={() => setSelectedActivity(null)}
          />
        )}

        {mode === "describe" && (
          <>
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
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={analyseActivity}
                    disabled={!describeText.trim() || describeLoading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="quick-log-describe-analyse"
                  >
                    {describeLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Analyse</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("pick"); setAnalysed(null); setDescribeError(""); }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="quick-log-mode-pick"
                  >
                    Back to the activity list
                  </button>
                </div>
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
          </>
        )}
      </div>

      {/* 2 — When did it happen? */}
      <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5" data-testid="quick-log-entry-date">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Step 2</p>
        <h2 className="text-base font-display font-semibold text-foreground mb-3">When did it happen?</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 text-sm font-medium text-foreground" data-testid="quick-log-date-display">
            <CalendarDays className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {isToday ? `Today, ${formatDisplayDate(entryDate)}` : formatDisplayDate(entryDate)}
          </span>
          {!showDatePicker ? (
            <button
              type="button"
              onClick={() => setShowDatePicker(true)}
              className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              data-testid="quick-log-change-date"
            >
              Change date
            </button>
          ) : (
            <input
              type="date"
              value={entryDate}
              max={todayIso()}
              onChange={e => { if (e.target.value) setEntryDate(e.target.value); }}
              className="px-3 py-2 rounded-md border border-border bg-white text-sm focus:border-primary outline-none"
              data-testid="quick-log-date-input"
            />
          )}
          {!isToday && (
            <button
              type="button"
              onClick={() => { setEntryDate(todayIso()); setShowDatePicker(false); }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Reset to today
            </button>
          )}
        </div>
      </div>

      {/* 3 — Where did it happen? */}
      <div className="bg-white border border-border rounded-xl p-5 md:p-6 mb-5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Step 3</p>
        <h2 className="text-base font-display font-semibold text-foreground mb-3">Where did it happen?</h2>
        <LocationPicker
          value={activityLocation}
          onChange={setActivityLocation}
          previous={usualLocation}
        />
      </div>

      {/* Duplicate prompt — never a silent merge */}
      {duplicate && (
        <div
          className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4"
          data-testid="quick-log-duplicate-prompt"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">This activity may already have been logged</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {duplicate.kind === "habit_entry_conflict"
                  ? "One of your regular activities already covers this — it looks like the same occurrence."
                  : `You already have an entry with this activity on ${formatDisplayDate(entryDate)}.`}
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {duplicate.existingRecordId && (
                  <button
                    type="button"
                    onClick={() => setLocation(`/history?edit=${duplicate.existingRecordId}`)}
                    className="px-3.5 py-2 rounded-md border border-border bg-white text-xs font-semibold hover:bg-muted transition-colors"
                    data-testid="quick-log-duplicate-view"
                  >
                    View or edit the existing entry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSubmit({ force: true })}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-md text-xs font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: "var(--brand-orange-bright)" }}
                  data-testid="quick-log-duplicate-log-anyway"
                >
                  Log anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicate(null)}
                  className="px-2 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share with organisation — decided here, not after saving */}
      {canShareInline && myOrg && (
        <label
          className="mb-5 flex items-start gap-3 bg-white border border-border rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-colors"
          data-testid="quick-log-share-org"
        >
          <input
            type="checkbox"
            checked={shareWithOrg}
            onChange={e => setShareWithOrg(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[var(--brand-orange-bright)] shrink-0"
            data-testid="quick-log-share-org-checkbox"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">
              Also share this with {myOrg.name}
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Your personal record keeps everything either way.
            </span>
          </span>
        </label>
      )}

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
          onClick={() => void handleSubmit()}
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
    case "hour": return "How many hours did you do?";
    case "session": return "How many sessions?";
    case "person":
    case "young_person":
    case "participant": return "How many people did you help?";
    case "child": return "How many children?";
    case "tree": return "How many trees?";
    case "bin": return "How many bins?";
    case "bag": return "How many bags?";
    case "event": return "How many events?";
    case "donation": return "How many donations?";
    case "mile_per_year": return "How many miles?";
    case "week": return "How many weeks?";
    default: return activity.unitLabel ? `How many ${activity.unitLabel}?` : "How many?";
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
              <NumberInput
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
          <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--brand-orange)" }} />
          <p className="text-sm font-medium text-foreground leading-snug">{analysed.friendlyQuestion}</p>
        </div>

        {analysed.unit === "pound" ? (
          <div className="flex items-center border border-border rounded-md bg-white focus-within:border-primary w-fit">
            <span className="pl-2.5 pr-1 text-base font-semibold text-foreground">£</span>
            <NumberInput
              min="1"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-20 py-2.5 pr-2.5 bg-transparent text-base font-semibold text-center focus:outline-none"
              data-testid="quick-log-quantity"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <NumberInput
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
              {analysed.proxyMatch.deflationNote && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {analysed.proxyMatch.deflationNote}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic mt-2">
            No proxy match found, this activity will count towards your volunteer hours but not your social value total.
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
