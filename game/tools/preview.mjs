#!/usr/bin/env node
// Node でフレームを焼いてPNGにする（ブラウザ不要のQAループ）。
//   node game/tools/preview.mjs --scene [--t 0.7] [--crop x,y,w,h,scale]
//   node game/tools/preview.mjs --hand
//   node game/tools/preview.mjs --scenario=slap   着地→平手の連番
//   node game/tools/preview.mjs --scenario=play   自動で7匹仕留めてリザルトまで
//   node game/tools/preview.mjs --scenario=idle   何もせず刺され尽くすまで
// 出力: game/records/<name>/*.png（.gitignore 済み）

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composite, createFrame, painterFor } from "../../vendor/pixelfx/src/core/index.js";
import { encodePNG } from "../../vendor/pixelfx/tools/lib/png.mjs";
import { buildStatic, drawSleeper, drawAmbient } from "../src/scene.js";
import { createGame } from "../src/game.js";
import { createHand, drawHand } from "../src/hand.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

function save(name, frame, tag) {
  const dir = join(ROOT, "records", name);
  mkdirSync(dir, { recursive: true });
  let { w, h } = frame;
  let rgba = new Uint8ClampedArray(w * h * 4);
  composite(frame, rgba, null, 1);
  if (args.crop) {
    const [cx, cy, cw, ch, cs] = String(args.crop).split(",").map(Number);
    const out = new Uint8ClampedArray(cw * cs * ch * cs * 4);
    for (let y = 0; y < ch * cs; y++)
      for (let x = 0; x < cw * cs; x++) {
        const sx = Math.min(w - 1, cx + Math.floor(x / cs)), sy = Math.min(h - 1, cy + Math.floor(y / cs));
        const si = (sy * w + sx) * 4, di = (y * cw * cs + x) * 4;
        out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = 255;
      }
    rgba = out; w = cw * cs; h = ch * cs;
  }
  const file = join(dir, `${name}-${tag}.png`);
  writeFileSync(file, encodePNG(w, h, rgba));
  return file;
}

const t2 = (v) => v.toFixed(2).replace(".", "_");

// --- 静的画面 ---
if (args.scene) {
  const frame = createFrame(320, 180);
  const bg = buildStatic();
  frame.color.set(bg.color);
  const p = painterFor(frame);
  drawSleeper(p, Number(args.t ?? 0.7));
  drawAmbient(p, Number(args.t ?? 0.7));
  console.log(save("scene", frame, "static"));
  process.exit(0);
}

// --- 手だけ ---
if (args.hand) {
  for (const [i, st] of [-1, 0.04, 0.075, 0.1, 0.13, 0.16, 0.2, 0.28, 0.4].entries()) {
    const f = createFrame(120, 100);
    const p = painterFor(f);
    p.place(0, 0);
    p.rect(0, 0, 120, 100, 0xff151520);
    const h = createHand(60, 50);
    h.tx = 60; h.ty = 38; h.slapT = st;
    // 叩き中の位置は update で決まるので、ここでは手を直接置く
    h.x = 60; h.y = 50;
    drawHand(p, h, 0);
    const rgba = new Uint8ClampedArray(120 * 100 * 4);
    composite(f, rgba, null, 1);
    mkdirSync(join(ROOT, "records", "hand"), { recursive: true });
    writeFileSync(join(ROOT, "records", "hand", `hand-${i}-${t2(st)}.png`), encodePNG(120, 100, rgba));
  }
  console.log("hand frames -> game/records/hand/");
  process.exit(0);
}

const STEP = 1 / 60;
const scenario = args.scenario ?? "slap";
const game = createGame({ seed: Number(args.seed ?? 5) });
game.draw(createFrame(320, 180));
game.start();

let t = 0;
let shots = [];
let slappedThisBug = false;
let maxT = 12;

if (scenario === "slap") {
  for (let i = 0; i < 60 * 14; i++) {
    const d = game.debug();
    const m = game.state.bugs[0];
    if (!slappedThisBug && d.state === "land" && d.landTimer > 0.5) {
      game.pointer(d.mosquito.x, d.mosquito.y);
      game.slap();
      slappedThisBug = true;
      for (const dd of [0.04, 0.07, 0.09, 0.11, 0.13, 0.16, 0.2, 0.26, 0.4, 0.8]) {
        shots.push({ at: t + dd });
      }
    }
    if (m && game.state.kills > 0) {
      // 当たった直後のフレームを拾う
      shots.push({ at: t });
      break;
    }
    game.update(STEP);
    t += STEP;
  }
  // 記録した時刻まで再シミュレーションして撮る
  shots = shots.filter((s) => s.at <= t + 1e-6);
  const g2 = createGame({ seed: Number(args.seed ?? 5) });
  g2.start();
  let tt = 0, idx = 0, done = false;
  shots.sort((a, b) => a.at - b.at);
  for (let i = 0; i < 60 * 16 && idx < shots.length; i++) {
    const d = g2.debug();
    if (!done && d.state === "land" && d.landTimer > 0.5) {
      g2.pointer(d.mosquito.x, d.mosquito.y);
      g2.slap();
      done = true;
    }
    while (idx < shots.length && tt >= shots[idx].at - 1e-9) {
      const f = createFrame(320, 180);
      g2.draw(f);
      console.log(save("slap", f, t2(tt)));
      idx++;
    }
    g2.update(STEP);
    tt += STEP;
  }
} else if (scenario === "bite") {
  // 肌に着地するまで進め、刺される瞬間まで撮る
  let shot = 0, bitten = false;
  for (let i = 0; i < 60 * 50; i++) {
    const m = game.state.bugs[0];
    if (m && m.state === "land" && m.spot?.kind === "skin") {
      for (const at of [0.15, 0.7, 1.2, 1.44, 1.55, 1.8, 2.4]) {
        const target = t + at;
        while (t < target) { game.update(STEP); t += STEP; }
        const f = createFrame(320, 180);
        game.draw(f);
        console.log(save("bite", f, t2(t)));
      }
      bitten = true;
      break;
    }
    game.update(STEP);
    t += STEP;
  }
  if (!bitten) console.log("no skin landing in window");
} else {
  // play: 着地したら必ず叩く / idle: 何もしない
  const auto = scenario === "play";
  const shotsAt = auto ? [1.0, 4.0, 8.0, 14.0, 22.0, 30.0, 40.0, 46.5] : [2.0, 5.0, 7.2, 9.0, 12.0, 20.0, 46.5];
  let si = 0;
  let lastLand = false;
  for (let i = 0; i < 60 * 60; i++) {
    const d = game.debug();
    if (auto) {
      if (d.state === "land" && d.landTimer > 0.5) {
        game.pointer(d.mosquito.x, d.mosquito.y);
        game.slap();
      }
      if (d.state === "hover" && game.state.hand.slapT < 0) game.pointer(d.mosquito.x, d.mosquito.y);
    }
    if (d.state === "land" && !lastLand && shots.length < 40) shots.push({ at: t + 0.25, tag: "land" });
    lastLand = d.state === "land";

    while (si < shotsAt.length && t >= shotsAt[si]) {
      const f = createFrame(320, 180);
      game.draw(f);
      console.log(save(scenario, f, t2(t)));
      si++;
    }
    if (game.state.phase === "over" && si >= shotsAt.length) break;
    game.update(STEP);
    t += STEP;
  }
  // リザルト
  const f = createFrame(320, 180);
  game.draw(f);
  console.log(save(scenario, f, "result"));
  console.log(`phase=${game.state.phase} kills=${game.state.kills} hp=${game.state.hp} score=${game.state.finalScore}`);
}
