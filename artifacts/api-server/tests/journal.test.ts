import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  authUser: { id: "user-1", email: "user@example.com" },
  selectRows: [] as unknown[],
  insertedValues: null as Record<string, unknown> | null,
  updatedValues: null as Record<string, unknown> | null,
  returnedRow: null as Record<string, unknown> | null,
}));

vi.mock("@workspace/db", () => {
  const column = {};
  const journalEntriesTable = {
    id: column,
    userId: column,
    type: column,
    text: column,
    prompt: column,
    reflectionText: column,
    periodLabel: column,
    impactRecordId: column,
    summary: column,
    reflectionPrompt: column,
    tags: column,
    createdAt: column,
  };
  const selectBuilder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(async () => state.selectRows),
    limit: vi.fn(async () => state.selectRows),
  };
  const insertBuilder = {
    values: vi.fn((values: Record<string, unknown>) => {
      state.insertedValues = values;
      return insertBuilder;
    }),
    returning: vi.fn(async () => [state.returnedRow]),
  };
  const updateBuilder = {
    set: vi.fn((values: Record<string, unknown>) => {
      state.updatedValues = values;
      return updateBuilder;
    }),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(async () => [state.returnedRow]),
  };
  const deleteBuilder = { where: vi.fn(async () => undefined) };
  return {
    journalEntriesTable,
    db: {
      select: vi.fn(() => selectBuilder),
      insert: vi.fn(() => insertBuilder),
      update: vi.fn(() => updateBuilder),
      delete: vi.fn(() => deleteBuilder),
    },
  };
});

vi.mock("../src/middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: typeof state.authUser }).user = state.authUser;
    next();
  },
}));

vi.mock("../src/lib/attachmentCleanup.js", () => ({
  deleteAttachmentsForJournal: vi.fn(async () => undefined),
}));

const { default: journalRouter } = await import("../src/routes/journal.js");

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use("/api/journal", journalRouter);
  return instance;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    userId: "user-1",
    type: "entry",
    text: "A useful day",
    prompt: "What mattered?",
    reflectionText: null,
    periodLabel: null,
    impactRecordId: null,
    summary: null,
    reflectionPrompt: null,
    tags: ["community"],
    createdAt: new Date("2026-09-19T10:00:00Z"),
    updatedAt: new Date("2026-09-19T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  state.selectRows = [];
  state.insertedValues = null;
  state.updatedValues = null;
  state.returnedRow = row();
});

describe("journal creation and editing", () => {
  it("normalises and persists tags when creating a manual entry", async () => {
    const response = await request(app()).post("/api/journal").send({
      type: "entry",
      text: "  A useful day  ",
      prompt: " What mattered? ",
      tags: [" Community Work ", "community-work", "Learning"],
    });

    expect(response.status).toBe(200);
    expect(state.insertedValues).toMatchObject({
      userId: "user-1",
      text: "A useful day",
      prompt: "What mattered?",
      tags: ["community-work", "learning"],
    });
  });

  it("rejects unsupported update fields", async () => {
    const response = await request(app()).patch("/api/journal/42").send({ createdAt: "2020-01-01" });
    expect(response.status).toBe(400);
    expect(state.updatedValues).toBeNull();
  });

  it("returns 404 without updating when the owned entry cannot be found", async () => {
    state.selectRows = [];
    const response = await request(app()).patch("/api/journal/42").send({ text: "Changed" });
    expect(response.status).toBe(404);
    expect(state.updatedValues).toBeNull();
  });

  it("updates only editable manual-entry fields", async () => {
    state.selectRows = [{ type: "entry" }];
    state.returnedRow = row({ text: "Changed", prompt: "New prompt", tags: ["new-tag"] });
    const response = await request(app()).patch("/api/journal/42").send({
      text: " Changed ",
      prompt: " New prompt ",
      tags: ["New Tag"],
    });

    expect(response.status).toBe(200);
    expect(state.updatedValues).toMatchObject({
      text: "Changed",
      prompt: "New prompt",
      tags: ["new-tag"],
    });
    expect(response.body).toMatchObject({ id: "42", text: "Changed", tags: ["new-tag"] });
  });

  it("allows activity reflections to change but not manual-entry text fields", async () => {
    state.selectRows = [{ type: "activity" }];
    state.returnedRow = row({ type: "activity", text: null, reflectionText: "Updated reflection" });
    const reflection = await request(app()).patch("/api/journal/42").send({ reflectionText: " Updated reflection " });
    expect(reflection.status).toBe(200);
    expect(state.updatedValues).toMatchObject({ reflectionText: "Updated reflection" });

    state.updatedValues = null;
    const text = await request(app()).patch("/api/journal/42").send({ text: "Not allowed" });
    expect(text.status).toBe(400);
    expect(state.updatedValues).toBeNull();
  });
});