---
name: React number input leading zeros
description: Why type="number" inputs keep leading zeros and the shared NumberInput fix
---

React compares controlled `<input type="number">` values numerically when deciding whether to stomp the DOM, so a DOM value of "0100" is treated as equal to state `100` and the leading zeros stay visible. Normalising state alone does not fix the display.

**Why:** Leading-zero bug ("0100") appeared in every numeric field bound as `value={number}` with `Number(e.target.value)` parsing.

**How to apply:** Use the shared `NumberInput` (my-impact `src/components/ui/number-input.tsx`) instead of raw `<input type="number">`. It keeps local text state, strips leading zeros on change (writing the cleaned value back to `e.target.value` before calling the parent onChange), and skips parent→text sync when the parent value is just the numeric echo of partial input ("" while parent holds 0, "0.", trailing decimals), so clearing and typing "0.5" stay smooth.
