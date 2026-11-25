// KA — 寝室の描画。3つのステージ（和室 / 洋室 / 夏の夜）。
//
// 画面は「横向きに寝ている人」の真横からの眺め。
//   ・枕の上に頭。顔は上を向き、鼻先が右上に出る。
//   ・掛け布団の稜線が肩 → 胸 → 腰 → 膝 → 爪先と起伏する。
//   ・顔のすぐ下で布団が顎を包むので、首が浮かない。
//
// 静的部分（部屋・窓・敷き布団・枕）はフレームに焼き、
// 掛け布団は呼吸で上下するので drawOver で毎フレーム描く。

import { createFrame, hex, mix } from "../../vendor/pixelfx/src/core/index.js";
import { C } from "./palette.js";

export const W = 320;
export const H = 180;

// ---------------------------------------------------------------- 色の扱い
// 色は "#rrggbb" のまま書けるようにする（数値でない文字列だけ変換）。
const hexCache = new Map();
const toColor = (v) => {
  if (typeof v !== "string") return v;
  let c = hexCache.get(v);
  if (c === undefined) {
    c = hex(v);
    hexCache.set(v, c);
  }
  return c;
};

const proxyCache = new WeakMap();
/** 色の文字列を自動で数値に直すペインタ。 */
export function hexPaint(p) {
  if (proxyCache.has(p)) return proxyCache.get(p);
  const q = new Proxy(p, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (typeof v !== "function") return v;
      return (...args) => v.apply(t, args.map(toColor));
    },
  });
  proxyCache.set(p, q);
  return q;
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- 静的描画
function toolkit(f) {
  const buf = f.color;
  const put = (x0, y0, c0, a = 1) => {
    const x = x0 | 0;
    const y = y0 | 0;
    const c = toColor(c0);
    if (x < 0 || y < 0 || x >= W || y >= H || !c) return;
    const i = y * W + x;
    if (a >= 1) buf[i] = c;
    else buf[i] = mix(buf[i], c, a);
  };
  return {
    put,
    rect(x, y, w, h, c, a = 1) {
      for (let yy = Math.max(0, y | 0); yy < Math.min(H, (y + h) | 0); yy++)
        for (let xx = Math.max(0, x | 0); xx < Math.min(W, (x + w) | 0); xx++) put(xx, yy, c, a);
    },
    ellipse(cx, cy, rx, ry, c, a = 1) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) put(x, y, c, a);
        }
    },
    round(x, y, w, h, r, c, a = 1) {
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const dx = Math.min(xx, w - 1 - xx);
          const dy = Math.min(yy, h - 1 - yy);
          if (dx < r && dy < r) {
            const ddx = r - dx;
            const ddy = r - dy;
            if (ddx * ddx + ddy * ddy > r * r + r * 0.6) continue;
          }
          put(x + xx, y + yy, c, a);
        }
    },
    line(x0, y0, x1, y1, c, a = 1) {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const n = Math.max(dx, dy) || 1;
      for (let i = 0; i <= n; i++) put(lerp(x0, x1, i / n), lerp(y0, y1, i / n), c, a);
    },
    // 円柱（布団の稜線）に沿った塗り分け
    wash(x0, y0, x1, y1, tint, kFn) {
      const t = toColor(tint);
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
          const k = kFn(x, y);
          if (k > 0.004) buf[y * W + x] = mix(buf[y * W + x], t, Math.min(0.9, k));
        }
    },
  };
}

// ---------------------------------------------------------------- 寝具の形
export const BED = {
  pillow: { x: 20, y: 110, w: 82, h: 24, r: 7 },
  mattress: { x: 16, y: 130, w: 292, h: 40, r: 6 },
  duvet: { x0: 72, x1: 308, bottom: 164 },
  head: { cx: 63, cy: 103 },
};

/**
 * 掛け布団の稜線（画面上の y）。肩で高く、腰で沈み、爪先でまた上がる。
 * 蚊の着地点もこの線の上になる。
 */
export function bedTop(x) {
  if (x <= BED.duvet.x0) return 112;
  if (x < 94) return lerp(112, 103, (x - BED.duvet.x0) / 22); // 肩
  if (x < 134) return lerp(103, 108, (x - 94) / 40); // 二の腕のくぼみ
  if (x < 182) return 108 - Math.sin(((x - 134) / 48) * Math.PI) * 1.2; // 腰
  if (x < 234) return lerp(108, 101, (x - 182) / 52); // 尻から腿
  if (x < 268) return lerp(101, 106, (x - 234) / 34); // 膝下
  if (x < 294) return lerp(106, 97, (x - 268) / 26); // 爪先が布団を押し上げる
  return 97;
}

