/**
 * Calls to the app's own API (/api/...), which needs the session cookie on
 * every request. Use these rather than fetch() with a copied base path.
 */

/** The app's base path, without a trailing slash ("" at the site root). */
export const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

/** A response that wasn't OK. `serverMessage` is the API's `error` text, if any. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serverMessage: string | undefined,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiInit extends RequestInit {
  /** Sent as the JSON body, with the matching Content-Type header. */
  json?: unknown;
}

/** fetch() for an API path such as "/api/impact/years", with the session cookie. */
export function apiFetch(path: string, { json, headers, ...init }: ApiInit = {}): Promise<Response> {
  const merged = new Headers(headers);
  if (json !== undefined && !merged.has("Content-Type")) merged.set("Content-Type", "application/json");
  return fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: merged,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });
}

/**
 * apiFetch(), then the response's JSON. A response that isn't OK throws an
 * ApiError whose message is `errorMessage` when given, otherwise the API's
 * own `error` text, otherwise a generic one.
 */
// The default `any` matches res.json(), so callers typed by useQuery<T>
// keep working when they switch to this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiJson<T = any>(path: string, { errorMessage, ...init }: ApiInit & { errorMessage?: string } = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    const serverMessage =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : undefined;
    throw new ApiError(errorMessage ?? serverMessage ?? `The server answered ${res.status}.`, res.status, serverMessage, body);
  }
  return res.json() as Promise<T>;
}
