/**
 * Privacy-first client analytics helper.
 *
 * Events are POSTed to /api/analytics/track on our own backend. No PII is
 * sent — properties are chosen explicitly at the call site. The full list
 * of event names is fixed below so TypeScript catches typos.
 *
 * To add a new event, edit `ANALYTICS_EVENTS` here AND in the matching
 * server module (`artifacts/api-server/src/lib/analytics.ts`), then update
 * the docs in `artifacts/api-server/src/lib/ANALYTICS.md`.
 */

export const ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  SIGNUP_COMPLETE: "signup_complete",
  WIZARD_STEP_COMPLETE: "wizard_step_complete",
  FIRST_RECORD_LOGGED: "first_record_logged",
  MILESTONE_EARNED: "milestone_earned",
  SIDEKICK_MESSAGE_SENT: "sidekick_message_sent",
  SHARE_CLICK: "share_click",
  PUBLIC_PROFILE_VIEW: "public_profile_view",
  ORG_INVITE_ACCEPTED: "org_invite_accepted",
  ORG_MEMBER_SUBMIT_STARTED: "org_member_submit_started",
  ORG_MEMBER_SUBMIT_COMPLETED: "org_member_submit_completed",
  IMPACT_RECORD_SAVED: "impact_record_saved",
  ORGANISATION_RECORD_SHARED: "organisation_record_shared",
  ORGANISATION_REGISTRATION_COMPLETED: "organisation_registration_completed",
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

function scalarProps(props?: Record<string, unknown>): AnalyticsData | undefined {
  if (!props) return undefined;
  const entries = Object.entries(props).filter(
    (entry): entry is [string, string | number | boolean] =>
      typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Fire-and-forget tracking call. Never throws and never blocks the caller.
 * `props` should never contain PII (no emails, no free text, no URLs with
 * tokens). Stick to enums, counts, and short identifiers.
 */
export function track(event: AnalyticsEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, scalarProps(props));
    fetch(`${BASE}/api/analytics/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ event, props: props ?? {} }),
    }).catch(() => {});
  } catch {
    // Swallow — analytics must never break the app.
  }
}
