import { Router, type IRouter } from "express";
import { db, journalEntriesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";

interface LocalEntryShape {
  id: string;
  type: string;
  text?: string;
  prompt?: string;
  reflectionText?: string;
  periodLabel?: string;
  impactRecordId?: string;
  summary?: string;
  reflectionPrompt?: string;
  createdAt?: string;
}

function isLocalEntry(value: unknown): value is LocalEntryShape {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === "string";
}

const router: IRouter = Router();

router.get("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId))
    .orderBy(desc(journalEntriesTable.createdAt));

  const formatted = entries.map((e) => ({
    id: String(e.id),
    type: e.type,
    text: e.text ?? undefined,
    prompt: e.prompt ?? undefined,
    reflectionText: e.reflectionText ?? "",
    periodLabel: e.periodLabel ?? undefined,
    impactRecordId: e.impactRecordId ?? undefined,
    summary: e.summary ?? undefined,
    reflectionPrompt: e.reflectionPrompt ?? undefined,
    createdAt: e.createdAt.toISOString(),
  }));

  res.json({ entries: formatted });
});

router.post("/", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;

  const type = typeof body.type === "string" ? body.type : "entry";
  if (type !== "entry" && type !== "activity") {
    res.status(400).json({ error: "Invalid type" });
    return;
  }

  const [inserted] = await db
    .insert(journalEntriesTable)
    .values({
      userId,
      type,
      text: typeof body.text === "string" ? body.text : null,
      prompt: typeof body.prompt === "string" ? body.prompt : null,
      reflectionText: typeof body.reflectionText === "string" ? body.reflectionText : null,
      periodLabel: typeof body.periodLabel === "string" ? body.periodLabel : null,
      impactRecordId: typeof body.impactRecordId === "string" ? body.impactRecordId : null,
      summary: typeof body.summary === "string" ? body.summary : null,
      reflectionPrompt: typeof body.reflectionPrompt === "string" ? body.reflectionPrompt : null,
    })
    .returning();

  res.json({
    id: String(inserted.id),
    type: inserted.type,
    text: inserted.text ?? undefined,
    prompt: inserted.prompt ?? undefined,
    reflectionText: inserted.reflectionText ?? "",
    periodLabel: inserted.periodLabel ?? undefined,
    impactRecordId: inserted.impactRecordId ?? undefined,
    summary: inserted.summary ?? undefined,
    reflectionPrompt: inserted.reflectionPrompt ?? undefined,
    createdAt: inserted.createdAt.toISOString(),
  });
});

router.patch("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const entryId = parseInt(String(req.params.id), 10);

  if (isNaN(entryId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const reflectionText = typeof body.reflectionText === "string" ? body.reflectionText : null;

  const [updated] = await db
    .update(journalEntriesTable)
    .set({ reflectionText, updatedAt: new Date() })
    .where(and(eq(journalEntriesTable.id, entryId), eq(journalEntriesTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  res.json({
    id: String(updated.id),
    type: updated.type,
    text: updated.text ?? undefined,
    prompt: updated.prompt ?? undefined,
    reflectionText: updated.reflectionText ?? "",
    periodLabel: updated.periodLabel ?? undefined,
    impactRecordId: updated.impactRecordId ?? undefined,
    summary: updated.summary ?? undefined,
    reflectionPrompt: updated.reflectionPrompt ?? undefined,
    createdAt: updated.createdAt.toISOString(),
  });
});

router.delete("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const entryId = parseInt(String(req.params.id), 10);

  if (isNaN(entryId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  await db
    .delete(journalEntriesTable)
    .where(and(eq(journalEntriesTable.id, entryId), eq(journalEntriesTable.userId, userId)));

  res.json({ ok: true });
});

router.post("/migrate", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;
  const entries = Array.isArray(body.entries) ? body.entries : [];

  if (entries.length === 0) {
    res.json({ migrated: 0 });
    return;
  }

  const toInsert = entries
    .filter(isLocalEntry)
    .map((e: LocalEntryShape) => ({
      userId,
      type: e.type === "activity" ? "activity" : "entry",
      text: e.text ?? null,
      prompt: e.prompt ?? null,
      reflectionText: e.reflectionText ?? null,
      periodLabel: e.periodLabel ?? null,
      impactRecordId: e.impactRecordId ?? null,
      summary: e.summary ?? null,
      reflectionPrompt: e.reflectionPrompt ?? null,
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    }));

  if (toInsert.length > 0) {
    await db.insert(journalEntriesTable).values(toInsert);
  }

  res.json({ migrated: toInsert.length });
});

export default router;
