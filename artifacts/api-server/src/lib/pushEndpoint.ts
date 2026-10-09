/**
 * Checks on the push-service URL a browser hands us when someone turns on
 * reminders: HTTPS, not a private address, and from a known push service.
 */

const MAX_ENDPOINT_LENGTH = 2000;

/**
 * Returns true if the hostname looks like a private or loopback address
 * that should never appear in a real browser push-service URL.
 */
function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }

  // IPv6 loopback and private ranges (bracket notation from URL parser).
  // Only IPv6 literals contain a colon; without this guard the prefix checks
  // below matched DNS names too ("fcm.googleapis.com" starts with "fc").
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (!bare.includes(":")) return false;
  if (bare === "::1") return true;
  if (/^::ffff:/i.test(bare)) {
    // IPv4-mapped IPv6 — check the embedded IPv4 part
    const v4 = bare.slice(7);
    const ipv4mapped = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4mapped) {
      const [, a, b] = ipv4mapped.map(Number);
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
  }
  // fc00::/7 — unique local addresses (fd...)
  if (/^f[cd]/i.test(bare)) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab]/i.test(bare)) return true;

  return false;
}

/**
 * Allowlist of hostname suffixes that correspond to real browser push services.
 * Browsers register endpoints only with their vendor-operated push services;
 * any other hostname is not a legitimate browser push endpoint.
 *
 * Sources:
 *   - Chrome/Android (FCM): fcm.googleapis.com, fcm-push.googleapis.com
 *   - Firefox (Mozilla): *.push.services.mozilla.com
 *   - Edge/Windows: *.notify.windows.com, *.wns.windows.com
 *   - Safari/Apple: *.push.apple.com
 *   - Opera: *.push.opera.com
 *   - Samsung Internet: *.push.samsungcloud.com
 */
const ALLOWED_PUSH_HOSTNAME_SUFFIXES: readonly string[] = [
  ".fcm.googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".wns.windows.com",
  ".push.apple.com",
  ".push.opera.com",
  ".push.samsungcloud.com",
];

const ALLOWED_PUSH_EXACT_HOSTNAMES: readonly string[] = [
  "fcm.googleapis.com",
  "fcm-push.googleapis.com",
  "updates.push.services.mozilla.com",
];

function isAllowedPushHost(hostname: string): boolean {
  if (ALLOWED_PUSH_EXACT_HOSTNAMES.includes(hostname)) return true;
  for (const suffix of ALLOWED_PUSH_HOSTNAME_SUFFIXES) {
    if (hostname === suffix.slice(1) || hostname.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * Validate that the endpoint is an HTTPS URL from a known browser push service.
 * Returns an error string if invalid, or null if acceptable.
 */
export function validatePushEndpoint(endpoint: string): string | null {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) {
    return `endpoint must not exceed ${MAX_ENDPOINT_LENGTH} characters`;
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "endpoint must be a valid URL";
  }

  if (url.protocol !== "https:") {
    return "endpoint must use HTTPS";
  }

  if (isPrivateHostname(url.hostname)) {
    return "endpoint hostname is not allowed";
  }

  if (!isAllowedPushHost(url.hostname)) {
    return "endpoint must be a browser push service URL";
  }

  return null;
}
