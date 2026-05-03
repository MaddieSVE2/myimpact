/**
 * Calendar provider integration via Replit Connectors.
 *
 * We deliberately do not handle raw OAuth client secrets in this codebase.
 * Instead we proxy through Replit's Connectors API, which holds the OAuth
 * token for the connected Google / Microsoft account and refreshes it
 * automatically.
 *
 * Per-user OAuth: this module reads/writes through the connector that the
 * Replit account owner has connected. Each MyImpact user still gets their
 * own `calendar_sources` row that controls *which* calendar to read from
 * and *what filter text* to apply, so users see their own filtered view of
 * upcoming events. Token columns on `calendar_sources` exist for a future
 * migration to true per-user OAuth (e.g. a deployment with first-party
 * Google / Microsoft credentials).
 */

export type CalendarProvider = "google" | "microsoft";

export interface CalendarListEntry {
  id: string;
  name: string;
  primary: boolean;
}

export interface ProviderEvent {
  externalId: string;
  title: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
}

interface ConnectorSettings {
  access_token?: string;
  oauth?: { credentials?: { access_token?: string; refresh_token?: string } };
  expires_at?: string;
  email?: string;
  account?: { email?: string };
}

interface ConnectorResponse {
  items?: Array<{ settings?: ConnectorSettings }>;
}

const CONNECTOR_NAMES: Record<CalendarProvider, string> = {
  google: "google-calendar",
  microsoft: "outlook",
};

/**
 * Fetch a fresh access token for the given provider via the Replit
 * Connectors proxy. Throws when the connector is not connected — the caller
 * should surface this to the user as "calendar sync isn't connected yet".
 */
async function fetchConnectorToken(
  provider: CalendarProvider,
): Promise<{ accessToken: string; accountEmail: string | null }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken =
    process.env.REPL_IDENTITY
      ? `repl ${process.env.REPL_IDENTITY}`
      : process.env.WEB_REPL_RENEWAL
        ? `depl ${process.env.WEB_REPL_RENEWAL}`
        : null;

  if (!hostname || !xReplitToken) {
    throw new ConnectorNotConfiguredError(
      "Calendar connector is not configured on this server.",
    );
  }

  const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${CONNECTOR_NAMES[provider]}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      X_REPLIT_TOKEN: xReplitToken,
    },
  });

  if (!res.ok) {
    throw new ConnectorNotConfiguredError(
      `Calendar connector returned ${res.status}.`,
    );
  }

  const json = (await res.json()) as ConnectorResponse;
  const item = json.items?.[0];
  const settings = item?.settings;
  const accessToken =
    settings?.access_token ?? settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new ConnectorNotConfiguredError(
      `${provider === "google" ? "Google" : "Microsoft"} calendar isn't connected yet.`,
    );
  }

  return {
    accessToken,
    accountEmail: settings?.email ?? settings?.account?.email ?? null,
  };
}

export class ConnectorNotConfiguredError extends Error {
  readonly code = "CONNECTOR_NOT_CONFIGURED" as const;
}

export async function isConnectorReady(provider: CalendarProvider): Promise<{
  connected: boolean;
  accountEmail: string | null;
  reason?: string;
}> {
  try {
    const { accountEmail } = await fetchConnectorToken(provider);
    return { connected: true, accountEmail };
  } catch (err) {
    return {
      connected: false,
      accountEmail: null,
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* ─────────────────────────── Google Calendar ─────────────────────────── */

interface GoogleCalendarListResp {
  items?: Array<{ id: string; summary?: string; primary?: boolean }>;
}

interface GoogleEventsResp {
  items?: Array<{
    id: string;
    summary?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
  }>;
}

async function listGoogleCalendars(token: string): Promise<CalendarListEntry[]> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50&minAccessRole=reader",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Google calendarList failed: ${res.status}`);
  const json = (await res.json()) as GoogleCalendarListResp;
  return (json.items ?? []).map((c) => ({
    id: c.id,
    name: c.summary ?? c.id,
    primary: !!c.primary,
  }));
}

async function fetchGoogleEvents(
  token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ProviderEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Google events failed: ${res.status}`);
  const json = (await res.json()) as GoogleEventsResp;
  const out: ProviderEvent[] = [];
  for (const item of json.items ?? []) {
    if (item.status === "cancelled") continue;
    const startStr = item.start?.dateTime ?? item.start?.date;
    const endStr = item.end?.dateTime ?? item.end?.date;
    if (!startStr || !endStr) continue;
    const startsAt = new Date(startStr);
    const endsAt = new Date(endStr);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    out.push({
      externalId: item.id,
      title: item.summary?.trim() || "(no title)",
      location: item.location ?? null,
      startsAt,
      endsAt,
    });
  }
  return out;
}

/* ───────────────────────────── Outlook ───────────────────────────────── */

interface MsCalendarListResp {
  value?: Array<{ id: string; name?: string; isDefaultCalendar?: boolean }>;
}

interface MsEventsResp {
  value?: Array<{
    id: string;
    subject?: string;
    location?: { displayName?: string };
    start?: { dateTime?: string; timeZone?: string };
    end?: { dateTime?: string; timeZone?: string };
    isCancelled?: boolean;
  }>;
}

async function listMicrosoftCalendars(token: string): Promise<CalendarListEntry[]> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/calendars?$top=50",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Microsoft calendars failed: ${res.status}`);
  const json = (await res.json()) as MsCalendarListResp;
  return (json.value ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? c.id,
    primary: !!c.isDefaultCalendar,
  }));
}

