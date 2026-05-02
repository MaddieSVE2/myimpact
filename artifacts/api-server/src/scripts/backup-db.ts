import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend.js";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

// The dump itself is produced by `pg_dump` and covers every table in the
// database. The row-count summary printed at the end of the run is a sanity
// check, and is built dynamically by querying information_schema so newly
// added product tables appear in the summary automatically.

function parseObjectStorageDir(privateDir: string): { bucket: string; prefix: string } {
  const trimmed = privateDir.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("PRIVATE_OBJECT_DIR is empty after trimming.");
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `PRIVATE_OBJECT_DIR "${privateDir}" must be of the form "/<bucket>/<prefix>" ` +
        `(e.g. "/replit-objstore-xxx/.private"). Got no "/" inside the value.`,
    );
  }
  const bucket = trimmed.slice(0, slash);
  const prefix = trimmed.slice(slash + 1);
  if (!bucket || !prefix) {
    throw new Error(
      `PRIVATE_OBJECT_DIR "${privateDir}" must include both a bucket and a prefix.`,
    );
  }
  return { bucket, prefix };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function runPgDump(databaseUrl: string, outFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "pg_dump",
      [
        "--no-owner",
        "--no-privileges",
        "--clean",
        "--if-exists",
        "--quote-all-identifiers",
        "-f",
        outFile,
        databaseUrl,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exited with code ${code}`));
    });
  });
}

async function listPublicTables(): Promise<string[]> {
  const res = await db.execute<{ table_name: string }>(
    sql.raw(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    ),
  );
  return res.rows.map((r) => r.table_name);
}

async function getRowCounts(): Promise<Array<{ table: string; rows: number }>> {
  const tables = await listPublicTables();
  if (tables.length === 0) {
    throw new Error(
      "No tables found in the public schema. Refusing to claim a clean backup.",
    );
  }
  const out: Array<{ table: string; rows: number }> = [];
  for (const t of tables) {
    const quoted = `"${t.replace(/"/g, '""')}"`;
    const res = await db.execute<{ count: string }>(
      sql.raw(`SELECT COUNT(*)::text AS count FROM ${quoted}`),
    );
    const row = res.rows[0];
    if (!row || typeof row.count !== "string") {
      throw new Error(`Failed to read row count for table "${t}": no rows returned.`);
    }
    const n = Number(row.count);
    if (!Number.isFinite(n)) {
      throw new Error(`Failed to parse row count for table "${t}": got "${row.count}".`);
    }
    out.push({ table: t, rows: n });
  }
  return out;
}

interface PruneResult {
  kept: string[];
  deleted: string[];
}

async function pruneOldBackups(
  bucketName: string,
  backupsPrefix: string,
  keep: number,
): Promise<PruneResult> {
  const [files] = await storage.bucket(bucketName).getFiles({ prefix: backupsPrefix });
  // Only consider .sql files (ignore any stray .gz copies)
  const sqlFiles = files.filter((f) => f.name.endsWith(".sql"));
  // Sort descending by name — names are timestamped (YYYY-MM-DDTHHMM) so
  // lexical ordering matches chronological ordering.
  sqlFiles.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  const kept = sqlFiles.slice(0, keep).map((f) => f.name);
  const toDelete = sqlFiles.slice(keep);
  const deleted: string[] = [];
  for (const file of toDelete) {
    await file.delete({ ignoreNotFound: true });
    deleted.push(file.name);
  }
  return { kept, deleted };
}

interface NotifyOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendNotification(opts: NotifyOptions): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  const { error } = await client.emails.send({
    from: fromEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(
      `Resend delivery failed: ${typeof error === "string" ? error : JSON.stringify(error)}`,
    );
  }
}

