#!/usr/bin/env node
// ブラウザ側の入口（main.js）を、最小限の DOM スタブで実際に走らせる回帰テスト。
//   node game/tools/dom-test.mjs

const listeners = new Map();
const canvasListeners = new Map();

function el(id, extra = {}) {
  return {
    id,
    style: {},
    dataset: { phase: "ready" },
    textContent: "",
    innerHTML: "",
    listeners: canvasListeners,
    addEventListener(type, fn) { (id === "screen" ? canvasListeners : listeners).set(type, fn); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    ...extra,
  };
}

let painted = null;
const ctx = {
  imageSmoothingEnabled: true,
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
  putImageData(img) { painted = img; },
};

const elements = {
  screen: el("screen", { width: 320, height: 180, getContext: () => ctx }),
  overlay: el("overlay"),
  "overlay-title": el("overlay-title"),
  "overlay-body": el("overlay-body"),
  "overlay-hint": el("overlay-hint"),
  info: el("info"),
};

globalThis.document = { getElementById: (id) => elements[id] ?? el(id) };
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener(type, fn) { listeners.set(type, fn); if (type === "keydown") keydown = fn; },
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
let keydown = null;
let raf = null;
globalThis.requestAnimationFrame = (fn) => { raf = fn; return 1; };
globalThis.performance = { now: () => nowMs };
let nowMs = 0;

// main.js を読み込む（副作用でループ開始）
await import("../src/main.js");

let frames = 0;
function tick(ms) {
  nowMs = ms;
  const fn = raf;
  raf = null;
  if (fn) fn(ms);
  frames++;
}

// タイトル → タップで開始
const pointerdown = canvasListeners.get("pointerdown");
if (!pointerdown) throw new Error("pointerdown が登録されていない");
pointerdown({ preventDefault() {}, clientX: 640, clientY: 360 });

const start = 0;
for (let i = 0; i < 240; i++) tick(start + i * 16.7); // 約4秒

const overlayPhase = elements.overlay.dataset.phase;
console.log(`frames=${frames} overlay=${overlayPhase} painted=${painted ? painted.data.length : 0}`);

// 画面が一色ではないこと（実際に描けている）
let colors = new Set();
for (let i = 0; i < painted.data.length; i += 4 * 97) colors.add(painted.data[i] + "," + painted.data[i + 1] + "," + painted.data[i + 2]);
console.log(`distinct sampled colors: ${colors.size}`);

const ok = frames > 200 && painted && overlayPhase === "play" && colors.size > 8;
if (!ok) { console.error("FAIL"); process.exit(1); }
console.log("ok  main.js は DOM 上で動く");
