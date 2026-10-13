import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiJson } from "./api";

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends the session cookie to the API path", async () => {
    const fetchMock = respond(200, {});
    await apiFetch("/api/impact/years");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/impact/years");
    expect(init.credentials).toBe("include");
  });

  it("sends `json` as the body with a JSON content type", async () => {
    const fetchMock = respond(200, {});
    await apiFetch("/api/impact/save", { method: "POST", json: { total: 12.5 } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"total":12.5}');
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("keeps a body and content type the caller set", async () => {
    const fetchMock = respond(200, {});
    await apiFetch("/api/upload", { method: "PUT", body: "raw", headers: { "Content-Type": "text/plain" } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe("raw");
    expect(new Headers(init.headers).get("Content-Type")).toBe("text/plain");
  });
});

describe("apiJson", () => {
  it("returns the response's JSON", async () => {
    respond(200, { years: [2025, 2026] });
    await expect(apiJson("/api/impact/years")).resolves.toEqual({ years: [2025, 2026] });
  });

  it("uses the caller's message for a failed response, keeping the server's", async () => {
    respond(403, { error: "Forbidden" });
    const error = await apiJson("/api/admin/x", { errorMessage: "Failed to load" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Failed to load", status: 403, serverMessage: "Forbidden" });
  });

  it("falls back to the server's message, then a generic one", async () => {
    respond(409, { error: "You already logged this today." });
    await expect(apiJson("/api/impact/save")).rejects.toThrow("You already logged this today.");
    respond(502, "<html>Bad gateway</html>");
    await expect(apiJson("/api/impact/save")).rejects.toMatchObject({ message: "The server answered 502.", serverMessage: undefined });
  });
});