export const surfaceY = (x) => bedTop(clamp(x, BED.duvet.x0 + 2, BED.duvet.x1 - 2)) + 2;

const upper = (a, b) => a + (b - a) * 0.5;
const frac = (v) => v - Math.floor(v);

// ---------------------------------------------------------------- 部屋
function drawRoom(tk, pal, opts = {}) {
  const wallH = 92;
  for (let y = 0; y < wallH; y++) tk.rect(0, y, W, 1, mix(pal.wallTop, pal.wallBot, y / wallH));

  // 腰板
  tk.rect(0, 78, W, 14, pal.wainscot);
  tk.rect(0, 78, W, 1, pal.wainscotHi);
  tk.rect(0, 90, W, 2, pal.wainscotLo);
  for (let x = 0; x < W; x += 46) tk.rect(x, 79, 1, 11, pal.wainscotLo);

  // 床
  const ft = 92;
  for (let y = ft; y < H; y++) {
    const k = clamp((y - ft) / (H - ft), 0, 1);
    tk.rect(0, y, W, 1, mix(pal.floorFar, pal.floorNear, k));
  }
  tk.rect(0, ft, W, 2, pal.floorShadow);

  if (opts.floor === "tatami") {
    for (let x = 6; x < W; x += 46) tk.rect(x, ft + 2, 1, H - ft, pal.floorSeam);
    for (let x = 6; x < W; x += 46) tk.rect(x + 1, ft + 2, 1, H - ft, pal.floorSeamHi);
    tk.rect(0, 132, W, 1, pal.floorSeam);
  } else {
    for (let y = ft + 6; y < H; y += 13) tk.rect(0, y, W, 1, pal.floorSeam);
    for (let x = 20; x < W; x += 64) tk.rect(x, ft + 2, 1, H - ft, pal.floorSeamHi);
  }

  // 隅の暗がり
  tk.wash(0, 0, W, H, pal.corner, (x, y) => {
    const d = Math.max(0, 1 - (x + y * 0.6) / 260);
    return d * d * 0.5;
  });
}

// 障子 / ブラインド / 開け窓。光源はどれも「窓」なので共通の枠で描く。
function drawShoji(tk, pal) {
  const x0 = 178, y0 = 8, x1 = 292, y1 = 76;
  // 外の光が壁ににじむ
  tk.wash(x0 - 26, y0 - 12, x1 + 26, y1 + 22, pal.glass, (x, y) => {
    const dx = Math.max(x0 - x, 0, x - x1);
    const dy = Math.max(y0 - y, 0, y - y1);
    const d = Math.sqrt(dx * dx + dy * dy);
    return clamp(1 - d / 34, 0, 1) * 0.24;
  });
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 3, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.paper);
  for (let y = y0; y < y1; y++)
    tk.rect(x0, y, x1 - x0, 1, mix(pal.paperHi, pal.paperLo, (y - y0) / (y1 - y0)));
  // 桟（3列 × 4段）
  for (let i = 1; i < 3; i++) tk.rect(x0 + Math.round(((x1 - x0) * i) / 3) - 1, y0, 2, y1 - y0, pal.frame);
  for (let i = 1; i < 4; i++) tk.rect(x0, y0 + Math.round(((y1 - y0) * i) / 4) - 1, x1 - x0, 2, pal.frame);
  tk.rect(x0, y0, x1 - x0, 1, pal.frameHi);
  tk.rect(x0, y1 - 1, x1 - x0, 1, pal.frame);
  // 紙の桟ぎわの影
  for (let y = y0 + 1; y < y1 - 1; y++) {
    tk.put(x0 + 1, y, pal.paperShade, 0.5);
    tk.put(x1 - 2, y, pal.paperShade, 0.5);
  }
}

function drawBlinds(tk, pal) {
  const x0 = 166, y0 = 10, x1 = 302, y1 = 74;
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 2, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.glassDark);
  // スリット越しの月明かり
  for (let y = y0; y < y1; y += 5) {
    tk.rect(x0, y, x1 - x0, 1, pal.glass);
    tk.rect(x0, y + 1, x1 - x0, 1, mix(pal.glass, pal.glassDark, 0.55));
  }
  // 羽根（手前）
  for (let y = y0 + 2; y < y1; y += 5) {
    tk.rect(x0, y, x1 - x0, 1, pal.slatHi);
    tk.rect(x0, y + 1, x1 - x0, 1, pal.slat);
    tk.rect(x0, y + 2, x1 - x0, 1, pal.slatLo);
  }
  tk.rect(x0, y1 - 3, x1 - x0, 3, pal.frame);
  tk.rect(x0, y0 - 5, x1 - x0, 2, pal.frameHi);
  // 左右の紐
  for (const x of [x0 + 6, x1 - 8]) tk.rect(x, y0, 1, y1 - y0, pal.slatLo);
}

