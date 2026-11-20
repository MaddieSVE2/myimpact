/**
 * Sidekick's instant answers about who can see a person's data.
 *
 * What an organisation sees depends on how it shares data, so the answer is
 * chosen from the person's own membership rather than being one fixed
 * sentence. The facts here mirror the member-facing pages
 * (/org/types/explicit-submission and /org/types/consented-logging) and the
 * server rules in api-server `lib/orgSharing.ts`; keep the three in step.
 */

/** "none" means the person is not in an organisation. */
export type SidekickOrgSharingMode = "none" | "explicit_submission" | "consented_logging";

export function sidekickOrgSharingMode(
  org: { dataSharingMode?: string | null } | null | undefined,
): SidekickOrgSharingMode {
  if (!org) return "none";
  // Organisations without a stored mode are explicit submission.
  return org.dataSharingMode === "consented_logging" ? "consented_logging" : "explicit_submission";
}

// True in every organisation, whatever its sharing mode.
const ALWAYS_SEEN =
  "Managers can also see your name, email address and general area, never your full postcode.";
const NEVER_SHARED =
  "Your journal, notes and reflections are never shared, and survey answers are only ever shown as anonymous totals.";

export function whoCanSeeAnswer(mode: SidekickOrgSharingMode): string {
  if (mode === "consented_logging") {
    return (
      "Your organisation is set up so that the activities you log are shared with it automatically, from the date you agreed to when you joined. " +
      "Its managers, and the lead of any group you are in, can see those activities with your name, their hours and their social value. " +
      "You can withdraw your consent at any time from the organisation page, and new activities stop being shared straight away. " +
      `${ALWAYS_SEEN} ${NEVER_SHARED}`
    );
  }
  if (mode === "explicit_submission") {
    return (
      "Your organisation's managers, and the lead of any group you are in, can see the activities you choose to share with it, with your name, their hours and their social value. " +
      "Activities you have not shared are not shown to them, but they do count towards the organisation's anonymous totals. " +
      `${ALWAYS_SEEN} ${NEVER_SHARED}`
    );
  }
  return (
    "Only you can see your score and activities, unless you choose to share them. " +
    "If you join an organisation on My Impact, what it can see depends on how that organisation is set up."
  );
}

export function dataSharingAnswer(mode: SidekickOrgSharingMode): string {
  const base =
    "Your data is not sold, and it is not used for advertising. The privacy policy lists the services that help us run My Impact.";
  if (mode === "consented_logging") {
    return `${base} Because you belong to an organisation, the activities you log are shared with it while your consent is active. Ask "Who can see my score?" for exactly what it sees.`;
  }
  if (mode === "explicit_submission") {
    return `${base} Because you belong to an organisation, it sees the activities you choose to share with it, and your hours and social value count towards its anonymous totals. Ask "Who can see my score?" for exactly what it sees.`;
  }
  return `${base} Your activities and score are only shown to other people if you choose to share them.`;
}
