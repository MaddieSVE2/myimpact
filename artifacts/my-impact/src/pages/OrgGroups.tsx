import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Users } from "lucide-react";
import { NoIndexMeta } from "@/components/PageMeta";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "@/lib/org-export";
import { groupsApi, useInvalidateGroups, useReportGroups, type ManagedGroup } from "@/lib/org-groups";

interface OrgMember {
  userId: string;
  name: string;
  email: string;
}

/** Every active member of the manager's organisation (the member list is paged). */
function useOrgMembers(enabled: boolean) {
  return useQuery<OrgMember[]>({
    queryKey: ["org-active-members-all"],
    enabled,
    queryFn: async () => {
      const all: OrgMember[] = [];
      for (let page = 1; page <= 20; page++) {
        const res = await fetch(`${BASE}/api/org/my/members?status=active&pageSize=100&page=${page}`, { credentials: "include" });
        if (!res.ok) throw new Error("Could not load members");
        const data: { members: OrgMember[]; totalPages: number } = await res.json();
        all.push(...data.members);
        if (page >= data.totalPages) break;
      }
      return all;
    },
  });
}

function GroupMembers({ group, orgMembers }: { group: ManagedGroup; orgMembers: OrgMember[] }) {
  const { toast } = useToast();
  const invalidate = useInvalidateGroups();
  const membersQuery = useQuery({ queryKey: ["org-group-members", group.id], queryFn: () => groupsApi.members(group.id) });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const members = membersQuery.data?.members ?? [];
  const inGroup = new Set(members.map((m) => m.userId));
  const candidates = orgMembers
    .filter((m) => !inGroup.has(m.userId))
    .filter((m) => !search.trim() || `${m.name} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 8);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      await membersQuery.refetch();
      invalidate();
      toast({ title: done });
    } catch (err) {
      toast({ title: "Could not update the group", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl bg-muted/30 p-4 space-y-4">
      {membersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody is in this group yet.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label={`Members of ${group.name}`}>
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {m.displayName ?? m.email}
                  {m.role === "lead" && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Lead</span>}
                </p>
                {m.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => groupsApi.setRole(group.id, m.userId, m.role === "lead" ? "member" : "lead"),
                      m.role === "lead" ? "No longer a lead" : "Made a lead",
                    )
                  }
                  className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-white disabled:opacity-60"
                >
                  {m.role === "lead" ? "Remove as lead" : "Make lead"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => groupsApi.removeMember(group.id, m.userId), "Removed from the group")}
                  aria-label={`Remove ${m.displayName ?? m.email} from ${group.name}`}
                  className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-red-700 hover:bg-white disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!group.archivedAt && (
        <div>
          <label htmlFor={`add-member-${group.id}`} className="block text-xs font-medium text-foreground mb-1">
            Add someone from your organisation
          </label>
          <input
            id={`add-member-${group.id}`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white"
          />
          {search.trim() && (
            <ul className="mt-2 space-y-1">
              {candidates.length === 0 ? (
                <li className="text-xs text-muted-foreground">No members match.</li>
              ) : (
                candidates.map((c) => (
                  <li key={c.userId}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => groupsApi.addMember(group.id, c.userId), `Added ${c.name}`).then(() => setSearch(""))}
                      className="w-full text-left px-3 py-2 rounded-lg bg-white border border-border text-sm hover:bg-muted/40 disabled:opacity-60"
                    >
                      {c.name} <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GroupRow({ group, orgMembers }: { group: ManagedGroup; orgMembers: OrgMember[] }) {
  const { toast } = useToast();
  const invalidate = useInvalidateGroups();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(group.name), [group.name]);

  const update = async (changes: Parameters<typeof groupsApi.update>[1], done: string) => {
    setBusy(true);
    try {
      await groupsApi.update(group.id, changes);
      invalidate();
      setRenaming(false);
      toast({ title: done });
    } catch (err) {
      toast({ title: "Could not update the group", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="bg-white border border-border rounded-2xl p-4 sm:p-5" data-testid="row-org-group">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void update({ name }, "Group renamed");
              }}
            >
              <label htmlFor={`rename-${group.id}`} className="sr-only">Group name</label>
              <input
                id={`rename-${group.id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="border border-border rounded-lg px-3 py-1.5 text-sm"
                autoFocus
              />
              <button type="submit" disabled={busy || !name.trim()} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-60">Save</button>
              <button type="button" onClick={() => { setRenaming(false); setName(group.name); }} className="px-3 py-1.5 rounded-lg border border-border text-xs">Cancel</button>
            </form>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {group.name}
              {group.archivedAt && <span className="ml-2 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">Archived</span>}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
            {group.leadCount > 0 ? `, ${group.leadCount} ${group.leadCount === 1 ? "lead" : "leads"}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/org/dashboard?groupId=${encodeURIComponent(group.id)}`} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40">
            View report
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40"
          >
            {open ? "Hide members" : "Members"}
          </button>
          {!renaming && !group.archivedAt && (
            <button type="button" onClick={() => setRenaming(true)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40">
              Rename
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              update(
                { archived: !group.archivedAt },
                group.archivedAt ? "Group restored" : "Group archived. Its activities stay in reports.",
              )
            }
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 disabled:opacity-60"
          >
            {group.archivedAt ? "Restore" : "Archive"}
          </button>
        </div>
      </div>
      {open && <GroupMembers group={group} orgMembers={orgMembers} />}
    </li>
  );
}

export default function OrgGroups() {
  const { data, isLoading } = useReportGroups();
  const canManage = data?.canManage === true;
  const { data: orgMembers = [] } = useOrgMembers(canManage);
  const invalidate = useInvalidateGroups();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const groups = useMemo(
    () => [...(data?.groups ?? [])].sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt))),
    [data?.groups],
  );

  if (isLoading) return null;
  if (!canManage) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <NoIndexMeta />
        <p className="text-base font-semibold mb-2">Manager access required</p>
        <p className="text-sm text-muted-foreground">Only organisation managers can manage groups.</p>
        <Link href="/org" className="text-primary text-sm underline mt-3 inline-block">Back to your organisation page</Link>
      </div>
    );
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await groupsApi.create(name, description.trim() || undefined);
      invalidate();
      toast({ title: `Created ${name.trim()}` });
      setName("");
      setDescription("");
    } catch (err) {
      toast({ title: "Could not create the group", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <NoIndexMeta />
      <div>
        <Link href="/org" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to your organisation
        </Link>
        <h1 className="text-2xl font-display font-bold text-foreground mt-2 flex items-center gap-2">
          <Users className="w-6 h-6" aria-hidden="true" /> Groups
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Clubs, teams or projects inside your organisation. Members can be in several groups and count each activity for one of them, so
          every group can report its own impact. Group leads see their group's report and members.
        </p>
      </div>

      <form onSubmit={create} className="bg-white border border-border rounded-2xl p-4 sm:p-5 space-y-3" aria-label="Create a group">
        <div>
          <label htmlFor="new-group-name" className="block text-sm font-medium text-foreground mb-1">New group</label>
          <input
            id="new-group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="For example, Football club"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-group-description" className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
          <input
            id="new-group-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Create group
        </button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups yet. Create one above, then add people or let members join from their organisation page.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <GroupRow key={g.id} group={g} orgMembers={orgMembers} />
          ))}
        </ul>
      )}
    </div>
  );
}
