import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "dist", "public");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const IMMUTABLE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

function isHashedAsset(pathname) {
  // Vite default: `[name]-[hash].[ext]` under /assets/
  return /^\/assets\/.+[-.][A-Za-z0-9_-]{8,}\.[a-zA-Z0-9]+$/.test(pathname);
}

function safeJoin(root, pathname) {
  // Strip query string and decode. Reject malformed encodings and anything
  // trying to escape the root.
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const normalized = normalize(decoded).replace(/^([/\\])+/, "");
  const full = join(root, normalized);
  const rel = resolve(full);
  if (rel !== root && !rel.startsWith(root + sep)) return null;
  return rel;
}

async function tryFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) return s;
    if (s.isDirectory()) {
      const indexPath = join(filePath, "index.html");
      const idx = await stat(indexPath);
      if (idx.isFile()) return { path: indexPath, stat: idx };
    }
  } catch {
    return null;
  }
  return null;
}

function applyHeaders(res, pathname, filePath, fileStat) {
  const ext = extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("Content-Length", String(fileStat.size));
  res.setHeader("X-Content-Type-Options", "nosniff");

  const isServiceWorker = pathname.endsWith("/service-worker.js") || pathname === "/service-worker.js";
  const isHtml = ext === ".html" || ext === "";
  if (isServiceWorker || isHtml) {
    for (const [k, v] of Object.entries(NO_CACHE_HEADERS)) res.setHeader(k, v);
  } else if (isHashedAsset(pathname)) {
    for (const [k, v] of Object.entries(IMMUTABLE_HEADERS)) res.setHeader(k, v);
  } else {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || (req.method !== "GET" && req.method !== "HEAD")) {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  const pathname = req.url.split("?")[0];
  const target = safeJoin(ROOT, pathname);
  if (!target) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  let resolvedPath = target;
  let resolvedStat = await tryFile(target);
  if (resolvedStat && "path" in resolvedStat) {
    resolvedPath = resolvedStat.path;
    resolvedStat = resolvedStat.stat;
  }

  // SPA fallback: any non-file, non-asset request serves index.html so the
  // client router takes over. Don't fall back for hashed asset 404s — those
  // should remain 404 so missing-bundle errors are visible instead of being
  // masked by HTML being returned with a 200.
  if (!resolvedStat) {
    if (isHashedAsset(pathname) || /\.[a-zA-Z0-9]+$/.test(pathname)) {
      res.statusCode = 404;
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.end("Not Found");
      return;
    }
    const indexPath = join(ROOT, "index.html");
    try {
      resolvedStat = statSync(indexPath);
      resolvedPath = indexPath;
    } catch {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }
  }

  applyHeaders(res, pathname, resolvedPath, resolvedStat);
  res.statusCode = 200;
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(resolvedPath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[my-impact] static server listening on http://${HOST}:${PORT} (root=${ROOT})`);
});
