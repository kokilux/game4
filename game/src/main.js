// ブラウザ側の入口。320x180 のフレームを画面いっぱいに拡大し、入力・音・ループをつなぐ。
// UI（タイトル・メニュー・クリア画面・リザルト・ポーズ）は全部キャンバスの中に描く。
// HTML は「黒い額縁」だけ。日本語の説明は README 側に置く。

import { composite, createFrame } from "../../vendor/pixelfx/src/core/index.js";
import { createGame } from "./game.js";
import { createAudio } from "./audio.js";
import { W, H, NIGHT } from "./palette.js";
import { BED } from "./scene.js";

// 起動マーカー（index.html の番犬が見ている）
window.__KA_BOOTED = true;

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

const stageEl = document.getElementById("stage");

const game = createGame({ seed: (Date.now() % 9999) + 1 });
const audio = createAudio();
const frame = createFrame(W, H);
const img = ctx.createImageData(W, H);

let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  audio.unlock();
}
window.addEventListener("pointerdown", unlock, { once: false });
window.addEventListener("keydown", unlock, { once: false });

// ---- 入力
function toGame(e) {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  const y = ((e.clientY - r.top) / r.height) * H;
  return { x, y };
}

window.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) return;
  const { x, y } = toGame(e);
  game.pointer(x, y);
});

/** 画面のどこを押しても反応する（キャンバスの外でも開始・平手できる）。 */
function action(e) {
  if (e && e.cancelable) e.preventDefault();
  unlock();
  const g = game.state;
  // キャンバス内なら狙いを更新（外なら今の狙いのまま）
  if (e && typeof e.clientX === "number") {
    const r = canvas.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const { x, y } = toGame(e);
      game.pointer(x, y);
    }
  }
  // メニュー系の画面は「決定」だけ
  if (g.phase === "title" || g.phase === "help" || g.phase === "clear" || g.phase === "over" || g.paused) {
    if (game.confirm()) return;
  }
  if (g.phase === "play") game.slap();
}

window.addEventListener("pointerdown", action);

window.addEventListener("keydown", (e) => {
  const g = game.state;
  if (e.code === "ArrowUp" || e.code === "KeyW") { game.menuMove(-1); return; }
  if (e.code === "ArrowDown" || e.code === "KeyS") { game.menuMove(1); return; }
  if (e.code === "Space" || e.code === "KeyZ" || e.code === "Enter" || e.code === "NumpadEnter") {
    if (e.repeat) return;
    action(e);
    return;
  }
  if (e.code === "Escape" || e.code === "KeyP") {
    if (e.code === "KeyP" && (g.phase === "play" || g.paused)) {
      game.togglePause();
      return;
    }
    if (g.phase === "help") { game.confirm(); return; }
    if (g.phase === "play" || g.paused) game.togglePause();
    return;
  }
  if (e.code === "KeyR") {
    if (g.phase === "title") return;
    game.restart();
    stageEl.dataset.phase = g.phase;
    return;
  }
  if (e.code === "KeyM") {
    g.soundOn = !g.soundOn;
    return;
  }
  if (e.code === "KeyC") {
    g.showPrinciples = !g.showPrinciples;
    return;
  }
});

// ---- 事件 → 音
function drainEvents() {
  const g = game.state;
  const evs = g.events;
  g.events = [];
  for (const e of evs) {
    if (e.type === "swing") audio.swing();
    else if (e.type === "kill") audio.hit(e.fast);
    else if (e.type === "whiff") audio.miss();
    else if (e.type === "bite") audio.bite();
    else if (e.type === "land") audio.land();
    else if (e.type === "end") audio.end(e.reason === "clear" || e.reason === "dawn");
    else if (e.type === "menu") audio.swing();
    else if (e.type === "clearScreen") audio.end(true);
  }
}

// ---- 羽音（耳の位置は寝具の定義から取る）
function updateBuzz() {
  const g = game.state;
  const b = g.buzz;
  if (!b || g.phase !== "play" || g.paused) {
    audio.buzz(0, 300, false);
    return;
  }
  const earX = BED.head.cx - 4;
  const earY = BED.head.cy - 2;
  const d = Math.hypot(b.x - earX, b.y - earY);
  const near = 1 - Math.min(1, d / 300);
  const hover = b.state === "hover" || b.state === "land";
  const on = b.state !== "land";
  audio.buzz((0.006 + near * 0.055) * (hover ? 1.5 : 1), 300 + near * 240 + (hover ? 60 : 0), on);
}

// ---- ループ
let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

let lastPhase = "";
let lastSound = true;
function syncChrome() {
  const g = game.state;
  const ph = g.paused ? "pause" : g.phase;
  if (ph !== lastPhase) {
    lastPhase = ph;
    if (stageEl) stageEl.dataset.phase = ph;
  }
  if (g.soundOn !== lastSound) {
    lastSound = g.soundOn;
    audio.setMuted(!g.soundOn);
  }
}

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 8) {
    game.update(STEP);
    acc -= STEP;
    steps++;
  }
  drainEvents();
  updateBuzz();

  game.draw(frame);
  composite(frame, img.data, null, 1);
  ctx.putImageData(img, 0, 0);

  syncChrome();
  requestAnimationFrame(loop);
}

/**
 * 画面いっぱいに拡大する。整数倍にこだわらず、縦横どちらかが埋まるまで伸ばす
 * （`image-rendering: pixelated` なのでドットは潰れない）。
 * 余った帯は本文と同じ色なので「小さい画面が中にある」ようには見えない。
 */
function fit() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = Math.floor(W * scale) + "px";
  canvas.style.height = Math.floor(H * scale) + "px";
}
window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
fit();
requestAnimationFrame(loop);
