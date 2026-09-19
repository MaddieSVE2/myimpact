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
  tags?: string[];
}

const MAX_TEXT_LENGTH = 20_000;
const MAX_PROMPT_LENGTH = 500;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

function normaliseTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((tag) => typeof tag !== "string")) return null;
  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
  if (tags.length > MAX_TAGS || tags.some((tag) => tag.length > MAX_TAG_LENGTH)) return null;
  return Array.from(new Set(tags));
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

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const tags = body.tags === undefined ? [] : normaliseTags(body.tags);
  if (tags === null) {
    res.status(400).json({ error: "Invalid tags" });
    return;
  }
  if (type === "entry" && !text) {
    res.status(400).json({ error: "Entry text is required" });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH || prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({ error: "Entry is too long" });
    return;
  }

  const [inserted] = await db
    .insert(journalEntriesTable)
    .values({
      userId,
      type,
      text: text || null,
      prompt: prompt || null,
      reflectionText: typeof body.reflectionText === "string" ? body.reflectionText : null,
      periodLabel: typeof body.periodLabel === "string" ? body.periodLabel : null,
      impactRecordId: typeof body.impactRecordId === "string" ? body.impactRecordId : null,
      summary: typeof body.summary === "string" ? body.summary : null,
      reflectionPrompt: typeof body.reflectionPrompt === "string" ? body.reflectionPrompt : null,
      tags,
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
  const allowedFields = new Set(["text", "prompt", "reflectionText", "tags"]);
  const suppliedFields = Object.keys(body);
  if (suppliedFields.length === 0 || suppliedFields.some((field) => !allowedFields.has(field))) {
    res.status(400).json({ error: "No supported editable fields supplied" });
    return;
  }

  const [existing] = await db
    .select({ type: journalEntriesTable.type })
    .from(journalEntriesTable)
    .where(and(eq(journalEntriesTable.id, entryId), eq(journalEntriesTable.userId, userId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.text !== undefined || body.prompt !== undefined) {
    if (existing.type !== "entry") {
      res.status(400).json({ error: "Text and prompt can only be changed on manual entries" });
      return;
    }
    if (body.text !== undefined) {
      if (typeof body.text !== "string" || !body.text.trim() || body.text.trim().length > MAX_TEXT_LENGTH) {
        res.status(400).json({ error: "Invalid entry text" });
        return;
      }
      updates.text = body.text.trim();
    }
    if (body.prompt !== undefined) {
      if (typeof body.prompt !== "string" || body.prompt.trim().length > MAX_PROMPT_LENGTH) {
        res.status(400).json({ error: "Invalid prompt" });
        return;
      }
      updates.prompt = body.prompt.trim() || null;
    }
  }
  if (body.reflectionText !== undefined) {
    if (existing.type !== "activity" || typeof body.reflectionText !== "string" || body.reflectionText.trim().length > MAX_TEXT_LENGTH) {
      res.status(400).json({ error: "Invalid reflection text" });
      return;
    }
    updates.reflectionText = body.reflectionText.trim();
  }
  if (body.tags !== undefined) {
    const tags = normaliseTags(body.tags);
    if (tags === null) {
      res.status(400).json({ error: "Invalid tags" });
      return;
    }
    updates.tags = tags;
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
      tags: normaliseTags(e.tags ?? []) ?? [],
      createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
    }));

  if (toInsert.length > 0) {
    await db.insert(journalEntriesTable).values(toInsert);
  }

  res.json({ migrated: toInsert.length });
});

export default router;
