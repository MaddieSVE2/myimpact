import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Trophy, Users, Calendar, Target, ChevronLeft, Loader2, AlertCircle,
  Share2, Copy, Check, LogOut, Trash2, Mail, Crown, Building2, PartyPopper,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ChallengeFull {
  id: string;
  name: string;
  description: string | null;
  goalType: "social_value" | "hours";
  target: number;
  startDate: string;
  endDate: string;
  scope: "personal" | "org";
  inviteCode: string;
  participantCount: number;
  isOwner: boolean;
  isParticipant: boolean;
  hasEnded: boolean;
  hasStarted: boolean;
  endSummarySentAt: string | null;
  orgName: string | null;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  isMe: boolean;
  value: number;
  hours: number;
  contribution: number;
}

interface ChallengeDetailResponse {
  challenge: ChallengeFull;
  progress: { total: number; target: number; percent: number };
  leaderboard: LeaderboardEntry[];
  myContribution: LeaderboardEntry | null;
}

function useChallenge(id: string) {
  return useQuery<ChallengeDetailResponse>({
    queryKey: ["challenge", id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${id}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load challenge");
      return data;
    },
    refetchInterval: 60_000,
  });
}

function formatGoal(goalType: string, value: number): string {
  if (goalType === "hours") return `${Math.round(value).toLocaleString()} hrs`;
  return formatCurrency(value);
}

function dateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function CelebrationCard({ challenge, percent, total }: { challenge: ChallengeFull; percent: number; total: number }) {
  const hit = percent >= 100;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl p-6 text-white relative overflow-hidden"
      style={{ background: hit ? "linear-gradient(135deg, #F06127 0%, #E54B1F 100%)" : "linear-gradient(135deg, #213547 0%, #2d4a5e 100%)" }}
    >
      <div className="absolute top-3 right-3 opacity-20">
        <PartyPopper className="w-20 h-20" aria-hidden="true" />
      </div>
      <div className="relative">
        <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-2">Challenge wrapped</p>
        <h2 className="text-xl font-display font-bold mb-2">
          {hit ? "You smashed it!" : "Thanks for taking part"}
        </h2>
        <p className="text-sm opacity-90 leading-relaxed">
          Together you reached <strong>{formatGoal(challenge.goalType, total)}</strong> of a{" "}
          <strong>{formatGoal(challenge.goalType, challenge.target)}</strong> target, that's <strong>{percent}%</strong>.
        </p>
      </div>
    </motion.div>
  );
}

