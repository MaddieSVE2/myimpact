import { Router, type IRouter } from "express";
import {
  db,
  attachmentsTable,
  impactRecordsTable,
  journalEntriesTable,
} from "@workspace/db";
import { and, eq, sum, desc, inArray, sql } from "drizzle-orm";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import {
  generateAttachmentKey,
  getUploadURL,
  getDownloadURL,
  deleteAttachment,
  streamAttachment,
} from "../lib/objectStorage.js";

const router: IRouter = Router();

// ── Limits ────────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;        // 10 MB per file
const USER_QUOTA_BYTES   = 200 * 1024 * 1024;        // 200 MB per user
const MAX_PHOTOS_PER_RECORD = 4;
const MAX_ATTACHMENTS_PER_JOURNAL = 1;
const MAX_RECEIPTS_PER_RECORD = 1;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const ALLOWED_PDF_TYPES = new Set(["application/pdf"]);

export const ATTACHMENT_LIMITS = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  userQuotaBytes: USER_QUOTA_BYTES,
  maxPhotosPerRecord: MAX_PHOTOS_PER_RECORD,
  maxAttachmentsPerJournal: MAX_ATTACHMENTS_PER_JOURNAL,
  maxReceiptsPerRecord: MAX_RECEIPTS_PER_RECORD,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getUserUsageBytes(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(attachmentsTable.byteSize) })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));
  return Number(row?.total ?? 0);
}

async function getRecordIfOwned(userId: string, recordId: number) {
  const [rec] = await db
    .select()
    .from(impactRecordsTable)
    .where(and(eq(impactRecordsTable.id, recordId), eq(impactRecordsTable.userId, userId)))
    .limit(1);
  return rec;
}

async function getJournalIfOwned(userId: string, journalId: number) {
  const [j] = await db
    .select()
    .from(journalEntriesTable)
    .where(and(eq(journalEntriesTable.id, journalId), eq(journalEntriesTable.userId, userId)))
    .limit(1);
  return j;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/limits", (_req, res) => {
  res.json(ATTACHMENT_LIMITS);
});

router.get("/usage", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const usedBytes = await getUserUsageBytes(userId);
  const [{ count } = { count: 0 }] = await db
    .select({ count: sum(attachmentsTable.byteSize) })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.userId, userId));
  void count;
  res.json({
    usedBytes,
    capBytes: USER_QUOTA_BYTES,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  });
});

/**
 * Step 1: Request a presigned upload URL.
 * Validates ownership of target record/journal, file size, mime type, and
 * checks the user's quota before issuing a URL.
 */
