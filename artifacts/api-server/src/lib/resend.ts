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
