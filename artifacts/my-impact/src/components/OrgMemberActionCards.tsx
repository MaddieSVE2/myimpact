import { BadgeCheck, ClipboardList, Sparkles, Trophy } from "lucide-react";
import { Link } from "wouter";
import { BrandedArtwork } from "@/components/BrandedArtwork";
import { ORG_MEMBER_ACTION_ARTWORK } from "@/lib/branded-artwork";

interface OrgMemberActionCardsProps {
  orgName: string;
  sharingMode: "explicit_submission" | "consented_logging";
  pulseCount: number;
  challengeCount: number;
  pulseHref: string;
  challengeHref: string;
  testIdPrefix: "home" | "member";
  onPulseClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

const cardClass =
  "bg-white border border-border rounded-2xl p-5 sm:p-6 flex flex-col shadow-sm";
const artworkClass =
  "w-12 h-12 rounded-xl bg-[var(--brand-cream)] flex items-center justify-center shrink-0";
const imageClass = "w-10 h-10 object-contain";
const buttonClass =
  "inline-flex items-center px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors self-start";
const disabledButtonClass =
  "inline-flex items-center px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold self-start opacity-55 cursor-not-allowed";

function ActionArtwork({
  file,
  fallback,
}: {
  file: string;
  fallback: React.ReactNode;
}) {
  return (
    <BrandedArtwork
      file={file}
      fallback={fallback}
      className={artworkClass}
      imageClassName={imageClass}
    />
  );
}

export function OrgMemberActionCards({
  orgName,
  sharingMode,
  pulseCount,
  challengeCount,
  pulseHref,
  challengeHref,
  testIdPrefix,
  onPulseClick,
}: OrgMemberActionCardsProps) {
  const hasPulse = pulseCount > 0;
  const hasChallenge = challengeCount > 0;
  const usesAutomaticSharing = sharingMode === "consented_logging";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
      <article className={cardClass} data-testid={`${testIdPrefix}-job-share`}>
        <div className="flex items-start gap-3 mb-3">
          <ActionArtwork
            file={ORG_MEMBER_ACTION_ARTWORK.quickLog}
            fallback={<BadgeCheck className="w-6 h-6 text-primary" />}
          />
          <div>
            <h3 className="text-base font-semibold text-foreground">Quick Log an activity</h3>
            <p className="text-xs font-semibold text-primary mt-0.5">Fast personal record</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
          {usesAutomaticSharing
            ? `Quickly record an activity for yourself. After it is saved, it is shared automatically with ${orgName} according to your consent.`
            : <>Quickly record an activity for yourself. After it is saved, use Review &amp; share when offered to share it with {orgName}.</>}
        </p>
        <Link
          href="/quick-log"
          className={buttonClass}
          data-testid={testIdPrefix === "home" ? "home-link-org-submit" : "link-org-submit"}
        >
          Quick Log
        </Link>
      </article>

      <article className={cardClass} data-testid={`${testIdPrefix}-job-pulse`}>
        <div className="flex items-start gap-3 mb-3">
          <ActionArtwork
            file={ORG_MEMBER_ACTION_ARTWORK.pulse}
            fallback={<ClipboardList className="w-6 h-6 text-primary" />}
          />
          <div>
            <h3 className="text-base font-semibold text-foreground">Open a pulse</h3>
            <p className="text-xs font-semibold text-primary mt-0.5">Around 30 seconds</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
          {hasPulse
            ? `${pulseCount} open ${pulseCount === 1 ? "pulse" : "pulses"} from ${orgName}. Anonymous unless the question says otherwise. Your manager only sees the totals.`
            : `No open pulse from ${orgName} right now. We'll show one here as soon as it is live.`}
        </p>
        {hasPulse ? (
          <Link
            href={pulseHref}
            onClick={onPulseClick}
            className={buttonClass}
            data-testid={testIdPrefix === "home" ? "home-link-pulse" : "link-pulse"}
          >
            Open a pulse
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className={disabledButtonClass}
            data-testid={testIdPrefix === "home" ? "home-link-pulse" : "link-pulse"}
          >
            No open pulse
          </button>
        )}
      </article>

      <article className={cardClass} data-testid={`${testIdPrefix}-job-challenges`}>
        <div className="flex items-start gap-3 mb-3">
          <ActionArtwork
            file={ORG_MEMBER_ACTION_ARTWORK.challenges}
            fallback={<Trophy className="w-6 h-6 text-primary" />}
          />
          <div>
            <h3 className="text-base font-semibold text-foreground">Active challenges</h3>
            <p className="text-xs font-semibold text-primary mt-0.5">Join your team</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
          {hasChallenge
            ? `${challengeCount} active ${challengeCount === 1 ? "challenge" : "challenges"} from ${orgName}. Your activity counts towards the team total and leaderboard, where other members can see your name.`
            : `No active challenge from ${orgName} right now. We'll show one here as soon as it is live.`}
        </p>
        {hasChallenge ? (
          <Link
            href={challengeHref}
            className={buttonClass}
            data-testid={testIdPrefix === "home" ? "home-link-challenges" : "link-challenges"}
          >
            See challenges
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className={disabledButtonClass}
            data-testid={testIdPrefix === "home" ? "home-link-challenges" : "link-challenges"}
          >
            No active challenge
          </button>
        )}
      </article>

      <article className={cardClass} data-testid={`${testIdPrefix}-job-calculate`}>
        <div className="flex items-start gap-3 mb-3">
          <ActionArtwork
            file={ORG_MEMBER_ACTION_ARTWORK.impactRecord}
            fallback={<Sparkles className="w-6 h-6 text-primary" />}
          />
          <div>
            <h3 className="text-base font-semibold text-foreground">Build or update my impact record</h3>
            <p className="text-xs font-semibold text-primary mt-0.5">Full guided record</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5 flex-1">
          {usesAutomaticSharing
            ? `Use the guided wizard to add more detail or update a fuller record, including hours and estimated social value. Saved activity is shared automatically with ${orgName} according to your consent.`
            : <>Use the guided wizard to add more detail or update a fuller record, including hours and estimated social value. It stays personal unless you choose Review &amp; share.</>}
        </p>
        <Link
          href="/wizard/actions"
          className={buttonClass}
          data-testid={testIdPrefix === "home" ? "home-link-calculate" : "link-calculate-impact"}
        >
          Open the impact wizard
        </Link>
      </article>
    </div>
  );
}