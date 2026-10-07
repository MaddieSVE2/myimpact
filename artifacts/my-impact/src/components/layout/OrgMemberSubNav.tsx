import { Link, useLocation } from "wouter";
import { ClipboardList, Trophy, Building2, History, UsersRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { joinedGroups, useMyGroups } from "@/lib/org-groups";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const ORG_SUBNAV_BG = "#1a3a4a";

function useMyOrgMembership(enabled: boolean) {
  return useQuery<{ org: { id: string; name: string; type: string; role?: string; dataSharingMode?: string } | null }>({
    queryKey: ["my-org"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function OrgMemberSubNav() {
  const [location] = useLocation();
  const { isLoggedIn } = useAuth();
  const { data: orgData, isLoading } = useMyOrgMembership(isLoggedIn);

  const inOrg = !isLoading && !!orgData?.org;
  const isOrgManager = inOrg && orgData?.org?.role === "manager";
  const isOrgMemberOnly = inOrg && !isOrgManager;
  const { data: orgGroups } = useMyGroups(isOrgMemberOnly);

  if (!isOrgMemberOnly) return null;

  // Which groups the member is in, or a nudge to join one when the
  // organisation has groups. Nothing when it has none.
  const myGroups = joinedGroups(orgGroups);
  const groupsLabel = myGroups.length > 0
    ? `Your groups: ${myGroups.slice(0, 2).map((g) => g.name).join(", ")}${myGroups.length > 2 ? ` +${myGroups.length - 2}` : ""}`
    : (orgGroups?.length ?? 0) > 0 ? "Join a group" : null;
  // Phones show the bar scrolled to the start, so the link goes first there, shortened.
  const groupsShortLabel = myGroups.length > 0 ? `My groups (${myGroups.length})` : "Join a group";

  const orgName = orgData?.org?.name ?? "My Organisation";
  const pulseActive = location === "/org/member/pulse" || location.startsWith("/org/member/pulse/");

  const items = [
    { href: "/org/member/pulse", label: "Pulse", icon: ClipboardList, testId: "member-subnav-pulse", active: pulseActive },
    { href: "/org/member/challenges", label: "Challenges", icon: Trophy, testId: "member-subnav-challenges", active: location === "/org/member/challenges" || location.startsWith("/org/member/challenges/") },
    ...(orgData?.org?.dataSharingMode === "explicit_submission"
      ? [{ href: "/org/submit/history", label: "Organisation submissions", icon: History, testId: "member-subnav-submissions", active: location === "/org/submit/history" || location.startsWith("/org/submit/history/") }]
      : []),
  ];

  return (
    <div
      data-testid="org-member-subnav"
      className="block sticky top-20 lg:top-0 z-40 w-full border-b border-white/10"
      style={{ background: ORG_SUBNAV_BG }}
      role="navigation"
      aria-label={`${orgName} navigation`}
    >
      <div className="max-w-7xl mx-auto px-4 h-10 flex items-center overflow-x-auto scrollbar-none gap-1">
        <span
          className="hidden lg:inline text-xs font-semibold text-white/50 uppercase tracking-wider shrink-0 mr-3"
          aria-label={`Organisation: ${orgName}`}
        >
          {orgName}
        </span>
        {items.map((item) => {
          const isActive = item.active;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={item.testId}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 " +
                (isActive
                  ? "text-white bg-white/15"
                  : "text-white/60 hover:text-white hover:bg-white/10")
              }
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        {groupsLabel && (
          <Link
            href="/org#your-groups"
            data-testid="member-subnav-groups"
            title={myGroups.length > 0 ? myGroups.map((g) => g.name).join(", ") : undefined}
            className="order-first lg:order-none lg:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 text-white/80 hover:text-white hover:bg-white/10"
          >
            <UsersRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="lg:hidden">{groupsShortLabel}</span>
            <span className="hidden lg:inline">{groupsLabel}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