function drawNightWindow(tk, pal) {
  const x0 = 148, y0 = 6, x1 = 300, y1 = 72;
  tk.round(x0 - 5, y0 - 5, x1 - x0 + 10, y1 - y0 + 10, 3, pal.frame);
  tk.rect(x0, y0, x1 - x0, y1 - y0, pal.skyLo);
  for (let y = y0; y < y1; y++) tk.rect(x0, y, x1 - x0, 1, mix(pal.skyHi, pal.skyLo, (y - y0) / (y1 - y0)));
  // 月
  const mx = 258, my = 24;
  tk.wash(x0, y0, x1, y1, pal.moon, (x, y) => {
    const d = Math.hypot(x - mx, (y - my) * 1.2);
    return clamp(1 - d / 46, 0, 1) ** 2 * 0.3;
  });
  tk.ellipse(mx, my, 8, 8, pal.moon);
  tk.ellipse(mx - 1, my - 1, 6, 6, pal.moonHi);
  // 星（ハッシュで散らす）
  for (let i = 0; i < 26; i++) {
    const sx = Math.round(x0 + 3 + frac(Math.sin(i * 12.9898) * 43758.5453) * (x1 - x0 - 6));
    const sy = Math.round(y0 + 3 + frac(Math.sin(i * 78.233) * 12345.6789) * 36);
    if (Math.hypot(sx - mx, sy - my) < 14) continue;
    tk.put(sx, sy, i % 6 === 0 ? pal.starHi : pal.star, i % 4 === 0 ? 0.7 : 1);
  }
  // 網戸
  for (let x = x0 + 2; x < x1; x += 4) tk.rect(x, y0, 1, y1 - y0, pal.mesh, 0.22);
  for (let y = y0 + 2; y < y1; y += 4) tk.rect(x0, y, x1 - x0, 1, pal.mesh, 0.22);
  // 窓枠
  for (let i = 1; i < 2; i++) tk.rect(x0 + (x1 - x0) * i - 1, y0, 2, y1 - y0, pal.frameHi);
  tk.rect(x0, y0, x1 - x0, 1, pal.frameHi);
  tk.rect(x0, y1 - 1, x1 - x0, 1, pal.frame);
  tk.rect(x0 - 3, y1 - 3, x1 - x0 + 6, 3, pal.frameHi);
}

// デジタル時計（洋室）
function drawClock(tk, pal) {
  const x = 118, y = 40, w = 44, h = 24;
  tk.round(x, y, w, h, 3, pal.clockBody);
  tk.rect(x + 2, y + 2, w - 4, h - 4, pal.clockFace);
  tk.rect(x, y, w, 1, pal.frameHi);
  // 2:41
  const gl = [
    ["111", "101", "101", "101", "111"],
    ["010", "010", "010", "010", "010"],
  ];
  const digits = [gl[0], gl[0], gl[0], gl[0]];
  const seg = [
    ["111", "101", "101", "101", "111"], // 0
    ["010", "010", "010", "010", "010"], // 1
    ["111", "001", "111", "100", "111"], // 2
    ["111", "001", "111", "001", "111"], // 3
    ["101", "101", "111", "001", "001"], // 4
    ["111", "100", "111", "001", "111"], // 5
    ["111", "100", "111", "101", "111"], // 6
    ["111", "001", "001", "001", "001"], // 7
    ["111", "101", "111", "101", "111"], // 8
    ["111", "101", "111", "001", "111"], // 9
  ];
  const time = [2, 4, 1];
  let cx = x + 5;
  time.forEach((d, i) => {
    const g = seg[d];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) if (g[r][c] === "1") tk.put(cx + c * 3, y + 5 + r * 3, pal.clockLed);
    cx += 12;
    if (i < 2) {
      tk.put(cx - 3, y + 7, pal.clockLed);
      tk.put(cx - 3, y + 13, pal.clockLed);
      cx += 3;
    }
  });
  void digits;
  tk.wash(x - 14, y - 14, x + w + 14, y + h + 14, pal.clockLed, (px, py) => {
    const d = Math.hypot(Math.max(x - px, 0, px - (x + w)), Math.max(y - py, 0, py - (y + h)));
    return clamp(1 - d / 16, 0, 1) * 0.22;
  });
}

