import { Resend } from "resend";

const FROM_EMAIL = "My Impact <enquiries@socialvalueengine.com>";

type SendArgs = Parameters<Resend["emails"]["send"]>[0];

function makeTestModeStub() {
  return {
    emails: {
      async send(payload: SendArgs) {
        const to = Array.isArray((payload as { to?: unknown }).to)
          ? ((payload as { to: string[] }).to).join(", ")
          : String((payload as { to?: unknown }).to ?? "");
        console.log(
          `[resend:test-mode] suppressed email to ${to} — subject: ${(payload as { subject?: string }).subject ?? ""}`,
        );
        return { data: { id: "test-mode-suppressed" }, error: null };
      },
    },
  } as unknown as Resend;
}

/**
 * Removes an address from Resend's account-level suppression list.
 * Called from the admin "clear suppression" action once the underlying
 * delivery problem has been fixed. In E2E test mode this is a no-op stub,
 * mirroring how sends are suppressed.
 *
 * Returns { ok: true } when Resend accepted the removal (or the address
 * wasn't on the list), { ok: false, error } otherwise.
 */
export async function removeFromResendSuppressionList(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (process.env.E2E_TEST_MODE === "1") {
    console.log(`[resend:test-mode] suppressed suppression-list removal for ${email}`);
    return { ok: true };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY environment variable is not set" };
  }
  try {
    const res = await fetch(
      `https://api.resend.com/suppressions/${encodeURIComponent(email)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    // 404 means the address is not on Resend's suppression list (possibly
    // already removed via the dashboard) — treat that as success so the
    // local record can still be cleared.
    if (res.ok || res.status === 404) {
      return { ok: true };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Resend responded ${res.status}: ${body.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getUncachableResendClient() {
  if (process.env.E2E_TEST_MODE === "1") {
    return { client: makeTestModeStub(), fromEmail: FROM_EMAIL };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  return {
    client: new Resend(apiKey),
    fromEmail: FROM_EMAIL,
  };
}
