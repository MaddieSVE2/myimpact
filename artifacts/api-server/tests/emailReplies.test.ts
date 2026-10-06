import { describe, it, expect } from "vitest";
import { withReplyTo, replyInboxAddress } from "../src/lib/emailLog.js";
import { bareAddress, buildForward, htmlToText, isForReplyInbox } from "../src/lib/emailReplies.js";

const env = { EMAIL_REPLY_TO: "Reply@MyImpact.uk" } as NodeJS.ProcessEnv;
const payload = { from: "My Impact <x@example.org>", to: "member@example.org", subject: "Hi", html: "<p>Hi</p>" };

describe("replyInboxAddress", () => {
  it("reads and normalises EMAIL_REPLY_TO", () => {
    expect(replyInboxAddress(env)).toBe("reply@myimpact.uk");
  });
  it("treats a missing or malformed value as off", () => {
    expect(replyInboxAddress({} as NodeJS.ProcessEnv)).toBeNull();
    expect(replyInboxAddress({ EMAIL_REPLY_TO: "not an address" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("withReplyTo", () => {
  it("adds the reply inbox to member emails", () => {
    expect(withReplyTo(payload as never, "onboarding", env)).toMatchObject({ replyTo: "reply@myimpact.uk" });
    expect(withReplyTo(payload as never, "monthly-digest", env)).toMatchObject({ replyTo: "reply@myimpact.uk" });
  });
  it("leaves internal alerts alone", () => {
    expect(withReplyTo(payload as never, "internal", env)).not.toHaveProperty("replyTo");
  });
  it("keeps a Reply-To the email already sets", () => {
    const own = { ...payload, replyTo: "manager@example.org" };
    expect(withReplyTo(own as never, "organisation", env)).toMatchObject({ replyTo: "manager@example.org" });
  });
  it("changes nothing until EMAIL_REPLY_TO is set", () => {
    expect(withReplyTo(payload as never, "onboarding", {} as NodeJS.ProcessEnv)).toBe(payload);
  });
});

describe("received email filtering", () => {
  const inbox = "reply@myimpact.uk";
  it("matches the reply inbox in to or received_for, ignoring case and display names", () => {
    expect(isForReplyInbox({ to: ["My Impact <Reply@myimpact.uk>"] }, inbox)).toBe(true);
    expect(isForReplyInbox({ to: ["someone@else.org"], received_for: ["reply@myimpact.uk"] }, inbox)).toBe(true);
  });
  it("leaves other inboxes on the domain alone", () => {
    expect(isForReplyInbox({ to: ["hello@myimpact.uk"] }, inbox)).toBe(false);
    expect(isForReplyInbox({ to: ["log@myimpact.uk"] }, inbox)).toBe(false);
    expect(isForReplyInbox({}, inbox)).toBe(false);
  });
  it("extracts bare addresses", () => {
    expect(bareAddress("Jo Bloggs <Jo@Example.org>")).toBe("jo@example.org");
    expect(bareAddress(" jo@example.org ")).toBe("jo@example.org");
  });
});

describe("htmlToText", () => {
  it("keeps the words and line breaks, drops markup and scripts", () => {
    const html = "<div>Thanks!<br>I did 3 hours &amp; more.</div><script>alert(1)</script><p>Jo</p>";
    expect(htmlToText(html)).toBe("Thanks!\nI did 3 hours & more.\nJo");
  });
});

describe("buildForward", () => {
  it("says what was replied to and includes the text", () => {
    const message = buildForward({
      from: "jo@example.org",
      subject: "Re: Welcome to My Impact",
      text: "Thanks, how do I add my hours?",
      original: { subject: "Welcome to My Impact", category: "onboarding", sentAt: new Date("2026-10-05T09:00:00Z") },
    });
    expect(message.subject).toBe("Reply from jo@example.org: Re: Welcome to My Impact");
    expect(message.text).toContain('In reply to "Welcome to My Impact" (onboarding)');
    expect(message.text).toContain("Thanks, how do I add my hours?");
  });
  it("still forwards when the reply cannot be matched or fetched", () => {
    const message = buildForward({ from: "jo@example.org", subject: "", text: null, original: null });
    expect(message.subject).toBe("Reply from jo@example.org: (no subject)");
    expect(message.text).toContain("could not be matched");
    expect(message.text).toContain("could not be fetched");
  });
});
