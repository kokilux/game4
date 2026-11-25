#!/usr/bin/env node
// 配信まわりの事故を防ぐスモークテスト。
//   node scripts/smoke.mjs [baseUrl]
// 実際に配信中のサーバへHTTPで取りに行き、
//   1) ルートが 302 で /game/ に飛ぶか
//   2) index.html の <script> が 200 で取れるか
//   3) そのモジュールから辿れる import が全部 200 か（404の相対パスを検出）
// を確認する。

const BASE = (process.argv[2] ?? process.env.BASE ?? "http://127.0.0.1:5173").replace(/\/$/, "");

let fail = 0;
const ok = (msg) => console.log("  ok   " + msg);
const bad = (msg) => { fail++; console.log("  FAIL " + msg); };

async function head(url) {
  const res = await fetch(url, { redirect: "manual" });
  return res;
}

// 1) ルートのリダイレクト
{
  const res = await head(BASE + "/");
  const loc = res.headers.get("location");
  if ((res.status === 301 || res.status === 302) && loc === "/game/") ok("/ は /game/ へリダイレクト");
  else bad(`/ がリダイレクトしない（status=${res.status} location=${loc}）→ ./src/main.js が404になる`);
}

// 2) ページとサブリソース
const pageUrl = BASE + "/game/";
const html = await (await fetch(pageUrl)).text();
if (html.includes("/game/src/main.js")) ok("index.html は絶対パスで main.js を読み込む");
else bad("index.html の <script src> が絶対パスになっていない");

const scripts = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
if (!scripts.length) bad("サブリソースが見つからない");

// 3) import をたどる
const seen = new Set();
async function crawl(url) {
  if (seen.has(url)) return;
  seen.add(url);
  const res = await fetch(url);
  if (!res.ok) { bad(`${res.status} ${url}`); return; }
  const text = await res.text();
  for (const m of text.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    if (!spec.startsWith(".") && !spec.startsWith("/")) continue; // 外部URLは対象外
    await crawl(new URL(spec, url).href);
  }
}

for (const src of scripts) {
  const url = new URL(src, pageUrl).href;
  const res = await fetch(url);
  if (!res.ok) bad(`${res.status} ${url}`);
  else ok(`${url.replace(BASE, "")}`);
  await crawl(url);
}

console.log(`\nchecked ${seen.size} modules, ${fail} problem(s)`);
process.exit(fail ? 1 : 0);
