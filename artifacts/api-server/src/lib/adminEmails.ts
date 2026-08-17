/**
 * Single source of truth for the admin allowlist. Used by:
 *   - `routes/admin.ts` to gate admin-only endpoints
 *   - `lib/aiSpendAlert.ts` to choose AI spend-alert email recipients
 *
 * The hard-coded defaults keep the existing team admin without any env
 * config; `ADMIN_EMAILS` (comma-separated) is merged on top so ops can
 * extend the list at deploy time without a code change.
 */

const DEFAULT_ADMIN_EMAILS = [
  "hello@myimpact.uk",
  "maddie@socialvalueengine.com",
  "lorna@socialvalueengine.com",
  "ivan.annibal@roseregeneration.co.uk",
];

/**
 * Recipients for internal admin notification emails (feedback, contact form,
 * charity submissions, org registrations, etc.).
 *
 * hello@myimpact.uk is the primary team inbox.
 * maddie@socialvalueengine.com is actively monitored and acts as a backup
 * so notifications are never silently lost.
 *
 * Override at deploy time with the ADMIN_NOTIFICATION_EMAILS env var
 * (comma-separated list).
 */
export const ADMIN_NOTIFICATION_EMAILS: string[] = (() => {
  const fromEnv = (process.env.ADMIN_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0
    ? fromEnv
    : ["hello@myimpact.uk", "maddie@socialvalueengine.com"];
})();

export function getAdminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]));
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase());
}
