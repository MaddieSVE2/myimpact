import { useState } from "react";
import { useGetImpactHistory } from "@workspace/api-client-react";
import { computeBadges, MILESTONES, Badge } from "@/lib/badges";
import { formatCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowLeft, Lock, Share2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import MilestoneShareModal from "@/components/MilestoneShareModal";
import { useAuth } from "@/lib/auth-context";

export default function Milestones() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useGetImpactHistory(
    { userId: user?.id ?? "" },
    { query: { enabled: !!user?.id } }
  );
  const [sharingBadge, setSharingBadge] = useState<Badge | null>(null);

  const records = data?.records ?? [];
  const latest = records[0];
  const isFirstRecord = records.length <= 1;

  const badges = latest
    ? computeBadges({ totalValue: latest.impactResult.totalValue, activityBreakdowns: [] }, isFirstRecord)
    : computeBadges({ totalValue: 0, activityBreakdowns: [] }, false);

  const earnedBadges = badges.filter(b => b.earned);
  const lockedBadges = badges.filter(b => !b.earned);

  const currentTotal = latest?.impactResult.totalValue ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-semibold text-foreground mb-1">My milestones</h1>
        <p className="text-sm text-muted-foreground">
          Earned through your positive contributions. Keep going to unlock more.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : isError ? (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-destructive" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Could not load your milestones. Please refresh.</p>
        </div>
      ) : (
        <>
          {/* Milestone progress strip */}
          <div className="bg-white border border-border rounded-xl p-5 mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Milestone progress</p>
            <div className="space-y-3">
              {[100, 500, 1000, 5000].map(threshold => {
                const reached = currentTotal >= threshold;
                const pct = Math.min(100, (currentTotal / threshold) * 100);
                return (
                  <div key={threshold}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={cn("font-medium", reached ? "text-primary" : "text-muted-foreground")}>
                        {reached ? "✓ " : ""}{formatCurrency(threshold)}
                      </span>
                      <span className="text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: reached ? "#22c55e" : "#F06127" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {!latest && (
              <p className="text-xs text-muted-foreground mt-3">
                <Link href="/wizard/actions" className="text-primary hover:underline">Calculate your impact</Link> to start earning milestones.
              </p>
            )}
          </div>

          {/* Earned milestones */}
          {earnedBadges.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Earned ({earnedBadges.length})</p>
              <div className="grid grid-cols-2 gap-3">
                {earnedBadges.map((badge, i) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.07 }}
                    className="bg-white border border-border rounded-xl p-4 flex flex-col gap-2"
                    style={{ borderTopColor: badge.colour, borderTopWidth: 3 }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0">{badge.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{badge.name}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{badge.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSharingBadge(badge)}
                      className="self-start flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:opacity-90"
                      style={{ backgroundColor: "#e8622a", color: "#ffffff" }}
                    >
                      <Share2 size={12} />
                      Share
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Locked milestones */}
          {lockedBadges.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Locked ({lockedBadges.length})</p>
              <div className="grid grid-cols-2 gap-3">
                {lockedBadges.map(badge => (
                  <div
                    key={badge.id}
                    className="bg-muted/30 border border-border rounded-xl p-4 flex items-start gap-3 opacity-60"
                  >
                    <span className="text-2xl shrink-0 grayscale">{badge.emoji}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-muted-foreground">{badge.name}</p>
                        <Lock className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{badge.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-8">
        <Link href="/history" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to history
        </Link>
      </div>

      {/* Share modal */}
      {sharingBadge && (
        <MilestoneShareModal
          badge={sharingBadge}
          totalValue={currentTotal}
          onClose={() => setSharingBadge(null)}
        />
      )}
    </div>
  );
}
