import { Storage } from "@google-cloud/storage";
import { mkdir, stat } from "fs/promises";
import path from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

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

async function main() {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const { bucket: bucketName, prefix: dirPrefix } = parseObjectStorageDir(privateDir);
  const prefix = `${dirPrefix}/backups/`;

  const [files] = await storage.bucket(bucketName).getFiles({ prefix });
  console.log(`Found ${files.length} backup object(s) in bucket:`);
  for (const f of files) {
    const [m] = await f.getMetadata();
    console.log(` - gs://${bucketName}/${f.name}  (${m.size} bytes)`);
  }
  if (files.length === 0) return;

  const target = process.argv[2];
  const file = target
    ? files.find((f) => f.name.endsWith(target))
    : files.sort((a, b) => (a.name < b.name ? 1 : -1))[0];
  if (!file) throw new Error(`No backup matching "${target}" found.`);

  const outDir = "/tmp/myimpact-backups";
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, path.basename(file.name));
  await file.download({ destination: outPath });
  const s = await stat(outPath);
  console.log(`\nDownloaded → ${outPath} (${s.size} bytes)`);
}

main().catch((err) => {
  console.error("fetch-backup failed:", err);
  process.exit(1);
});