export default function ChallengeDetail() {
  const [, params] = useRoute<{ id: string }>("/challenges/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useChallenge(id);

  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "sent" | "already">("idle");

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${id}/leave`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to leave");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
      setLocation("/challenges");
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges-mine"] });
      setLocation("/challenges");
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const summaryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/challenges/${id}/send-summary`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          throw Object.assign(new Error("Summary already sent"), { code: "already" });
        }
        throw new Error(data.error ?? "Failed to send summary");
      }
      return data;
    },
    onSuccess: () => {
      setSummaryStatus("sent");
      queryClient.invalidateQueries({ queryKey: ["challenge", id] });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "already") setSummaryStatus("already");
      else setActionError(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
        <AlertCircle className="w-10 h-10 text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{(error as Error)?.message ?? "Could not load this challenge."}</p>
        <div className="flex gap-3">
          <button onClick={() => refetch()} className="text-sm text-primary underline hover:text-primary/80">
            Try again
          </button>
          <Link href="/challenges" className="text-sm text-muted-foreground underline">
            Back to challenges
          </Link>
        </div>
      </div>
    );
  }

  const { challenge, progress, leaderboard, myContribution } = data;
  const inviteUrl = `${window.location.origin}${BASE}/challenges/join?code=${challenge.inviteCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Could not copy link");
    }
  };

  const handleNativeShare = async () => {
    const text = `Join my "${challenge.name}" challenge on My Impact`;
    if ((navigator as { share?: (data: { url: string; text: string }) => Promise<void> }).share) {
      try {
        await (navigator as { share: (data: { url: string; text: string }) => Promise<void> }).share({
          url: inviteUrl,
          text,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/challenges"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        All challenges
      </Link>

      <div className="bg-white border border-border rounded-2xl p-6 mb-5">
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          {challenge.isOwner && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
              <Crown className="w-3 h-3" aria-hidden="true" /> Owner
            </span>
          )}
          {challenge.scope === "org" && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
              <Building2 className="w-3 h-3" aria-hidden="true" />
              {challenge.orgName ?? "Org"}
            </span>
          )}
          {challenge.hasEnded && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              Ended
            </span>
          )}
          {!challenge.hasStarted && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Upcoming
            </span>
          )}
          {challenge.hasStarted && !challenge.hasEnded && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700">
              Active
            </span>
          )}
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-1">{challenge.name}</h1>
        {challenge.description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{challenge.description}</p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground mb-5">
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            {challenge.participantCount} participant{challenge.participantCount === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            {dateLong(challenge.startDate)} → {dateLong(challenge.endDate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            Target {formatGoal(challenge.goalType, challenge.target)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">{formatGoal(challenge.goalType, progress.total)}</span>
            <span className="text-muted-foreground">{progress.percent}% of target</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, progress.percent)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-primary"
            />
          </div>
        </div>
      </div>

      {challenge.hasEnded && (
        <div className="mb-5">
          <CelebrationCard challenge={challenge} percent={progress.percent} total={progress.total} />
        </div>
      )}

      {/* Invite + actions */}
      {challenge.scope === "personal" && (
        <div className="bg-white border border-border rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="w-4 h-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">Invite friends</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Share this link or invite code. One click and they're in.</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-xs font-mono bg-muted/20 truncate"
              onFocus={e => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/30 transition-colors inline-flex items-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleNativeShare}
              className="px-3 py-2 rounded-lg text-white text-sm font-bold inline-flex items-center gap-1.5"
              style={{ background: "#F06127" }}
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              Share
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">Code: <code className="font-mono">{challenge.inviteCode}</code></p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-white border border-border rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">Leaderboard</h3>
          <span className="text-xs text-muted-foreground ml-auto">refreshes every minute</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No participants yet.</p>
        ) : (
          <ol className="space-y-2">
            {leaderboard.map(entry => (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  entry.isMe ? "border-primary/40 bg-orange-50/50" : "border-border bg-white"
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  entry.rank === 1 ? "bg-yellow-100 text-yellow-700"
                  : entry.rank === 2 ? "bg-slate-100 text-slate-600"
                  : entry.rank === 3 ? "bg-amber-100 text-amber-700"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {entry.rank}
                </div>
                <p className="text-sm font-medium text-foreground flex-1 truncate">{entry.displayName}</p>
                <p className="text-sm font-bold text-foreground">{formatGoal(challenge.goalType, entry.contribution)}</p>
              </li>
            ))}
          </ol>
        )}
        {myContribution && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Your contribution: <strong className="text-foreground">{formatGoal(challenge.goalType, myContribution.contribution)}</strong> · ranked #{myContribution.rank} of {leaderboard.length}
          </p>
        )}
      </div>

      {/* Owner / participant actions */}
      <div className="bg-white border border-border rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          {challenge.hasEnded && challenge.isOwner && (
            <button
              onClick={() => summaryMutation.mutate()}
              disabled={summaryMutation.isPending || !!challenge.endSummarySentAt || summaryStatus !== "idle"}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {summaryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              {challenge.endSummarySentAt || summaryStatus !== "idle" ? "Summary email sent" : "Email summary to all"}
            </button>
          )}
          {challenge.isParticipant && !challenge.isOwner && (
            <button
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground border border-border hover:bg-muted/30 disabled:opacity-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave challenge
            </button>
          )}
          {challenge.isOwner && (
            <button
              onClick={() => {
                if (confirm(`Delete "${challenge.name}"? This can't be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          )}
        </div>
        {actionError && (
          <p className="text-xs text-red-600 mt-3">{actionError}</p>
        )}
      </div>
    </div>
  );
}
