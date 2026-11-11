#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for the GLB viewer.
 * GLB files have to be served over HTTP so the browser can fetch them.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname);
const port = Number(process.env.PORT) || 5173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = join(root, normalize(pathname));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": types[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${port} is already in use.\n  Try: PORT=5174 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`\n  Model Vault\n  http://localhost:${port}\n`);
});
