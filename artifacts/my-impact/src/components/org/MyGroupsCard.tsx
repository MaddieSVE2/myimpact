import { useState } from "react";
import { Link } from "wouter";
import { Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { joinGroup, leaveGroup, useInvalidateGroups, useMyGroups } from "@/lib/org-groups";

/**
 * The member's view of their organisation's groups: join or leave each one,
 * and, for groups they lead, a link to that group's report. Hidden when the
 * organisation has no groups.
 */
export function MyGroupsCard() {
  const { data: groups } = useMyGroups();
  const invalidate = useInvalidateGroups();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!groups || groups.length === 0) return null;

  const toggle = async (groupId: string, name: string, joined: boolean) => {
    setBusy(groupId);
    try {
      await (joined ? leaveGroup(groupId) : joinGroup(groupId));
      invalidate();
      toast({
        title: joined ? `You left ${name}` : `You joined ${name}`,
        description: joined
          ? "Activities you already counted for it stay in its report."
          : "When you log an activity you can count it for this group.",
      });
    } catch (err) {
      toast({ title: "Could not update your groups", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white border border-border rounded-2xl p-5 sm:p-6 shadow-sm" aria-labelledby="my-groups-heading" data-testid="card-my-groups">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="my-groups-heading" className="text-base font-display font-semibold text-foreground">Your groups</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Join the groups you take part in. Each activity you log counts for one of them, so every group can report what its members do.
      </p>
      <ul className="divide-y divide-border">
        {groups.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {g.name}
                {g.role === "lead" && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Lead</span>
                )}
              </p>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {g.role === "lead" && (
                <Link
                  href={`/org/dashboard?groupId=${encodeURIComponent(g.id)}`}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  View report
                </Link>
              )}
              <button
                type="button"
                onClick={() => toggle(g.id, g.name, g.joined)}
                disabled={busy === g.id}
                aria-pressed={g.joined}
                aria-label={g.joined ? `Leave ${g.name}` : `Join ${g.name}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                  g.joined ? "border border-border text-foreground hover:bg-muted/40" : "bg-primary text-white hover:bg-primary/90"
                }`}
                data-testid={`button-group-${g.joined ? "leave" : "join"}`}
              >
                {g.joined ? "Leave" : "Join"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
