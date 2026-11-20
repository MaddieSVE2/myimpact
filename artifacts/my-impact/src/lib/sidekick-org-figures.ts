import { useQuery } from "@tanstack/react-query";
import { apiJson } from "@/lib/api";
import { getPeriodBounds } from "@/lib/summaryPeriod";
import type { SidekickOrgFigures } from "@/lib/sidekick-templates";

// Same id as DEMO_ORG_ID in org-demo-mock. Kept as a literal so the demo
// data set is only downloaded for the demo organisation (see the dynamic
// import below), not shipped with Sidekick on every page.
const DEMO_ORG_ID = "demo-org-0000000000000";

interface SidekickOrg {
  id: string;
  name: string;
  summaryYearStart?: string;
}

async function loadOrgFigures(org: SidekickOrg): Promise<SidekickOrgFigures> {
  if (org.id === DEMO_ORG_ID) {
    // The demo organisation has no server data. Mirror the manager home
    // page: every demo activity, minus members removed in this browser.
    const mock = await import("@/lib/org-demo-mock");
    const removed = new Set(mock.getRemovedMemberIds(DEMO_ORG_ID));
    const activities = mock.DEMO_ACTIVITIES.filter((a) => !removed.has(a.memberId));
    const totals = mock.computeDemoAggregates(activities);
    const dates = activities.map((a) => a.occurredAt).sort();
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const first = dates[0];
    const last = dates[dates.length - 1];
    return {
      name: org.name,
      periodLabel: first && last ? `${fmt(first)} – ${fmt(last)}` : undefined,
      totalSocialValue: totals.totalSocialValue,
      totalHours: totals.totalHours,
      people: totals.activeMembers,
    };
  }

  // With no parameters the server returns the organisation's current
  // reporting period, worked out from the same year-start setting.
  const stats = await apiJson<{
    totalSocialValue?: number;
    totalHours?: number;
    totalUsers?: number;
  }>(`/api/impact/org-stats`, { errorMessage: "Failed to load organisation figures" });
  return {
    name: org.name,
    periodLabel: getPeriodBounds(org.summaryYearStart ?? "01-01", 0).label,
    totalSocialValue: stats.totalSocialValue ?? 0,
    totalHours: stats.totalHours ?? 0,
    people: stats.totalUsers ?? 0,
  };
}

/**
 * The organisation's dashboard totals for Sidekick's organisation mode, so
 * its drafts use the organisation's figures rather than the manager's own
 * score. Only fetched while `enabled` (organisation mode with Sidekick open).
 */
export function useSidekickOrgFigures(org: SidekickOrg | null | undefined, enabled: boolean) {
  return useQuery<SidekickOrgFigures>({
    queryKey: ["sidekick-org-figures", org?.id, org?.summaryYearStart ?? "01-01"],
    queryFn: () => loadOrgFigures(org!),
    enabled: enabled && !!org,
    staleTime: 60_000,
    retry: false,
  });
}
