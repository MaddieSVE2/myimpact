/**
 * MyImpact database backup script.
 *
 * Supports two targets via `--target`:
 *
 *   --target dev   (default)
 *     Runs `pg_dump` against `process.env.DATABASE_URL` (the
 *     development DB) and uploads the resulting `.sql` file to
 *     App Storage under the `backups/` prefix. Per-table row
 *     counts are taken from the dev DB via SELECT COUNT(*).
 *     Optional flags: --gzip, --prune --keep N, --notify [--notify-email],
 *     used by the scheduled backup job.
 *
 *   --target prod
 *     Uploads a pre-assembled production SQL dump to App Storage
 *     under the `backups/prod/` prefix. Production `DATABASE_URL`
 *     is intentionally NOT exposed to the workspace runtime; the
 *     prod DB is reachable only through the Replit database skill
 *     in production mode (read-only). Per-table row counts are
 *     supplied via a `--counts <json>` file produced from
 *     SELECT COUNT(*) against prod via that skill — they are the
 *     source of truth and the script asserts that the dump's
 *     INSERT-per-table counts match them before uploading.
 *     The local SQL file is deleted after a verified upload
 *     (override with --keep-local, debugging only) so production
 *     PII is never left on the workspace disk.
 *
 * Reporting format is identical across targets: file name, size,
 * App Storage key, table count, total rows, and per-table counts.
 */
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, stat, unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import path from "path";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUncachableResendClient } from "../lib/resend.js";
import {
  storage,
  parseObjectStorageDir,
  formatBytes,
  utcTimestamp as timestamp,
} from "./_backup-utils.js";

type Target = "dev" | "prod";

interface TableCount {
  table: string;
  rows: number;
}

interface PruneResult {
  kept: string[];
  deleted: string[];
}

interface RunOptions {
  target: Target;
  wantGzip: boolean;
  wantPrune: boolean;
  keep: number;
  wantNotify: boolean;
  notifyEmail?: string;
  // prod-only:
  sqlFile?: string;
  countsFile?: string;
  keepLocal?: boolean;
}

