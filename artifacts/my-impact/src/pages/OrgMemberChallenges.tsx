import { Link } from "wouter";
import { Trophy, AlertCircle, Flag, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useMyOrg } from "@/lib/org-export";
import { BASE } from "@/lib/org-export";

interface ApiChallenge {
  id: string;
  name: string;
  description: string | null;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  orgId: string | null;
  scope: "personal" | "org";
  hasEnded: boolean;
  hasStarted: boolean;
  participantCount: number;
  progressTotal: number;
  progressPercent: number;
  isActive: boolean;
}

function formatTarget(c: ApiChallenge): string {
  if (c.goalType === "social_value") return `£${c.target.toLocaleString("en-GB")}`;
  return `${c.target.toLocaleString("en-GB")} hrs`;
}

function formatProgress(c: ApiChallenge): string {
  if (c.goalType === "social_value") return `£${Math.round(c.progressTotal).toLocaleString("en-GB")}`;
  return `${Math.round(c.progressTotal).toLocaleString("en-GB")} hrs`;
}

function daysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
}

function ChallengeCard({ c, orgName }: { c: ApiChallenge; orgName: string }) {
  const ended = c.hasEnded || new Date(c.endDate) < new Date();
  const pct = Math.min(100, c.progressPercent);
  const days = daysLeft(c.endDate);

  return (
    <div
      className={`bg-white border rounded-2xl shadow-sm p-5 ${ended ? "border-border opacity-70" : "border-primary/30"}`}
      data-testid={`member-challenge-card-${c.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Flag className="w-4 h-4 text-primary shrink-0" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-primary">
              {ended ? "Challenge ended" : "Active challenge"}
            </p>
            {!ended && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {days} {days === 1 ? "day" : "days"} left
              </span>
            )}
          </div>
          <h3 className="text-base font-display font-semibold text-foreground leading-snug">{c.name}</h3>
          {c.description && (
            <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">{c.description}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{orgName}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{c.participantCount} {c.participantCount === 1 ? "member" : "members"}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Team progress</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatProgress(c)} <span className="font-normal text-muted-foreground">of {formatTarget(c)}</span>
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${ended ? "bg-muted-foreground/40" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{pct}% complete</span>
          <span>
            {ended
              ? `Ended ${new Date(c.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
              : `Ends ${new Date(c.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
            }
          </span>
        </div>
      </div>

      {!ended && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-[12px] text-muted-foreground">
            Your activities shared with {orgName} between{" "}
            {new Date(c.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} and{" "}
            {new Date(c.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}{" "}
            count towards this challenge automatically.{" "}
            <Link href="/org/submit" className="text-primary hover:underline font-medium">Log hours</Link>
          </p>
        </div>
      )}
    </div>
  );
}

export default function OrgMemberChallenges() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { data: orgData, isLoading: orgLoading } = useMyOrg();

  const isMember = !!orgData?.org && orgData.org.role !== "manager";
  const orgId = orgData?.org?.id ?? null;
  const orgName = orgData?.org?.name ?? "your organisation";

  const challengesQuery = useQuery<{ challenges: ApiChallenge[] }>({
    queryKey: ["challenges-mine"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/mine`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load challenges");
      return res.json();
    },
    enabled: !!isLoggedIn && isMember,
    retry: false,
  });

  const orgChallenges = (challengesQuery.data?.challenges ?? []).filter(
    c => c.scope === "org" && c.orgId === orgId,
  );

  const active = orgChallenges.filter(c => !c.hasEnded && new Date(c.endDate) >= new Date());
  const past = orgChallenges.filter(c => c.hasEnded || new Date(c.endDate) < new Date());

  if (authLoading || orgLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!orgData?.org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-base font-semibold mb-2">You're not in an organisation yet.</p>
        <Link href="/org" className="text-primary underline">Go to the organisation portal</Link>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-base font-semibold mb-2">This page is for organisation members.</p>
        <Link href="/org/challenges" className="text-primary underline">Go to the manager challenges view</Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-8" data-testid="org-member-challenges-root">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-display font-semibold text-foreground">Challenges</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Team goals set by {orgName}. Your shared activities count towards the team total automatically.
        </p>

        {challengesQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : challengesQuery.isError ? (
          <div className="text-center py-16">
            <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-semibold">Could not load challenges</p>
          </div>
        ) : orgChallenges.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="member-challenges-empty">
            <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold text-foreground mb-1">No challenges yet</p>
            <p className="text-sm">Check back later — {orgName} will post team challenges here when they have one running.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active</h2>
                <div className="space-y-4">
                  {active.map(c => <ChallengeCard key={c.id} c={c} orgName={orgName} />)}
                </div>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Past</h2>
                <div className="space-y-4">
                  {past.map(c => <ChallengeCard key={c.id} c={c} orgName={orgName} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}