async function fetchMicrosoftEvents(
  token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ProviderEvent[]> {
  const params = new URLSearchParams({
    startDateTime: timeMin.toISOString(),
    endDateTime: timeMax.toISOString(),
    $top: "250",
    $orderby: "start/dateTime",
  });
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    },
  );
  if (!res.ok) throw new Error(`Microsoft events failed: ${res.status}`);
  const json = (await res.json()) as MsEventsResp;
  const out: ProviderEvent[] = [];
  for (const item of json.value ?? []) {
    if (item.isCancelled) continue;
    const startStr = item.start?.dateTime;
    const endStr = item.end?.dateTime;
    if (!startStr || !endStr) continue;
    // Graph returns naive ISO strings without Z when timeZone is set;
    // append Z because we asked for UTC via the Prefer header.
    const normalize = (s: string) => (s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
    const startsAt = new Date(normalize(startStr));
    const endsAt = new Date(normalize(endStr));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    out.push({
      externalId: item.id,
      title: item.subject?.trim() || "(no title)",
      location: item.location?.displayName ?? null,
      startsAt,
      endsAt,
    });
  }
  return out;
}

/* ─────────────────────────── Public surface ──────────────────────────── */

export async function listCalendarsFor(
  provider: CalendarProvider,
): Promise<{ accountEmail: string | null; calendars: CalendarListEntry[] }> {
  const { accessToken, accountEmail } = await fetchConnectorToken(provider);
  const calendars =
    provider === "google"
      ? await listGoogleCalendars(accessToken)
      : await listMicrosoftCalendars(accessToken);
  return { accountEmail, calendars };
}

/**
 * Verify that `calendarId` is actually present in the connector account's
 * calendar list. This prevents a client from supplying an arbitrary calendar
 * ID that does not belong to the connected account and using the shared
 * connector token to read events from a calendar it was never granted access
 * to (or a calendar owned by a different user on the same deployment).
 *
 * Returns the matching calendar entry when valid, or null when the ID is not
 * found in the connector's calendar list.
 */
export async function validateCalendarId(
  provider: CalendarProvider,
  calendarId: string,
): Promise<CalendarListEntry | null> {
  const { accessToken } = await fetchConnectorToken(provider);
  const calendars =
    provider === "google"
      ? await listGoogleCalendars(accessToken)
      : await listMicrosoftCalendars(accessToken);
  return calendars.find((c) => c.id === calendarId) ?? null;
}

/**
 * Fetch the primary calendar for the connected account.
 *
 * This is the ONLY calendar that the server will allow users to connect to
 * via the shared deployment-wide connector. We do not expose the full
 * calendar list to clients — doing so would let any authenticated user
 * enumerate all calendars on the connected account and then inject an
 * arbitrary calendar ID to read events that do not belong to them.
 */
export async function getPrimaryCalendar(
  provider: CalendarProvider,
): Promise<{ calendar: CalendarListEntry; accountEmail: string | null }> {
  const { accessToken, accountEmail } = await fetchConnectorToken(provider);
  const calendars =
    provider === "google"
      ? await listGoogleCalendars(accessToken)
      : await listMicrosoftCalendars(accessToken);

  const primary = calendars.find((c) => c.primary) ?? calendars[0];
  if (!primary) {
    throw new ConnectorNotConfiguredError(
      `No calendars found on the connected ${provider} account.`,
    );
  }
  return { calendar: primary, accountEmail };
}

/**
 * Verify that the requesting user's email matches the connector account's email.
 *
 * The calendar connector is a deployment-wide shared credential that represents
 * ONE Google / Microsoft account. Only the user whose application email matches
 * the connected account's email may use the calendar feature. Every other user
 * gets a 403, because they would be reading the connector owner's calendar data
 * rather than their own.
 *
 * Throws CalendarOwnershipError when the emails do not match or the connector
 * account email cannot be determined.
 */
export class CalendarOwnershipError extends Error {
  readonly code = "CALENDAR_OWNERSHIP_REQUIRED" as const;
}

export async function assertCalendarOwnership(
  userEmail: string,
  provider: CalendarProvider,
): Promise<void> {
  const { accountEmail } = await fetchConnectorToken(provider);
  if (!accountEmail) {
    throw new CalendarOwnershipError(
      "Calendar access is restricted to the owner of the connected account.",
    );
  }
  if (accountEmail.toLowerCase() !== userEmail.toLowerCase()) {
    throw new CalendarOwnershipError(
      "Calendar access is restricted to the owner of the connected account.",
    );
  }
}

export async function fetchEventsForSource(
  provider: CalendarProvider,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ProviderEvent[]> {
  const { accessToken } = await fetchConnectorToken(provider);
  return provider === "google"
    ? fetchGoogleEvents(accessToken, calendarId, timeMin, timeMax)
    : fetchMicrosoftEvents(accessToken, calendarId, timeMin, timeMax);
}

export function applyTitleFilter(
  events: ProviderEvent[],
  filterText: string | null,
): ProviderEvent[] {
  if (!filterText || !filterText.trim()) return events;
  const terms = filterText
    .toLowerCase()
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return events;
  return events.filter((e) => {
    const hay = e.title.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
}

/**
 * Best-effort revocation of the connector's OAuth grant. Replit Connectors
 * don't currently expose a generic "revoke this token" endpoint, so we make
 * a provider-direct revoke call when we have a token. If revocation fails
 * we still consider the local disconnect successful — the user record is
 * removed and we stop syncing.
 */
export async function revokeProviderToken(provider: CalendarProvider): Promise<void> {
  let accessToken: string;
  try {
    const fetched = await fetchConnectorToken(provider);
    accessToken = fetched.accessToken;
  } catch {
    return;
  }

  try {
    if (provider === "google") {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    }
    // Microsoft Graph doesn't offer a per-token revoke endpoint; users can
    // revoke at https://account.live.com/consent/Manage. We surface that URL
    // to the user in the disconnect confirmation.
  } catch {
    // best-effort
  }
}
