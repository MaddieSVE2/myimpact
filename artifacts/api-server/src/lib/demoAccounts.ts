/**
 * Demo personas and seeded accounts. None of these is a real inbox or a real
 * person's device, so every job that emails or nudges users filters them out.
 * The addresses sit on domains we do not own, which makes a stray send worse
 * than a bounce: it could reach a stranger.
 */

// Shared sign-ins used in demos and screenshots. Mirror of PERSONA_ACCOUNTS in
// routes/auth.ts plus the seeded demo user.
const PERSONA_EMAILS = new Set<string>([
  "demo@demo.org",
  "volunteer@volunteer.org",
  "student@student.org",
  "carer@carer.org",
  "veteran@veteran.org",
  "apprentice@apprentice.org",
  "jobseeker@jobseeker.org",
  "organisation@organisation.org",
  "university@university.org",
]);

/**
 * Accounts created by scripts/seed-demo.ts to fill the demo organisations
 * (the Demo Organisation's survey respondents and My Impact University's
 * students). Matched by pattern, so the seed can add more without a list.
 */
export function isSyntheticSeedEmail(email: string): boolean {
  const e = email.toLowerCase();
  return (
    e.startsWith("synth-member-") ||
    e.startsWith("uni-synth-") ||
    e.endsWith("@demo-organisation.org") ||
    e.endsWith("@myimpact-university.org")
  );
}

/** Demo personas and seeded accounts: never real inboxes, never emailed. */
export function isDemoOrSyntheticEmail(email: string): boolean {
  return PERSONA_EMAILS.has(email.toLowerCase()) || isSyntheticSeedEmail(email);
}
