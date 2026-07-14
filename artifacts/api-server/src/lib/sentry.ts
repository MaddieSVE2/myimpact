import * as Sentry from "@sentry/node";

const DSN = process.env.SENTRY_DSN;
const ENVIRONMENT =
  process.env.SENTRY_ENVIRONMENT ??
  (process.env.NODE_ENV === "production" ? "production" : "preview");
const RELEASE = process.env.SENTRY_RELEASE;
const TRACES_SAMPLE_RATE = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1");

let initialized = false;

const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /AbortError/i,
  /The (?:user|operation) aborted/i,
  /ECONNRESET/i,
  /EPIPE/i,
  /ETIMEDOUT/i,
  /Request aborted/i,
  /socket hang up/i,
];

const BENIGN_HTTP_STATUS = new Set([400, 401, 403, 404, 409, 422, 429]);

function isBenignMessage(message: string | undefined): boolean {
  if (!message) return false;
  return BENIGN_ERROR_PATTERNS.some((re) => re.test(message));
}

// A Sentry DSN looks like: https://<publicKey>@<host>/<projectId>
// Guard against misconfigured values (e.g. an access token pasted into the
// env var) so we never pass them to Sentry.init, which would echo the raw
// value into logs via its "Invalid Sentry Dsn" error.
const DSN_PATTERN = /^https?:\/\/[0-9a-f]+@[a-z0-9.-]+(?::\d+)?\/\d+$/i;

export function initSentry(): boolean {
  if (initialized) return true;
  if (!DSN) return false;
  if (!DSN_PATTERN.test(DSN)) {
    console.warn(
      "[sentry] SENTRY_DSN is not a valid Sentry DSN; error monitoring is disabled. (Value withheld from logs.)"
    );
    return false;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE)
      ? TRACES_SAMPLE_RATE
      : 0.1,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      const err = hint?.originalException as
        | (Error & { status?: number; statusCode?: number })
        | undefined;
      const status = err?.status ?? err?.statusCode;
      if (status && BENIGN_HTTP_STATUS.has(status)) return null;

      const message =
        (err instanceof Error ? err.message : undefined) ??
        event.message ??
        event.exception?.values?.[0]?.value;
      if (isBenignMessage(message)) return null;

      // Strip cookies / authorization headers from request snapshots
      if (event.request?.headers) {
        const h = event.request.headers as Record<string, string | undefined>;
        delete h.cookie;
        delete h.Cookie;
        delete h.authorization;
        delete h.Authorization;
      }
      if (event.request) {
        delete (event.request as { cookies?: unknown }).cookies;
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

export { Sentry };
