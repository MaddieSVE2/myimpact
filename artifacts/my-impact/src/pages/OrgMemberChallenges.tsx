import { Link } from "wouter";
import { Trophy, AlertCircle, Flag, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useMyOrg } from "@/lib/org-export";
import { BASE } from "@/lib/org-export";

interface OrgChallenge {
  id: string;
  name: string;
  description: string | null;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  orgId: string | null;
  participantCount: number;
  progressTotal: number;
  progressPercent: number;
  myContribution: number;
  isEnrolled: boolean;
  hasEnded: boolean;
  isActive: boolean;
}

function formatTarget(c: OrgChallenge): string {
  if (c.goalType === "social_value") return `£${c.target.toLocaleString("en-GB")}`;
  return `${c.target.toLocaleString("en-GB")} hrs`;
}

function formatProgress(c: OrgChallenge): string {
  if (c.goalType === "social_value") return `£${Math.round(c.progressTotal).toLocaleString("en-GB")}`;
  return `${Math.round(c.progressTotal).toLocaleString("en-GB")} hrs`;
}

function formatContrib(c: OrgChallenge): string {
  if (c.goalType === "social_value") return `£${Math.round(c.myContribution).toLocaleString("en-GB")}`;
  return `${Math.round(c.myContribution).toLocaleString("en-GB")} hrs`;
}

function daysLeft(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000));
}

function ChallengeCard({ c, orgName }: { c: OrgChallenge; orgName: string }) {
  const pct = Math.min(100, c.progressPercent);
  const days = daysLeft(c.endDate);
  const hasMyContrib = c.myContribution > 0;

  return (
    <div
      className={`bg-white border rounded-2xl shadow-sm p-5 ${c.hasEnded ? "border-border opacity-70" : "border-primary/30"}`}
      data-testid={`member-challenge-card-${c.id}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Flag className="w-4 h-4 text-primary shrink-0" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-primary">
              {c.hasEnded ? "Challenge ended" : "Active challenge"}
            </p>
            {!c.hasEnded && (
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
          <p className="text-xs text-muted-foreground">{c.participantCount} {c.participantCount === 1 ? "member" : "members"}</p>
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
            className={`h-full rounded-full transition-all ${c.hasEnded ? "bg-muted-foreground/40" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{pct}% complete</span>
          <span>
            {c.hasEnded
              ? `Ended ${new Date(c.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
              : `Ends ${new Date(c.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
            }
          </span>
        </div>
      </div>

      {hasMyContrib && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[12px]">
          <span className="text-muted-foreground">Your contribution</span>
          <span className="font-semibold text-primary tabular-nums">{formatContrib(c)}</span>
        </div>
      )}

      {!c.hasEnded && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[12px] text-muted-foreground">
            Activities you share with {orgName} between{" "}
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
  const orgName = orgData?.org?.name ?? "your organisation";

  const challengesQuery = useQuery<{ challenges: OrgChallenge[] }>({
    queryKey: ["org-member-challenges"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/org`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load challenges");
      return res.json();
    },
    enabled: !!isLoggedIn && isMember,
    retry: false,
  });

  const challenges = challengesQuery.data?.challenges ?? [];
  const active = challenges.filter(c => c.isActive && !c.hasEnded);
  const past = challenges.filter(c => c.hasEnded || !c.isActive);

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
      ) : challenges.length === 0 ? (
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
  );
}