// 扇風機（夏の夜）。布団の向こうに置く。
function drawFanStand(tk, pal) {
  const cx = 286;
  tk.rect(cx - 2, 88, 4, 48, pal.fanStand);
  tk.rect(cx - 9, 134, 18, 3, pal.fanStand);
  tk.ellipse(cx, 88, 15, 15, pal.fanCage);
  tk.ellipse(cx, 88, 13, 13, pal.fanInner);
}

const FAN = { cx: 286, cy: 88, r: 12 };
function drawFanBlades(pIn, t, pal) {
  const p = hexPaint(pIn);
  const { cx, cy, r } = FAN;
  const a0 = t * 5.2;
  // 回っている羽根は「ぶれ」で描く
  p.disc(cx, cy, r - 1, pal.fanBlade, 0.3);
  for (let i = 0; i < 3; i++) {
    const a = a0 + (i * Math.PI * 2) / 3;
    for (let k = 2; k <= r - 1; k++) {
      p.dot(cx + Math.cos(a) * k, cy + Math.sin(a) * k, pal.fanBlade, 0.9);
      p.dot(cx + Math.cos(a + 0.16) * k, cy + Math.sin(a + 0.16) * k, pal.fanBlade, 0.45);
    }
  }
  p.disc(cx, cy, 3, pal.fanHub);
  // ガードの放射線
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    p.line(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, cx + Math.cos(a) * r, cy + Math.sin(a) * r, pal.fanCage, 0.55);
  }
  p.ring(cx, cy, r, 1, pal.fanCage, 0.9);
  p.ring(cx, cy, r - 4, 1, pal.fanCage, 0.3);
}

// 敷き布団・シーツ・枕
function drawBedding(tk, pal) {
  const m = BED.mattress;
  tk.round(m.x, m.y + 1, m.w, m.h, m.r, pal.sheetLo);
  tk.round(m.x, m.y, m.w, m.h - 2, m.r, pal.sheet);
  tk.rect(m.x + 8, m.y, m.w - 16, 1, pal.sheetHi);
  // 布団の下の影
  tk.wash(m.x, m.y, m.x + m.w, m.y + 18, pal.shadow, (x, y) => clamp((y - m.y) / 18, 0, 1) * 0.45);
  tk.rect(m.x, m.y + m.h - 2, m.w, 2, pal.sheetLo);

  // 枕
  const q = BED.pillow;
  tk.round(q.x, q.y + 2, q.w, q.h, q.r, pal.pillowLo);
  tk.round(q.x, q.y, q.w, q.h - 1, q.r, pal.pillow);
  tk.round(q.x + 3, q.y + 1, q.w - 8, 5, 3, pal.pillowHi);
  tk.round(q.x + 2, q.y + q.h - 5, q.w - 4, 4, 2, pal.pillowLo);
  tk.rect(q.x + 1, q.y + q.h - 1, q.w - 2, 1, pal.pillowDeep);
  // 枕の縫い目
  for (let x = q.x + 6; x < q.x + q.w - 6; x += 6) tk.rect(x, q.y + 8, 2, 1, pal.pillowLo, 0.8);
}

// ---------------------------------------------------------------- 寝姿
/**
 * 横向きに寝ている人。顔は上向き、鼻先は右上。
 * mood 1 で「刺された」顔（眉が寄り、口がへの字）。
 */
// ---- 頭：上から見おろす寝顔（両目が閉じているので顔だと即座に読める）----
const HEAD_SHAPE = { rx: 17, ry: 14.5 };
const FACE_SHAPE = { rx: 13, ry: 10.5 };

/** 楕円の内側での法線ライティング値（外なら null）。 */
function lamAt(x, y, cx, cy, rx, ry, lx, ly) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const d2 = nx * nx + ny * ny;
  if (d2 > 1) return null;
  const len = Math.hypot(nx, ny) || 1;
  return { lam: (nx / len) * lx + (ny / len) * ly, d2 };
}

const LIGHT = { x: -0.42, y: -0.9 }; // 月明かりは左上から

/**
 * 枕の上の寝顔。仰向けで顔がこちらを向き、両目は閉じている。
 * mood 1 で「刺された」顔（眉が寄り、口がへの字）。
 */
