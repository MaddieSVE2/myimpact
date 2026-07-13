/**
 * Shared charity-name matching helpers used to verify whether an AI-suggested
 * organisation corresponds to a real entry in an official register (Charity
 * Commission for England & Wales, or OSCR for Scotland).
 *
 * Matching is deliberately conservative: we only confirm a match when the
 * normalised names are equal, or one fully contains the other and the shorter
 * name makes up a large fraction of the longer one. This avoids falsely
 * "verifying" a generic AI suggestion against an unrelated registered charity.
 */

const LEGAL_NOISE = new Set([
  "the",
  "ltd",
  "limited",
  "cic",
  "cio",
  "inc",
  "incorporated",
  "co",
  "company",
]);

/**
 * Normalise a charity / organisation name for comparison: lowercase, expand
 * "&", strip punctuation, drop legal-form noise words, and collapse spaces.
 * Substantive words such as "trust" and "foundation" are kept so distinct
 * organisations are not collapsed together.
 */
export function normalizeCharityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !LEGAL_NOISE.has(w))
    .join(" ")
    .trim();
}

/**
 * Decide whether two organisation names confidently refer to the same body.
 * Returns true on exact normalised equality, or when the shorter normalised
 * name's tokens are all contained (in order, as a contiguous run) within the
 * longer name and make up at least `minRatio` of the longer name's tokens.
 */
export function isConfidentNameMatch(a: string, b: string, minRatio = 0.7): boolean {
  const na = normalizeCharityName(a);
  const nb = normalizeCharityName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = na.split(" ");
  const tb = nb.split(" ");
  const [shortT, longT] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shortT.length < 2) return false;

  // Contiguous-run containment of the shorter token list within the longer one.
  const longJoined = ` ${longT.join(" ")} `;
  const shortJoined = ` ${shortT.join(" ")} `;
  if (!longJoined.includes(shortJoined)) return false;

  return shortT.length / longT.length >= minRatio;
}
