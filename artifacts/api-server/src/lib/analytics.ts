import { db, analyticsEventsTable } from "@workspace/db";

/**
 * Fixed enum of named analytics events. Adding a new event MUST also be
 * documented in `artifacts/api-server/src/lib/ANALYTICS.md` so the
 * funnel/dashboard owners can find it.
 */
export const ANALYTICS_EVENTS = [
  "page_view",
  "signup_complete",
  "wizard_step_complete",
  "first_record_logged",
  "milestone_earned",
  "sidekick_message_sent",
  "share_click",
  "public_profile_view",
  "org_invite_accepted",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsSurface = "member" | "org";

export interface TrackEventOptions {
  eventName: AnalyticsEventName;
  userId?: string | null;
  surface?: AnalyticsSurface;
  props?: Record<string, unknown> | null;
}

/**
 * Server-side analytics insert. Always non-blocking: failures are logged but
 * never thrown so analytics can never affect the user-facing request.
 */
export async function trackServerEvent(opts: TrackEventOptions): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      eventName: opts.eventName,
      userId: opts.userId ?? null,
      surface: opts.surface ?? "member",
      props: opts.props ?? null,
    });
  } catch (err) {
    console.error("[analytics] failed to track", opts.eventName, err);
  }
}

export function isValidEventName(name: unknown): name is AnalyticsEventName {
  return typeof name === "string" && (ANALYTICS_EVENTS as readonly string[]).includes(name);
}