interface RunSummary {
  target: Target;
  bucketName: string;
  objectName: string;
  objectKey: string;
  fileName: string;
  sizeBytes: number;
  totalRows: number;
  tableCount: number;
  pruned?: PruneResult;
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

async function getDevRowCounts(): Promise<TableCount[]> {
  const tables = await listPublicTables();
  if (tables.length === 0) {
    throw new Error(
      "No tables found in the public schema. Refusing to claim a clean backup.",
    );
  }
  const out: TableCount[] = [];
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

async function loadProdRowCountsFromFile(countsPath: string): Promise<TableCount[]> {
  const raw = await readFile(countsPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Counts file ${countsPath} is not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Counts file ${countsPath} must be a JSON object of {table: rowCount}.`,
    );
  }
  const out: TableCount[] = [];
  for (const [table, rows] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof rows !== "number" || !Number.isInteger(rows) || rows < 0) {
      throw new Error(
        `Counts file ${countsPath}: table "${table}" has non-integer row count ${JSON.stringify(rows)}.`,
      );
    }
    out.push({ table, rows });
  }
  if (out.length === 0) {
    throw new Error(`Counts file ${countsPath} is empty — refusing to upload.`);
  }
  out.sort((a, b) => a.table.localeCompare(b.table));
  return out;
}

/**
 * For prod: assert the assembled dump's per-table INSERT counts
 * match the source-of-truth row counts (taken from prod via the
 * database skill). Refuse to upload on any mismatch.
 */
async function assertProdDumpMatchesCounts(
  sqlPath: string,
  counts: TableCount[],
): Promise<void> {
  const contents = await readFile(sqlPath, "utf8");
  const insertCounts = new Map<string, number>();
  const re = /^INSERT INTO "([^"]+)"\s/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contents)) !== null) {
    const t = m[1]!;
    insertCounts.set(t, (insertCounts.get(t) ?? 0) + 1);
  }
  const mismatches: string[] = [];
  for (const { table, rows } of counts) {
    const got = insertCounts.get(table) ?? 0;
    if (got !== rows) {
      mismatches.push(
        `  ${table}: counts.json says ${rows}, dump has ${got} INSERTs`,
      );
    }
  }
  for (const [t, got] of insertCounts.entries()) {
    if (!counts.find((c) => c.table === t)) {
      mismatches.push(
        `  ${t}: in dump (${got} INSERTs) but missing from counts.json`,
      );
    }
  }
  if (mismatches.length) {
    throw new Error(
      "Dump does not match production row counts — refusing to upload:\n" +
        mismatches.join("\n"),
    );
  }
}

async function pruneOldBackups(
  bucketName: string,
  backupsPrefix: string,
  keep: number,
): Promise<PruneResult> {
  const [files] = await storage.bucket(bucketName).getFiles({ prefix: backupsPrefix });
  // Only prune at this exact prefix level — never recurse into sub-prefixes
  // (e.g. when scoping to dev's `backups/`, do NOT also list `backups/prod/`).
  const sqlFiles = files.filter((f) => {
    if (!f.name.endsWith(".sql")) return false;
    const rest = f.name.slice(backupsPrefix.length);
    return !rest.includes("/");
  });
  // Names are timestamped (YYYY-MM-DDTHHMM) so lexical desc = chronological desc.
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

function parseStringArg(args: string[], name: string): string | undefined {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return undefined;
  if (args[idx]!.includes("=")) return args[idx]!.split("=").slice(1).join("=");
  return args[idx + 1];
}

function parseKeepArg(args: string[]): number {
  const raw = parseStringArg(args, "--keep");
  if (raw === undefined) return 12;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--keep expects a positive integer, got "${raw}".`);
  }
  return n;
}

function parseTargetArg(args: string[]): Target {
  const raw = parseStringArg(args, "--target");
  if (raw === undefined) return "dev";
  if (raw !== "dev" && raw !== "prod") {
    throw new Error(`--target must be "dev" or "prod", got "${raw}".`);
  }
  return raw;
}

function parseNotifyEmailArg(args: string[]): string | undefined {
  const raw = parseStringArg(args, "--notify-email");
  if (raw === undefined) return undefined;
  if (!raw.includes("@")) {
    throw new Error(`--notify-email expects a valid email, got "${raw}".`);
  }
  return raw;
}

/**
 * Path-prefix policy:
 *   dev  → `<private>/backups/`        (preserves existing scheduled job
 *                                        and fetch-backup.ts behavior)
 *   prod → `<private>/backups/prod/`   (kept distinct so dev pruning never
 *                                        touches prod snapshots)
 */
function backupsPrefix(prefix: string, target: Target): string {
  return target === "prod" ? `${prefix}/backups/prod/` : `${prefix}/backups/`;
}

async function runBackup(options: RunOptions): Promise<RunSummary> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR is not set. App Storage must be provisioned for this project.",
    );
  }
  const { bucket: bucketName, prefix } = parseObjectStorageDir(privateDir);
  const targetPrefix = backupsPrefix(prefix, options.target);

  // ─── Source the SQL file + per-table counts for the chosen target ───
  let sqlPath: string;
  let fileName: string;
  let counts: TableCount[];

  if (options.target === "dev") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set.");
    }
    const stamp = timestamp();
    fileName = `myimpact-db-backup-${stamp}.sql`;
    const localDir = path.resolve("backups");
    sqlPath = path.join(localDir, fileName);
    await mkdir(localDir, { recursive: true });

    console.log(`\n[1/4] Running pg_dump (dev) → ${sqlPath}`);
    await runPgDump(process.env.DATABASE_URL, sqlPath);
    const stats0 = await stat(sqlPath);
    console.log(`      Wrote ${formatBytes(stats0.size)} (${stats0.size} bytes)`);

    console.log(`\n[2/4] Collecting per-table row counts from dev DB...`);
    counts = await getDevRowCounts();
  } else {
    if (!options.sqlFile) {
      throw new Error("--target prod requires --sql-file <path> (the assembled prod SQL dump).");
    }
    if (!options.countsFile) {
      throw new Error(
        "--target prod requires --counts <path> (JSON of true per-table row counts " +
          "from prod, taken via the database skill in production mode).",
      );
    }
    sqlPath = path.resolve(options.sqlFile);
    fileName = path.basename(sqlPath);

    console.log(`\n[1/4] Loading per-table row counts from ${options.countsFile}...`);
    counts = await loadProdRowCountsFromFile(options.countsFile);

    console.log(`\n[2/4] Verifying assembled dump matches per-table row counts...`);
    await assertProdDumpMatchesCounts(sqlPath, counts);
    console.log(`      OK — every table's INSERT count matches counts.json.`);
  }

  // ─── Common reporting block ───
  const widest = Math.max(...counts.map((c) => c.table.length), 5);
  for (const c of counts) {
    console.log(`      ${c.table.padEnd(widest)}  ${c.rows}`);
  }
  const totalRows = counts.reduce((sum, c) => sum + c.rows, 0);
  console.log(`      ${"TOTAL".padEnd(widest)}  ${totalRows}`);

  const stats = await stat(sqlPath);
  const objectName = `${targetPrefix}${fileName}`;
  const objectKey = `/${bucketName}/${objectName}`;

  console.log(`\n[3/4] Uploading to App Storage (${options.target})`);
  console.log(`      gs://${bucketName}/${objectName}`);
  console.log(`      Local file: ${sqlPath} (${formatBytes(stats.size)})`);
  const uploadStream = storage.bucket(bucketName).file(objectName).createWriteStream({
    contentType: "application/sql",
    resumable: false,
    metadata: {
      metadata: {
        source: "myimpact-db-backup-script",
        environment: options.target === "prod" ? "production" : "development",
        createdAt: new Date().toISOString(),
        totalRows: String(totalRows),
        tableCount: String(counts.length),
      },
    },
  });
  await pipeline(createReadStream(sqlPath), uploadStream);

  console.log(`\n[4/4] Verifying upload...`);
  const [exists] = await storage.bucket(bucketName).file(objectName).exists();
  if (!exists) {
    throw new Error("Upload verification failed: object not found in bucket.");
  }
  const [meta] = await storage.bucket(bucketName).file(objectName).getMetadata();
  console.log(`      Confirmed: ${meta.size} bytes in App Storage.`);

  let pruned: PruneResult | undefined;
  if (options.wantPrune) {
    console.log(`\n[+]   Pruning old ${options.target} backups (keeping last ${options.keep})...`);
    pruned = await pruneOldBackups(bucketName, targetPrefix, options.keep);
    console.log(`      Kept ${pruned.kept.length} backup(s); deleted ${pruned.deleted.length}.`);
    for (const k of pruned.kept) console.log(`      keep    ${k}`);
    for (const d of pruned.deleted) console.log(`      delete  ${d}`);
  }

  let gzPath: string | null = null;
  if (options.wantGzip && options.target === "dev") {
    gzPath = `${sqlPath}.gz`;
    console.log(`\n[+]   Writing gzipped copy → ${gzPath}`);
    await pipeline(createReadStream(sqlPath), createGzip(), createWriteStream(gzPath));
    const gzStats = await stat(gzPath);
    console.log(`      Wrote ${formatBytes(gzStats.size)} (${gzStats.size} bytes)`);
  }

  // For prod, scrub the local SQL file from disk (PII protection).
  if (options.target === "prod") {
    if (options.keepLocal) {
      console.log(
        `\n[+]   --keep-local: NOT deleting ${sqlPath}. ` +
          `Do NOT commit this file to git.`,
      );
    } else {
      await unlink(sqlPath);
      console.log(`\n[+]   Removed local prod dump: ${sqlPath}.`);
    }
  }

  console.log(`\nBackup complete (${options.target}).`);
  console.log(`   File name:         ${fileName}`);
  console.log(`   Size:              ${formatBytes(stats.size)} (${stats.size} bytes)`);
  console.log(`   App Storage key:   ${objectKey}`);
  console.log(`   Bucket / object:   ${bucketName} / ${objectName}`);
  console.log(`   Tables backed up:  ${counts.length}`);
  console.log(`   Total rows:        ${totalRows}`);
  if (options.target === "dev") console.log(`   Local SQL file:    ${sqlPath}`);
  if (gzPath) console.log(`   Local gzip copy:   ${gzPath}`);
  console.log("");

  return {
    target: options.target,
    bucketName,
    objectName,
    objectKey,
    fileName,
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
  // pnpm forwards a literal "--" separator as the first argv entry; strip it.
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const argSet = new Set(argv);

  const target = parseTargetArg(argv);
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

  const sqlFile = parseStringArg(argv, "--sql-file");
  const countsFile = parseStringArg(argv, "--counts");
  const keepLocal = argSet.has("--keep-local");

  let summary: RunSummary | null = null;
  let runError: unknown = null;

  try {
    summary = await runBackup({
      target,
      wantGzip,
      wantPrune,
      keep,
      wantNotify,
      notifyEmail,
      sqlFile,
      countsFile,
      keepLocal,
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
        console.log(`Success notification sent to ${notifyEmail}.`);
      } else {
        await sendNotification({
          to: notifyEmail,
          subject: "My Impact — weekly DB backup FAILED",
          html: buildFailureEmail(runError),
        });
        console.log(`Failure notification sent to ${notifyEmail}.`);
      }
    } catch (notifyErr) {
      console.error("Failed to send backup notification email:", notifyErr);
      // Do not let a notification failure mask the original outcome.
    }
  }

  // Pool is only opened on the dev path (the prod flow never queries the
  // local DB), but pool.end() is safe to call either way.
  try {
    await pool.end();
  } catch {}

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
