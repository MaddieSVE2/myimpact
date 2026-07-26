// Applies deflation factors when a proxy is used to price a contribution.
//
// Long-horizon proxies (lifetime / multi-year outcomes) must never be applied
// at full value to a single logged contribution — one tutoring session cannot
// claim £79k of lifetime productivity gains. The stored deflation factor
// scales the value to a defensible per-contribution share, and a guardrail
// applies a fallback deflation if a lifetime proxy somehow still carries a
// full-strength factor when matched to a per-session/hour unit.

import type { StoredProxy } from "./proxyStore.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Fallback if an admin resets a lifetime proxy's factor to 1 and the matcher
// pairs it with a small per-contribution unit anyway.
export const LIFETIME_FALLBACK_DEFLATION = 0.001;

const PER_CONTRIBUTION_UNITS = new Set(["hour", "session", "item"]);

export interface DeflatedValuation {
  /** Value per unit after deflation — what the record should store. */
  valuePerUnit: number;
  /** The factor actually applied (1 = no adjustment). */
  appliedFactor: number;
  /** Human-readable explanation shown to the user, or null if unadjusted. */
  note: string | null;
}

const HORIZON_PHRASE: Record<string, string> = {
  lifetime: "a lifetime outcome",
  multi_year: "a multi-year outcome",
  annual: "an annual outcome",
  per_instance: "a one-off outcome",
};

export function deflateProxyValue(proxy: StoredProxy, matchedUnit: string): DeflatedValuation {
  let factor = proxy.deflationFactor;
  if (!(factor > 0) || factor > 1) factor = 1;

  // Guardrail: a lifetime-horizon proxy applied to a per-contribution unit
  // must always be deflated, even if its stored factor says otherwise.
  if (
    proxy.horizon === "lifetime" &&
    factor >= 1 &&
    PER_CONTRIBUTION_UNITS.has(matchedUnit)
  ) {
    factor = LIFETIME_FALLBACK_DEFLATION;
  }

  if (factor >= 1) {
    return { valuePerUnit: round2(proxy.value), appliedFactor: 1, note: null };
  }

  return {
    valuePerUnit: round2(proxy.value * factor),
    appliedFactor: factor,
    note: `Adjusted to reflect one contribution's share of ${HORIZON_PHRASE[proxy.horizon] ?? "a long-term outcome"} (full value £${proxy.value.toLocaleString("en-GB")}, scaled by ×${factor}).`,
  };
}
