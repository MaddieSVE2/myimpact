# Org-invited member UX checklist

This document captures the four jobs an org-invited member (e.g. `demo@demo.org`) should be able to do without hunting around, plus the specific places we surface each one. Use this as a smoke-test checklist after any change to the navbar, home page, or org flow.

## The four key jobs

1. **Share my volunteering hours with my employer**: submit activities into the org's totals.
2. **Answer pulse surveys**: respond to the 30-second prompts the org has open.
3. **Take part in challenges**: see active org challenges and contribute to them.
4. **Calculate or update my impact**: kick off the personal wizard.

The order above is the canonical order used in both the home page "Your organisation" panel and the `/org` member view.

## Where each job is surfaced for org members

| Job | Top nav | Home page | `/org` member view |
|---|---|---|---|
| Share with employer | "Share with {Org}" → `/org/submit` | "Your organisation" panel card 1 → `/org/submit` | Card 1 → `/org/submit` |
| Answer pulse | "Pulse" → `/#org-prompts-section` | Panel card 2 + `OrgPromptsSection` survey cards. Disabled state when no pulse is open. | Card 2. Active: link to `/#org-prompts-section`. Inactive: disabled button, "No pulse open right now from {Org}." |
| Challenges | "Challenges" → `/challenges` | Panel card 3 + `OrgPromptsSection` challenge cards. Disabled state when nothing is active. | Card 3. Active: link to `/challenges` (or to the single active challenge wizard). Inactive: disabled button, "No challenges right now from {Org}." |
| Calculate impact | Account dropdown ("Calculate my impact") + orange "Calculate" CTA | Panel card 4 → `/wizard/actions` | Card 4 → `/wizard/actions` |

## Conditional pulse / challenge state

Both the home panel and the `/org` member view fetch `/api/org/prompts` and render:

- **Active**: copy mentions the count and link/button is live.
- **Inactive (none open)**: copy reads "No pulse open right now from {Org}" or "No challenges right now from {Org}", and the CTA is rendered as a disabled, non-clickable button so members don't bounce off to an empty section.

## Invite round-trip sanity check

A fresh user clicking an invite link must land on the join confirmation, not on `/history`.

1. Open `/org?orgId=DEMO_ORG_ID&inviteCode=DEMO-0000` while logged out.
2. The "You've been invited" panel renders with a "Log in to join" button pointing at `/login?next=/org?orgId=...&inviteCode=...` (URL-encoded).
3. Submit your email. The magic-link request POSTs `returnTo` to the API.
4. The email link contains `&returnTo=/org?orgId=...&inviteCode=...`.
5. `AuthConfirm` reads `returnTo`, validates it starts with `/`, and redirects there after sign-in.
6. Brand-new accounts hit `/profile/setup?returnTo=...` first; setup must forward `returnTo` after save.
7. The user lands on `/org?orgId=...&inviteCode=...`, which the join confirmation flow consumes.

If a user lands on `/history`, the most likely cause is a broken `returnTo` somewhere in steps 3-6 (e.g. a new screen forgot to forward it).

## Member-facing copy rules

- No em dashes (`—`) in any user-facing string. Use commas, full stops, or parentheses instead. Em dashes inside JSX/JS comments are fine.
- Plain English: tell members what is being submitted, when it goes, who sees it, and what value it has. Avoid jargon ("aggregate", "social value engine", etc.) in member-facing surfaces.
- Disabled CTAs must explain *why* (visible inline copy + disabled button state), not just look greyed out.

## Demo-data warnings

Demo-data warnings (`Demo data, actions disabled`) live inside `DemoPulseSurveysSection` and other `Demo*` components. Real org members must never see them, so any new caller of `PulseSurveysSection` (etc.) must omit `isDemoOrg` (or pass `false`) unless the user is explicitly inside the demo org dashboard. The `OrgPortal` member view does not render `PulseSurveysSection` at all, which is the safe default.

## Manual smoke test

1. Sign in as `demo@demo.org`.
2. Confirm the top nav shows: My Impact · Share with Demo Org · Challenges · Pulse.
3. On `/`, confirm the "Your organisation" panel renders four cards in this order: Share, Open a pulse, Active challenges, Calculate or update my impact.
4. With no open pulse / challenge, confirm both panel cards (home and `/org`) show the "No ... right now" copy and a disabled button.
5. Open `/org` and confirm the same four cards appear in the same order, again with conditional pulse/challenge states.
6. Click each card. Confirm no dead-ends, no `/history` redirects, no demo-data warnings.
7. Open `/journal` and `/challenges`. Confirm the compact "For your organisation" strip's *Answer* link jumps to the home pulse section (not just `/`).
8. Trigger an invite round-trip with a fresh email and confirm landing on the join confirmation.