export function drawSleeper(pIn, t, mood = 0, palParam = C) {
  const p = hexPaint(pIn);
  const pal = palParam;
  const breath = Math.sin(t * 1.1);
  const hx = BED.head.cx;
  const hy = BED.head.cy + (breath > 0.62 ? 1 : 0);
  const hurt = mood > 0;
  const hrx = HEAD_SHAPE.rx;
  const hry = HEAD_SHAPE.ry;

  // 生え際（額の上の波打つライン）
  const hairline = (x) => hy - 7 + Math.sin((x - hx) * 0.34) * 1.5 + clamp((x - hx) * 0.16, -1.5, 1.5);

  // 枕への接触影
  p.ellipse(hx + 1, hy + 12, 19, 4, pal.pillowDeep);
  p.ellipse(hx + 2, hy + 13, 14, 2, pal.shadow, 0.5);
  // 枕に広がる毛先
  p.ellipse(hx - 1, hy + 11, 17, 5, pal.hair);
  p.ellipse(hx - 3, hy + 12, 12, 3, pal.hairLo);

  // ---- 頭（髪の地）----
  for (let y = hy - 17; y <= hy + 15; y++)
    for (let x = hx - 19; x <= hx + 19; x++) {
      const r = lamAt(x, y, hx, hy - 1, hrx, hry, LIGHT.x, LIGHT.y);
      if (!r) continue;
      p.put(x, y, r.lam > 0.3 ? pal.hairHi : r.lam > -0.4 ? pal.hair : pal.hairLo);
    }

  // ---- 顔（額から頬まで）----
  for (let y = hy - 9; y <= hy + 12; y++)
    for (let x = hx - 14; x <= hx + 14; x++) {
      const r = lamAt(x, y, hx, hy + 1, FACE_SHAPE.rx, FACE_SHAPE.ry, LIGHT.x, LIGHT.y);
      if (!r) continue;
      if (y < hairline(x)) continue;
      let c = r.lam > 0.34 ? pal.skinHi : r.lam > -0.25 ? pal.skin : pal.skinLo;
      if (r.d2 > 0.82) c = pal.skinLo;
      if (r.d2 > 0.95) c = pal.skinDeep;
      p.put(x, y, c);
    }
  // 頬の明るみ・こめかみの陰
  p.ellipse(hx - 6, hy + 2, 4, 2.5, pal.skinHi);
  p.ellipse(hx + 6, hy + 2, 3, 2, pal.skinHi);
  p.put(hx - 11, hy + 1, pal.skinLo);

  // ---- 前髪（生え際から額へ垂れる）----
  for (let x = hx - 16; x <= hx + 16; x++) {
    let ty = null;
    for (let y = hy - 16; y <= hy + 2; y++)
      if (lamAt(x, y, hx, hy - 1, hrx, hry, LIGHT.x, LIGHT.y)) {
        ty = y;
        break;
      }
    if (ty === null) continue;
    const edge = Math.round(hairline(x));
    for (let y = ty; y <= edge; y++) {
      const lit = lamAt(x, y, hx, hy - 1, hrx, hry, LIGHT.x, LIGHT.y);
      p.put(x, y, y >= edge ? pal.hair : lit && lit.lam > 0.25 ? pal.hairHi : pal.hair);
    }
  }
  // 横の髪（顔の左右を縁取る）
  for (let y = hy + 2; y <= hy + 11; y++) {
    const half = Math.round(hrx * Math.sqrt(Math.max(0, 1 - ((y - (hy - 1)) / hry) ** 2)));
    for (const sgn of [-1, 1]) {
      for (let k = 0; k < 2; k++) p.put(hx + sgn * (half - k), y, k === 0 ? pal.hairLo : pal.hair);
    }
  }

  // ---- 閉じた目（まつ毛つき）----
  const eye = (cx, ey) => {
    if (hurt) {
      p.rect(cx - 2, ey + 1, 4, 1, pal.eye);
      p.put(cx - 3, ey, pal.eye);
      p.put(cx + 2, ey + 2, pal.eye);
    } else {
      p.rect(cx - 2, ey, 4, 1, pal.eye);
      p.put(cx - 3, ey - 1, pal.eye); // まつ毛
      p.put(cx + 2, ey - 1, pal.eye);
      p.put(cx - 3, ey + 1, pal.skinLo);
      p.put(cx + 2, ey + 1, pal.skinLo);
    }
  };
  eye(hx - 6, hy + 1);
  eye(hx + 7, hy + 1);

  // ---- 鼻 ----
  p.put(hx, hy + 3, pal.skinLo);
  p.rect(hx - 1, hy + 4, 3, 1, pal.skinLo);
  p.put(hx - 1, hy + 4, pal.skinDeep);
  p.put(hx + 1, hy + 5, pal.skinHi);

  // ---- 口 ----
  if (hurt) {
    p.rect(hx - 3, hy + 7, 6, 1, pal.mouthIn);
    p.put(hx - 2, hy + 8, pal.mouthIn);
    p.put(hx + 1, hy + 8, pal.mouthIn);
  } else {
    p.rect(hx - 3, hy + 7, 5, 1, pal.lip);
    p.put(hx - 4, hy + 7, pal.skinLo);
    p.put(hx + 2, hy + 7, pal.skinLo);
    if (breath > 0.05) p.rect(hx - 2, hy + 8, 3, 1, pal.mouthIn);
  }

  // ---- 顎した（首は布団に隠れる）----
  p.rect(hx - 4, hy + 10, 9, 1, pal.skinLo);

  // ---- 息（Zzz）----
  drawZzz(p, hx, hy, t);
}

