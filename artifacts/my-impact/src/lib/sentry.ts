import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENVIRONMENT =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
  (import.meta.env.MODE === "production" ? "production" : "preview");
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;
const TRACES_SAMPLE_RATE = Number(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
);

let initialized = false;

const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /AbortError/i,
  /The (?:user|operation) aborted/i,
  /NavigationDuplicated/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i,
  /Non-Error promise rejection captured/i,
  /Failed to fetch dynamically imported module/i,
];

function isBenign(message: string | undefined): boolean {
  if (!message) return false;
  return BENIGN_ERROR_PATTERNS.some((re) => re.test(message));
}

// A Sentry DSN looks like: https://<publicKey>@<host>/<projectId>
// Guard against misconfigured values (e.g. an access token pasted into the
// env var) so we never pass them to Sentry.init, which would echo the raw
// value into the browser console via its "Invalid Sentry Dsn" error.
const DSN_PATTERN = /^https?:\/\/[0-9a-f]+@[a-z0-9.-]+(?::\d+)?\/\d+$/i;

function isValidDsn(value: string): boolean {
  return DSN_PATTERN.test(value);
}

export function initSentry(): void {
  if (initialized) return;
  if (!DSN) return;
  if (!isValidDsn(DSN)) {
    console.warn(
      "[sentry] VITE_SENTRY_DSN is not a valid Sentry DSN; error monitoring is disabled. (Value withheld from logs.)"
    );
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE)
      ? TRACES_SAMPLE_RATE
      : 0.1,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const message =
        (err instanceof Error ? err.message : undefined) ??
        event.message ??
        event.exception?.values?.[0]?.value;
      if (isBenign(message)) return null;
      return event;
    },
  });

  initialized = true;
}

export function setSentryUser(user: { id: string } | null): void {
  if (!initialized) return;
  if (user) {
    Sentry.setUser({ id: user.id });
  } else {
    Sentry.setUser(null);
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    console.error("[sentry:disabled]", err, context);
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const isSentryEnabled = (): boolean => initialized;
