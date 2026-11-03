/** "@a.org", "@a.org or @b.org", "@a.org, @b.org or @c.org" */
export function describeDomains(domains: string[]): string {
  const at = domains.map((d) => `@${d}`);
  return at.length <= 1 ? (at[0] ?? "") : `${at.slice(0, -1).join(", ")} or ${at[at.length - 1]}`;
}
