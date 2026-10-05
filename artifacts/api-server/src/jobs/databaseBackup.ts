/**
 * Daily backup of the production database, run by the scheduler inside the
 * published app (see SCHEDULING.md).
 *
 * `pg_dump` output is gzipped and streamed straight into App Storage under
 * `<PRIVATE_OBJECT_DIR>/backups/prod-daily/`, so no copy of the data is
 * written to the server's disk. The newest PROD_BACKUP_KEEP backups are kept
 * and older ones deleted. A failure is emailed to BACKUP_NOTIFY_EMAIL when
 * that is set.
 *
 * Only runs where REPLIT_DEPLOYMENT=1, because only there is DATABASE_URL the
 * production database (in the workspace it is the development database,
 * which `backup:db` covers). `--allow-non-production` overrides this for
 * testing.
 *
 * Restore: `pnpm --filter @workspace/api-server run backup:fetch <file name>`
 * downloads one, then `gunzip -c <file> | psql "<database url>"`.
 */
import { spawn } from "child_process";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { storage, parseObjectStorageDir, formatBytes, utcTimestamp } from "../scripts/_backup-utils.js";
import { getUncachableResendClient } from "../lib/resend.js";

export const PROD_BACKUP_KEEP = 30;
const BACKUP_DIR = "backups/prod-daily/";
const FILE_PREFIX = "myimpact-prod-";
const FILE_SUFFIX = ".sql.gz";
const STDERR_LIMIT = 4000;

/**
 * Which backups to delete so only the newest `keep` remain. Names carry a
 * UTC timestamp, so newest sorts last. Files that are not daily backups are
 * never touched.
 */
export function backupsToPrune(objectNames: string[], keep: number): string[] {
  const backups = objectNames
    .filter((n) => {
      const base = n.slice(n.lastIndexOf("/") + 1);
      return base.startsWith(FILE_PREFIX) && base.endsWith(FILE_SUFFIX);
    })
    .sort();
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/** Streams pg_dump through gzip into `destination`; rejects with pg_dump's stderr on failure. */
export async function dumpTo(databaseUrl: string, destination: NodeJS.WritableStream): Promise<void> {
  const proc = spawn(
    "pg_dump",
    ["--no-owner", "--no-privileges", "--clean", "--if-exists", "--quote-all-identifiers", databaseUrl],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  proc.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < STDERR_LIMIT) stderr += chunk.toString();
  });
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "ENOENT" ? new Error("pg_dump is not installed where the API runs") : err),
    );
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_dump exited with ${code}: ${stderr.trim().slice(0, STDERR_LIMIT)}`)),
    );
  });
  // Wait for both, so a failed dump is never cleaned up while the upload is
  // still finishing.
  const [upload, dump] = await Promise.allSettled([pipeline(proc.stdout, createGzip(), destination), exited]);
  if (dump.status === "rejected") throw dump.reason;
  if (upload.status === "rejected") throw upload.reason;
}

async function notifyFailure(error: unknown): Promise<void> {
  const to = process.env.BACKUP_NOTIFY_EMAIL;
  if (!to) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const message = error instanceof Error ? error.message : String(error);
    await client.emails.send({
      from: fromEmail,
      to,
      subject: "My Impact: daily database backup FAILED",
      text: `The daily production database backup failed at ${new Date().toISOString()}.\n\n${message}\n\nThe scheduler retries on the next run. Details are in the Replit deployment logs.`,
    });
  } catch (err) {
    console.error("[database-backup] could not send the failure email:", err);
  }
}

export async function runDatabaseBackup(args: string[]): Promise<boolean> {
  try {
    if (process.env.REPLIT_DEPLOYMENT !== "1" && !args.includes("--allow-non-production")) {
      throw new Error("Refusing to run outside the published app: DATABASE_URL here is not the production database.");
    }
    const databaseUrl = process.env.DATABASE_URL;
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
    if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR is not set. App Storage must be provisioned.");

    const { bucket: bucketName, prefix } = parseObjectStorageDir(privateDir);
    const bucket = storage.bucket(bucketName);
    const dir = `${prefix}/${BACKUP_DIR}`;
    const file = bucket.file(`${dir}${FILE_PREFIX}${utcTimestamp()}${FILE_SUFFIX}`);

    console.log(`[database-backup] dumping to gs://${bucketName}/${file.name}`);
    try {
      await dumpTo(databaseUrl, file.createWriteStream({ resumable: false, contentType: "application/gzip" }));
    } catch (err) {
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      throw err;
    }

    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    if (!(size > 0)) throw new Error(`Backup ${file.name} is empty after upload.`);
    console.log(`[database-backup] uploaded ${formatBytes(size)}`);

    const [existing] = await bucket.getFiles({ prefix: dir });
    const stale = backupsToPrune(existing.map((f) => f.name), PROD_BACKUP_KEEP);
    for (const name of stale) await bucket.file(name).delete({ ignoreNotFound: true });
    console.log(`[database-backup] done: ${existing.length - stale.length} kept, ${stale.length} deleted`);
    return true;
  } catch (err) {
    console.error("[database-backup] failed:", err);
    await notifyFailure(err);
    throw err;
  }
}
