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
  "ivan.annibal@roseregeneration.co.uk",
];

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