function parseKeepArg(args: string[]): number {
  const idx = args.findIndex((a) => a === "--keep" || a.startsWith("--keep="));
  if (idx === -1) return 12;
  const raw = args[idx]!.includes("=") ? args[idx]!.split("=")[1] : args[idx + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--keep expects a positive integer, got "${raw}".`);
  }
  return n;
}

function parseNotifyEmailArg(args: string[]): string | undefined {
  const idx = args.findIndex((a) => a === "--notify-email" || a.startsWith("--notify-email="));
  if (idx === -1) return undefined;
  const raw = args[idx]!.includes("=")
    ? args[idx]!.split("=")[1]
    : args[idx + 1];
  if (!raw || !raw.includes("@")) {
    throw new Error(`--notify-email expects a valid email, got "${raw}".`);
  }
  return raw;
}

interface RunOptions {
  wantGzip: boolean;
  wantPrune: boolean;
  keep: number;
  wantNotify: boolean;
  notifyEmail?: string;
}

interface RunSummary {
  bucketName: string;
  objectName: string;
  objectKey: string;
  sizeBytes: number;
  totalRows: number;
  tableCount: number;
  pruned?: PruneResult;
}

async function runBackup(options: RunOptions): Promise<RunSummary> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR is not set. App Storage must be provisioned for this project.",
    );
  }
  const { bucket: bucketName, prefix } = parseObjectStorageDir(privateDir);

  const stamp = timestamp();
  const sqlFileName = `myimpact-db-backup-${stamp}.sql`;
  const localDir = path.resolve("backups");
  const sqlPath = path.join(localDir, sqlFileName);
  await mkdir(localDir, { recursive: true });

  const totalSteps = options.wantPrune ? 5 : 4;
  console.log(`\n[1/${totalSteps}] Running pg_dump → ${sqlPath}`);
  await runPgDump(process.env.DATABASE_URL, sqlPath);

  const stats = await stat(sqlPath);
  console.log(`      Wrote ${formatBytes(stats.size)} (${stats.size} bytes)`);

  console.log(`\n[2/${totalSteps}] Collecting per-table row counts...`);
  const counts = await getRowCounts();
  const widest = Math.max(...counts.map((c) => c.table.length));
  for (const c of counts) {
    console.log(`      ${c.table.padEnd(widest)}  ${c.rows}`);
  }
  const totalRows = counts.reduce((sum, c) => sum + c.rows, 0);
  console.log(`      ${"TOTAL".padEnd(widest)}  ${totalRows}`);

  const fileName = sqlFileName;
  const objectName = `${prefix}/backups/${fileName}`;
  const objectKey = `/${bucketName}/${objectName}`;

  console.log(`\n[3/${totalSteps}] Uploading to App Storage`);
  console.log(`      gs://${bucketName}/${objectName}`);
  const uploadStream = storage
    .bucket(bucketName)
    .file(objectName)
    .createWriteStream({
      contentType: "application/sql",
      resumable: false,
      metadata: {
        metadata: {
          source: "myimpact-db-backup-script",
          createdAt: new Date().toISOString(),
          totalRows: String(totalRows),
        },
      },
    });
  await pipeline(createReadStream(sqlPath), uploadStream);

  console.log(`\n[4/${totalSteps}] Verifying upload...`);
  const [exists] = await storage.bucket(bucketName).file(objectName).exists();
  if (!exists) {
    throw new Error("Upload verification failed: object not found in bucket.");
  }
  const [meta] = await storage.bucket(bucketName).file(objectName).getMetadata();
  console.log(`      Confirmed: ${meta.size} bytes in App Storage.`);

  let pruned: PruneResult | undefined;
  if (options.wantPrune) {
    console.log(`\n[5/${totalSteps}] Pruning old backups (keeping last ${options.keep})...`);
    const backupsPrefix = `${prefix}/backups/`;
    pruned = await pruneOldBackups(bucketName, backupsPrefix, options.keep);
    console.log(`      Kept ${pruned.kept.length} backup(s); deleted ${pruned.deleted.length}.`);
    for (const k of pruned.kept) {
      console.log(`      keep    ${k}`);
    }
    for (const d of pruned.deleted) {
      console.log(`      delete  ${d}`);
    }
  }

  let gzPath: string | null = null;
  if (options.wantGzip) {
    gzPath = `${sqlPath}.gz`;
    console.log(`\n[+]   Writing gzipped copy → ${gzPath}`);
    await pipeline(createReadStream(sqlPath), createGzip(), createWriteStream(gzPath));
    const gzStats = await stat(gzPath);
    console.log(`      Wrote ${formatBytes(gzStats.size)} (${gzStats.size} bytes)`);
  }

  console.log(`\n✅ Backup complete.`);
  console.log(`   Local SQL file:    ${sqlPath}`);
  if (gzPath) console.log(`   Local gzip copy:   ${gzPath}`);
  console.log(`   App Storage key:   ${objectKey}`);
  console.log(`   Bucket / object:   ${bucketName} / ${objectName}`);
  console.log(`   Size:              ${formatBytes(stats.size)}`);
  console.log(`   Tables backed up:  ${counts.length}`);
  console.log(`   Total rows:        ${totalRows}\n`);

  return {
    bucketName,
    objectName,
    objectKey,
    sizeBytes: stats.size,
    totalRows,
    tableCount: counts.length,
    pruned,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSuccessEmail(summary: RunSummary): string {
  const prunedSection = summary.pruned
    ? `
        <p style="margin:16px 0 4px;color:#213547;"><strong>Retention:</strong></p>
        <p style="margin:0 0 4px;color:#444;font-size:14px;">
          Kept ${summary.pruned.kept.length} backup(s); deleted ${summary.pruned.deleted.length} older one(s).
        </p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:#213547;font-size:20px;">My Impact — weekly backup succeeded</h2>
      <p style="margin:0 0 16px;color:#444;font-size:14px;">
        The scheduled database backup ran successfully and the snapshot was uploaded to App Storage.
      </p>
      <table style="border-collapse:collapse;font-size:14px;color:#213547;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">When (UTC)</td><td>${escapeHtml(new Date().toISOString())}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Object</td><td><code>${escapeHtml(summary.objectKey)}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Size</td><td>${formatBytes(summary.sizeBytes)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Tables</td><td>${summary.tableCount}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Total rows</td><td>${summary.totalRows}</td></tr>
      </table>
      ${prunedSection}
      <p style="margin:24px 0 0;color:#888;font-size:12px;">
        Sent automatically by the My Impact backup job.
      </p>
    </div>
  `;
}

function buildFailureEmail(error: unknown): string {
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:#a40000;font-size:20px;">My Impact — weekly backup FAILED</h2>
      <p style="margin:0 0 12px;color:#444;font-size:14px;">
        The scheduled database backup did not complete. The most recent successful snapshot in App Storage is unaffected,
        but no new snapshot was added for this run. Please investigate so the schedule resumes cleanly next week.
      </p>
      <p style="margin:0 0 4px;color:#666;font-size:13px;">When (UTC): ${escapeHtml(new Date().toISOString())}</p>
      <pre style="background:#f6f6f6;padding:12px;border-radius:6px;font-size:12px;color:#a40000;white-space:pre-wrap;word-break:break-word;">${escapeHtml(msg)}</pre>
    </div>
  `;
}

async function main() {
  const argv = process.argv.slice(2);
  const argSet = new Set(argv);
  const wantGzip = argSet.has("--gzip") || argSet.has("--downloadable");
  const wantPrune = argSet.has("--prune");
  const wantNotify = argSet.has("--notify");
  const keep = parseKeepArg(argv);
  const notifyEmail =
    parseNotifyEmailArg(argv) ?? process.env.BACKUP_NOTIFY_EMAIL ?? undefined;

  if (wantNotify && !notifyEmail) {
    throw new Error(
      "--notify was passed but no recipient was provided. " +
        "Set BACKUP_NOTIFY_EMAIL or pass --notify-email <address>.",
    );
  }

  let summary: RunSummary | null = null;
  let runError: unknown = null;

  try {
    summary = await runBackup({
      wantGzip,
      wantPrune,
      keep,
      wantNotify,
      notifyEmail,
    });
  } catch (err) {
    runError = err;
  }

  if (wantNotify && notifyEmail) {
    try {
      if (summary) {
        await sendNotification({
          to: notifyEmail,
          subject: "My Impact — weekly DB backup succeeded",
          html: buildSuccessEmail(summary),
        });
        console.log(`📧 Success notification sent to ${notifyEmail}.`);
      } else {
        await sendNotification({
          to: notifyEmail,
          subject: "My Impact — weekly DB backup FAILED",
          html: buildFailureEmail(runError),
        });
        console.log(`📧 Failure notification sent to ${notifyEmail}.`);
      }
    } catch (notifyErr) {
      console.error("Failed to send backup notification email:", notifyErr);
      // Do not let a notification failure mask the original outcome.
    }
  }

  await pool.end();

  if (runError) {
    throw runError;
  }
}

main().catch(async (err) => {
  console.error("Backup failed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
