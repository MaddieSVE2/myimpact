/**
 * An organisation can limit joining to people with an email at one or more
 * domains. They're kept together in organisations.allowed_domain as
 * "a.org, b.org", so a single domain reads exactly as it always has.
 */

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const MAX_ALLOWED_DOMAINS = 10;

/** Splits what a manager typed on commas, semicolons or spaces, dropping any "@". */
export function splitDomains(input: string): string[] {
  const domains = input.split(/[\s,;]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  return [...new Set(domains)];
}

export function parseAllowedDomains(stored: string | null | undefined): string[] {
  return stored ? splitDomains(stored) : [];
}

/** The first entry that isn't a domain, if any. */
export function invalidDomain(domains: string[]): string | undefined {
  return domains.find((d) => !DOMAIN.test(d));
}

export function emailMatchesDomains(email: string, domains: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domains.includes(domain);
}

/** "@a.org", "@a.org or @b.org", "@a.org, @b.org or @c.org" */
export function describeDomains(domains: string[]): string {
  const at = domains.map((d) => `@${d}`);
  return at.length <= 1 ? (at[0] ?? "") : `${at.slice(0, -1).join(", ")} or ${at[at.length - 1]}`;
}