function drawZzz(p, hx, hy, t) {
  const cycle = (t * 0.42) % 1;
  const zs = [
    { a: 0, s: 1 },
    { a: 0.36, s: 2 },
    { a: 0.68, s: 3 },
  ];
  for (const z of zs) {
    const k = (cycle - z.a + 1) % 1;
    if (k > 0.62) continue;
    const u = k / 0.62;
    const alpha = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
    if (alpha <= 0.05) continue;
    const x = Math.round(hx + 14 + Math.sin(u * 3.1) * 4 + u * 14);
    const y = Math.round(hy - 20 - u * 26);
    pixelZ(p, x, y, z.s, pal_zzz, alpha);
  }
}

const pal_zzz = hex("#cfc6e8");
function pixelZ(p, x, y, s, c, a) {
  const w = s + 2;
  for (let i = 0; i < w; i++) {
    p.dot(x + i, y, c, a);
    p.dot(x + (w - 1 - i), y + i, c, a);
    p.dot(x + i, y + w - 1, c, a);
  }
}

// ---------------------------------------------------------------- 掛け布団
function duvetTop(x, t) {
  const breath = Math.sin(t * 1.7);
  let y = bedTop(x);
  // 胸のあたりが呼吸で上下する
  const chest = Math.max(0, 1 - Math.abs(x - 118) / 54);
  y -= chest * breath * 1.4;
  return y;
}

export function drawDuvet(pIn, t, pal) {
  const p = hexPaint(pIn);
  const d = BED.duvet;
  const pts = [];
  for (let x = d.x0; x <= d.x1; x += 1) pts.push([x, Math.round(duvetTop(x, t))]);
  for (let x = d.x1; x >= d.x0; x -= 1) pts.push([x, d.bottom]);
  p.poly(pts, pal.blanket);

  const cTop = mix(pal.blanketHi, pal.blanket, 0.25);
  const cMid = mix(pal.blanket, pal.blanketLo, 0.4);
  const cBot = mix(pal.blanket, pal.blanketLo, 0.78);
  const cDeep = mix(pal.blanketLo, pal.shadow, 0.5);

  for (let x = d.x0; x <= d.x1; x++) {
    const y0 = Math.round(duvetTop(x, t));
    if (y0 >= d.bottom - 6) continue;
    const h = d.bottom - y0;
    const b1 = y0 + 6;
    const b2 = b1 + Math.round(h * 0.4);
    const b3 = b1 + Math.round(h * 0.72);
    // 稜線：上を向いた面だけ明るく
    p.rect(x, y0, 1, 1, cTop);
    p.rect(x, y0 + 1, 1, 2, pal.blanketHi);
    if (x > 78 && x < 116) p.rect(x, y0 + 3, 1, 1, pal.sheetFold);
    // 本体
    p.rect(x, b1, 1, b2 - b1, pal.blanket);
    p.rect(x, b2, 1, b3 - b2, cMid);
    p.rect(x, b3, 1, d.bottom - 3 - b3, cBot);
    // 接地
    p.rect(x, d.bottom - 3, 1, 3, cDeep);
  }

  // キルティングの縦線
  for (let x = 104; x < d.x1; x += 34) {
    const y0 = Math.round(duvetTop(x, t)) + 8;
    p.line(x, y0, x + 1, d.bottom - 8, mix(pal.blanket, pal.blanketLo, 0.55), 0.55);
  }
  // 裾の折り返し
  p.rect(d.x0, d.bottom - 1, d.x1 - d.x0, 1, pal.shadow, 0.6);
  // 布団の落ち影
  p.rect(d.x0, d.bottom, d.x1 - d.x0, 2, pal.shadow, 0.45);
}

// ---------------------------------------------------------------- 環境
function drawMotes(pIn, t, color, n = 14, warm = false) {
  const p = hexPaint(pIn);
  for (let i = 0; i < n; i++) {
    const seed = i * 37.7;
    const sp = 0.28 + (i % 5) * 0.07;
    const x = ((seed * 3 + t * 5 * sp) % (W + 40)) - 20;
    const y = 96 - ((seed * 1.7 + t * 9 * sp) % 62);
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i));
    p.light(Math.round(x), Math.round(y), warm ? pal_warm : color, tw * 0.5);
    if (i % 4 === 0) p.dot(Math.round(x), Math.round(y), warm ? pal_warmHi : color, tw);
  }
}
const pal_warm = hex("#e8c46a");
const pal_warmHi = hex("#fff0b8");


