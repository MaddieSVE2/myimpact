import { describe, it, expect } from "vitest";
import { validatePushEndpoint } from "../src/lib/pushEndpoint.js";

describe("validatePushEndpoint", () => {
  it.each([
    // Chrome / Android. Its hostname starts with "fc", which the private
    // IPv6 check used to mistake for an fc00::/7 address.
    "https://fcm.googleapis.com/fcm/send/abc123:APA91b",
    "https://fcm.googleapis.com/wp/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGx1c2VyLXRva2Vu",
  ])("accepts a browser push service: %s", (endpoint) => {
    expect(validatePushEndpoint(endpoint)).toBeNull();
  });

  it.each([
    ["http://fcm.googleapis.com/fcm/send/abc", "endpoint must use HTTPS"],
    ["https://localhost/push", "endpoint hostname is not allowed"],
    ["https://127.0.0.1/push", "endpoint hostname is not allowed"],
    ["https://192.168.1.10/push", "endpoint hostname is not allowed"],
    ["https://[::1]/push", "endpoint hostname is not allowed"],
    ["https://[fd00::1]/push", "endpoint hostname is not allowed"],
    ["https://[fe80::1]/push", "endpoint hostname is not allowed"],
    ["https://example.com/push", "endpoint must be a browser push service URL"],
    ["https://fcm.googleapis.com.evil.example/push", "endpoint must be a browser push service URL"],
    ["not a url", "endpoint must be a valid URL"],
  ])("rejects %s", (endpoint, error) => {
    expect(validatePushEndpoint(endpoint)).toBe(error);
  });

  it("rejects an over-long endpoint", () => {
    expect(validatePushEndpoint(`https://fcm.googleapis.com/${"a".repeat(2000)}`)).toMatch(/must not exceed/);
  });
});
