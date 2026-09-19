import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  isSafeReturnPath,
  signState,
  verifyState,
} from "../src/lib/oidc.js";

describe("OIDC state and consumer Google separation", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
    process.env.GOOGLE_OIDC_CLIENT_ID = "google-client";
    process.env.GOOGLE_OIDC_CLIENT_SECRET = "google-secret";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.GOOGLE_OIDC_CLIENT_ID;
    delete process.env.GOOGLE_OIDC_CLIENT_SECRET;
  });

  it("round-trips signed consumer state without organisation requirements", () => {
    const { state, nonce } = signState({
      provider: "google",
      flow: "consumer",
      returnTo: "/history",
      marketingOptIn: true,
      mode: "signin",
    });

    expect(verifyState(state)).toMatchObject({
      provider: "google",
      flow: "consumer",
      returnTo: "/history",
      marketingOptIn: true,
      nonce,
    });
  });

  it("rejects tampered and expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    const { state } = signState({
      provider: "google",
      flow: "consumer",
      mode: "signin",
    });
    expect(verifyState(`${state.slice(0, -1)}x`)).toBeNull();
    vi.setSystemTime(new Date("2026-09-19T12:11:00Z"));
    expect(verifyState(state)).toBeNull();
  });

  it("requires organisation state to carry its domain and organisation", () => {
    const { state } = signState({
      provider: "google",
      flow: "organisation",
      orgId: null,
      domain: null,
      mode: "signin",
    });
    expect(verifyState(state)).toBeNull();
  });

  it("does not add a hosted-domain restriction to consumer Google login", () => {
    const url = new URL(buildAuthorizeUrl(
      "google",
      "signed-state",
      "https://app.example/api/auth/sso/google/callback",
    ));
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example/api/auth/sso/google/callback");
    expect(url.searchParams.has("hd")).toBe(false);
  });

  it("keeps the hosted-domain restriction for organisation Google SSO", () => {
    const url = new URL(buildAuthorizeUrl(
      "google",
      "signed-state",
      "https://app.example/api/auth/sso/google/callback",
      { domain: "example.org" },
    ));
    expect(url.searchParams.get("hd")).toBe("example.org");
  });

  it("accepts only local return paths", () => {
    expect(isSafeReturnPath("/org/reports")).toBe(true);
    expect(isSafeReturnPath("//evil.example/path")).toBe(false);
    expect(isSafeReturnPath("https://evil.example/path")).toBe(false);
  });
});