// ---------------------------------------------------------------- 蚊の着地点
/**
 * 着地候補。kind:"skin" は刺される＝危険（顔まわり）、
 * "blanket" / "pillow" は安全。y は布団の稜線に沿わせる。
 */
function makeSpots(hx, hy) {
  const spots = [
    // 顔まわり（危険）
    { x: hx - 5, y: hy + 2, kind: "skin" },
    { x: hx + 6, y: hy + 3, kind: "skin" },
    { x: hx - 1, y: hy + 6, kind: "skin" },
    { x: hx + 3, y: hy - 3, kind: "skin" },
    { x: hx - 12, y: hy + 1, kind: "skin" },
  ];
  // 布団の稜線（安全）
  for (let x = 92; x <= 296; x += 26) {
    const jx = ((x * 37) % 11) - 5;
    const px = clamp(x + jx, 92, 298);
    spots.push({ x: px, y: Math.round(bedTop(px)) - 1, kind: "blanket" });
  }
  // 枕（安全）
  spots.push({ x: 30, y: 110, kind: "pillow" });
  spots.push({ x: 44, y: 108, kind: "pillow" });
  return spots;
}

// 月明かりの届く範囲（＝蚊のシルエットが読える）
const inBeam = (x, y) => y < 104;

// ---------------------------------------------------------------- ステージ定義
/** パレットは数値に直してから使う（mix が数値を要求するため）。 */
function basePal(over) {
  const out = { ...C };
  for (const [k, v] of Object.entries(over)) out[k] = toColor(v);
  return out;
}

function buildWashitsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#171220",
    wallBot: "#0f0b16",
    wainscot: "#241c2c",
    wainscotHi: "#33283c",
    wainscotLo: "#171120",
    floorFar: "#1d2118",
    floorNear: "#2b3123",
    floorSeam: "#161a12",
    floorSeamHi: "#333a28",
    floorShadow: "#120f14",
    corner: "#05040a",
    shadow: "#0a0710",
    frame: "#2c2334",
    frameHi: "#463a52",
    paper: "#8e88a4",
    paperHi: "#a29cba",
    paperLo: "#78728d",
    paperShade: "#6e6884",
    glass: "#b9b3c9",
    sheet: "#4e4860",
    sheetHi: "#5d5672",
    sheetLo: "#3a3448",
    sheetFold: "#8f88a2",
    sheetFoldLo: "#7b7490",
    pillow: "#cfc6d6",
    pillowHi: "#e4dce8",
    pillowLo: "#a9a0b4",
    pillowDeep: "#7d7590",
    lip: "#a8787c",
    blanket: "#3d3554",
    blanketHi: "#544a70",
    blanketLo: "#282141",
  });
  drawRoom(tk, pal, { floor: "tatami" });
  drawShoji(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "TATAMI",
    jp: "和室",
    night: 40,
    bugs: 5,
    speed: 1.0,
    spotBias: 0.3,
    pal,
    frame,
    floor: "tatami",
    drawAmbient(p, t) {
      drawMotes(p, t, pal.paperHi, 12);
    },
    drawOver(p, t) {
      drawDuvet(p, t, pal);
    },
  };
}

function buildYoshitsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#151726",
    wallBot: "#0e101b",
    wainscot: "#1f2233",
    wainscotHi: "#2c3048",
    wainscotLo: "#12141f",
    floorFar: "#191720",
    floorNear: "#241f2a",
    floorSeam: "#121019",
    floorSeamHi: "#2c2635",
    floorShadow: "#0d0b12",
    corner: "#05060c",
    shadow: "#08070e",
    frame: "#232a3c",
    frameHi: "#3a4560",
    glass: "#33477a",
    glassDark: "#1a2138",
    slat: "#2b3654",
    slatHi: "#3c4b73",
    slatLo: "#1a2137",
    clockBody: "#1b1a24",
    clockFace: "#0d0c12",
    clockLed: "#e8483c",
    sheet: "#4c5168",
    sheetHi: "#5b6078",
    sheetLo: "#383c4e",
    sheetFold: "#888fa4",
    sheetFoldLo: "#727a92",
    pillow: "#ccd2e0",
    pillowHi: "#e2e6f0",
    pillowLo: "#a3a9bb",
    pillowDeep: "#767c90",
    lip: "#9c7480",
    blanket: "#31405c",
    blanketHi: "#46587a",
    blanketLo: "#1f2a40",
  });
  drawRoom(tk, pal, { floor: "wood" });
  drawBlinds(tk, pal);
  drawClock(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "WESTERN",
    jp: "洋室",
    night: 40,
    bugs: 6,
    speed: 1.12,
    spotBias: 0.38,
    pal,
    frame,
    floor: "wood",
    drawAmbient(p, t) {
      drawMotes(p, t, pal.slatHi, 10);
      // 時計のコロンが1秒ごとに点滅
      const q = hexPaint(p);
      const on = Math.floor(t * 2) % 2 === 0;
      if (on) {
        q.put(133, 47, pal.clockLed);
        q.put(133, 53, pal.clockLed);
      }
    },
    drawOver(p, t) {
      drawDuvet(p, t, pal);
    },
  };
}

