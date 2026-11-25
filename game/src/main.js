// ブラウザ側の入口。320x180 のフレームを整数倍で拡大し、入力・音・ループをつなぐ。

import { composite, createFrame } from "../../vendor/pixelfx/src/core/index.js";
import { createGame } from "./game.js";
import { createAudio } from "./audio.js";
import { W, H } from "./palette.js";

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const overlayHint = document.getElementById("overlay-hint");
const hudInfo = document.getElementById("info");

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

canvas.addEventListener("pointermove", (e) => {
  const { x, y } = toGame(e);
  game.pointer(x, y);
});

function action(e) {
  e.preventDefault();
  unlock();
  const g = game.state;
  if (g.phase === "ready") {
    game.start();
    audio.start();
    overlay.dataset.phase = "play";
    return;
  }
  if (g.phase === "over") {
    game.restart();
    game.start();
    audio.start();
    overlay.dataset.phase = "play";
    return;
  }
  game.slap();
}

canvas.addEventListener("pointerdown", action);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "KeyZ" || e.code === "Enter") {
    if (e.repeat) return;
    action(e);
  }
  if (e.code === "KeyR") {
    game.restart();
    overlay.dataset.phase = "ready";
  }
  if (e.code === "KeyP") {
    game.state.showPrinciples = !game.state.showPrinciples;
  }
  if (e.code === "KeyM") {
    audio.setMuted(!audio.muted);
    hudInfo.textContent = audio.muted ? "SOUND OFF" : "";
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
  }
}

// ---- 羽音
function updateBuzz() {
  const g = game.state;
  const b = g.buzz;
  if (!b || g.phase !== "play") {
    audio.buzz(0, 300, false);
    return;
  }
  const earX = 52, earY = 108;
  const d = Math.hypot(b.x - earX, b.y - earY);
  const near = 1 - Math.min(1, d / 300);
  const hover = b.state === "hover";
  const on = b.state !== "land";
  audio.buzz((0.006 + near * 0.055) * (hover ? 1.5 : 1), 300 + near * 240 + (hover ? 60 : 0), on);
}

// ---- ループ
let last = performance.now();
let acc = 0;
const STEP = 1 / 120;

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

  syncOverlay();
  requestAnimationFrame(loop);
}

let lastPhase = "";
function syncOverlay() {
  const g = game.state;
  if (g.phase === lastPhase) return;
  lastPhase = g.phase;
  if (g.phase === "ready") {
    overlay.dataset.phase = "ready";
    overlayTitle.textContent = "KA";
    overlayBody.innerHTML = "夜の蚊取り。<br>羽音をたよりに、刺される前に叩け。";
    overlayHint.innerHTML = "TAP / SPACE で叩く ・ M で無音";
  } else if (g.phase === "over") {
    overlay.dataset.phase = "over";
    overlayTitle.textContent = g.banner ?? "DAWN";
    overlayBody.innerHTML = `SCORE ${g.finalScore ?? g.score}<br>CATCH ${g.kills}・BITE ${g.bites}`;
    overlayHint.innerHTML = "TAP で もう一晩 ・ R でタイトル";
  } else {
    overlay.dataset.phase = "play";
  }
}

// 画面に合わせて整数倍で拡大
function fit() {
  const pad = 24;
  const scale = Math.max(1, Math.floor(Math.min((window.innerWidth - pad) / W, (window.innerHeight - pad * 2) / H)));
  canvas.style.width = W * scale + "px";
  canvas.style.height = H * scale + "px";
}
window.addEventListener("resize", fit);
fit();
requestAnimationFrame(loop);
