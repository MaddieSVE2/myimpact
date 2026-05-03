import { Router, type IRouter } from "express";
import { db, journalEntriesTable } from "@workspace/db";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { deleteAttachmentsForJournal } from "../lib/attachmentCleanup.js";

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

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tagsParam = typeof req.query.tags === "string" ? req.query.tags : "";
  const tagFilters = tagsParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const conditions = [eq(journalEntriesTable.userId, userId)];

  if (q) {
    const like = `%${q}%`;
    const searchClause = or(
      ilike(journalEntriesTable.text, like),
      ilike(journalEntriesTable.prompt, like),
      ilike(journalEntriesTable.reflectionText, like),
      ilike(journalEntriesTable.summary, like),
      ilike(journalEntriesTable.reflectionPrompt, like),
      ilike(journalEntriesTable.periodLabel, like),
      sql`EXISTS (SELECT 1 FROM unnest(${journalEntriesTable.tags}) AS t WHERE t ILIKE ${like})`,
    );
    if (searchClause) conditions.push(searchClause);
  }

  if (tagFilters.length > 0) {
    conditions.push(sql`${journalEntriesTable.tags} @> ARRAY[${sql.join(tagFilters.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  }

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(and(...conditions))
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
    tags: e.tags ?? [],
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
    tags: inserted.tags ?? [],
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
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.reflectionText === "string" || body.reflectionText === null) {
    updates.reflectionText = typeof body.reflectionText === "string" ? body.reflectionText : null;
  }
  if (Array.isArray(body.tags)) {
    const tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    updates.tags = Array.from(new Set(tags));
  }

  const [updated] = await db
    .update(journalEntriesTable)
    .set(updates)
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
    tags: updated.tags ?? [],
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

  // Drop the journal's attached photo (DB row + GCS object) before deleting
  // the entry itself so storage doesn't get orphaned.
  await deleteAttachmentsForJournal(userId, entryId);

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
