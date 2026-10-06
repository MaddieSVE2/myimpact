import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { Resend } from "resend";

const state = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertFails: false,
  authUser: null as { id: string; email: string } | null,
  listCalls: [] as unknown[],
}));

vi.mock("@workspace/db", () => ({
  emailLogTable: {},
  db: {
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          if (state.insertFails) throw new Error("db down");
          state.inserted.push(row);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (n: number) => {
              state.listCalls.push(n);
              return [];
            },
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!state.authUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    (req as express.Request & { user?: { id: string; email: string } }).user = state.authUser;
    next();
  },
}));

vi.mock("../src/lib/adminEmails.js", () => ({
  isAdminEmail: (email: string) => email === "admin@example.org",
}));

import { nextEmailStatus, withEmailLog } from "../src/lib/emailLog.js";
import adminEmailLogRouter from "../src/routes/admin-email-log.js";

function fakeClient(send: (payload: unknown) => Promise<unknown>): Resend {
  return { emails: { send } } as unknown as Resend;
}

const payload = { from: "My Impact <x@example.org>", to: "Member@Example.org", subject: "Welcome", html: "<p>Hi</p>" };

beforeEach(() => {
  state.inserted = [];
  state.insertFails = false;
  state.authUser = null;
  state.listCalls = [];
});

describe("nextEmailStatus", () => {
  it("moves forward through delivery progress", () => {
    expect(nextEmailStatus("sent", "email.delivered")).toBe("delivered");
    expect(nextEmailStatus("delivered", "email.opened")).toBe("opened");
    expect(nextEmailStatus("opened", "email.clicked")).toBe("clicked");
  });

  it("ignores events that arrive late or out of order", () => {
    expect(nextEmailStatus("delivered", "email.delivery_delayed")).toBeNull();
    expect(nextEmailStatus("opened", "email.delivered")).toBeNull();
    expect(nextEmailStatus("delivered", "email.sent")).toBeNull();
  });

  it("lets a delivery problem replace any progress", () => {
    expect(nextEmailStatus("delivered", "email.bounced")).toBe("bounced");
    expect(nextEmailStatus("clicked", "email.complained")).toBe("complained");
  });

  it("ignores events that are not about delivery", () => {
    expect(nextEmailStatus("sent", "email.received")).toBeNull();
    expect(nextEmailStatus("sent", "contact.created")).toBeNull();
  });
});

describe("withEmailLog", () => {
  it("records a successful send without the message body", async () => {
    const client = withEmailLog(fakeClient(async () => ({ data: { id: "re_1" }, error: null })), "onboarding");
    const result = await client.emails.send(payload as never);
    expect(result).toEqual({ data: { id: "re_1" }, error: null });
    expect(state.inserted).toEqual([
      {
        resendId: "re_1",
        toAddresses: ["member@example.org"],
        subject: "Welcome",
        category: "onboarding",
        status: "sent",
        error: null,
      },
    ]);
  });

  it("records an error Resend returned", async () => {
    const client = withEmailLog(
      fakeClient(async () => ({ data: null, error: { name: "validation_error", message: "bad to" } })),
      "sign-in",
    );
    await client.emails.send(payload as never);
    expect(state.inserted[0]).toMatchObject({ resendId: null, status: "failed", category: "sign-in" });
    expect(state.inserted[0]!.error).toContain("bad to");
  });

  it("records a thrown send and still throws it", async () => {
    const client = withEmailLog(fakeClient(async () => Promise.reject(new Error("network"))), "internal");
    await expect(client.emails.send(payload as never)).rejects.toThrow("network");
    expect(state.inserted[0]).toMatchObject({ status: "failed", error: "network" });
  });

  it("never fails a send because logging failed", async () => {
    state.insertFails = true;
    const client = withEmailLog(fakeClient(async () => ({ data: { id: "re_2" }, error: null })), "account");
    await expect(client.emails.send(payload as never)).resolves.toEqual({ data: { id: "re_2" }, error: null });
  });
});

describe("GET /admin/email-log", () => {
  const app = express();
  app.use("/api/admin", adminEmailLogRouter);

  it("is for admins only", async () => {
    expect((await request(app).get("/api/admin/email-log")).status).toBe(401);
    state.authUser = { id: "u1", email: "member@example.org" };
    expect((await request(app).get("/api/admin/email-log")).status).toBe(403);
    expect(state.listCalls).toEqual([]);
  });

  it("returns a page of entries to an admin", async () => {
    state.authUser = { id: "u2", email: "admin@example.org" };
    const res = await request(app).get("/api/admin/email-log?status=bounced");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], nextBefore: null, retentionDays: 365 });
  });
});
