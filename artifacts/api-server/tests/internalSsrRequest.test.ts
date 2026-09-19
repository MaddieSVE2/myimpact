import { afterEach, describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  INTERNAL_SSR_HEADER,
  isTrustedInternalSsrRequest,
} from "../src/lib/internalSsrRequest.js";

const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

function requestWithHeader(value?: string): Request {
  return {
    get(name: string) {
      return name === INTERNAL_SSR_HEADER ? value : undefined;
    },
  } as Request;
}

describe("internal SSR request authentication", () => {
  it("accepts only the exact server-side secret", () => {
    process.env.SESSION_SECRET = "server-side-ssr-secret";

    expect(isTrustedInternalSsrRequest(requestWithHeader())).toBe(false);
    expect(isTrustedInternalSsrRequest(requestWithHeader("wrong-secret"))).toBe(false);
    expect(isTrustedInternalSsrRequest(requestWithHeader("server-side-ssr-secret"))).toBe(true);
  });

  it("does not authenticate requests when the server secret is unavailable", () => {
    delete process.env.SESSION_SECRET;
    expect(isTrustedInternalSsrRequest(requestWithHeader("server-side-ssr-secret"))).toBe(false);
  });
});