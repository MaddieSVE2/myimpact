import jwt from "jsonwebtoken";

/**
 * Signed, single-purpose unsubscribe tokens for email footer links.
 *
 * The token is a JWT signed with SESSION_SECRET but with a distinct
 * `purpose` claim so it can never be replayed as a session token (the
 * authenticate middleware expects `{ id, email }` and this payload has
 * neither in that shape — verification here also requires the purpose).
 *
 * Tokens expire after 90 days so a link in an old forwarded email cannot
 * flip preferences forever.
 */

const PURPOSE = "email-unsubscribe";
const EXPIRY = "90d";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to sign unsubscribe tokens");
  }
  return secret;
}

/**
 * Which emails a link turns off. Signed into the token so a link cannot be
 * edited to switch off a different kind. Tokens without one (all issued
 * before reminders existed) mean onboarding.
 */
export type UnsubscribeList = "onboarding" | "activity-reminders";

export function createUnsubscribeToken(userId: string, list: UnsubscribeList = "onboarding"): string {
  return jwt.sign({ sub: userId, purpose: PURPOSE, ...(list === "onboarding" ? {} : { list }) }, getSecret(), {
    expiresIn: EXPIRY,
  });
}

export type UnsubscribeTokenResult =
  | { ok: true; userId: string; list: UnsubscribeList }
  | { ok: false; reason: "expired" | "invalid" };

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenResult {
  try {
    const payload = jwt.verify(token, getSecret());
    if (
      typeof payload !== "object" ||
      payload === null ||
      (payload as jwt.JwtPayload).purpose !== PURPOSE ||
      typeof (payload as jwt.JwtPayload).sub !== "string"
    ) {
      return { ok: false, reason: "invalid" };
    }
    const list = (payload as jwt.JwtPayload).list;
    if (list !== undefined && list !== "activity-reminders") return { ok: false, reason: "invalid" };
    return { ok: true, userId: (payload as jwt.JwtPayload).sub as string, list: list ?? "onboarding" };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}

/** Frontend confirmation-page URL embedded in email footers. */
export function buildUnsubscribeUrl(appUrl: string, userId: string, list?: UnsubscribeList): string {
  const token = createUnsubscribeToken(userId, list);
  return `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Direct API URL used for RFC 8058 one-click List-Unsubscribe-Post.
 * Inbox providers POST to this URL with no cookies or body.
 */
export function buildOneClickUnsubscribeUrl(appUrl: string, userId: string, list?: UnsubscribeList): string {
  const token = createUnsubscribeToken(userId, list);
  return `${appUrl}/api/profile/unsubscribe?token=${encodeURIComponent(token)}`;
}
