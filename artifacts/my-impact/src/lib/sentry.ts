// Thin facade over @sentry/react that keeps the SDK out of the initial
// bundle. The heavy SDK is loaded via dynamic import when initSentry() runs
// (deferred to browser idle time from main.tsx). Calls made before the SDK
// is ready are queued and replayed once it loads.

type SentryModule = typeof import("@sentry/react");

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const ENVIRONMENT =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
  (import.meta.env.MODE === "production" ? "production" : "preview");
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;
const TRACES_SAMPLE_RATE = Number(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
);

let sdk: SentryModule | null = null;
let initStarted = false;
let pendingUser: { id: string } | null | undefined;
const pendingExceptions: Array<{
  err: unknown;
  context?: Record<string, unknown>;
}> = [];

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
  if (initStarted) return;
  if (!DSN) return;
  if (!isValidDsn(DSN)) {
    console.warn(
      "[sentry] VITE_SENTRY_DSN is not a valid Sentry DSN; error monitoring is disabled. (Value withheld from logs.)"
    );
    return;
  }
  initStarted = true;

  import("@sentry/react")
    .then((Sentry) => {
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
      sdk = Sentry;

      // Replay anything that happened before the SDK finished loading.
      if (pendingUser !== undefined) {
        Sentry.setUser(pendingUser ? { id: pendingUser.id } : null);
        pendingUser = undefined;
      }
      for (const { err, context } of pendingExceptions.splice(0)) {
        Sentry.captureException(err, context ? { extra: context } : undefined);
      }
    })
    .catch(() => {
      initStarted = false; // allow a retry on a later call
    });
}

export function setSentryUser(user: { id: string } | null): void {
  if (sdk) {
    sdk.setUser(user ? { id: user.id } : null);
  } else if (initStarted) {
    pendingUser = user;
  }
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>
): void {
  if (sdk) {
    sdk.captureException(err, context ? { extra: context } : undefined);
    return;
  }
  if (initStarted) {
    pendingExceptions.push({ err, context });
    return;
  }
  console.error("[sentry:disabled]", err, context);
}

export const isSentryEnabled = (): boolean => sdk !== null;
