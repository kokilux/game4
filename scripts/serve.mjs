#!/usr/bin/env node
// 依存なしの静的サーバ。ES モジュールをそのまま配信する。
//   node scripts/serve.mjs [--port 5173]
// 0.0.0.0 で待ち受けるので、プレビュー用のホスト名でもそのまま開ける。

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const arg = process.argv.indexOf("--port");
const PORT = Number(arg > -1 ? process.argv[arg + 1] : process.env.PORT || 5173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
};

createServer((req, res) => {
  let path = decodeURIComponent((req.url || "/").split("?")[0]);

  // ルートは必ず /game/ へ「リダイレクト」する。
  // 中身をそのまま返すと、HTML内の ./src/main.js が /src/main.js に解決されて 404 になる。
  if (path === "/" || path === "/index.html") {
    res.writeHead(302, { location: "/game/" });
    res.end();
    return;
  }
  if (path.endsWith("/")) path += "index.html";
  const rel = normalize(path).replace(/^([/\\]|\.\.([/\\]|$))+/, "");
  const file = join(ROOT, rel);
  if (!resolve(file).startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 " + path);
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(302, { location: path + "/" });
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  createReadStream(file).pipe(res);
}).listen(PORT, "0.0.0.0", () => {
  console.log(`KA dev server → http://localhost:${PORT}/game/`);
});