function buildNatsu() {
  const frame = createFrame(W, H);
  const tk = toolkit(frame);
  const pal = basePal({
    wallTop: "#121629",
    wallBot: "#0b0e1c",
    wainscot: "#1a1f31",
    wainscotHi: "#262c42",
    wainscotLo: "#0f1320",
    floorFar: "#1a1e1a",
    floorNear: "#282d25",
    floorSeam: "#141813",
    floorSeamHi: "#33392b",
    floorShadow: "#0c0f0c",
    corner: "#05060d",
    shadow: "#08090f",
    frame: "#232a3e",
    frameHi: "#3d4763",
    skyHi: "#1d2a52",
    skyLo: "#0e1530",
    moon: "#dfe7ff",
    moonHi: "#f6f8ff",
    star: "#b9c6ee",
    starHi: "#ffffff",
    mesh: "#4a5570",
    fanStand: "#22202c",
    fanCage: "#6b6584",
    fanInner: "#20202e",
    fanBlade: "#575272",
    fanHub: "#8a82a4",
    sheet: "#494e63",
    sheetHi: "#585d73",
    sheetLo: "#35394a",
    sheetFold: "#868ea2",
    sheetFoldLo: "#6f7789",
    pillow: "#cdd2dd",
    pillowHi: "#e4e8ef",
    pillowLo: "#a3a8b5",
    pillowDeep: "#767b8a",
    lip: "#a8747e",
    blanket: "#46527a",
    blanketHi: "#5d6b96",
    blanketLo: "#2e3654",
  });
  drawRoom(tk, pal, { floor: "tatami" });
  drawNightWindow(tk, pal);
  drawFanStand(tk, pal);
  drawBedding(tk, pal);
  return {
    spots: makeSpots(BED.head.cx, BED.head.cy),
    inBeam,
    surfaceY,
    name: "SUMMER",
    jp: "夏の夜",
    night: 45,
    bugs: 7,
    speed: 1.22,
    spotBias: 0.46,
    pal,
    frame,
    floor: "tatami",
    drawAmbient(p, t) {
      const q = hexPaint(p);
      // 星のまたたき
      for (let i = 0; i < 22; i++) {
        const sx = 151 + ((i * 47) % 146);
        const sy = 9 + ((i * 23) % 34);
        const tw = Math.sin(t * 2.2 + i * 1.7);
        if (tw > 0.55) q.dot(sx, sy, pal.starHi, (tw - 0.55) * 0.9);
      }
      // 蛍
      for (let i = 0; i < 5; i++) {
        const x = 40 + ((i * 61 + t * 11) % 240);
        const y = 78 + Math.sin(t * 0.9 + i * 2.1) * 12 + Math.sin(t * 1.7 + i) * 4;
        const b = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + i * 0.9));
        q.light(Math.round(x), Math.round(y), pal_warm, b * 0.55);
        q.dot(Math.round(x), Math.round(y), pal_warmHi, b);
      }
      drawMotes(p, t, pal.star, 8);
    },
    drawOver(p, t) {
      drawFanBlades(p, t, pal);
      drawDuvet(p, t, pal);
    },
  };
}

export const STAGES = [{ build: buildWashitsu }, { build: buildYoshitsu }, { build: buildNatsu }];
export const STAGE_NAMES = ["TATAMI", "WESTERN", "SUMMER"];

const cache = new Map();
/** ステージを1回だけ焼いて使い回す（毎回焼くと重い）。 */
export function stageWorld(i) {
  const k = clamp(i, 0, STAGES.length - 1);
  if (!cache.has(k)) {
    const w = STAGES[k].build();
    w.label = "NIGHT " + (k + 1);
    cache.set(k, w);
  }
  return cache.get(k);
}

void upper;
