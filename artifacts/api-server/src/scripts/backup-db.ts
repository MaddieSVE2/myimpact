import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { createGzip } from "zlib";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

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

async function main() {
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

  const args = new Set(process.argv.slice(2));
  const wantGzip = args.has("--gzip") || args.has("--downloadable");

  const stamp = timestamp();
  const sqlFileName = `myimpact-db-backup-${stamp}.sql`;
  const localDir = path.resolve("backups");
  const sqlPath = path.join(localDir, sqlFileName);
  await mkdir(localDir, { recursive: true });

  console.log(`\n[1/4] Running pg_dump → ${sqlPath}`);
  await runPgDump(process.env.DATABASE_URL, sqlPath);

  const stats = await stat(sqlPath);
  console.log(`      Wrote ${formatBytes(stats.size)} (${stats.size} bytes)`);

  console.log(`\n[2/4] Collecting per-table row counts...`);
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

  console.log(`\n[3/4] Uploading to App Storage`);
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

  console.log(`\n[4/4] Verifying upload...`);
  const [exists] = await storage.bucket(bucketName).file(objectName).exists();
  if (!exists) {
    throw new Error("Upload verification failed: object not found in bucket.");
  }
  const [meta] = await storage.bucket(bucketName).file(objectName).getMetadata();
  console.log(`      Confirmed: ${meta.size} bytes in App Storage.`);

  let gzPath: string | null = null;
  if (wantGzip) {
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

  await pool.end();
}

main().catch(async (err) => {
  console.error("Backup failed:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
