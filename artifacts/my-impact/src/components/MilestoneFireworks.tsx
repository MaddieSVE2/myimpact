import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { getGetImpactHistoryQueryKey, useGetActivities, useGetImpactHistory, type SelectedActivity } from "@workspace/api-client-react";
import { PartyPopper, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { computeBadges, type Badge } from "@/lib/badges";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";

interface MilestoneFireworksProps {
  badgeId: string;
  colour: string;
  children: ReactNode;
}

const PARTICLES = [
  { x: -42, y: -30, size: 5, delay: 0 },
  { x: -18, y: -45, size: 4, delay: 0.03 },
  { x: 18, y: -43, size: 5, delay: 0.06 },
  { x: 43, y: -25, size: 4, delay: 0.02 },
  { x: 47, y: 17, size: 5, delay: 0.08 },
  { x: 24, y: 36, size: 4, delay: 0.04 },
  { x: -24, y: 38, size: 5, delay: 0.07 },
  { x: -47, y: 15, size: 4, delay: 0.05 },
] as const;

const BURST_DURATION_MS = 850;
const NOTICE_DURATION_MS = 5_000;

function getYearMonth(isoDate: string): string {
  const date = new Date(isoDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function MilestoneUnlockNotice() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [unlockedBadges, setUnlockedBadges] = useState<Badge[]>([]);
  const previousEarnedRef = useRef<Set<string> | null>(null);
  const baselineUserIdRef = useRef<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data } = useGetImpactHistory(
    { userId: user?.id ?? "" },
    { query: { enabled: !!user?.id, queryKey: getGetImpactHistoryQueryKey({ userId: user?.id ?? "" }) } },
  );
  const { data: activitiesData } = useGetActivities();

  const earnedBadges = useMemo(() => {
    const records = data?.records ?? [];
    const personUnitActivityIds = new Set(
      (activitiesData?.activities ?? [])
        .filter((activity) => activity.unit === "person" || activity.unit === "young_person")
        .map((activity) => activity.id),
    );
    const monthlyRecordCounts: Record<string, number> = {};
    const recordDates: string[] = [];
    for (const record of records) {
      if (!record.createdAt) continue;
      const month = getYearMonth(record.createdAt);
      monthlyRecordCounts[month] = (monthlyRecordCounts[month] ?? 0) + 1;
      recordDates.push(record.createdAt);
    }

    return computeBadges({
      totalValue: records[0]?.impactResult.totalValue ?? 0,
      activityBreakdowns: records.flatMap((record) =>
        (record.impactResult.activityBreakdowns ?? []).map((activity) => ({ category: activity.category })),
      ),
      isFirstRecord: records.length > 0,
      cumulativeHours: records.reduce((sum, record) => sum + (record.impactResult.totalHours ?? 0), 0),
      cumulativeDonations: records.reduce((sum, record) => sum + (record.impactResult.donationsValue ?? 0), 0),
      cumulativePeopleSupported: records.reduce((sum, record) => {
        const withActivities = record as typeof record & { activities?: SelectedActivity[] };
        return sum + (withActivities.activities ?? []).reduce(
          (recordSum, activity) =>
            personUnitActivityIds.has(activity.activityId) ? recordSum + (activity.quantity ?? 0) : recordSum,
          0,
        );
      }, 0),
      monthlyRecordCounts,
      recordDates,
      accountAgeDays: user?.createdAt
        ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      sdgIds: records.flatMap((record) =>
        (record.impactResult.sdgBreakdowns ?? []).map((breakdown) => breakdown.sdg),
      ),
    }).filter((candidate) => candidate.earned);
  }, [activitiesData?.activities, data?.records, user?.createdAt]);

  useEffect(() => {
    if (!user?.id || !data || !activitiesData) return;
    if (baselineUserIdRef.current !== user.id) {
      baselineUserIdRef.current = user.id;
      previousEarnedRef.current = null;
      setUnlockedBadges([]);
    }
    const currentIds = new Set(earnedBadges.map((candidate) => candidate.id));
    const previousIds = previousEarnedRef.current;
    previousEarnedRef.current = currentIds;
    if (!previousIds || user.gamificationEnabled === false) return;

    const storageKey = `mi_tracked_milestones_${user.id}`;
    let acknowledged = new Set<string>();
    try {
      const stored = localStorage.getItem(storageKey);
      acknowledged = new Set(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      // A blocked or malformed local store should not prevent the notice.
    }
    const newlyEarned = earnedBadges.filter(
      (candidate) => !previousIds.has(candidate.id) && !acknowledged.has(candidate.id),
    );
    if (newlyEarned.length === 0) return;

    for (const candidate of newlyEarned) acknowledged.add(candidate.id);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...acknowledged]));
    } catch {
      // The in-memory baseline still prevents repeats during this session.
    }
    for (const candidate of newlyEarned) {
      track(ANALYTICS_EVENTS.MILESTONE_EARNED, {
        badgeId: candidate.id,
        badgeName: candidate.name,
      });
    }
    setUnlockedBadges(newlyEarned);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setUnlockedBadges([]), NOTICE_DURATION_MS);
  }, [activitiesData, data, earnedBadges, user?.gamificationEnabled, user?.id]);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  return (
    <AnimatePresence>
      {unlockedBadges.length > 0 && (() => {
        const primaryBadge = unlockedBadges[0];
        const names = unlockedBadges.map((candidate) => candidate.name).join(", ");
        return (
          <motion.aside
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid={`milestone-unlock-notice-${primaryBadge.id}`}
          className="fixed bottom-5 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border bg-white p-4 shadow-xl"
          style={{ borderColor: primaryBadge.colour }}
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primaryBadge.colour}20`, color: primaryBadge.colour }}
            aria-hidden="true"
          >
            <PartyPopper className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-foreground">
              {unlockedBadges.length === 1 ? `Milestone earned: ${names}` : `${unlockedBadges.length} milestones earned`}
            </p>
            <p className="text-sm text-muted-foreground">
              {unlockedBadges.length === 1 ? "Your latest activity unlocked a new milestone." : names}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUnlockedBadges([])}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Dismiss milestone notice"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          </motion.aside>
        );
      })()}
    </AnimatePresence>
  );
}

export function MilestoneFireworks({
  badgeId,
  colour,
  children,
}: MilestoneFireworksProps) {
  const reduceMotion = useReducedMotion();
  const [burstKey, setBurstKey] = useState(0);
  const [isBurstVisible, setIsBurstVisible] = useState(false);
  const isBurstingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const celebrate = useCallback(() => {
    if (reduceMotion || isBurstingRef.current) return;
    isBurstingRef.current = true;
    setBurstKey((key) => key + 1);
    setIsBurstVisible(true);
    timeoutRef.current = setTimeout(() => {
      isBurstingRef.current = false;
      setIsBurstVisible(false);
      timeoutRef.current = null;
    }, BURST_DURATION_MS);
  }, [reduceMotion]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative isolate bg-white rounded-xl p-4 flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ border: `2px solid ${colour}` }}
      tabIndex={0}
      data-testid={`card-earned-milestone-${badgeId}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") celebrate();
      }}
      onFocus={celebrate}
    >
      <AnimatePresence>
        {isBurstVisible && !reduceMotion && (
          <motion.div
            key={burstKey}
            className="pointer-events-none absolute inset-1 z-0 overflow-hidden rounded-lg"
            aria-hidden="true"
            data-testid={`fireworks-${badgeId}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {PARTICLES.map((particle, index) => (
              <motion.span
                key={index}
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: index % 3 === 0 ? "var(--brand-orange-bright)" : colour,
                  boxShadow: `0 0 5px ${index % 3 === 0 ? "var(--brand-orange-bright)" : colour}`,
                }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: particle.x,
                  y: particle.y,
                  scale: [0, 1, 0.5],
                  opacity: [0, 0.85, 0],
                }}
                transition={{
                  duration: BURST_DURATION_MS / 1000,
                  delay: particle.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}