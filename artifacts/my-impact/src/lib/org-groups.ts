/**
 * Organisation groups (clubs, teams) on the client. A member can be in
 * several groups; each activity counts for at most one. Server rules live in
 * artifacts/api-server/src/lib/orgGroups.ts and orgReportScope.ts.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BASE } from "@/lib/org-export";

export interface MyGroup {
  id: string;
  name: string;
  description: string | null;
  /** null when the member has not joined. */
  role: "member" | "lead" | null;
  joined: boolean;
}

export interface ManagedGroup {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  memberCount: number;
  leadCount: number;
  iLead: boolean;
}

/** The value a report filter uses for activities counted for no group. */
export const NO_GROUP = "none";

async function send(path: string, method: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Please try again.");
  return data;
}

/** The organisation's active groups, each marked joined or not, for the signed-in member. */
export function useMyGroups(enabled = true) {
  return useQuery<MyGroup[]>({
    queryKey: ["org-my-groups"],
    queryFn: async () => ((await send("/org/my/groups", "GET")) as { groups: MyGroup[] }).groups,
    enabled,
    staleTime: 60_000,
  });
}

/** Groups the member has joined (the ones an activity can count for). */
export function joinedGroups(groups: MyGroup[] | undefined): MyGroup[] {
  return (groups ?? []).filter((g) => g.joined);
}

/**
 * Groups for reports: every group for managers, only their own for leads.
 * null when the person can see no reports (a plain member).
 */
export function useReportGroups(enabled = true) {
  return useQuery<{ groups: ManagedGroup[]; canManage: boolean } | null>({
    queryKey: ["org-report-groups"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/org/groups`, { credentials: "include" });
      if (res.status === 403 || res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load groups");
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

export const joinGroup = (groupId: string) => send(`/org/my/groups/${encodeURIComponent(groupId)}/join`, "POST");
export const leaveGroup = (groupId: string) => send(`/org/my/groups/${encodeURIComponent(groupId)}/leave`, "POST");

/** Sets which group an activity counts for (null = no group). */
export const setRecordGroup = (recordId: string | number, groupId: string | null) =>
  send(`/org/my/records/${encodeURIComponent(String(recordId))}/group`, "PATCH", { groupId });

/** Remembers which group a regular activity's occurrences count for. */
export const setTemplateGroup = (templateId: string | number, groupId: string | null) =>
  send(`/org/my/templates/${encodeURIComponent(String(templateId))}/group`, "PATCH", { groupId });

export const groupsApi = {
  create: (name: string, description?: string) => send("/org/groups", "POST", { name, description }),
  update: (groupId: string, changes: { name?: string; description?: string | null; archived?: boolean }) =>
    send(`/org/groups/${encodeURIComponent(groupId)}`, "PATCH", changes),
  members: (groupId: string) =>
    send(`/org/groups/${encodeURIComponent(groupId)}/members`, "GET") as Promise<{
      members: { userId: string; displayName: string | null; email?: string; role: "member" | "lead"; joinedAt: string }[];
    }>,
  addMember: (groupId: string, userId: string, role: "member" | "lead" = "member") =>
    send(`/org/groups/${encodeURIComponent(groupId)}/members`, "POST", { userId, role }),
  setRole: (groupId: string, userId: string, role: "member" | "lead") =>
    send(`/org/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, "PATCH", { role }),
  removeMember: (groupId: string, userId: string) =>
    send(`/org/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, "DELETE"),
};

export interface GroupMembership {
  userId: string;
  groupId: string;
  groupName: string;
  role: "member" | "lead";
}

/** Every member's active groups, by user id (managers only; for the Members list). */
export function useGroupMemberships(enabled = true) {
  return useQuery<Map<string, GroupMembership[]>>({
    queryKey: ["org-group-memberships"],
    enabled,
    queryFn: async () => {
      const { memberships } = (await send("/org/groups/memberships", "GET")) as { memberships: GroupMembership[] };
      const byUser = new Map<string, GroupMembership[]>();
      for (const m of memberships) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m]);
      return byUser;
    },
  });
}

/** Refreshes everything that depends on group membership or the group filter. */
export function useInvalidateGroups() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["org-my-groups"] });
    void queryClient.invalidateQueries({ queryKey: ["org-report-groups"] });
    void queryClient.invalidateQueries({ queryKey: ["org-group-memberships"] });
  };
}

function readGroupParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("groupId") || null;
}

/**
 * The report group filter: null = everything this person may see (the whole
 * organisation for managers, their own groups for leads), a group id, or
 * NO_GROUP. Kept in the page address (?groupId=) so links and reloads keep it.
 */
export function useGroupFilter(): [string | null, (groupId: string | null) => void] {
  const [groupId, setState] = useState<string | null>(readGroupParam);
  const setGroupId = (next: string | null) => {
    setState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("groupId", next);
    else url.searchParams.delete("groupId");
    window.history.replaceState(window.history.state, "", url);
  };
  return [groupId, setGroupId];
}

/** Adds the group filter to an API path or page link. */
export function withGroup(path: string, groupId: string | null): string {
  if (!groupId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}groupId=${encodeURIComponent(groupId)}`;
}

/**
 * Who may open the organisation's report pages: managers, and group leads
 * (for their own groups). `loading` is true until that is known.
 */
export function useReportAccess(inOrg: boolean, isManager: boolean) {
  const { data, isLoading } = useReportGroups(inOrg);
  const groups = data?.groups ?? [];
  const isLead = !isManager && groups.length > 0;
  return {
    canView: isManager || isLead,
    isLead,
    groups,
    loading: inOrg && !isManager && isLoading,
  };
}