router.post("/upload-url", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const byteSize = typeof body.byteSize === "number" ? body.byteSize : NaN;
  const recordIdRaw = body.recordId;
  const journalIdRaw = body.journalId;
  const kindRaw = typeof body.kind === "string" ? body.kind : "photo";
  const kind: "photo" | "receipt" = kindRaw === "receipt" ? "receipt" : "photo";

  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    res.status(400).json({ error: "Invalid file size" });
    return;
  }
  if (byteSize > MAX_FILE_SIZE_BYTES) {
    res.status(413).json({
      error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`,
    });
    return;
  }

  if (kind === "receipt") {
    if (!ALLOWED_PDF_TYPES.has(mimeType)) {
      res.status(415).json({ error: "Receipt must be a PDF file." });
      return;
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      res.status(415).json({
        error: "Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, HEIC.",
      });
      return;
    }
  }

  // Resolve target & validate ownership/limits
  let recordId: number | null = null;
  let journalId: number | null = null;

  if (recordIdRaw != null) {
    const parsed = typeof recordIdRaw === "number"
      ? recordIdRaw
      : parseInt(String(recordIdRaw), 10);
    if (!Number.isFinite(parsed)) {
      res.status(400).json({ error: "Invalid recordId" });
      return;
    }
    const rec = await getRecordIfOwned(userId, parsed);
    if (!rec) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    recordId = parsed;

    if (kind === "receipt") {
      const donations = Number(rec.donationsValue ?? 0);
      if (!(donations > 0)) {
        res.status(400).json({ error: "Receipts can only be attached to records with donations." });
        return;
      }
      const existingReceipts = await db
        .select()
        .from(attachmentsTable)
        .where(and(
          eq(attachmentsTable.userId, userId),
          eq(attachmentsTable.recordId, recordId),
          eq(attachmentsTable.kind, "receipt"),
        ));
      if (existingReceipts.length >= MAX_RECEIPTS_PER_RECORD) {
        res.status(400).json({ error: "This record already has a receipt attached." });
        return;
      }
    } else {
      const existing = await db
        .select()
        .from(attachmentsTable)
        .where(and(
          eq(attachmentsTable.userId, userId),
          eq(attachmentsTable.recordId, recordId),
          eq(attachmentsTable.kind, "photo"),
        ));
      if (existing.length >= MAX_PHOTOS_PER_RECORD) {
        res.status(400).json({ error: `Maximum ${MAX_PHOTOS_PER_RECORD} photos per record.` });
        return;
      }
    }
  } else if (journalIdRaw != null) {
    if (kind === "receipt") {
      res.status(400).json({ error: "Receipts can only attach to records, not journal entries." });
      return;
    }
    const parsed = typeof journalIdRaw === "number"
      ? journalIdRaw
      : parseInt(String(journalIdRaw), 10);
    if (!Number.isFinite(parsed)) {
      res.status(400).json({ error: "Invalid journalId" });
      return;
    }
    const j = await getJournalIfOwned(userId, parsed);
    if (!j) {
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }
    journalId = parsed;

    const existing = await db
      .select()
      .from(attachmentsTable)
      .where(and(
        eq(attachmentsTable.userId, userId),
        eq(attachmentsTable.journalId, journalId),
      ));
    if (existing.length >= MAX_ATTACHMENTS_PER_JOURNAL) {
      res.status(400).json({ error: "This journal entry already has an image attached." });
      return;
    }
  } else {
    res.status(400).json({ error: "Either recordId or journalId is required." });
    return;
  }

  // Quota check
  const usedBytes = await getUserUsageBytes(userId);
  if (usedBytes + byteSize > USER_QUOTA_BYTES) {
    res.status(413).json({
      error: "Storage quota exceeded.",
      usedBytes,
      capBytes: USER_QUOTA_BYTES,
    });
    return;
  }

  const storageKey = generateAttachmentKey(userId);
  const uploadUrl = await getUploadURL(storageKey, mimeType);

  res.json({
    uploadUrl,
    storageKey,
    mimeType,
    kind,
    recordId,
    journalId,
  });
});

/**
 * Step 2: After successful upload to GCS, register the metadata row.
 * Re-validates ownership and quota at insert time so a stale upload URL
 * cannot bypass limits.
 */
router.post("/register", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const body = req.body as Record<string, unknown>;
  const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const byteSize = typeof body.byteSize === "number" ? body.byteSize : NaN;
  const kindRaw = typeof body.kind === "string" ? body.kind : "photo";
  const kind: "photo" | "receipt" = kindRaw === "receipt" ? "receipt" : "photo";
  const recordIdRaw = body.recordId;
  const journalIdRaw = body.journalId;

  if (!storageKey || !mimeType || !Number.isFinite(byteSize) || byteSize <= 0) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Storage key must belong to this user (matches the prefix generated server-side).
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!storageKey.startsWith(`attachments/${safeUserId}/`)) {
    res.status(403).json({ error: "Storage key does not belong to this user." });
    return;
  }

  if (byteSize > MAX_FILE_SIZE_BYTES) {
    await deleteAttachment(storageKey);
    res.status(413).json({ error: "File too large." });
    return;
  }

  let recordId: number | null = null;
  let journalId: number | null = null;

  if (recordIdRaw != null) {
    const parsed = typeof recordIdRaw === "number" ? recordIdRaw : parseInt(String(recordIdRaw), 10);
    if (!Number.isFinite(parsed)) {
      await deleteAttachment(storageKey);
      res.status(400).json({ error: "Invalid recordId" });
      return;
    }
    const rec = await getRecordIfOwned(userId, parsed);
    if (!rec) {
      await deleteAttachment(storageKey);
      res.status(404).json({ error: "Record not found" });
      return;
    }
    recordId = parsed;
  } else if (journalIdRaw != null) {
    const parsed = typeof journalIdRaw === "number" ? journalIdRaw : parseInt(String(journalIdRaw), 10);
    if (!Number.isFinite(parsed)) {
      await deleteAttachment(storageKey);
      res.status(400).json({ error: "Invalid journalId" });
      return;
    }
    const j = await getJournalIfOwned(userId, parsed);
    if (!j) {
      await deleteAttachment(storageKey);
      res.status(404).json({ error: "Journal entry not found" });
      return;
    }
    journalId = parsed;
  } else {
    await deleteAttachment(storageKey);
    res.status(400).json({ error: "Either recordId or journalId is required." });
    return;
  }

  // Re-check quota
  const usedBytes = await getUserUsageBytes(userId);
  if (usedBytes + byteSize > USER_QUOTA_BYTES) {
    await deleteAttachment(storageKey);
    res.status(413).json({ error: "Storage quota exceeded." });
    return;
  }

  const [inserted] = await db
    .insert(attachmentsTable)
    .values({
      userId,
      recordId,
      journalId,
      kind,
      storageKey,
      mimeType,
      byteSize,
    })
    .returning();

  res.json({
    id: String(inserted.id),
    kind: inserted.kind,
    mimeType: inserted.mimeType,
    byteSize: inserted.byteSize,
    recordId: inserted.recordId,
    journalId: inserted.journalId,
    createdAt: inserted.createdAt.toISOString(),
  });
});

/**
 * Bulk photo counts for the requesting user across many records and/or
 * journal entries. Used by History and Journal to render a small "n photos"
 * indicator without firing one request per row.
 *
 * Query params:
 *   recordIds=1,2,3
 *   journalIds=4,5,6
 *
 * Response:
 *   { records: { "1": 3, "2": 0, ... }, journals: { "4": 1, ... } }
 *
 * Only photo-kind attachments are counted (receipts are excluded).
 * IDs not owned by the user simply don't appear in the result.
 */
const MAX_BULK_IDS = 200;

router.get("/counts", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordIdsRaw = typeof req.query.recordIds === "string" ? req.query.recordIds : "";
  const journalIdsRaw = typeof req.query.journalIds === "string" ? req.query.journalIds : "";

  const parseList = (s: string): number[] => {
    if (!s) return [];
    const seen = new Set<number>();
    for (const part of s.split(",")) {
      const n = parseInt(part.trim(), 10);
      if (Number.isFinite(n) && n > 0) seen.add(n);
    }
    return Array.from(seen).slice(0, MAX_BULK_IDS);
  };

  const recordIds = parseList(recordIdsRaw);
  const journalIds = parseList(journalIdsRaw);

  const records: Record<string, number> = {};
  const journals: Record<string, number> = {};

  if (recordIds.length > 0) {
    const rows = await db
      .select({
        recordId: attachmentsTable.recordId,
        c: sql<number>`count(*)::int`,
      })
      .from(attachmentsTable)
      .where(and(
        eq(attachmentsTable.userId, userId),
        eq(attachmentsTable.kind, "photo"),
        inArray(attachmentsTable.recordId, recordIds),
      ))
      .groupBy(attachmentsTable.recordId);
    for (const r of rows) {
      if (r.recordId != null) records[String(r.recordId)] = Number(r.c);
    }
  }

  if (journalIds.length > 0) {
    const rows = await db
      .select({
        journalId: attachmentsTable.journalId,
        c: sql<number>`count(*)::int`,
      })
      .from(attachmentsTable)
      .where(and(
        eq(attachmentsTable.userId, userId),
        eq(attachmentsTable.kind, "photo"),
        inArray(attachmentsTable.journalId, journalIds),
      ))
      .groupBy(attachmentsTable.journalId);
    for (const r of rows) {
      if (r.journalId != null) journals[String(r.journalId)] = Number(r.c);
    }
  }

  res.json({ records, journals });
});

router.get("/list", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const recordIdRaw = req.query.recordId;
  const journalIdRaw = req.query.journalId;

  let condition;
  if (typeof recordIdRaw === "string" && recordIdRaw) {
    const parsed = parseInt(recordIdRaw, 10);
    if (!Number.isFinite(parsed)) {
      res.status(400).json({ error: "Invalid recordId" });
      return;
    }
    condition = and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.recordId, parsed));
  } else if (typeof journalIdRaw === "string" && journalIdRaw) {
    const parsed = parseInt(journalIdRaw, 10);
    if (!Number.isFinite(parsed)) {
      res.status(400).json({ error: "Invalid journalId" });
      return;
    }
    condition = and(eq(attachmentsTable.userId, userId), eq(attachmentsTable.journalId, parsed));
  } else {
    res.status(400).json({ error: "recordId or journalId query param required" });
    return;
  }

  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(condition)
    .orderBy(desc(attachmentsTable.createdAt));

  res.json({
    attachments: rows.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      recordId: r.recordId,
      journalId: r.journalId,
      createdAt: r.createdAt.toISOString(),
      // serving URL — does not expose storage key
      url: `/api/attachments/${r.id}/file`,
    })),
  });
});

/**
 * Stream the file bytes for an attachment owned by the requesting user.
 * Authenticated; the URL itself does not leak the GCS path.
 */
router.get("/:id/file", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const data = await streamAttachment(row.storageKey);
  if (!data) {
    res.status(404).json({ error: "File missing" });
    return;
  }
  res.setHeader("Content-Type", data.contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (data.contentLength) res.setHeader("Content-Length", data.contentLength);
  data.stream.pipe(res);
  data.stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
});

/**
 * Optional: short-lived signed URL (useful for <a href> downloads of PDFs).
 */
router.get("/:id/signed-url", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const url = await getDownloadURL(row.storageKey);
  res.json({ url });
});

router.delete("/:id", authenticate, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(attachmentsTable)
    .where(and(eq(attachmentsTable.id, id), eq(attachmentsTable.userId, userId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await deleteAttachment(row.storageKey);
  await db.delete(attachmentsTable).where(eq(attachmentsTable.id, id));
  res.json({ ok: true });
});

export default router;
