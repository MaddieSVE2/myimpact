// Writes a Brotli (.br) and a gzip (.gz) copy of every text file in the
// build, so serve.mjs can send compressed files without compressing on each
// request. Runs after prerender (package.json "postbuild"), so the
// prerendered pages are included.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// serve.mjs imports this list, so the two always agree.
export const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".svg", ".txt", ".webmanifest", ".map"]);
// Smaller files save too little to justify a second copy.
const MIN_BYTES = 1024;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

export function compressDir(root) {
  let count = 0;
  let before = 0;
  let after = 0;
  for (const path of files(root)) {
    if (!COMPRESSIBLE.has(extname(path).toLowerCase()) || statSync(path).size < MIN_BYTES) continue;
    const body = readFileSync(path);
    const br = brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: body.length },
    });
    writeFileSync(`${path}.br`, br);
    writeFileSync(`${path}.gz`, gzipSync(body, { level: 9 }));
    count += 1;
    before += body.length;
    after += br.length;
  }
  return { count, before, after };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "dist", "public");
  const { count, before, after } = compressDir(root);
  console.log(
    `[compress] ${count} files: ${(before / 1024).toFixed(0)} KiB -> ${(after / 1024).toFixed(0)} KiB with Brotli`,
  );
}
